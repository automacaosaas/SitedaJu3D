#!/usr/bin/env bash
# Configuração inicial do servidor próprio da loja (Debian 13). Rodar uma vez, como root:
#   sudo bash setup-servidor.sh
# Pode rodar de novo, e deve, quando deploy/ mudar no Git (a publicação avisa): reinstala deploy.sh, as unidades do
# systemd e o sudoers. O .env, o deploy.conf, as chaves, o banco e o nginx (com o domínio e o HTTPS) nunca são
# sobrescritos. Não mexe em firewall, SSH nem em outros sites. Passo a passo em SERVIDOR-SETUP.md.
set -euo pipefail

APP_USER=juimprime
APP_DIR=/srv/juimprime
REPO_URL=git@github.com:automacaosaas/SitedaJu3D.git
BRANCH_DEFAULT=main   # produção: a main, protegida no GitHub (SERVIDOR-SETUP.md)
NODE_MAJOR=24
DB_NAME=juimprime
DB_USER=juimprime
OPERATOR=${SUDO_USER:-}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$APP_DIR/shared/.env"
CONF_FILE="$APP_DIR/shared/deploy.conf"
# Impressão digital da chave ED25519 do github.com, publicada pelo GitHub (docs.github.com, "GitHub's SSH key fingerprints").
GITHUB_FP='SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU'

[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0"; exit 1; }
step() { printf '\n== %s\n' "$*"; }

step "Pacotes do sistema"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates git xz-utils openssl util-linux nginx certbot python3-certbot-nginx mariadb-client >/dev/null
echo "ok"

step "Node.js $NODE_MAJOR (versão LTS, do site oficial, com o arquivo conferido)"
if [[ "$(/usr/local/bin/node -v 2>/dev/null || true)" != v$NODE_MAJOR.* ]]; then
  base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  tmp=$(mktemp -d)
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file=$(grep -oE "node-v$NODE_MAJOR\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz" "$tmp/SHASUMS256.txt" | head -1)
  [ -n "$file" ] || { echo "Não achei o Node $NODE_MAJOR em $base"; exit 1; }
  curl -fsSL "$base/$file" -o "$tmp/$file"
  (cd "$tmp" && grep "  $file\$" SHASUMS256.txt | sha256sum -c --quiet -)
  mkdir -p /usr/local/lib/nodejs
  tar -xJf "$tmp/$file" -C /usr/local/lib/nodejs
  for bin in node npm npx; do ln -sfn "/usr/local/lib/nodejs/${file%.tar.xz}/bin/$bin" "/usr/local/bin/$bin"; done
  rm -rf "$tmp"
fi
echo "node $(/usr/local/bin/node -v) em /usr/local/bin (o Node 20 do Debian fica como está)"

step "Usuário do site ($APP_USER) e pastas em $APP_DIR"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --user-group --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$APP_DIR" "$APP_DIR/releases" "$APP_DIR/shared"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$APP_DIR/.ssh" "$APP_DIR/shared/backups"
echo "ok"

step "Chave de leitura do GitHub (Deploy Key)"
if [ ! -f "$APP_DIR/.ssh/id_ed25519" ]; then
  sudo -u "$APP_USER" ssh-keygen -q -t ed25519 -N '' -C "deploy juimprime@$(hostname)" -f "$APP_DIR/.ssh/id_ed25519"
fi
if ! grep -q '^github.com ' "$APP_DIR/.ssh/known_hosts" 2>/dev/null; then
  key=$(ssh-keyscan -t ed25519 github.com 2>/dev/null)
  fp=$(printf '%s\n' "$key" | ssh-keygen -lf - | awk '{print $2}')
  [ "$fp" = "$GITHUB_FP" ] || { echo "A chave do github.com não confere ($fp). Parando por segurança."; exit 1; }
  printf '%s\n' "$key" > "$APP_DIR/.ssh/known_hosts"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.ssh/known_hosts"; chmod 644 "$APP_DIR/.ssh/known_hosts"
fi
# Reserva para uma rede que bloqueia a saída pela porta 22: o mesmo GitHub em ssh.github.com:443, com a mesma chave
# (conferida pela mesma impressão digital). Só é usado se deploy.conf apontar REPO para lá (SERVIDOR-SETUP.md).
if ! grep -q '^\[ssh.github.com\]:443 ' "$APP_DIR/.ssh/known_hosts" 2>/dev/null; then
  key=$(ssh-keyscan -T 10 -p 443 -t ed25519 ssh.github.com 2>/dev/null || true)
  if [ -n "$key" ] && [ "$(printf '%s\n' "$key" | ssh-keygen -lf - | awk '{print $2}')" = "$GITHUB_FP" ]; then printf '%s\n' "$key" >> "$APP_DIR/.ssh/known_hosts"; fi
fi
echo "ok"

step "Banco de dados (MariaDB: banco $DB_NAME, usuário $DB_USER)"
if [ -f "$ENV_FILE" ] && grep -q '^DB_PASSWORD=..*' "$ENV_FILE"; then
  DB_PASS=$(grep '^DB_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)
else
  DB_PASS=$(openssl rand -hex 24)   # ninguém precisa digitar: fica só no .env
fi
mariadb <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
echo "ok (as tabelas são criadas pelo próprio site, quando ele liga)"

step "Configuração secreta ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
  (umask 077; cat > "$ENV_FILE" <<EOF
# Configuração secreta do site, gerada por deploy/setup-servidor.sh em $(date '+%d/%m/%Y %H:%M').
# NUNCA mande este arquivo (nem partes dele) por chat, e-mail ou Git. Editar: sudo nano $ENV_FILE
# Depois de editar: sudo systemctl restart juimprime.service
# Comentários só em linhas próprias (um "#" depois do valor vira parte do valor).

# Modo: preview (teste) até o lançamento; production no lançamento (aí MP_MODE também é obrigatório).
APP_ENV=preview
# Endereço do site, sem barra no fim. Trocar pelo domínio (https://...) quando ele apontar para cá.
SITE_URL=http://10.0.100.80
# Google: só o domínio da loja (o do SITE_URL ou, enquanto ele for IP, juimprimepramim.com.br) e o www dele entram na busca.
# Opcional: outros endereços que podem ser indexados, separados por vírgula.
INDEX_HOSTS=
HOST=127.0.0.1
PORT=3000

DB_HOST=127.0.0.1
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS

# DATA_KEY e INDEX_KEY nunca podem mudar nem se perder: guarde uma cópia num gerenciador de senhas.
DATA_KEY=$(openssl rand -base64 32)
INDEX_KEY=$(openssl rand -base64 32)
AUTH_SECRET=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -hex 24)

# A preencher (nomes e formatos em HOSTINGER-SETUP.md, MERCADOPAGO-SETUP.md, FRETE-SETUP.md e NFE-SETUP.md).
ADMIN_EMAIL=
ADMIN_PASSWORD=
ORDER_NOTIFY_EMAIL=
CONTACT_EMAIL=
RESEND_API_KEY=
MAIL_FROM=
MAIL_REPLY_TO=
MP_PUBLIC_KEY=
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
MP_MODE=
CORREIOS_USER=
CORREIOS_CODE=
CORREIOS_CONTRACT=
CORREIOS_CARD=
CORREIOS_DR=
SHIP_FROM_CEP=
NFE_PROVIDER=
BLING_CLIENT_ID=
BLING_CLIENT_SECRET=
NFE_ENVIRONMENT=
# Entrar com o Google e com a Apple (opcional; sem eles, os botões não aparecem). APPLE_PRIVATE_KEY: a chave .p8 numa linha só, com \n no lugar das quebras.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
EOF
  )
  chown "$APP_USER:$APP_USER" "$ENV_FILE"; chmod 600 "$ENV_FILE"
  echo "criado (as chaves aleatórias e a senha do banco já estão dentro; os campos vazios você preenche)"
else
  echo "já existe: mantido como está"
fi
if [ ! -f "$CONF_FILE" ]; then
  {
    echo "# Repositório e branch que o servidor publica (deploy/deploy.sh). Trocar a branch e rodar: sudo systemctl start juimprime-deploy.service"
    echo "REPO=$REPO_URL"
    echo "BRANCH=$BRANCH_DEFAULT"
    echo "# Opcionais. TESTS=off publica sem rodar os testes antes (não recomendado)."
    echo "# TEST_SKIP: suítes de tests/ puladas no servidor (separadas por vírgula; o GitHub roda todas). Vazio = todas."
    echo "# KEEP_BACKUPS: quantas cópias do banco guardar em shared/backups (uma antes de cada versão com migração nova)."
    echo "#TESTS=off"
    echo "#TEST_SKIP=model-details"
    echo "#KEEP_BACKUPS=10"
  } > "$CONF_FILE"
  chown "$APP_USER:$APP_USER" "$CONF_FILE"; chmod 640 "$CONF_FILE"
fi
echo "publica: $(grep '^BRANCH=' "$CONF_FILE" | cut -d= -f2-)"

step "Serviço do site, publicação automática, volta de versão e aviso por e-mail (systemd)"
install -d -m 755 /usr/local/lib/juimprime
install -m 755 "$HERE/deploy.sh" /usr/local/lib/juimprime/deploy.sh
install -m 644 "$HERE/juimprime.service" "$HERE/juimprime-deploy.service" "$HERE/juimprime-deploy.timer" "$HERE/juimprime-rollback.service" "$HERE/juimprime-deploy-alert.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable juimprime.service juimprime-deploy.timer >/dev/null 2>&1
echo "ok (o site liga na primeira publicação; a publicação automática começa quando a Deploy Key estiver no GitHub)"

step "Permissões sem senha, só para o necessário (sudoers)"
rules=$(mktemp)
{
  echo "# deploy/setup-servidor.sh: o site reinicia o próprio serviço ao publicar uma versão nova."
  echo "$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart juimprime.service"
  if [ -n "$OPERATOR" ] && [ "$OPERATOR" != root ]; then
    echo "# Operador: publicar agora, ligar a publicação automática, voltar a versão anterior e reiniciar o site."
    echo "$OPERATOR ALL=(root) NOPASSWD: /usr/bin/systemctl start juimprime-deploy.service, /usr/bin/systemctl start juimprime-deploy.timer, /usr/bin/systemctl start juimprime-rollback.service, /usr/bin/systemctl restart juimprime.service"
  fi
} > "$rules"
visudo -cqf "$rules" || { echo "Regra de sudo inválida: nada foi alterado."; rm -f "$rules"; exit 1; }
install -m 440 -o root -g root "$rules" /etc/sudoers.d/juimprime
rm -f "$rules"
if [ -n "$OPERATOR" ] && [ "$OPERATOR" != root ]; then usermod -aG systemd-journal "$OPERATOR"; fi
echo "ok"

step "nginx (porta 80 → site)"
# Só na primeira vez: depois, o arquivo tem o domínio e o HTTPS que o certbot acrescentou, e rodar o setup de novo (por
# causa de uma mudança no kit) não pode apagar isso.
if [ ! -f /etc/nginx/sites-available/juimprime ]; then
  install -m 644 "$HERE/nginx-juimprime.conf" /etc/nginx/sites-available/juimprime
  nginx_note="instalado (até a primeira publicação, a porta 80 responde 502)"
else
  nginx_note="já existe: mantido como está (domínio e HTTPS preservados)"
fi
ln -sfn /etc/nginx/sites-available/juimprime /etc/nginx/sites-enabled/juimprime
rm -f /etc/nginx/sites-enabled/default
nginx -t -q && systemctl reload nginx
echo "ok, $nginx_note"

step "Pronto. Falta cadastrar a chave abaixo no GitHub:"
echo "GitHub → repositório SitedaJu3D → Settings → Deploy keys → Add deploy key"
echo "Title: servidor $(hostname)   ·   Allow write access: DESMARCADO (só leitura)"
echo "Key:"
cat "$APP_DIR/.ssh/id_ed25519.pub"
