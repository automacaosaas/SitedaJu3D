#!/usr/bin/env bash
# Grava no .env do servidor o primeiro acesso do Painel da Júlia, o frete dos Correios e o aplicativo do Bling (nota
# fiscal), sem abrir o arquivo à mão (08/10/2026). Rodar como root:  sudo bash /srv/juimprime/current/deploy/config-loja.sh
# Pergunta cada valor (a senha do painel, o código de acesso dos Correios e o Client Secret do Bling não aparecem na tela
# nem ficam no histórico; Enter mantém o que já está), guarda uma cópia do .env de antes, troca só as linhas pedidas,
# reinicia o site e mostra o que o /api/health enxerga ("admin", "shipping", "nfe", "bling" e "queue", nunca um valor).
# Onde achar cada dado: ADMIN-SETUP.md, FRETE-SETUP.md e NFE-SETUP.md.
# Testar no computador (sem root, sem reiniciar nada): JU_TEST=1 JU_ENV_FILE=<um .env de teste> bash deploy/config-loja.sh
set -euo pipefail

ENV_FILE=${JU_ENV_FILE:-/srv/juimprime/shared/.env}
APP_USER=juimprime
DOMAIN=https://juimprimepramim.com.br
HEALTH=http://127.0.0.1:3000/api/health
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
# Números escritos com pontos, traços, barras ou espaços (01310-100, 99.1234.5678): o site lê só os dígitos (digits() em
# api/_lib/correios.js), então só os dígitos vão para o .env. No usuário, só um CPF (11) ou CNPJ (14) assim vira números.
SEPARATED='^[0-9./ -]+$'
tidy() {  # tidy <como: texto|numeros|usuario> <valor>
  local kind=$1 value=$2 d
  if [ "$kind" != texto ] && [[ "$value" =~ $SEPARATED ]]; then
    d=${value//[!0-9]/}
    if [ "$kind" = numeros ] || [ ${#d} -eq 11 ] || [ ${#d} -eq 14 ]; then value=$d
    elif [ "$value" != "$d" ]; then value=''; fi   # um CPF/CNPJ com pontos e um número a mais ou a menos: digitar de novo
  fi
  printf '%s' "$value"
}
# Aspas e barra invertida nunca entram: o systemd (EnvironmentFile) lê esses sinais de um jeito especial.
fits() { [[ -n "$1" && "$1" =~ $2 && "$1" != *[\'\"\\]* ]]; }
declare -A NEW=()
ask() {  # ask <VAR> <pergunta> <secreto 0|1> <regex> [como: texto|numeros|usuario] [aviso]
  local var=$1 label=$2 secret=$3 re=$4 kind=${5:-texto} hint=${6:-'Valor com formato inesperado; confira e digite de novo.'} value had fixed
  # Enter só mantém o atual quando ele já serve, e aí grava a forma limpa (um CPF com pontos vira só os números)
  had=$(current "$var"); fixed=$(tidy "$kind" "$had"); fits "$fixed" "$re" || had=''; [ -n "$had" ] && label="$label [Enter mantém o atual]"
  while :; do
    if [ "$secret" = 1 ]; then read -r -s -p "$label: " value; echo; else read -r -e -p "$label: " value; fi
    value=${value//$'\r'/}; value="${value#"${value%%[![:space:]]*}"}"; value="${value%"${value##*[![:space:]]}"}"
    if [ -z "$value" ] && [ -n "$had" ]; then [ "$fixed" = "$had" ] || NEW[$var]=$fixed; return 0; fi
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
  local value again problem had='' label="Senha do painel (12 a 128 caracteres, sem espaços, aspas, barra invertida, acentos nem ç; não aparece na tela)"
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

# Enter escolhe tudo, como antes da opção do Bling (o "3 = os dois" de antes virou o 4); em cada parte, Enter mantém o
# que já está certo.
read -r -p "O que configurar? 1 = Painel da Júlia (primeiro acesso), 2 = Frete dos Correios, 3 = Nota fiscal (Bling), 4 = tudo [4]: " choice
choice=${choice//[[:space:]]/}
case "${choice:-4}" in
  1) panel=1; ship=''; nfe='' ;;
  2) panel=''; ship=1; nfe='' ;;
  3) panel=''; ship=''; nfe=1 ;;
  4) panel=1; ship=1; nfe=1 ;;
  *) echo "Responda 1, 2, 3 ou 4."; exit 1 ;;
esac

if [ -n "$panel" ] && [ -z "$TESTING" ]; then
  body=$(curl -fsS -m 5 "$HEALTH" 2>/dev/null || true)
  if grep -q '"admin":"ready"' <<<"$body"; then
    echo "O painel já tem alguém cadastrado. ADMIN_EMAIL e ADMIN_PASSWORD só criam a PRIMEIRA pessoa: trocar aqui não muda"
    echo "a senha de quem já entra (para trocar a senha ou o celular, veja ADMIN-SETUP.md)."
    read -r -p "Continuar mesmo assim? (s/N): " sure
    if [[ "${sure,,}" != s* ]]; then
      panel=''; echo "O painel fica como está."
      [ -n "$ship$nfe" ] || { echo "Nada foi alterado."; exit 0; }
    fi
  elif [ -z "$body" ]; then
    echo "(Não consegui ler o /api/health agora; sigo assim mesmo.)"
  fi
fi

if [ -n "$panel" ]; then
  echo "== Painel da Júlia (primeiro acesso)"
  ask ADMIN_EMAIL "E-mail com que a Júlia vai entrar no painel" 0 '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' texto \
    "E-mail com formato inesperado (exemplo: nome@gmail.com); digite de novo."
  ask_password
fi

if [ -n "$ship" ]; then
  echo "== Frete dos Correios (dados do contrato da Júlia; o passo a passo está em FRETE-SETUP.md)"
  ask CORREIOS_USER "Usuário da API (o login do Meu Correios: CPF/CNPJ só com números ou o nome de usuário)" 0 '^[A-Za-z0-9._@-]{3,80}$' usuario \
    "Use só letras, números e . _ @ - (de 3 a 80); CPF tem 11 números e CNPJ 14. Confira e digite de novo."
  ask CORREIOS_CODE "Código de acesso da API (CWS → Gestão de acesso a API's → Gerar código; não aparece na tela)" 1 '^[A-Za-z0-9._-]{16,200}$' texto \
    "Código com formato inesperado (letras, números e . _ -, pelo menos 16); copie de novo do CWS e cole."
  ask CORREIOS_CONTRACT "Número do contrato (Correios Empresas → Consultar Contratos)" 0 '^[0-9]{6,12}$' numeros \
    "O contrato tem de 6 a 12 números; confira e digite de novo."
  ask CORREIOS_CARD "Número do cartão de postagem (Correios Empresas → Cartões de Postagem)" 0 '^[0-9]{10}$' numeros \
    "O cartão de postagem tem 10 números (com os zeros da frente); confira e digite de novo."
  ask CORREIOS_DR "DR: o número da \"Unidade Gestora\" na tela do contrato (por exemplo 72)" 0 '^[0-9]{1,3}$' numeros \
    "A DR é só o número da Unidade Gestora (1 a 3 números); confira e digite de novo."
  ask SHIP_FROM_CEP "CEP de onde a Júlia despacha (12345-678)" 0 '^(0[1-9]|[1-9][0-9])[0-9]{6}$' numeros \
    "O CEP tem 8 números (12345-678); confira e digite de novo."
fi

# Bling (NFE-SETUP.md): o aplicativo do site no Bling dá o Client ID e o Client Secret (texto opaco: letras e números, sem
# tamanho fixo); a conta só se conecta depois, pelo painel, com o link de redirecionamento igual a SITE_URL/admin.html
# (api/_lib/bling.js). NFE_ENVIRONMENT vazio = homologação; "producao" (essa palavra exata, api/_lib/fiscal.js) = notas de
# verdade.
bling_steps() {
  echo "Para conectar a conta da empresa:"
  echo "  1. No Bling (Central de Extensões → Área do Integrador → o aplicativo do site), o Link de redirecionamento tem de ser"
  echo "     exatamente $DOMAIN/admin.html (sem www e sem barra no fim). Se o aplicativo era o do site de teste, o site de teste"
  echo "     deixa de conectar: é o roteiro do lançamento."
  echo "  2. Painel da Júlia ($DOMAIN/admin.html) → cartão \"Nota fiscal · Bling\" → Conectar ao Bling → entrar com a conta da"
  echo "     empresa e permitir. O painel volta mostrando \"Bling conectado\" e as naturezas de operação."
  echo "  3. Confira: curl -s $HEALTH | grep -o '\"bling\":\"[a-z_]*\"'  → \"bling\":\"connected\"."
}
if [ -n "$nfe" ]; then
  echo "== Nota fiscal (Bling): o aplicativo do site no Bling (o passo a passo está em NFE-SETUP.md)"
  [ "$(current NFE_PROVIDER)" = bling ] || NEW[NFE_PROVIDER]=bling
  ask BLING_CLIENT_ID "Client ID do aplicativo (Bling → Central de Extensões → Área do Integrador → o aplicativo)" 0 '^[A-Za-z0-9._-]{16,128}$' texto \
    "O Client ID tem letras e números (pelo menos 16); copie de novo do Bling e cole."
  ask BLING_CLIENT_SECRET "Client Secret do aplicativo (não aparece na tela)" 1 '^[A-Za-z0-9._-]{16,200}$' texto \
    "O Client Secret tem letras e números (pelo menos 16); copie de novo do Bling e cole."
  # O link que o site manda ao Bling sai de SITE_URL: no servidor da loja, sempre o domínio (config-pagamentos.sh grava o mesmo).
  site=$(current SITE_URL)
  if [ "${site%/}" != "$DOMAIN" ]; then NEW[SITE_URL]=$DOMAIN; echo "  SITE_URL estava \"$site\": fica $DOMAIN (o link que o site manda ao Bling é SITE_URL/admin.html)."; fi
  was_env=$(current NFE_ENVIRONMENT); default=1; [ "$was_env" != producao ] || default=2
  while :; do
    read -r -p "Ambiente das notas: 1 = homologação (testes, sem valor fiscal), 2 = produção (notas de verdade) [$default = o atual]: " where
    where=${where//[[:space:]]/}
    case "${where:-$default}" in 1|2) break ;; *) echo "  Responda 1 ou 2." ;; esac
  done
  target=''
  if [ "${where:-$default}" = 2 ]; then
    target=producao
    if [ "$was_env" != producao ]; then
      echo "  Produção emite notas com valor fiscal. Só vale com a contadora de acordo e o Bling já em produção (\"1 - Produção\""
      echo "  e a série 1 seguindo na nota nº 11; NFE-SETUP.md, passo 5)."
      read -r -p "  A contadora está de acordo e o Bling já está em produção? (s/N): " sure
      [[ "${sure,,}" == s* ]] || { target=$was_env; echo "  O ambiente das notas fica como estava (homologação)."; }
    fi
  elif [ "$was_env" = producao ]; then
    echo "  As notas voltam para homologação (sem valor fiscal)."
  fi
  [ "$target" = "$was_env" ] || NEW[NFE_ENVIRONMENT]=$target
fi

if [ ${#NEW[@]} -eq 0 ]; then
  echo "Nada foi alterado (os valores ficaram como estavam)."
  [ -z "$nfe" ] || bling_steps
  exit 0
fi
newapp=''; [ -z "${NEW[BLING_CLIENT_ID]+x}" ] || [ "${NEW[BLING_CLIENT_ID]}" = "$(current BLING_CLIENT_ID)" ] || newapp=1

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
for i in $(seq 1 30); do body=$(curl -fsS -m 5 "$HEALTH" 2>/dev/null || true); grep -q '"ok":true' <<<"$body" && break; sleep 1; done
grep -q '"ok":true' <<<"$body" || { echo "O site não respondeu: journalctl -u juimprime -n 40"; exit 1; }
[ -z "$panel" ] || grep -o '"admin":"[a-z]*"' <<<"$body" || true
[ -z "$ship" ] || grep -o '"shipping":"[a-z]*"' <<<"$body" || true
[ -z "$nfe" ] || grep -o '"nfe":"[a-z]*"\|"fiscal":"[a-z]*"\|"bling":"[a-z_]*"\|"queue":{[^}]*}' <<<"$body" || true
state() { grep -o "\"$1\":\"[a-z_]*\"" <<<"$body" | cut -d'"' -f4 || true; }
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
    correios) echo "Dados dos Correios completos: o checkout passa a cotar pelo contrato, mas os Correios só conferem na primeira cotação."
      echo "Faça agora uma cotação no carrinho com um CEP. Sem PAC e SEDEX, os Correios recusaram o usuário, o código ou o cartão,"
      echo "e o checkout não fecha pedidos até corrigir: rode de novo, opção 2 (o motivo: journalctl -u juimprime -n 50 | grep shipping)." ;;
    pending) echo "Os dados dos Correios estão gravados, mas falta dado da loja em api/_lib/shipping-config.js (caixas, prazos ou serviços): me chame." ;;
    *) echo "Frete real desligado: algum dado dos Correios ficou vazio. Rode de novo, opção 2." ;;
  esac
fi
if [ -n "$nfe" ]; then
  case "$(state nfe)" in
    live) echo "Notas fiscais de verdade (produção)." ;;
    test) echo "Notas fiscais em homologação (sem valor fiscal)."
      [ "$target" != producao ] || echo "ATENÇÃO: NFE_ENVIRONMENT=producao só vale com APP_ENV=production: rode config-pagamentos.sh (ele grava APP_ENV)." ;;
    *) echo "A nota fiscal ficou desligada: confira NFE_PROVIDER=bling no .env e me chame." ;;
  esac
  [ "$(state fiscal)" != pending ] || echo "Faltam dados fiscais em api/_lib/fiscal.js (o pedido mostra quais): nenhuma nota sai até completar. Me chame."
  case "$(state bling)" in
    connected) echo "O Bling já está conectado."
      [ -z "$newapp" ] || echo "Como o Client ID mudou, no painel: Desconectar o Bling e Conectar de novo (a autorização era do aplicativo de antes)." ;;
    disconnected) echo "Aplicativo do Bling gravado; falta conectar a conta."; bling_steps ;;
    paused|unstable) echo "O Bling está conectado, mas com a emissão pausada ou instável: veja o cartão \"Nota fiscal · Bling\" no painel (BLING-RESILIENCIA.md)." ;;
    not_configured) echo "Faltou o Client ID ou o Client Secret: rode de novo, opção 3." ;;
    *) echo "Não consegui ler a conexão com o Bling (\"bling\":\"$(state bling)\"): confira o \"db\" em curl -s $HEALTH e me chame." ;;
  esac
  [ "$(state nfe)" = off ] || grep -q '"worker":true' <<<"$body" || echo "A fila das notas não está rodando (\"queue\" sem \"worker\":true): journalctl -u juimprime -n 40 | grep fila, e me chame."
fi
