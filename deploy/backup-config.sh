#!/usr/bin/env bash
# Liga a cópia diária do banco na nuvem (Backblaze B2). Rodar uma vez, como root, depois do setup-servidor.sh:
#   sudo bash /srv/juimprime/current/deploy/backup-config.sh
# Pergunta (as chaves digitadas não aparecem na tela nem ficam no histórico do terminal):
#   - o nome do bucket do B2 e a Application Key só de escrita dele (keyID e applicationKey);
#   - a chave PÚBLICA age (começa com age1…) — a privada fica com vocês, fora do servidor.
# Grava em /srv/juimprime/shared (só o usuário do site lê): rclone.conf, backup.conf e backup-recipients.txt.
# Depois envia um arquivinho de teste e roda a primeira cópia. Pode rodar de novo para trocar a chave ou o bucket.
set -euo pipefail

APP_DIR=/srv/juimprime
SHARED="$APP_DIR/shared"
APP_USER=juimprime
[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0"; exit 1; }
command -v rclone >/dev/null && command -v age >/dev/null || { echo "Faltam o rclone e o age: rode antes sudo bash $APP_DIR/current/deploy/setup-servidor.sh"; exit 1; }

echo "== Backblaze B2"
read -r -p "Nome do bucket (ex.: juimprime-backup): " bucket
[[ "$bucket" =~ ^[A-Za-z0-9-]{6,50}$ ]] || { echo "Nome de bucket inválido (6 a 50 letras, números e hífens)."; exit 1; }
read -r -p "keyID da Application Key (só de escrita): " key_id
[[ "$key_id" =~ ^[A-Za-z0-9]{12,40}$ ]] || { echo "keyID inválido."; exit 1; }
read -r -s -p "applicationKey (não aparece na tela): " app_key; echo
[[ "$app_key" =~ ^[A-Za-z0-9/+]{20,64}$ ]] || { echo "applicationKey inválida."; exit 1; }

echo "== Chave pública age (a que começa com age1…; a privada NÃO vem para cá)"
read -r -p "Chave pública: " recipient
[[ "$recipient" =~ ^age1[a-z0-9]{50,70}$ ]] || { echo "Isso não parece uma chave pública age (age1…)."; exit 1; }
read -r -p "Uma segunda chave pública (opcional, por exemplo a da Júlia; Enter para pular): " recipient2
[[ -z "$recipient2" || "$recipient2" =~ ^age1[a-z0-9]{50,70}$ ]] || { echo "A segunda chave não parece uma chave pública age."; exit 1; }

# rclone.conf com printf (comando interno do bash): a chave não passa pela linha de comando de nenhum programa
( umask 077
  printf '[b2]\ntype = b2\naccount = %s\nkey = %s\nhard_delete = false\n' "$key_id" "$app_key" > "$SHARED/rclone.conf"
  printf '# Cópia diária do banco na nuvem (deploy/backup-nuvem.sh)\nBACKUP_REMOTE=b2:%s\n' "$bucket" > "$SHARED/backup.conf"
  { echo "$recipient"; [ -z "$recipient2" ] || echo "$recipient2"; } > "$SHARED/backup-recipients.txt" )
unset app_key
chown "$APP_USER:$APP_USER" "$SHARED/rclone.conf" "$SHARED/backup.conf" "$SHARED/backup-recipients.txt"
chmod 600 "$SHARED/rclone.conf"; chmod 640 "$SHARED/backup.conf" "$SHARED/backup-recipients.txt"
echo "gravado em $SHARED (rclone.conf só o usuário do site lê)"

echo "== Teste de envio"
probe="$APP_DIR/.backup-teste.txt"
printf 'teste de envio do servidor %s em %s\n' "$(hostname)" "$(date -Is)" > "$probe"; chown "$APP_USER:$APP_USER" "$probe"
if runuser -u "$APP_USER" -- env HOME="$APP_DIR" rclone --config "$SHARED/rclone.conf" copyto "$probe" "b2:$bucket/teste-conexao.txt" --no-check-dest -q; then
  echo "ok: o servidor consegue gravar no bucket $bucket"
else
  rm -f "$probe"; echo "Falhou: confira o nome do bucket, o keyID e a applicationKey (Application Key do bucket, com escrita)."; exit 1
fi
rm -f "$probe"

echo "== Primeira cópia do banco na nuvem"
systemctl start juimprime-backup.service || true
journalctl -u juimprime-backup -n 6 --no-pager -o cat
echo "Pronto. A cópia roda todo dia às 03:30 (systemctl list-timers juimprime-backup.timer)."
