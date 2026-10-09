#!/usr/bin/env bash
# Grava no .env do servidor o Mercado Pago (teste ou produção) e o e-mail da loja, sem abrir o arquivo à mão
# (08/10/2026). Rodar como root:  sudo bash /srv/juimprime/current/deploy/config-pagamentos.sh
# Pergunta primeiro o que configurar: 1 = Mercado Pago (e depois o e-mail), 2 = só o e-mail (Resend), sem tocar no
# Mercado Pago. Depois, cada valor (as chaves secretas não aparecem na tela nem ficam no histórico; Enter mantém o que já
# está, menos as três credenciais do Mercado Pago quando o modo muda), guarda uma cópia do .env de antes, troca só as
# linhas pedidas, reinicia o site e mostra o que o /api/health enxerga (só se cada chave existe, nunca o valor). APP_ENV
# vira production e SITE_URL o domínio da loja.
# Testar no computador (sem root, sem reiniciar nada): JU_TEST=1 JU_ENV_FILE=<um .env de teste> bash deploy/config-pagamentos.sh
# (no teste, JU_HEALTH_FILE=<um JSON> faz as vezes do /api/health no resumo antes da produção).
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
# O /api/health local (sem cabeçalho Host); no teste, o arquivo de JU_HEALTH_FILE.
health() { if [ -n "$TESTING" ]; then cat -- "${JU_HEALTH_FILE:-/dev/null}" 2>/dev/null || true; else curl -fsS -m 10 "$HEALTH" 2>/dev/null || true; fi; }
field() { grep -o "\"$1\":\"\\{0,1\\}[A-Za-z0-9_]*" <<<"$body" | head -n 1 | cut -d: -f2 | tr -d '"' || true; }

# O valor que o site usa: o systemd (EnvironmentFile) aceita espaços antes do nome e em volta do =, e, com o nome
# repetido, fica com a ÚLTIMA linha.
current() {
  local line value='' re="^[[:space:]]*$1[[:space:]]*=[[:space:]]*(.*)$"
  while IFS= read -r line; do if [[ "$line" =~ $re ]]; then value=${BASH_REMATCH[1]}; fi; done <<<"$ENV_TEXT"
  printf '%s' "${value%"${value##*[![:space:]]}"}"
}
declare -A NEW=()
mode='' changed='' was=''
ask() {  # ask <VAR> <pergunta> <secreto 0|1> <regex> [credencial do Mercado Pago: recusa|confere]
  local var=$1 label=$2 secret=$3 re=$4 cred=${5:-} value had old same
  old=$(current "$var"); had=$old
  # Enter só mantém o atual quando ele já serve e, numa credencial do Mercado Pago, quando o modo não mudou: a credencial
  # de um modo nunca fica gravada no outro.
  [[ -n "$had" && "$had" =~ $re ]] || had=''
  if [ -n "$cred" ] && [ -n "$changed" ]; then had=''; label="$label [o modo mudou: cole a $mode_label]"; fi
  [ -n "$had" ] && label="$label [Enter mantém o atual]"
  while :; do
    if [ "$secret" = 1 ]; then read -r -s -p "$label: " value; echo; else read -r -e -p "$label: " value; fi
    value=${value//$'\r'/}; value="${value#"${value%%[![:space:]]*}"}"; value="${value%"${value##*[![:space:]]}"}"
    if [ -z "$value" ] && [ -n "$had" ]; then return 0; fi
    if [ -z "$value" ]; then echo "  Cole o valor (aqui o Enter não mantém nada)."; continue; fi
    if [ -n "$cred" ] && [ "$mode" = live ] && [[ "$value" == TEST-* ]]; then
      echo "  Credencial que começa com TEST- é sempre de teste; a de produção começa com APP_USR-."; continue
    fi
    if ! [[ "$value" =~ $re ]]; then echo "  Valor com formato inesperado; confira e cole de novo."; continue; fi
    # O modo mudou e veio o mesmo valor que já estava gravado: a Public Key e o Access Token de teste e de produção são
    # sempre diferentes, então é a credencial do outro modo. A assinatura do webhook pode ser uma só por aplicação no
    # Mercado Pago (e, sem modo definido antes, não se sabe de qual modo era a gravada): aí só com a confirmação.
    if [ -n "$cred" ] && [ -n "$changed" ] && [ -n "$old" ] && [ "$value" = "$old" ]; then
      if [ "$cred" = recusa ] && [ -n "$was" ]; then
        echo "  Essa é a credencial do outro modo (a $was_label, que já estava gravada). Copie a $mode_label: Suas integrações → a aplicação → Credenciais de $mode_name."
        continue
      fi
      if [ "$cred" = recusa ]; then
        read -r -p "  É a mesma que já estava gravada (sem modo definido). Ela é mesmo a $mode_label? (s/N): " same
      else
        read -r -p "  É a mesma assinatura que já estava gravada. O Mercado Pago pode usar uma só por aplicação: em Webhooks → Configurar notificações, a do modo de $mode_name é essa mesma? (s/N): " same
      fi
      [[ "${same,,}" == s* ]] || { echo "  Então cole a do modo de $mode_name."; continue; }
    fi
    NEW[$var]=$value; return 0
  done
}

read -r -p "O que configurar? 1 = Mercado Pago (teste ou produção) e o e-mail, 2 = só o e-mail da loja (Resend), sem tocar no Mercado Pago [1]: " part
part=${part//[[:space:]]/}
case "${part:-1}" in 1|2) ;; *) echo "Responda 1 ou 2."; exit 1 ;; esac

if [ "${part:-1}" = 1 ]; then
  echo "== Mercado Pago"
  # O padrão é o modo de agora: rodar de novo e apertar Enter nunca troca o modo.
  was=$(current MP_MODE); case "$was" in test|live) ;; *) was='' ;; esac
  default=1; [ "$was" != live ] || default=2
  read -r -p "Modo: 1 = teste, 2 = produção (vendas de verdade) [$default${was:+ = o atual}]: " choice
  choice=${choice//[[:space:]]/}
  # As credenciais de teste do Mercado Pago podem começar com TEST- (as antigas) ou APP_USR- (as de hoje, iguais às de
  # produção no formato): o prefixo não diz o modo. Quem diz é MP_MODE; por isso a confirmação logo abaixo e, quando o
  # modo muda, as três credenciais coladas de novo (ask acima).
  case "${choice:-$default}" in
    1) mode=test; mode_label='credencial de TESTE'; mode_name=teste ;;
    2) mode=live; mode_label='credencial de PRODUÇÃO'; mode_name=produção ;;
    *) echo "Responda 1 ou 2."; exit 1 ;;
  esac
  case "$was" in test) was_label='de teste' ;; live) was_label='de produção' ;; *) was_label='' ;; esac
  [ "$mode" = "$was" ] || changed=1
  if [ "$mode" = live ]; then
    # Antes de vender de verdade: o que o site mostra agora. Nada é gravado sem o "s" do fim.
    echo "== Antes da produção: o que o site mostra agora (/api/health)"
    body=$(health)
    if [ -z "$body" ]; then
      echo "  (Não consegui ler o /api/health agora; confira depois com: curl -s $HEALTH)"
    else
      shipping=$(field shipping); mail=$(field mail); sender=$(field sender); nfe=$(field nfe); admin=$(field admin); free=$(field interestFree)
      [ "$free" != null ] || free='ainda sem resposta do Mercado Pago'
      echo "  Frete: ${shipping:-?} · E-mail: ${mail:-?} (remetente ${sender:-?}) · Nota fiscal: ${nfe:-?} · Painel: ${admin:-?}"
      echo "  Parcelas sem juros que o Mercado Pago dá hoje (com as credenciais de agora): ${free:-?} (o anúncio de 3x sem juros pede 3)"
      if [[ "$free" =~ ^[0-9]+$ ]] && [ "$free" -lt 3 ]; then
        echo "  ATENÇÃO: o Mercado Pago dá $free parcela(s) sem juros: o checkout só mostra o que a conta dá. Para o \"3x sem juros\": MERCADOPAGO-VALIDACAO.md, etapa 4."
      fi
      [ "$shipping" = correios ] || echo "  ATENÇÃO: o frete não está nos Correios (\"shipping\":\"${shipping:-?}\"): sem a cotação do contrato, o checkout não fecha pedidos de verdade. Antes de vender: sudo bash /srv/juimprime/current/deploy/config-loja.sh, opção 2."
      [ "$mail" = resend ] && [ "$sender" = custom ] || echo "  ATENÇÃO: o e-mail da loja não está pronto (Resend com o domínio Verified): o cliente pode ficar sem a confirmação do pedido. Opção 2 deste script."
      [ "$admin" = ready ] || echo "  ATENÇÃO: o Painel da Júlia ainda não tem ninguém (\"admin\":\"${admin:-?}\"): sem ele, ninguém confirma nem recusa os pedidos."
      case "$nfe" in
        live) ;;
        test) echo "  Nota fiscal em homologação: as notas saem sem valor fiscal até NFE_ENVIRONMENT=producao (config-loja.sh, opção 3, com a contadora de acordo)." ;;
        *) echo "  Nota fiscal desligada: as vendas não geram NF-e sozinhas (config-loja.sh, opção 3)." ;;
      esac
    fi
    read -r -p "Daqui em diante a loja faz VENDAS DE VERDADE (cobra cartões e Pix reais), com as credenciais de PRODUÇÃO da conta da Júlia (Suas integrações → a aplicação → Credenciais de produção). Confirma? (s/N): " sure
  else
    [ "$was" != live ] || echo "A loja volta ao modo de TESTE: nenhum pagamento de verdade é aceito até voltar à produção."
    read -r -p "Vai usar as credenciais de TESTE da conta da Júlia (Suas integrações → a aplicação → Credenciais de teste)? (s/N): " sure
  fi
  [[ "${sure,,}" == s* ]] || { echo "Nada foi alterado."; exit 1; }
  prefix='(TEST-|APP_USR-)'; starts='APP_USR-… ou TEST-…'; [ "$mode" = test ] || starts='APP_USR-…'
  NEW[MP_MODE]=$mode
  ask MP_PUBLIC_KEY "Public Key ($mode_name, $starts)" 0 "^${prefix}[A-Za-z0-9-]{20,120}$" recusa
  ask MP_ACCESS_TOKEN "Access Token ($mode_name, não aparece na tela)" 1 "^${prefix}[A-Za-z0-9-]{30,200}$" recusa
  ask MP_WEBHOOK_SECRET "Assinatura secreta do webhook ($mode_name, não aparece na tela)" 1 '^[A-Za-z0-9]{16,128}$' confere
fi

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
for i in $(seq 1 30); do body=$(curl -fsS -m 5 "$HEALTH" 2>/dev/null || true); grep -q '"ok":true' <<<"$body" && break; sleep 1; done
grep -o '"payments":"[a-z]*"\|"paymentsBlocked":[a-z]*\|"interestFree":[a-z0-9]*\|"mp":{[^}]*}\|"mail":"[a-z]*"\|"sender":"[a-z]*"\|"orderMail":[a-z]*\|"indexable":[a-z]*' <<<"$body" || echo "O site não respondeu: journalctl -u juimprime -n 40"
got=$(field payments)
if [ -n "$mode" ] && grep -q '"ok":true' <<<"$body" && [ "$got" != "$mode" ]; then
  echo "ATENÇÃO: o site respondeu \"payments\":\"${got:-?}\", não \"$mode\": confira as três credenciais (o \"mp\" acima) e journalctl -u juimprime -n 40."
fi
case "$mode" in
  live) echo "Esperado:\"payments\":\"live\" e os três do mp true. No Mercado Pago, Webhooks → Modo de produção → URL $DOMAIN/api/payments/webhook (sem www), só \"Order\"."
        echo "Depois: a compra real de valor baixo com estorno (MERCADOPAGO-VALIDACAO.md, etapa 6)." ;;
  test) echo "Esperado: \"payments\":\"test\" e os três do mp true." ;;
  *) echo "O Mercado Pago ficou como estava; esperado no e-mail: \"mail\":\"resend\" e, com o domínio Verified, \"sender\":\"custom\"." ;;
esac
