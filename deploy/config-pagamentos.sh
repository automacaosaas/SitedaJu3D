#!/usr/bin/env bash
# Grava no .env do servidor o Mercado Pago (teste ou produção) e o e-mail da loja, sem abrir o arquivo à mão
# (08/10/2026). Rodar como root:  sudo bash /srv/juimprime/current/deploy/config-pagamentos.sh
# Pergunta cada valor (as chaves secretas não aparecem na tela nem ficam no histórico; Enter mantém o que já está),
# guarda uma cópia do .env de antes, troca só as linhas pedidas, reinicia o site e mostra o que o /api/health enxerga
# (só se cada chave existe, nunca o valor). APP_ENV vira production e SITE_URL o domínio da loja.
set -euo pipefail

ENV_FILE=${JU_ENV_FILE:-/srv/juimprime/shared/.env}
APP_USER=juimprime
DOMAIN=https://juimprimepramim.com.br
TESTING=${JU_TEST:-}
[ -n "$TESTING" ] || [ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Não achei $ENV_FILE (rode antes o setup-servidor.sh)."; exit 1; }
# O .env fica numa pasta do juimprime: root só lê e grava ali como o próprio juimprime (runuser), para um link simbólico
# deixado na pasta nunca levar a leitura ou a gravação a um arquivo do sistema. A cópia de antes vai para uma pasta só de
# root, fora de /srv/juimprime (no teste, ao lado do .env).
BACKUP_DIR=/var/backups/juimprime; [ -z "$TESTING" ] || BACKUP_DIR=$(dirname -- "$ENV_FILE")
as_app() { if [ -n "$TESTING" ]; then "$@"; else runuser -u "$APP_USER" -- "$@"; fi; }
load() { ENV_TEXT=$(as_app cat -- "$ENV_FILE") || { echo "Não consegui ler $ENV_FILE como $APP_USER."; exit 1; }; }
load

# O valor que o site usa: o systemd (EnvironmentFile) aceita espaços antes do nome e em volta do =, e, com o nome
# repetido, fica com a ÚLTIMA linha.
current() {
  local line value='' re="^[[:space:]]*$1[[:space:]]*=[[:space:]]*(.*)$"
  while IFS= read -r line; do if [[ "$line" =~ $re ]]; then value=${BASH_REMATCH[1]}; fi; done <<<"$ENV_TEXT"
  printf '%s' "${value%"${value##*[![:space:]]}"}"
}
declare -A NEW
ask() {  # ask <VAR> <pergunta> <secreto 0|1> <regex>
  local var=$1 label=$2 secret=$3 re=$4 value had
  # Enter só mantém o atual quando ele já serve (uma chave de teste não fica no modo produção)
  had=$(current "$var"); [[ -n "$had" && "$had" =~ $re ]] || had=''; [ -n "$had" ] && label="$label [Enter mantém o atual]"
  while :; do
    if [ "$secret" = 1 ]; then read -r -s -p "$label: " value; echo; else read -r -e -p "$label: " value; fi
    value=${value//$'\r'/}; value="${value#"${value%%[![:space:]]*}"}"; value="${value%"${value##*[![:space:]]}"}"
    if [ -z "$value" ] && [ -n "$had" ]; then return 0; fi
    if [[ "$value" =~ $re ]]; then NEW[$var]=$value; return 0; fi
    echo "  Valor com formato inesperado; confira e cole de novo."
  done
}

echo "== Mercado Pago"
read -r -p "Modo: 1 = teste, 2 = produção (vendas de verdade) [1]: " choice
# As credenciais de teste do Mercado Pago podem começar com TEST- (as antigas) ou APP_USR- (as de hoje, iguais às de
# produção no formato): o prefixo não diz o modo. Quem diz é MP_MODE; por isso a confirmação logo abaixo.
case "${choice:-1}" in 1) mode=test; label='de TESTE' ;; 2) mode=live; label='de PRODUÇÃO' ;; *) echo "Responda 1 ou 2."; exit 1 ;; esac
read -r -p "Vai colar as credenciais $label da conta da Júlia (Suas integrações → a aplicação → Credenciais $label)? (s/N): " sure
[[ "${sure,,}" == s* ]] || { echo "Nada foi alterado."; exit 1; }
prefix='(TEST-|APP_USR-)'
NEW[MP_MODE]=$mode
ask MP_PUBLIC_KEY "Public Key $label (APP_USR-… ou TEST-…)" 0 "^${prefix}[A-Za-z0-9-]{20,120}$"
ask MP_ACCESS_TOKEN "Access Token $label (não aparece na tela)" 1 "^${prefix}[A-Za-z0-9-]{30,200}$"
ask MP_WEBHOOK_SECRET "Assinatura secreta do webhook (não aparece na tela)" 1 '^[A-Za-z0-9]{16,128}$'

echo "== E-mail da loja (Resend)"
ask ORDER_NOTIFY_EMAIL "E-mail da Júlia (recebe 'pedido pago' e os alertas)" 0 '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
ask RESEND_API_KEY "Chave do Resend (re_…, não aparece na tela)" 1 '^re_[A-Za-z0-9_]{10,80}$'
read -r -p "O domínio juimprimepramim.com.br já aparece como Verified no Resend? (s/N): " verified
if [[ "${verified,,}" == s* ]]; then NEW[MAIL_FROM]="Ju imprime pra mim <pedidos@juimprimepramim.com.br>"; fi
NEW[APP_ENV]=production
NEW[SITE_URL]=$DOMAIN

# Troca só as linhas pedidas, com comandos internos do bash (os valores nunca passam pela linha de comando de outro
# programa): o valor novo entra na primeira linha do nome, as repetidas saem (o systemd ficaria com a última) e o nome que
# faltar entra no fim. Antes, a cópia do .env de antes, só para root (ficam as 10 mais novas).
load
[ -n "$TESTING" ] || install -d -o root -g root -m 700 "$BACKUP_DIR"
backup=$(mktemp "$BACKUP_DIR/env.antes-$(date +%Y%m%d-%H%M%S)-XXXXXX")
printf '%s\n' "$ENV_TEXT" > "$backup"
olds=("$BACKUP_DIR"/env.antes-*); for ((i = 0; i < ${#olds[@]} - 10; i++)); do rm -f -- "${olds[i]}"; done
ASSIGN='^[[:space:]]*([A-Z][A-Z0-9_]*)[[:space:]]*='
declare -A DONE=()
out=''
while IFS= read -r line || [ -n "$line" ]; do
  key=''; if [[ "$line" =~ $ASSIGN ]]; then key=${BASH_REMATCH[1]}; fi
  if [ -n "$key" ] && [ -n "${NEW[$key]+x}" ]; then
    if [ -z "${DONE[$key]+x}" ]; then out+="$key=${NEW[$key]}"$'\n'; DONE[$key]=1; fi
  else
    out+="$line"$'\n'
  fi
done < <(printf '%s' "$ENV_TEXT")
for key in "${!NEW[@]}"; do [ -n "${DONE[$key]+x}" ] || out+="$key=${NEW[$key]}"$'\n'; done
# Gravado pelo juimprime: um arquivo novo (600) ao lado, trocado de uma vez; interrompido no meio, o temporário sai e o
# .env fica como estava.
printf '%s' "$out" | as_app sh -c 'umask 077; t=$(mktemp "$1.XXXXXX") || exit 1; trap "rm -f -- \"$t\"" EXIT HUP INT TERM; cat > "$t" && mv -f -- "$t" "$1"' sh "$ENV_FILE"
unset NEW out ENV_TEXT
echo "gravado (a versão de antes ficou em $backup, só para root)"
[ -z "$TESTING" ] || exit 0

echo "== Reiniciando o site"
systemctl restart juimprime.service
for i in $(seq 1 30); do body=$(curl -fsS -m 5 http://127.0.0.1:3000/api/health 2>/dev/null || true); grep -q '"ok":true' <<<"$body" && break; sleep 1; done
grep -o '"payments":"[a-z]*"\|"paymentsBlocked":[a-z]*\|"mp":{[^}]*}\|"mail":"[a-z]*"\|"orderMail":[a-z]*\|"indexable":[a-z]*' <<<"$body" || echo "O site não respondeu: journalctl -u juimprime -n 40"
echo "Esperado em teste: \"payments\":\"test\", os três do mp true. Em produção: \"payments\":\"live\"."
