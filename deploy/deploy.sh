#!/usr/bin/env bash
# Publica a versão nova do site quando a branch configurada muda no GitHub. Roda como o usuário do site (juimprime):
# a cada minuto pelo juimprime-deploy.timer, ou na hora com "sudo systemctl start juimprime-deploy.service".
# Cada versão fica em releases/<commit>, e "current" aponta para a que está no ar. Se a versão nova não responder no
# /api/health em um minuto, o site volta sozinho para a anterior, e aquele commit não é tentado de novo até mudar
# (ou até rodar com --force). Instalado em /usr/local/lib/juimprime/ por setup-servidor.sh. Veja SERVIDOR-SETUP.md.
set -euo pipefail

APP_DIR=/srv/juimprime
KEEP=5
export PATH=/usr/local/bin:/usr/bin:/bin
export HOME="$APP_DIR"
# shellcheck source=/dev/null
source "$APP_DIR/shared/deploy.conf"   # REPO e BRANCH
PORT=$(grep -E '^PORT=[0-9]+$' "$APP_DIR/shared/.env" | head -1 | cut -d= -f2)
HEALTH="http://127.0.0.1:${PORT:-3000}/api/health"
FAILED="$APP_DIR/.deploy-failed"
REPO_DIR="$APP_DIR/repo.git"

# Uma publicação por vez (o timer não empilha).
exec 9>"$APP_DIR/.deploy.lock"
flock -n 9 || exit 0

export GIT_SSH_COMMAND="ssh -i $APP_DIR/.ssh/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$APP_DIR/.ssh/known_hosts"
if [ ! -d "$REPO_DIR" ]; then
  git init -q --bare "$REPO_DIR"
  git -C "$REPO_DIR" remote add origin "$REPO"
fi
git -C "$REPO_DIR" remote set-url origin "$REPO"
git -C "$REPO_DIR" fetch -q --prune origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
NEW=$(git -C "$REPO_DIR" rev-parse "refs/remotes/origin/$BRANCH")
CURRENT=$(readlink -f "$APP_DIR/current" 2>/dev/null || true)
FORCE=${1:-}

if [ "$FORCE" != "--force" ]; then
  [ "$(basename "${CURRENT:-none}")" = "$NEW" ] && exit 0
  [ -f "$FAILED" ] && [ "$(cat "$FAILED")" = "$NEW" ] && exit 0
fi
echo "Publicando $BRANCH em ${NEW:0:7} (no ar: $(basename "${CURRENT:-nenhuma}" | cut -c1-7))"

RELEASE="$APP_DIR/releases/$NEW"
rm -rf "$RELEASE.tmp"
mkdir -p "$RELEASE.tmp"
git -C "$REPO_DIR" archive "$NEW" | tar -x -C "$RELEASE.tmp"
(cd "$RELEASE.tmp" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
rm -rf "$RELEASE"
mv "$RELEASE.tmp" "$RELEASE"

point() { ln -sfn "$1" "$APP_DIR/current.new" && mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"; }
healthy() {
  local i
  for i in $(seq 1 30); do
    if curl -fsS -m 3 "$HEALTH" 2>/dev/null | grep -q '"ok":true'; then return 0; fi
    sleep 2
  done
  return 1
}

point "$RELEASE"
sudo -n /usr/bin/systemctl restart juimprime.service
if healthy; then
  rm -f "$FAILED"
  echo "No ar: ${NEW:0:7}"
  # Guarda só as $KEEP versões mais novas (nunca apaga a que está no ar).
  live=$(readlink -f "$APP_DIR/current")
  ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    [ "$(readlink -f "$old")" = "$live" ] || rm -rf "$old"
  done
else
  echo "$NEW" > "$FAILED"
  echo "A versão ${NEW:0:7} não respondeu no /api/health." >&2
  if [ -n "$CURRENT" ] && [ -d "$CURRENT" ] && [ "$CURRENT" != "$RELEASE" ]; then
    point "$CURRENT"
    sudo -n /usr/bin/systemctl restart juimprime.service
    echo "O site voltou para $(basename "$CURRENT" | cut -c1-7)." >&2
  fi
  exit 1
fi
