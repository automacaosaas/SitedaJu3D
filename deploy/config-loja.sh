#!/usr/bin/env bash
# Grava no .env do servidor o primeiro acesso do Painel da Júlia e o frete dos Correios, sem abrir o arquivo à mão
# (08/10/2026). Rodar como root:  sudo bash /srv/juimprime/current/deploy/config-loja.sh
# Pergunta cada valor (a senha do painel e o código de acesso dos Correios não aparecem na tela nem ficam no histórico;
# Enter mantém o que já está), guarda uma cópia do .env de antes, troca só as linhas pedidas, reinicia o site e mostra o
# que o /api/health enxerga ("admin" e "shipping", nunca um valor). Onde achar cada dado: ADMIN-SETUP.md e FRETE-SETUP.md.
# Testar no computador (sem root, sem reiniciar nada): JU_TEST=1 JU_ENV_FILE=<um .env de teste> bash deploy/config-loja.sh
set -euo pipefail

ENV_FILE=${JU_ENV_FILE:-/srv/juimprime/shared/.env}
APP_USER=juimprime
DOMAIN=https://juimprimepramim.com.br
HEALTH=http://127.0.0.1:3000/api/health
TESTING=${JU_TEST:-}
[ -n "$TESTING" ] || [ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Não achei $ENV_FILE (rode antes o setup-servidor.sh)."; exit 1; }

current() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
# Números escritos com pontos, traços, barras ou espaços (01310-100, 99.1234.5678): o site lê só os dígitos (digits() em
# api/_lib/correios.js), então só os dígitos vão para o .env. No usuário, só um CPF (11) ou CNPJ (14) assim vira números.
SEPARATED='^[0-9./ -]+$'
tidy() {  # tidy <como: texto|numeros|usuario> <valor>
  local kind=$1 value=$2 d
  if [ "$kind" != texto ] && [[ "$value" =~ $SEPARATED ]]; then
    d=${value//[!0-9]/}
    if [ "$kind" = numeros ] || [ ${#d} -eq 11 ] || [ ${#d} -eq 14 ]; then value=$d; fi
  fi
  printf '%s' "$value"
}
# Aspas e barra invertida nunca entram: o systemd (EnvironmentFile) lê esses sinais de um jeito especial.
fits() { [[ -n "$1" && "$1" =~ $2 && "$1" != *[\'\"\\]* ]]; }
declare -A NEW=()
ask() {  # ask <VAR> <pergunta> <secreto 0|1> <regex> [como: texto|numeros|usuario] [aviso]
  local var=$1 label=$2 secret=$3 re=$4 kind=${5:-texto} hint=${6:-'Valor com formato inesperado; confira e digite de novo.'} value had
  # Enter só mantém o atual quando ele já serve
  had=$(current "$var"); fits "$(tidy "$kind" "$had")" "$re" || had=''; [ -n "$had" ] && label="$label [Enter mantém o atual]"
  while :; do
    if [ "$secret" = 1 ]; then read -r -s -p "$label: " value; echo; else read -r -p "$label: " value; fi
    value=${value//$'\r'/}; value="${value#"${value%%[![:space:]]*}"}"; value="${value%"${value##*[![:space:]]}"}"
    if [ -z "$value" ] && [ -n "$had" ]; then return 0; fi
    value=$(tidy "$kind" "$value")
    if fits "$value" "$re"; then NEW[$var]=$value; return 0; fi
    echo "  $hint"
  done
}

# A senha do painel vai para o .env como foi digitada. Ficam de fora os espaços (o systemd corta os das pontas), as aspas
# e a barra invertida (ele as interpreta) e os acentos (o terminal pode gravar diferente do que o navegador manda).
# Em subshell, com LC_ALL=C só aqui: conta e reconhece os caracteres do mesmo jeito em qualquer servidor.
password_problem() (
  LC_ALL=C
  p=$1
  if [ ${#p} -lt 12 ] || [ ${#p} -gt 128 ]; then echo "A senha precisa ter de 12 a 128 caracteres."
  elif [[ "$p" == *[[:space:]]* ]]; then echo "A senha não pode ter espaços."
  elif [[ "$p" == *[\'\"\\]* ]]; then echo "Sem aspas (' ou \") e sem barra invertida (\\): o servidor lê esses sinais de um jeito especial e a senha gravada ficaria diferente da digitada."
  elif [[ "$p" == *[![:graph:]]* ]]; then echo "Sem acentos nem ç: use letras sem acento, números e símbolos como ! @ # % * - _"
  fi
)
ask_password() {
  local value again problem had='' label="Senha do painel (12 a 128 caracteres, sem espaços, aspas nem barra invertida; não aparece na tela)"
  # Enter só mantém a atual quando ela já passa nas regras; aí não há o que confirmar
  [ -n "$(password_problem "$(current ADMIN_PASSWORD)")" ] || { had=1; label="$label [Enter mantém a atual]"; }
  while :; do
    read -r -s -p "$label: " value; echo; value=${value//$'\r'/}
    if [ -z "$value" ] && [ -n "$had" ]; then return 0; fi
    problem=$(password_problem "$value")
    if [ -n "$problem" ]; then echo "  $problem"; continue; fi
    read -r -s -p "Digite a mesma senha de novo (não aparece na tela): " again; echo; again=${again//$'\r'/}
    if [[ "$value" != "$again" ]]; then echo "  As duas senhas não são iguais; vamos de novo."; continue; fi
    NEW[ADMIN_PASSWORD]=$value; return 0
  done
}

read -r -p "O que configurar? 1 = Painel da Júlia (primeiro acesso), 2 = Frete dos Correios, 3 = os dois [3]: " choice
choice=${choice//[[:space:]]/}
case "${choice:-3}" in 1) panel=1; ship='' ;; 2) panel=''; ship=1 ;; 3) panel=1; ship=1 ;; *) echo "Responda 1, 2 ou 3."; exit 1 ;; esac

if [ -n "$panel" ] && [ -z "$TESTING" ]; then
  body=$(curl -fsS -m 5 "$HEALTH" 2>/dev/null || true)
  if grep -q '"admin":"ready"' <<<"$body"; then
    echo "O painel já tem alguém cadastrado. ADMIN_EMAIL e ADMIN_PASSWORD só criam a PRIMEIRA pessoa: trocar aqui não muda"
    echo "a senha de quem já entra (para trocar a senha ou o celular, veja ADMIN-SETUP.md)."
    read -r -p "Continuar mesmo assim? (s/N): " sure
    if [[ "${sure,,}" != s* ]]; then
      panel=''; echo "O painel fica como está."
      [ -n "$ship" ] || { echo "Nada foi alterado."; exit 0; }
    fi
  elif [ -z "$body" ]; then
    echo "(Não consegui ler o /api/health agora; sigo assim mesmo.)"
  fi
fi

if [ -n "$panel" ]; then
  echo "== Painel da Júlia (primeiro acesso)"
  ask ADMIN_EMAIL "E-mail com que a Júlia vai entrar no painel" 0 '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[A-Za-z]{2,}$' texto \
    "E-mail com formato inesperado (exemplo: nome@gmail.com); digite de novo."
  ask_password
fi

if [ -n "$ship" ]; then
  echo "== Frete dos Correios (dados do contrato da Júlia; o passo a passo está em FRETE-SETUP.md)"
  ask CORREIOS_USER "Usuário da API (o login do Meu Correios: CPF/CNPJ só com números ou o nome de usuário)" 0 '^[A-Za-z0-9._@-]{3,80}$' usuario \
    "Use só letras, números e . _ @ - (de 3 a 80); confira e digite de novo."
  ask CORREIOS_CODE "Código de acesso da API (CWS → Gestão de acesso a API's → Gerar código; não aparece na tela)" 1 '^[A-Za-z0-9._-]{16,200}$' texto \
    "Código com formato inesperado (letras, números e . _ -, pelo menos 16); copie de novo do CWS e cole."
  ask CORREIOS_CONTRACT "Número do contrato (Correios Empresas → Consultar Contratos)" 0 '^[0-9]{6,12}$' numeros \
    "O contrato tem de 6 a 12 números; confira e digite de novo."
  ask CORREIOS_CARD "Número do cartão de postagem (Correios Empresas → Cartões de Postagem)" 0 '^[0-9]{6,14}$' numeros \
    "O cartão de postagem tem de 6 a 14 números; confira e digite de novo."
  ask CORREIOS_DR "DR: o número da \"Unidade Gestora\" na tela do contrato (por exemplo 72)" 0 '^[0-9]{1,3}$' numeros \
    "A DR é só o número da Unidade Gestora (1 a 3 números); confira e digite de novo."
  ask SHIP_FROM_CEP "CEP de onde a Júlia despacha (12345-678)" 0 '^[0-9]{8}$' numeros \
    "O CEP tem 8 números (12345-678); confira e digite de novo."
fi

[ ${#NEW[@]} -gt 0 ] || { echo "Nada foi alterado (os valores ficaram como estavam)."; exit 0; }

# Troca só as linhas pedidas (a primeira de cada nome; a que faltar entra no fim), com comandos internos do bash: os
# valores nunca passam pela linha de comando de outro programa. A cópia de antes fica ao lado, só para root.
backup="$ENV_FILE.antes-$(date +%Y%m%d-%H%M%S)"
( umask 077; cp -p "$ENV_FILE" "$backup" )
tmp=$(mktemp "$ENV_FILE.XXXXXX")
declare -A DONE=()
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
for i in $(seq 1 30); do body=$(curl -fsS -m 5 "$HEALTH" 2>/dev/null || true); grep -q '"ok":true' <<<"$body" && break; sleep 1; done
grep -q '"ok":true' <<<"$body" || { echo "O site não respondeu: journalctl -u juimprime -n 40"; exit 1; }
grep -o '"admin":"[a-z]*"\|"shipping":"[a-z]*"\|"missing":\[[^]]*\]' <<<"$body" || true
state() { grep -o "\"$1\":\"[a-z]*\"" <<<"$body" | cut -d'"' -f4 || true; }
if [ -n "$panel" ]; then
  case "$(state admin)" in
    bootstrap) echo "Painel pronto: a Júlia já pode abrir $DOMAIN/admin.html, entrar com esse e-mail e senha e ler o QR Code no app autenticador." ;;
    ready) echo "O painel já tinha alguém cadastrado: vale a senha de quem já entra (para trocar, veja ADMIN-SETUP.md)." ;;
    waiting) echo "O painel ainda espera o e-mail e a senha: rode de novo, opção 1." ;;
    *) echo "O painel precisa do banco: confira o \"db\" em curl -s $HEALTH e me chame." ;;
  esac
fi
if [ -n "$ship" ]; then
  case "$(state shipping)" in
    correios) echo "Frete real ligado: o checkout já cota PAC e SEDEX pelo contrato. Faça uma cotação de teste com um CEP." ;;
    pending) echo "Os dados dos Correios estão gravados, mas falta dado da loja em api/_lib/shipping-config.js (caixas, prazos ou serviços): me chame." ;;
    *) echo "Frete real desligado: algum dado dos Correios ficou vazio. Rode de novo, opção 2." ;;
  esac
fi
