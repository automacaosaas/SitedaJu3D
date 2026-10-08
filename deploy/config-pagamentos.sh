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

current() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
declare -A NEW
ask() {  # ask <VAR> <pergunta> <secreto 0|1> <regex>
  local var=$1 label=$2 secret=$3 re=$4 value had
  # Enter só mantém o atual quando ele já serve (uma chave de teste não fica no modo produção)
  had=$(current "$var"); [[ -n "$had" && "$had" =~ $re ]] || had=''; [ -n "$had" ] && label="$label [Enter mantém o atual]"
  while :; do
    if [ "$secret" = 1 ]; then read -r -s -p "$label: " value; echo; else read -r -p "$label: " value; fi
    value=${value//$'\r'/}; value="${value#"${value%%[![:space:]]*}"}"; value="${value%"${value##*[![:space:]]}"}"
    if [ -z "$value" ] && [ -n "$had" ]; then return 0; fi
    if [[ "$value" =~ $re ]]; then NEW[$var]=$value; return 0; fi
    echo "  Valor com formato inesperado; confira e cole de novo."
  done
}

echo "== Mercado Pago"
read -r -p "Modo: 1 = teste, 2 = produção (vendas de verdade) [1]: " choice
case "${choice:-1}" in 1) mode=test; prefix='TEST-' ;; 2) mode=live; prefix='APP_USR-' ;; *) echo "Responda 1 ou 2."; exit 1 ;; esac
NEW[MP_MODE]=$mode
ask MP_PUBLIC_KEY "Public Key ($prefix…)" 0 "^${prefix}[A-Za-z0-9-]{20,120}$"
ask MP_ACCESS_TOKEN "Access Token ($prefix…, não aparece na tela)" 1 "^${prefix}[A-Za-z0-9-]{30,200}$"
ask MP_WEBHOOK_SECRET "Assinatura secreta do webhook (não aparece na tela)" 1 '^[A-Za-z0-9]{16,128}$'

echo "== E-mail da loja (Resend)"
ask ORDER_NOTIFY_EMAIL "E-mail da Júlia (recebe 'pedido pago' e os alertas)" 0 '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[A-Za-z]{2,}$'
ask RESEND_API_KEY "Chave do Resend (re_…, não aparece na tela)" 1 '^re_[A-Za-z0-9_]{10,80}$'
read -r -p "O domínio juimprimepramim.com.br já aparece como Verified no Resend? (s/N): " verified
if [[ "${verified,,}" == s* ]]; then NEW[MAIL_FROM]="Ju imprime pra mim <pedidos@juimprimepramim.com.br>"; fi
NEW[APP_ENV]=production
NEW[SITE_URL]=$DOMAIN

# Troca só as linhas pedidas (a primeira de cada nome; a que faltar entra no fim), com comandos internos do bash: os
# valores nunca passam pela linha de comando de outro programa. A cópia de antes fica ao lado, só para root.
backup="$ENV_FILE.antes-$(date +%Y%m%d-%H%M%S)"
( umask 077; cp -p "$ENV_FILE" "$backup" )
tmp=$(mktemp "$ENV_FILE.XXXXXX")
declare -A DONE
while IFS= read -r line || [ -n "$line" ]; do
  key=${line%%=*}
  if [[ "$line" == *=* && "$key" =~ ^[A-Z][A-Z0-9_]*$ && -n "${NEW[$key]+x}" && -z "${DONE[$key]+x}" ]]; then
    printf '%s=%s\n' "$key" "${NEW[$key]}"; DONE[$key]=1
  else
    printf '%s\n' "$line"
  fi
done < "$ENV_FILE" > "$tmp"
for key in "${!NEW[@]}"; do [ -n "${DONE[$key]+x}" ] || printf '%s=%s\n' "$key" "${NEW[$key]}" >> "$tmp"; done
chmod 600 "$tmp"; [ -n "$TESTING" ] || chown "$APP_USER:$APP_USER" "$tmp"
mv -f "$tmp" "$ENV_FILE"
unset NEW
echo "gravado (a versão de antes ficou em $backup)"
[ -z "$TESTING" ] || exit 0

echo "== Reiniciando o site"
systemctl restart juimprime.service
for i in $(seq 1 30); do body=$(curl -fsS -m 5 http://127.0.0.1:3000/api/health 2>/dev/null || true); grep -q '"ok":true' <<<"$body" && break; sleep 1; done
grep -o '"payments":"[a-z]*"\|"paymentsBlocked":[a-z]*\|"mp":{[^}]*}\|"mail":"[a-z]*"\|"orderMail":[a-z]*\|"indexable":[a-z]*' <<<"$body" || echo "O site não respondeu: journalctl -u juimprime -n 40"
echo "Esperado em teste: \"payments\":\"test\", os três do mp true. Em produção: \"payments\":\"live\"."
