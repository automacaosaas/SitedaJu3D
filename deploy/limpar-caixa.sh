#!/usr/bin/env bash
# Zera o Fluxo de caixa do Painel da Júlia, para ela começar do valor real da conta (09/10/2026, pedido do dono: "Reinicia o
# fluxo de caixa da Júlia. Deixa limpo, com tudo validado."). Rodar como root:
#   sudo bash /srv/juimprime/current/deploy/limpar-caixa.sh
# Uma rodada:
#   1. a cópia do banco, antes de tudo (deploy.sh --backup limpeza, como o usuário do site), conferida (gzip inteiro e o
#      "Dump completed" no fim) e guardada também em /var/backups/juimprime (só root), fora do rodízio das 10 cópias de
#      shared/backups; sem ela, nada é apagado;
#   2. mostra o que existe: lançamentos à mão (e quantos são "Ajuste de saldo"), contas a pagar (e quantas trancadas),
#      pedidos de TESTE do Mercado Pago (por status) e pedidos REAIS;
#   3. pergunta o alcance: 1 = só o caixa (lançamentos à mão, ajustes de saldo e contas a pagar, também as trancadas);
#      2 = o caixa e os pedidos de teste, com o que pende deles (peças, histórico, notas fiscais de homologação e registros
#      do Bling), para o painel começar limpo (o recomendado no lançamento);
#   4. mostra o que vai apagar e só segue com LIMPAR (em maiúsculas). Apaga numa transação só e por id: só o que foi
#      mostrado (um lançamento feito durante a rodada fica). Registra "caixa zerado pelo servidor" no registro de auditoria
#      do painel (admin_audit) e conta de novo.
# Pedidos REAIS (source 'live') nunca são apagados: as vendas de verdade continuam no caixa. Um pedido de teste com nota
# fiscal no ambiente de PRODUÇÃO que passou pelo Bling também fica: ela pode ser de verdade (cancelar no Bling).
# Depois, a Júlia toca em "Informar o saldo de hoje" no painel. Veja ADMIN-SETUP.md ("Fluxo de caixa") e SERVIDOR-SETUP.md.
# Testar no computador (sem root, com um banco de mentira; tests/deploy.mjs faz isso):
#   JU_TEST=1 JU_ENV_FILE=<.env> JU_DEPLOY=<cópia de mentira> JU_MARIADB=<mariadb de mentira> bash deploy/limpar-caixa.sh
set -euo pipefail

APP_DIR=/srv/juimprime
APP_USER=juimprime
ENV_FILE=${JU_ENV_FILE:-$APP_DIR/shared/.env}
DEPLOY=/usr/local/lib/juimprime/deploy.sh   # instalado por setup-servidor.sh
KEEP_DIR=/var/backups/juimprime             # só root (o config-loja.sh guarda ali o .env de antes)
TESTING=${JU_TEST:-}
if [ -n "$TESTING" ]; then
  [ "$(id -u)" -ne 0 ] || { echo "JU_TEST é só para o teste no computador: no servidor, rode sem ele."; exit 1; }
  DEPLOY=${JU_DEPLOY:?}; KEEP_DIR=$(dirname -- "$ENV_FILE")
  as_app() { "$@"; }
  db() { "${JU_MARIADB:?}" "$@"; }
else
  [ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0"; exit 1; }
  command -v mariadb >/dev/null || { echo "Falta o cliente mariadb (sudo apt install mariadb-client)."; exit 1; }
  [ -x "$DEPLOY" ] && grep -q -- '--backup' "$DEPLOY" || { echo "Falta $DEPLOY (com a cópia do banco): rode antes sudo bash $APP_DIR/current/deploy/setup-servidor.sh"; exit 1; }
  cd /   # o juimprime não entra na pasta de quem rodou o sudo (o /home do Debian é só do dono)
  # root lê e copia na pasta do juimprime só como o próprio juimprime: um link deixado ali nunca leva a um arquivo do sistema
  as_app() { runuser -u "$APP_USER" -- "$@"; }
  # o MariaDB como root pelo socket (o mesmo que "sudo mariadb"): nenhuma senha na linha de comando nem no ambiente
  db() { mariadb "$@"; }
fi

# Do .env sai só a linha do DB_NAME (como o envget do deploy.sh): nenhum segredo entra neste script.
DB=$(as_app grep -m 1 -E '^DB_NAME=' -- "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
[[ "$DB" =~ ^[A-Za-z0-9_]{1,64}$ ]] || { echo "Não achei um DB_NAME válido em $ENV_FILE."; exit 1; }
q() { db --batch --skip-column-names --default-character-set=utf8mb4 "$DB"; }   # o SQL pela entrada; a resposta, com tabulações
reais() { printf 'R$ %d,%02d' $(($1 / 100)) $(($1 % 100)); }
numbers() { local n; for n in "$@"; do [[ "$n" =~ ^[0-9]+$ ]] || return 1; done; }
SHOW=40   # linhas de cada lista na tela (as contagens são sempre as de tudo)
more() { if [ "$1" -gt "$SHOW" ]; then echo "    … e mais $(($1 - SHOW))"; fi; }

echo "== 1. Cópia do banco (antes de qualquer outra coisa)"
if ! out=$(as_app "$DEPLOY" --backup limpeza 2>&1); then
  printf '%s\n' "$out"; echo "A cópia do banco falhou: nada foi apagado."; exit 1
fi
copy=$(grep -oE '[^ ]*/limpeza-[0-9]{8}-[0-9]{6}\.sql\.gz' <<<"$out" | tail -n 1 || true)
# conferida antes de qualquer DELETE: o gzip inteiro e a linha "Dump completed" que o mariadb-dump escreve no fim
if [ -z "$copy" ] || ! as_app sh -c 'test -s "$1" && gzip -t "$1" && gzip -dc "$1" | tail -n 1 | grep -q "Dump completed"' sh "$copy"; then
  printf '%s\n' "$out"; echo "Não consegui conferir a cópia do banco: nada foi apagado."; exit 1
fi
[ -n "$TESTING" ] || install -d -o root -g root -m 700 "$KEEP_DIR"
kept="$KEEP_DIR/$(basename -- "$copy")"
if ! (umask 077; as_app cat -- "$copy" > "$kept"); then
  rm -f -- "$kept"; echo "Não consegui guardar a cópia em $KEEP_DIR: nada foi apagado."; exit 1
fi
echo "ok: $copy"
echo "    e outra fora do rodízio (as cópias diárias empurram as antigas de shared/backups): $kept"

PAID="'pendente', 'confirmado', 'enviado', 'concluido', 'recusado'"   # pedido pago (PAID em api/_lib/orders.js)
# Nota fiscal no ambiente de PRODUÇÃO que passou pelo Bling ou ainda vai (autorizada, em processamento, na fila, com chave
# de acesso ou com o código da nota no Bling): pode ser de verdade, então o pedido de teste dela não sai daqui. Sai só a
# recusada antes de ir ao Bling ("pedido de teste, sem nota real", api/_lib/invoicing.js).
REAL_NOTE="EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = orders.id AND i.environment = 'producao' AND (i.status <> 'erro' OR i.access_key IS NOT NULL OR i.provider_id IS NOT NULL))"
TEST_ORDERS="source <> 'live' AND NOT $REAL_NOTE"

echo
echo "== 2. O que existe hoje (banco $DB)"
if ! row=$(q <<<"SELECT (SELECT COUNT(*) FROM cash_entries) AS lancamentos, (SELECT COUNT(*) FROM cash_entries WHERE category = 'ajuste') AS ajustes,
  (SELECT COUNT(*) FROM bills) AS contas, (SELECT COUNT(*) FROM bills WHERE locked_at IS NOT NULL) AS trancadas,
  (SELECT COUNT(*) FROM orders WHERE source <> 'live') AS teste, (SELECT COUNT(*) FROM orders WHERE $TEST_ORDERS) AS teste_sem_nota_real,
  (SELECT COUNT(*) FROM orders WHERE source = 'live') AS reais,
  (SELECT COUNT(*) FROM orders WHERE source = 'live' AND paid_at IS NOT NULL AND status IN ($PAID)) AS reais_pagos;"); then
  echo "Não consegui ler o banco como root (sudo mariadb $DB). Nada foi apagado; a cópia está em $kept."; exit 1
fi
read -r n_entries n_adjust n_bills n_locked n_test n_gone n_live n_paid <<<"$row" || true
numbers "${n_entries:-}" "${n_adjust:-}" "${n_bills:-}" "${n_locked:-}" "${n_test:-}" "${n_gone:-}" "${n_live:-}" "${n_paid:-}" || { echo "Resposta inesperada do banco: nada foi apagado."; exit 1; }
echo "Lançamentos à mão (entradas e despesas): $n_entries, dos quais $n_adjust são \"Ajuste de saldo\""
echo "Contas a pagar: $n_bills ($n_locked trancadas)"
echo "Pedidos de TESTE do Mercado Pago: $n_test"
while IFS=$'\t' read -r status n; do
  if [ -n "$status" ]; then echo "    ${status//_/ }: $n"; fi
done <<<"$(q <<<"SELECT status, COUNT(*) AS n FROM orders WHERE source <> 'live' GROUP BY status ORDER BY status;")"
echo "Pedidos REAIS: $n_live ($n_paid pagos: as vendas de verdade, que continuam no caixa). Estes nunca são apagados."

echo
echo "== 3. O que limpar?"
echo "  1 = só o caixa: os lançamentos à mão, os ajustes de saldo e as contas a pagar (também as trancadas)"
echo "  2 = o caixa e também os pedidos de TESTE do Mercado Pago, com as peças, o histórico, as notas fiscais de"
echo "      homologação e os registros do Bling deles: o painel começa limpo (o recomendado no lançamento)"
echo "  Os pedidos REAIS ficam intactos nas duas opções."
scope=''
read -r -p "Responda 1 ou 2: " scope || true
scope=${scope//[[:space:]]/}
case "$scope" in 1|2) ;; *) echo "Responda 1 ou 2. Nada foi apagado."; exit 1 ;; esac

# Os ids de agora: é só isso que sai (validados, porque entram no texto do SQL).
ID_RE='^[A-Za-z0-9-]{1,36}$'
ids() {  # ids <variável> <SELECT de uma coluna de ids>
  local -n into=$1
  local found one
  into=()
  found=$(q <<<"$2") || { echo "Erro ao ler o banco: nada foi apagado."; exit 1; }
  if [ -n "$found" ]; then mapfile -t into <<<"$found"; fi
  for one in "${into[@]}"; do [[ "$one" =~ $ID_RE ]] || { echo "Id inesperado ($1): nada foi apagado."; exit 1; }; done
}
in_list() { local one list=''; for one in "$@"; do list+="${list:+, }'$one'"; done; printf '%s' "$list"; }
entry_ids=() bill_ids=() order_ids=()
ids entry_ids "SELECT id FROM cash_entries ORDER BY occurred_on, created_at, id;"
ids bill_ids "SELECT id FROM bills ORDER BY due_on, created_at, id;"
if [ "$scope" = 2 ]; then ids order_ids "SELECT id FROM orders WHERE $TEST_ORDERS ORDER BY created_at, id;"; fi

echo
echo "== 4. O que vai ser apagado"
if [ ${#entry_ids[@]} -gt 0 ]; then
  echo "${#entry_ids[@]} lançamento(s) à mão:"
  q <<<"SELECT occurred_on, kind, category, amount_cents, description FROM cash_entries WHERE id IN ($(in_list "${entry_ids[@]}")) ORDER BY occurred_on, created_at LIMIT $SHOW;" |
    while IFS=$'\t' read -r on kind category cents text; do
      if [ "$kind" = saida ]; then kind=saída; fi
      printf '    %s  %s · %s  %s  %s\n' "$on" "$kind" "$category" "$(reais "$cents")" "$text"
    done
  more ${#entry_ids[@]}
fi
if [ ${#bill_ids[@]} -gt 0 ]; then
  echo "${#bill_ids[@]} conta(s) a pagar:"
  # nenhuma coluna vazia na resposta: o read junta tabulações seguidas e as colunas andariam
  q <<<"SELECT due_on, paid_on, CASE WHEN locked_at IS NULL THEN 'aberta' ELSE 'trancada' END AS cadeado, amount_cents, description FROM bills WHERE id IN ($(in_list "${bill_ids[@]}")) ORDER BY due_on, created_at LIMIT $SHOW;" |
    while IFS=$'\t' read -r due paid lock cents text; do
      if [ "$paid" = NULL ]; then paid=pendente; else paid="paga em $paid"; fi
      if [ "$lock" = trancada ]; then paid+=" · trancada"; fi
      printf '    vence %s  %s  %s  %s\n' "$due" "$(reais "$cents")" "$paid" "$text"
    done
  more ${#bill_ids[@]}
fi
if [ ${#order_ids[@]} -gt 0 ]; then
  list=$(in_list "${order_ids[@]}")
  echo "${#order_ids[@]} pedido(s) de teste:"
  q <<<"SELECT reference, status, total_cents, created_at FROM orders WHERE id IN ($list) ORDER BY created_at LIMIT $SHOW;" |
    while IFS=$'\t' read -r ref status cents at; do printf '    %s  %s  %s  criado em %s\n' "$ref" "${status//_/ }" "$(reais "$cents")" "${at:0:10}"; done
  more ${#order_ids[@]}
  read -r n_items n_events n_notes n_log <<<"$(q <<<"SELECT (SELECT COUNT(*) FROM order_items WHERE order_id IN ($list)) AS pecas,
    (SELECT COUNT(*) FROM order_events WHERE order_id IN ($list)) AS historico, (SELECT COUNT(*) FROM invoices WHERE order_id IN ($list)) AS notas,
    (SELECT COUNT(*) FROM integration_log WHERE reference IN (SELECT reference FROM orders WHERE id IN ($list))) AS registros;")"
  echo "    junto com eles: $n_items peça(s), $n_events linha(s) de histórico, $n_notes nota(s) fiscal(is) (de homologação ou recusadas"
  echo "    por serem de teste: nenhuma vale como nota de verdade) e $n_log registro(s) do Bling"
fi
if [ "$scope" = 2 ]; then
  while IFS=$'\t' read -r ref status; do
    if [ -n "$ref" ]; then echo "FICA: $ref ($status; pedido de teste com nota fiscal de PRODUÇÃO: confira a nota no Bling, cancele se foi autorizada, e fale com a contadora)"; fi
  done <<<"$(q <<<"SELECT reference, status FROM orders WHERE source <> 'live' AND $REAL_NOTE ORDER BY created_at;")"
fi
if [ $((${#entry_ids[@]} + ${#bill_ids[@]} + ${#order_ids[@]})) -eq 0 ]; then
  echo "Nada: o caixa já está limpo$([ "$scope" = 1 ] && [ "$n_gone" -gt 0 ] && echo " ($n_gone pedido(s) de teste saem na opção 2)" || true)."
  echo "Se ainda não fez, a Júlia toca em \"Informar o saldo de hoje\" no Fluxo de caixa do painel."
  exit 0
fi
echo "Os $n_live pedidos REAIS não são tocados."
answer=''
read -r -p "Para apagar, digite LIMPAR (em maiúsculas; qualquer outra resposta cancela): " answer || true
answer=${answer//$'\r'/}
[ "$answer" = LIMPAR ] || { echo "Nada foi apagado."; exit 1; }

# Numa transação só: um erro em qualquer linha (o cliente mariadb para nela) e o MariaDB desfaz tudo. Os pedidos de teste
# vão para uma tabela temporária desta conexão (com as mesmas colunas de orders, criada antes da transação), filtrados de
# novo já dentro dela (nunca um pedido real, nunca um com nota de produção); cada tabela que pende deles sai pela chave
# dela, e o pedido por último.
detail="caixa zerado pelo servidor (limpar-caixa.sh, opção $scope): ${#entry_ids[@]} lançamento(s) à mão, ${#bill_ids[@]} conta(s) a pagar"
if [ "$scope" = 2 ]; then detail+=", ${#order_ids[@]} pedido(s) de teste"; fi
sql=''
if [ ${#order_ids[@]} -gt 0 ]; then sql+="CREATE TEMPORARY TABLE limpeza_pedidos AS SELECT id, reference FROM orders WHERE 1 = 0;"$'\n'; fi
sql+="START TRANSACTION;"$'\n'
if [ ${#entry_ids[@]} -gt 0 ]; then sql+="DELETE FROM cash_entries WHERE id IN ($(in_list "${entry_ids[@]}"));"$'\n'; fi
if [ ${#bill_ids[@]} -gt 0 ]; then sql+="DELETE FROM bills WHERE id IN ($(in_list "${bill_ids[@]}"));"$'\n'; fi
if [ ${#order_ids[@]} -gt 0 ]; then
  sql+="INSERT INTO limpeza_pedidos (id, reference) SELECT id, reference FROM orders WHERE $TEST_ORDERS AND id IN ($(in_list "${order_ids[@]}"));"$'\n'
  sql+="DELETE FROM integration_log WHERE reference IN (SELECT reference FROM limpeza_pedidos);"$'\n'
  sql+="DELETE FROM invoices WHERE order_id IN (SELECT id FROM limpeza_pedidos);"$'\n'
  sql+="DELETE FROM order_events WHERE order_id IN (SELECT id FROM limpeza_pedidos);"$'\n'
  sql+="DELETE FROM order_items WHERE order_id IN (SELECT id FROM limpeza_pedidos);"$'\n'
  sql+="DELETE FROM orders WHERE source <> 'live' AND id IN (SELECT id FROM limpeza_pedidos);"$'\n'
fi
sql+="INSERT INTO admin_audit (admin_id, action, detail, ip) VALUES (NULL, 'cash_reset', '$detail', NULL);"$'\n'
sql+="COMMIT;"

echo
echo "== 5. Apagando (numa transação: ou vai tudo, ou nada)"
if ! printf '%s\n' "$sql" | q; then
  echo "A limpeza parou com erro (acima): o MariaDB desfaz a transação inteira, então nada foi apagado (rode de novo para"
  echo "ver o que existe). A cópia está em $kept."
  exit 1
fi
row=$(q <<<"SELECT (SELECT COUNT(*) FROM cash_entries) AS lancamentos, (SELECT COUNT(*) FROM bills) AS contas,
  (SELECT COUNT(*) FROM orders WHERE source <> 'live') AS teste, (SELECT COUNT(*) FROM orders WHERE source = 'live') AS reais;") || row=''
read -r a_entries a_bills a_test a_live <<<"$row" || true
if ! numbers "${a_entries:-}" "${a_bills:-}" "${a_test:-}" "${a_live:-}"; then
  echo "A limpeza foi gravada, mas não consegui contar de novo: confira no painel (rodar este script de novo mostra o que existe)."
  echo "A cópia de antes da limpeza: $kept"
  exit 1
fi
echo "Agora: $a_entries lançamento(s) à mão, $a_bills conta(s) a pagar, $a_test pedido(s) de teste e $a_live pedido(s) real(is)."
if [ "$a_live" -lt "$n_live" ]; then echo "ATENÇÃO: havia $n_live pedidos reais e agora há $a_live. Pare e chame quem cuida do código (a cópia: $kept)."; exit 1; fi
if [ "$a_entries" -eq 0 ] && [ "$a_bills" -eq 0 ]; then echo "== Caixa zerado."
else echo "== Caixa zerado. (Ficaram $a_entries lançamento(s) e $a_bills conta(s) feitos durante a limpeza: confira no painel.)"; fi
echo "Registrado no registro de auditoria do painel: \"caixa zerado pelo servidor\"."
echo
echo "Agora, com a Júlia: Painel → Fluxo de caixa → \"Informar o saldo de hoje\" e digitar quanto a loja tem hoje (conta e"
echo "caixa). O caixa passa a partir desse valor; as vendas reais já pagas ($n_paid) continuam nele."
echo "A cópia de antes da limpeza: $kept (só root; apague quando não precisar mais)."
echo "Desfazer, só em caso de engano (volta o banco INTEIRO para antes da limpeza, e o que chegou depois some):"
echo "  gunzip -c $kept | sudo mariadb $DB"
