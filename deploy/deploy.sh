#!/usr/bin/env bash
# Publica a versão nova do site quando a branch configurada muda no GitHub. Roda como o usuário do site (juimprime):
# a cada minuto pelo juimprime-deploy.timer, ou na hora com "sudo systemctl start juimprime-deploy.service".
# Uma rodada: baixa a branch → monta releases/<commit> (npm ci sem scripts, arquivo REVISION) → roda os testes dentro
# da versão nova → copia o banco se ela traz migrações novas → troca "current" de uma vez → reinicia → confere o
# /api/health (ok, banco ok e o commit novo respondendo). Se algo falha antes da troca, o site nem é tocado; se falha
# depois, ele volta sozinho para a versão anterior. Um commit que falhou não é tentado de novo até chegar outro.
#   deploy.sh                      rodada normal (o timer)
#   deploy.sh --force              publica a ponta da branch mesmo que já esteja no ar, tenha falhado ou esteja segurada
#   deploy.sh --rollback [commit]  volta para a versão anterior (ou a do commit) e segura a publicação automática até
#                                  chegar um commit novo na branch (sudo systemctl start juimprime-rollback.service)
#   deploy.sh --backup [nome]      só a cópia do banco, na hora (shared/backups/<nome>-<data>.sql.gz; nome padrão: manual;
#                                  "diario" é a da nuvem, deploy/backup-nuvem.sh)
# Instalado em /usr/local/lib/juimprime/ por setup-servidor.sh. Veja SERVIDOR-SETUP.md.
set -euo pipefail

APP_DIR=/srv/juimprime
KEEP=5
export PATH=/usr/local/bin:/usr/bin:/bin
export HOME="$APP_DIR"
umask 027
# shellcheck source=/dev/null
source "$APP_DIR/shared/deploy.conf"   # REPO e BRANCH; opcionais: TESTS=off, TEST_SKIP=..., KEEP_BACKUPS=10
TESTS=${TESTS:-on}
TEST_SKIP=${TEST_SKIP-model-details}   # o teste pesado dos modelos 3D (o GitHub já roda tudo); TEST_SKIP= roda todos
KEEP_BACKUPS=${KEEP_BACKUPS:-10}
ENV_FILE="$APP_DIR/shared/.env"
# Só as linhas pedidas saem do .env (grep): nenhum outro segredo entra no ambiente deste script.
envget() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true; }
PORT=$(envget PORT); [[ "$PORT" =~ ^[0-9]+$ ]] || PORT=3000
HEALTH="http://127.0.0.1:$PORT/api/health"
FAILED="$APP_DIR/.deploy-failed"      # commit que falhou: não é tentado de novo até chegar outro
HOLD="$APP_DIR/.deploy-hold"          # ponta da branch na hora de um --rollback: segura a publicação até ela mudar
STATUS="$APP_DIR/.deploy-status"      # "<motivo> <commit>" da última falha (o e-mail de alerta lê, tools/deploy-alert.cjs)
RUNLOG="$APP_DIR/.deploy-last.log"    # o que esta rodada contou (vai no e-mail de alerta)
TESTLOG="$APP_DIR/.deploy-tests.log"
BACKUPS="$APP_DIR/shared/backups"
REPO_DIR="$APP_DIR/repo.git"
LIB=/usr/local/lib/juimprime
MODE=${1:-}
case "$MODE" in ''|--force|--rollback|--backup) ;; *) echo "Uso: deploy.sh [--force | --rollback [commit] | --backup [nome]]" >&2; exit 2 ;; esac

# Uma publicação por vez: o timer não empilha (sai na hora); a volta de versão e a cópia esperam a rodada em curso.
exec 9>"$APP_DIR/.deploy.lock"
if [ -z "$MODE" ] || [ "$MODE" = --force ]; then flock -n 9 || exit 0; else flock -w 900 9; fi

: > "$RUNLOG"
say() { printf '%s\n' "$*" | tee -a "$RUNLOG"; }
warn() { printf '%s\n' "$*" | tee -a "$RUNLOG" >&2; }
status() { printf '%s %s\n' "$1" "${2:-}" > "$STATUS"; }
NEW='' CNF=''
trap 'rm -f "$CNF"' EXIT
trap 'status erro "$NEW"; warn "Parou com erro na linha $LINENO."' ERR

# O commit de uma versão: o REVISION que a publicação grava (ou o nome da pasta, nas versões de antes dele).
rev_of() { if [ -s "$1/REVISION" ]; then head -c 40 "$1/REVISION"; else basename "$1" | cut -c1-40; fi; }
# O commit que a versão informa no /api/health (só as que leem o REVISION; nas antigas, vazio = não confere).
reports() { if grep -q REVISION "$1/api/health.js" 2>/dev/null; then rev_of "$1"; fi; }
point() { ln -sfn "$1" "$APP_DIR/current.new" && mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"; }
restart() { sudo -n /usr/bin/systemctl restart juimprime.service; }
# O site respondeu ok, com o banco ok (uma migração que falhou ou o banco fora do ar não passam) e, quando pedido, é o
# commit esperado respondendo (e não a versão anterior que ainda não caiu). Até 30 tentativas.
healthy() {
  local want=${1:-} body i
  for i in $(seq 1 30); do
    body=$(curl -fsS -m 5 "$HEALTH" 2>/dev/null || true)
    if grep -q '"ok":true' <<<"$body" && grep -q '"db":"ok"' <<<"$body" && { [ -z "$want" ] || grep -q "\"release\":\"${want:0:12}\"" <<<"$body"; }; then return 0; fi
    sleep 2
  done
  return 1
}

# Cópia do banco (mariadb-dump) em shared/backups; ficam as KEEP_BACKUPS mais novas. A senha vai num arquivo só do
# usuário do site (--defaults-extra-file), nunca na linha de comando (que qualquer um vê no ps).
backup() {
  local label=$1 name user pass host port file
  name=$(envget DB_NAME); user=$(envget DB_USER); pass=$(envget DB_PASSWORD); host=$(envget DB_HOST); port=$(envget DB_PORT)
  if [ -z "$name" ] || [ -z "$user" ]; then warn "Cópia do banco: DB_NAME e DB_USER não estão no .env."; return 1; fi
  if ! command -v mariadb-dump >/dev/null; then warn "Cópia do banco: falta o mariadb-dump (sudo apt install mariadb-client)."; return 1; fi
  install -d -m 700 "$BACKUPS"
  CNF=$(mktemp "$APP_DIR/.dump-XXXXXX")
  q() { printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"; }
  { echo '[client]'; echo "user=$(q "$user")"; echo "password=$(q "$pass")"; echo "host=$(q "${host:-127.0.0.1}")"; if [[ "$port" =~ ^[0-9]+$ ]]; then echo "port=$port"; fi; } > "$CNF"
  file="$BACKUPS/$label-$(date +%Y%m%d-%H%M%S).sql.gz"
  if ! (umask 077; mariadb-dump --defaults-extra-file="$CNF" --single-transaction --quick --no-tablespaces "$name" | gzip > "$file.tmp"); then
    rm -f "$CNF" "$file.tmp"; warn "Cópia do banco falhou (mariadb-dump)."; return 1
  fi
  rm -f "$CNF"; mv "$file.tmp" "$file"
  say "Cópia do banco: $file ($(du -h "$file" | cut -f1))"
  ls -1t "$BACKUPS"/*.sql.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while read -r old; do rm -f "$old"; done
}
# As migrações (db/migrations) que a versão <para> traz e a <de> não tem.
new_migrations() { comm -13 <(ls -1 "$1/db/migrations" 2>/dev/null | sort) <(ls -1 "$2/db/migrations" 2>/dev/null | sort); }

if [ "$MODE" = --backup ]; then
  label=${2:-manual}; [[ "$label" =~ ^[a-z0-9-]{1,20}$ ]] || { echo "Nome da cópia inválido: $label" >&2; exit 2; }
  backup "$label" || { status backup ""; exit 1; }
  exit 0
fi

# Volta de versão: aponta "current" para a versão anterior (ou a do commit pedido), reinicia e confere. Não precisa do
# GitHub. Depois segura a publicação automática: a ponta atual da branch (a versão com problema) não volta sozinha; o
# próximo commit novo na branch é publicado normalmente.
if [ "$MODE" = --rollback ]; then
  want=${2:-}
  if [ -n "$want" ] && [[ ! "$want" =~ ^[0-9a-f]{7,40}$ ]]; then warn "Commit inválido: $want (use de 7 a 40 letras de 0-9 e a-f)."; exit 2; fi
  live=$(readlink -f "$APP_DIR/current" 2>/dev/null || true)
  live_rev=''; [ -n "$live" ] && live_rev=$(rev_of "$live")
  target=''
  while read -r dir; do
    dir=${dir%/}
    case "$dir" in *.tmp) continue ;; esac
    [ -f "$dir/server.cjs" ] || continue
    rev=$(rev_of "$dir")
    if [ -n "$want" ]; then if [[ "$rev" == "$want"* ]]; then target=$dir; break; fi
    elif [ "$rev" != "$live_rev" ]; then target=$dir; break; fi
  done < <(ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null)
  if [ -z "$target" ]; then
    status rollback "$want"
    warn "Não achei uma versão guardada para voltar${want:+ ($want)}. Guardadas: $(ls -1t "$APP_DIR/releases" 2>/dev/null | cut -c1-7 | tr '\n' ' ')"
    exit 1
  fi
  NEW=$(rev_of "$target")
  say "Voltando a versão: de ${live_rev:0:7} para ${NEW:0:7}"
  point "$target"
  restart
  if healthy "$(reports "$target")"; then
    tip=$(git -C "$REPO_DIR" rev-parse "refs/remotes/origin/$BRANCH" 2>/dev/null || echo "$live_rev")
    echo "$tip" > "$HOLD"
    rm -f "$STATUS"
    say "No ar: ${NEW:0:7}. A publicação automática fica parada até chegar um commit novo na branch $BRANCH (ou deploy.sh --force)."
    exit 0
  fi
  status rollback "$NEW"
  warn "A versão ${NEW:0:7} não respondeu no /api/health."
  if [ -n "$live" ] && [ -d "$live" ] && [ "$live" != "$target" ]; then point "$live"; restart; warn "O site continua em ${live_rev:0:7}."; fi
  exit 1
fi

export GIT_SSH_COMMAND="ssh -i $APP_DIR/.ssh/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$APP_DIR/.ssh/known_hosts -o ConnectTimeout=20"
if [ ! -d "$REPO_DIR" ]; then
  git init -q --bare "$REPO_DIR"
  git -C "$REPO_DIR" remote add origin "$REPO"
fi
git -C "$REPO_DIR" remote set-url origin "$REPO"
if ! err=$(git -C "$REPO_DIR" fetch -q --prune origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>&1); then
  status github ""
  warn "Não consegui baixar a branch $BRANCH de $REPO: ${err:0:400}"
  exit 1
fi
NEW=$(git -C "$REPO_DIR" rev-parse "refs/remotes/origin/$BRANCH")
CURRENT=$(readlink -f "$APP_DIR/current" 2>/dev/null || true)
LIVE_REV=''; [ -n "$CURRENT" ] && [ -d "$CURRENT" ] && LIVE_REV=$(rev_of "$CURRENT")

if [ "$MODE" != --force ]; then
  [ "$LIVE_REV" = "$NEW" ] && exit 0
  [ -f "$FAILED" ] && [ "$(cat "$FAILED")" = "$NEW" ] && exit 0
  [ -f "$HOLD" ] && [ "$(cat "$HOLD")" = "$NEW" ] && exit 0
fi
rm -f "$HOLD"   # um commit novo (ou --force) acaba com a pausa de um --rollback
say "Publicando $BRANCH em ${NEW:0:7} (no ar: ${LIVE_REV:0:7})"

RELEASE="$APP_DIR/releases/$NEW"
# --force no commit que já está no ar: monta numa pasta ao lado. A pasta da versão no ar nunca é apagada.
[ "$RELEASE" = "$CURRENT" ] && RELEASE="$RELEASE-$(date +%Y%m%d%H%M%S)"
BUILD="$RELEASE.tmp"
refuse() { echo "$NEW" > "$FAILED"; status "$1" "$NEW"; warn "$2"; rm -rf "$BUILD"; exit 1; }
rm -rf "$BUILD"
mkdir -p "$BUILD"
git -C "$REPO_DIR" archive "$NEW" | tar -x -C "$BUILD"
# Trava de segurança: só publica o site completo (server.cjs e package.json) e com o HOST respeitado (o Node só em
# 127.0.0.1, atrás do nginx). Uma branch errada em deploy.conf para aqui, com o site intacto.
if [ ! -f "$BUILD/server.cjs" ] || [ ! -f "$BUILD/package.json" ]; then refuse guarda "O commit ${NEW:0:7} não tem server.cjs e package.json: não é o site (branch errada em deploy.conf?)."; fi
if ! grep -q 'env\.HOST' "$BUILD/server/create-server.cjs" 2>/dev/null; then refuse guarda "O commit ${NEW:0:7} não respeita o HOST (server/create-server.cjs): o site ficaria aberto em todos os endereços. Publique uma branch com o kit do servidor."; fi
# --ignore-scripts: nenhum pacote roda código ao instalar (o mysql2 não precisa).
if ! (cd "$BUILD" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error); then refuse npm "npm ci falhou no commit ${NEW:0:7}."; fi
echo "$NEW" > "$BUILD/REVISION"

# Os testes, dentro da versão nova e antes da troca. Sem nenhuma variável do servidor (env -i): nenhum segredo chega a
# eles. Com prioridade baixa (nice): o site no ar não sente. TESTS=off em deploy.conf pula.
if [ "$TESTS" != off ]; then
  say "Testes em ${NEW:0:7}${TEST_SKIP:+ (sem: $TEST_SKIP)}..."
  if ! (cd "$BUILD" && env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 TEST_SKIP="$TEST_SKIP" nice -n 10 node tools/run-tests.mjs) > "$TESTLOG" 2>&1; then
    tail -n 40 "$TESTLOG" >&2
    refuse testes "Os testes falharam no commit ${NEW:0:7}: o site continua em ${LIVE_REV:0:7}. Detalhes em $TESTLOG."
  fi
  say "Testes ok: $(tail -n 1 "$TESTLOG")"
fi

[ "$RELEASE" != "$CURRENT" ] || { warn "Recusado: a pasta da versão no ar seria substituída."; exit 1; }
rm -rf "$RELEASE"   # uma tentativa anterior deste commit (nunca a versão no ar: veja acima)
mv "$BUILD" "$RELEASE"

# Migrações rodam quando o site liga e só andam para a frente: a volta de versão não as desfaz. Antes de uma versão que
# muda o banco, uma cópia dele; sem a cópia, a versão não entra.
if [ -n "$CURRENT" ] && [ -d "$CURRENT" ]; then
  added=$(new_migrations "$CURRENT" "$RELEASE")
  if [ -n "$added" ]; then
    say "Migrações novas: $(echo "$added" | tr '\n' ' ')"
    backup "antes-${NEW:0:7}" || refuse backup "Sem a cópia do banco, a versão ${NEW:0:7} (que muda o banco) não foi publicada. O site continua em ${LIVE_REV:0:7}."
  fi
fi

point "$RELEASE"
restart
if healthy "$(reports "$RELEASE")"; then
  rm -f "$FAILED" "$STATUS"
  say "No ar: ${NEW:0:7}"
  # Guarda só as $KEEP versões mais novas (nunca apaga a que está no ar).
  live=$(readlink -f "$APP_DIR/current")
  ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    [ "$(readlink -f "$old")" = "$live" ] || rm -rf "$old"
  done
  # O kit instalado (este script e as unidades do systemd) é o desta versão? O setup roda como root e nunca sozinho:
  # só avisa, no journal e no e-mail da próxima falha.
  if [ -d "$RELEASE/deploy" ]; then
    stale=()
    cmp -s "$RELEASE/deploy/deploy.sh" "$LIB/deploy.sh" || stale+=(deploy.sh)
    for unit in juimprime.service juimprime-deploy.service juimprime-deploy.timer juimprime-rollback.service juimprime-deploy-alert.service; do
      cmp -s "$RELEASE/deploy/$unit" "/etc/systemd/system/$unit" || stale+=("$unit")
    done
    if [ ${#stale[@]} -gt 0 ]; then warn "Aviso: o kit do servidor mudou no Git (${stale[*]}). Para instalar: sudo bash $APP_DIR/current/deploy/setup-servidor.sh"; fi
  fi
else
  echo "$NEW" > "$FAILED"
  status saude "$NEW"
  warn "A versão ${NEW:0:7} não respondeu no /api/health (ok, banco ok e o commit novo) em cerca de 3 minutos."
  if [ -n "$CURRENT" ] && [ -d "$CURRENT" ]; then
    point "$CURRENT"
    restart
    if healthy "$(reports "$CURRENT")"; then warn "O site voltou para ${LIVE_REV:0:7}."; else warn "O site voltou para ${LIVE_REV:0:7}, mas ela também não respondeu: confira journalctl -u juimprime."; fi
  fi
  exit 1
fi
