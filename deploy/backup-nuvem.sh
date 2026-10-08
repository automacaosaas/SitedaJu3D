#!/usr/bin/env bash
# Cópia diária do banco fora do servidor (08/10/2026, pedido do dono: "um dump do banco, por precaução, numa nuvem").
# Roda como o usuário do site (juimprime) pelo juimprime-backup.timer, de madrugada, ou na hora com
# "sudo systemctl start juimprime-backup.service". Uma rodada:
#   1. a cópia do banco (deploy.sh --backup diario: mariadb-dump numa transação, compactada, em shared/backups);
#   2. confere a cópia (o gzip íntegro e a linha "Dump completed" no fim);
#   3. tranca com a chave PÚBLICA age de shared/backup-recipients.txt (quem abre é só quem tem a chave privada, fora do
#      servidor: nem quem invadir o servidor nem quem tiver acesso à nuvem lê os dados dos clientes);
#   4. envia para o Backblaze B2 (rclone, shared/rclone.conf com uma chave só de escrita: daqui ninguém apaga nem lê as
#      cópias da nuvem), em <ano>/<mês>/diario-<data>.sql.gz.age.
# Se falhar, juimprime-deploy-alert.service manda um e-mail (motivo "nuvem", um por dia). Sem configuração (antes de
# rodar deploy/backup-config.sh), avisa no journal e sai sem erro. Veja SERVIDOR-SETUP.md, "Cópia do banco na nuvem".
set -euo pipefail

APP_DIR=/srv/juimprime
export PATH=/usr/local/bin:/usr/bin:/bin
export HOME="$APP_DIR"
umask 077
SHARED="$APP_DIR/shared"
CONF="$SHARED/backup.conf"                 # BACKUP_REMOTE=b2:<bucket> (opcional: BACKUP_PREFIX=pasta)
RCLONE_CONF="$SHARED/rclone.conf"           # o remoto "b2" com a chave só de escrita do Backblaze
RECIPIENTS="$SHARED/backup-recipients.txt"  # chaves públicas age (age1…), uma por linha
LOG="$APP_DIR/.backup-last.log"
STATUS="$APP_DIR/.deploy-status"
OK="$APP_DIR/.backup-nuvem-ok"
OUT=''

: > "$LOG"
say() { printf '%s\n' "$*" | tee -a "$LOG"; }
fail() { printf '%s\n' "$*" | tee -a "$LOG" >&2; printf 'nuvem \n' > "$STATUS"; rm -f "$OUT"; exit 1; }
trap 'rm -f "$OUT"' EXIT

if [ ! -s "$CONF" ] || [ ! -s "$RCLONE_CONF" ] || ! grep -q '^age1' "$RECIPIENTS" 2>/dev/null; then
  say "Cópia na nuvem ainda não configurada: rode sudo bash /srv/juimprime/current/deploy/backup-config.sh (SERVIDOR-SETUP.md)."
  exit 0
fi
# shellcheck source=/dev/null
source "$CONF"
[[ "${BACKUP_REMOTE:-}" =~ ^[a-z0-9]+:[A-Za-z0-9._-]+$ ]] || fail "backup.conf: BACKUP_REMOTE inválido (ex.: b2:juimprime-backup)."
PREFIX=${BACKUP_PREFIX:-}
[[ -z "$PREFIX" || "$PREFIX" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "backup.conf: BACKUP_PREFIX inválido."
command -v age >/dev/null || fail "Falta o age (sudo apt install age; o setup-servidor.sh instala)."
command -v rclone >/dev/null || fail "Falta o rclone (sudo apt install rclone; o setup-servidor.sh instala)."

# 1. a cópia (espera uma publicação em curso terminar: deploy.sh usa a mesma trava)
/usr/local/lib/juimprime/deploy.sh --backup diario >/dev/null || fail "A cópia do banco (mariadb-dump) falhou: veja journalctl -u juimprime-backup."
FILE=$(ls -1t "$SHARED/backups"/diario-*.sql.gz 2>/dev/null | head -1 || true)
[ -n "$FILE" ] && [ -s "$FILE" ] || fail "A cópia do banco não apareceu em shared/backups."

# 2. conferida antes de sair do servidor
gzip -t "$FILE" || fail "A cópia $FILE está corrompida (gzip)."
zcat "$FILE" | tail -n 1 | grep -q 'Dump completed' || fail "A cópia $FILE está incompleta (sem 'Dump completed' no fim)."

# 3. trancada com a chave pública
OUT="$APP_DIR/.backup-$(basename "$FILE").age"
age -R "$RECIPIENTS" -o "$OUT" "$FILE" || fail "Não consegui trancar a cópia com a chave age."

# 4. para a nuvem (sem listar nem ler o destino: a chave é só de escrita)
DEST="$BACKUP_REMOTE/${PREFIX:+$PREFIX/}$(date +%Y/%m)/$(basename "$FILE").age"
rclone --config "$RCLONE_CONF" copyto "$OUT" "$DEST" --no-check-dest --retries 5 --low-level-retries 10 --contimeout 30s --timeout 5m -q \
  || fail "O envio para o Backblaze ($DEST) falhou: rede, chave do B2 ou nome do bucket."
SIZE=$(du -h "$OUT" | cut -f1)
rm -f "$OUT"; OUT=''
printf '%s %s %s\n' "$(date -Is)" "$SIZE" "$DEST" > "$OK"
say "Cópia do banco na nuvem: $DEST ($SIZE, trancada com age)."
