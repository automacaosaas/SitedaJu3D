#!/usr/bin/env bash
# Página "voltamos já" e guarda dos registros de acesso do nginx (08/10/2026). Rodar como root:
#   sudo bash /srv/juimprime/current/deploy/config-nginx.sh
# - Instala deploy/manutencao.html em /var/www/juimprime-manutencao. Quando o site (Node) cai ou não responde a tempo, o
#   nginx mostra essa página com o código 503 e "Retry-After: 120" (pausa curta, para o Google e os navegadores) no lugar
#   do "502 Bad Gateway". Só os erros do próprio nginx: as respostas do site, como o 503 do frete, passam como estão.
# - Grava /etc/nginx/snippets/juimprime-manutencao.conf e põe o "include" dele, uma vez, em cada bloco server da
#   configuração do site que leva ao Node (proxy_pass http://127.0.0.1:3000): o do 443 do certbot e o da porta 80, se
#   ele também leva ao site (o que só redireciona para o https fica como está).
# - Liga o HTTP/2 (09/10/2026, PageSpeed): "http2 on;" em cada bloco server do 443 (o do certbot e o do www, se houver), a
#   forma do nginx 1.25.1 em diante (o servidor tem a 1.26.3; a antiga, "listen … http2", está obsoleta). A home pede uns 60
#   arquivos: no HTTP/1.1 eles fazem fila em 6 conexões; no HTTP/2 vão juntos numa só, com um aperto de mão TLS. Bloco que já
#   decide o HTTP/2 (http2 on/off, ou o listen antigo) fica como está. Antes do certbot não há 443: rode de novo depois dele.
# - Guarda os registros de acesso do nginx por 190 dias, um arquivo por dia, comprimidos (a política de privacidade
#   promete 6 meses: Marco Civil da Internet, art. 15).
# Antes de mexer, copia o que vai mudar para /var/backups/juimprime; confere com "nginx -t" e, se falhar, volta a cópia
# sem recarregar nada. Pode rodar de novo (nada duplica). Não mexe nos certificados, no HSTS nem no server_name.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE=/etc/nginx/sites-available/juimprime
PAGE_DIR=/var/www/juimprime-manutencao
SNIPPET=/etc/nginx/snippets/juimprime-manutencao.conf
LOGROTATE_OWN=/etc/logrotate.d/juimprime-nginx
LOGROTATE_PKG=/etc/logrotate.d/nginx
COPIES=/var/backups/juimprime
STAMP=$(date +%Y%m%d-%H%M%S)

# Acrescenta "include snippets/juimprime-manutencao.conf;" em cada bloco server (do primeiro nível) que tem proxy_pass para
# 127.0.0.1:3000 e ainda não o tem, logo depois do "server_tokens off;" do bloco (sem ele, logo depois de "server {").
# Conta as chaves fora de aspas e de comentários. Em <resumo>: blocos que levam ao site, include novo, include que já havia.
add_include() {  # add_include <config> <saída> <resumo>
  awk -v info="$3" '
    function code(s) { gsub(/"[^"]*"/, "", s); sub(/#.*/, "", s); return s }
    function flush(   i, c, site, has, at, pad, add) {
      site = 0; has = 0; at = 0
      for (i = 1; i <= n; i++) {
        c = code(buf[i])
        if (c ~ /proxy_pass[ \t]+http:\/\/127\.0\.0\.1:3000[;\/]/) site = 1
        if (c ~ /^[ \t]*include[ \t]+snippets\/juimprime-manutencao\.conf[ \t]*;/) has = 1
        if (!at && lvl[i] == 1 && c ~ /^[ \t]*server_tokens[ \t]+off[ \t]*;/) at = i
      }
      add = site && !has
      if (site) sites++
      if (site && has) kept++
      if (add) {
        added++
        if (at) { match(buf[at], /^[ \t]*/); pad = substr(buf[at], 1, RLENGTH) }
        else { at = 1; match(buf[1], /^[ \t]*/); pad = substr(buf[1], 1, RLENGTH) "    " }
      }
      for (i = 1; i <= n; i++) {
        print buf[i]
        if (add && i == at) print pad "include snippets/juimprime-manutencao.conf;  # página \"voltamos já\" (deploy/config-nginx.sh)"
      }
      n = 0
    }
    {
      c = code($0)
      if (!inside && depth == 0 && c ~ /^[ \t]*server([ \t]|\{|$)/) { inside = 1; opened = 0; n = 0 }
      if (inside) { n++; buf[n] = $0; lvl[n] = depth } else print
      o = gsub(/\{/, "{", c); x = gsub(/\}/, "}", c); depth += o - x
      if (inside && o > 0) opened = 1
      if (inside && opened && depth == 0) { flush(); inside = 0 }
    }
    END { if (inside) flush(); printf "%d %d %d\n", sites, added, kept > info }
  ' "$1" > "$2"
}

# Acrescenta "http2 on;" em cada bloco server (do primeiro nível) que escuta no 443 e ainda não decide o HTTP/2 (nem
# "http2 on;"/"http2 off;" nem o antigo "listen … http2"), logo depois do último "listen" do 443 do bloco, com o mesmo recuo.
# Em <resumo>: blocos no 443, "http2 on" novo, blocos que já decidiam.
add_http2() {  # add_http2 <config> <saída> <resumo>
  awk -v info="$3" '
    function code(s) { gsub(/"[^"]*"/, "", s); sub(/#.*/, "", s); return s }
    function flush(   i, c, tls, has, at, pad) {
      tls = 0; has = 0; at = 0
      for (i = 1; i <= n; i++) {
        if (lvl[i] != 1) continue
        c = code(buf[i])
        if (c ~ /^[ \t]*listen[ \t]/ && c ~ /[ \t:]443([ \t;]|$)/) { tls = 1; at = i }
        if (c ~ /^[ \t]*http2[ \t]+(on|off)[ \t]*;/ || (c ~ /^[ \t]*listen[ \t]/ && c ~ /[ \t]http2([ \t;]|$)/)) has = 1
      }
      if (tls) blocks++
      if (tls && has) kept++
      if (tls && !has) { added++; match(buf[at], /^[ \t]*/); pad = substr(buf[at], 1, RLENGTH) }
      for (i = 1; i <= n; i++) {
        print buf[i]
        if (tls && !has && i == at) print pad "http2 on;  # HTTP/2: os arquivos da página juntos, numa conexão só (deploy/config-nginx.sh)"
      }
      n = 0
    }
    {
      c = code($0)
      if (!inside && depth == 0 && c ~ /^[ \t]*server([ \t]|\{|$)/) { inside = 1; opened = 0; n = 0 }
      if (inside) { n++; buf[n] = $0; lvl[n] = depth } else print
      o = gsub(/\{/, "{", c); x = gsub(/\}/, "}", c); depth += o - x
      if (inside && o > 0) opened = 1
      if (inside && opened && depth == 0) { flush(); inside = 0 }
    }
    END { if (inside) flush(); printf "%d %d %d\n", blocks, added, kept > info }
  ' "$1" > "$2"
}

[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0"; exit 1; }
[ -f "$SITE" ] || { echo "Não achei $SITE (rode antes o setup-servidor.sh)."; exit 1; }
[ -f "$HERE/manutencao.html" ] || { echo "Falta $HERE/manutencao.html (rode o script de dentro da pasta deploy/ do site)."; exit 1; }
step() { printf '\n== %s\n' "$*"; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
install -d -m 700 "$COPIES"

step "Página \"voltamos já\" ($PAGE_DIR)"
install -d -m 755 "$PAGE_DIR"
install -m 644 "$HERE/manutencao.html" "$PAGE_DIR/manutencao.html"
echo "ok ($(wc -c < "$PAGE_DIR/manutencao.html") bytes, tudo dentro do arquivo: não depende do site)"

step "nginx: a página no lugar do 502 e o HTTP/2"
cat > "$work/snippet" <<'EOF'
# Gerado por deploy/config-nginx.sh (a cada vez que ele roda: mudanças à mão aqui se perdem). Incluído uma vez em cada
# bloco server do site: a página "voltamos já" quando o site (Node, 127.0.0.1:3000) não responde.
#
# 502 (o Node fora do ar) e 504 (não respondeu a tempo) viram 503 com a página; o 503 só quando é do próprio nginx. Sem
# proxy_intercept_errors (desligado por padrão; não ligue): as respostas do site, como o 503 do frete
# (shipping_unavailable), passam como estão.
error_page 502 503 504 =503 /manutencao.html;

location = /manutencao.html {
    root /var/www/juimprime-manutencao;
    internal;
    # Retry-After: pausa curta (o Google não tira as páginas do índice); no-store: ninguém guarda a página de pausa.
    # (um add_header aqui vale só para esta página: os do bloco server não se somam a ela)
    add_header Retry-After 120 always;
    add_header Cache-Control "no-store" always;
}

# Prévia da página, só de dentro do próprio servidor (ou por um túnel SSH): curl http://127.0.0.1/manutencao-previa
location = /manutencao-previa {
    allow 127.0.0.1;
    allow ::1;
    deny all;
    alias /var/www/juimprime-manutencao/manutencao.html;
    default_type text/html;
    add_header Cache-Control "no-store" always;
}
EOF
snippet_copy='' snippet_new=0 site_copy=''
if [ -f "$SNIPPET" ]; then
  if ! cmp -s "$work/snippet" "$SNIPPET"; then snippet_copy="$COPIES/nginx-snippet-manutencao.antes-$STAMP"; cp -p "$SNIPPET" "$snippet_copy"; fi
else
  snippet_new=1
fi
install -d -m 755 "$(dirname "$SNIPPET")"
install -m 644 "$work/snippet" "$SNIPPET"
echo "trecho gravado em $SNIPPET"

add_include "$SITE" "$work/site-include" "$work/info"
read -r sites added kept < "$work/info"
if [ "$sites" -eq 0 ]; then
  [ -z "$snippet_copy" ] || cat "$snippet_copy" > "$SNIPPET"; [ "$snippet_new" = 0 ] || rm -f "$SNIPPET"
  echo "Não achei em $SITE nenhum bloco server com \"proxy_pass http://127.0.0.1:3000\". Nada foi alterado."; exit 1
fi
echo "include da página: acrescentado em $added bloco(s) server (já havia em $kept)"
# O HTTP/2 sobre o mesmo arquivo: uma cópia, um nginx -t e um reload para as duas mudanças.
add_http2 "$work/site-include" "$work/site" "$work/info-http2"
read -r tls h2_added h2_kept < "$work/info-http2"
if [ "$tls" -eq 0 ]; then
  echo "HTTP/2: ainda não há bloco server no 443 (o HTTPS do certbot); depois do certbot, rode este script de novo"
else
  echo "HTTP/2 (http2 on;): acrescentado em $h2_added bloco(s) do 443 (já decidido em $h2_kept)"
fi
if cmp -s "$work/site" "$SITE"; then
  echo "$SITE já estava assim: nada a mudar nele"
else
  site_copy="$COPIES/nginx-juimprime.antes-$STAMP"
  cp -p "$SITE" "$site_copy"
  cat "$work/site" > "$SITE"   # escreve por cima, mantendo dono, permissões e o link de sites-enabled
  echo "$SITE alterado; cópia de antes: $site_copy"
fi

restore() {
  [ -z "$site_copy" ] || cat "$site_copy" > "$SITE"
  if [ -n "$snippet_copy" ]; then cat "$snippet_copy" > "$SNIPPET"; elif [ "$snippet_new" = 1 ]; then rm -f "$SNIPPET"; fi
}
if ! nginx -t 2> "$work/nginx-t"; then
  cat "$work/nginx-t"
  restore
  echo
  echo "O nginx recusou a configuração nova (mensagem acima). Voltei a cópia e não recarreguei nada: o site continua como"
  echo "estava. Mande a mensagem acima para quem cuida do site."
  if nginx -t -q 2>/dev/null; then echo "(a configuração de antes confere: ok)"; else echo "(atenção: nem a configuração de antes passa no nginx -t; veja: sudo nginx -t)"; fi
  exit 1
fi
systemctl reload nginx
echo "ok: nginx -t passou e o nginx recarregou"

step "Registros de acesso do nginx: 190 dias (política de privacidade: 6 meses)"
command -v logrotate >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq logrotate >/dev/null
# O bloco do pacote do Debian 13 (nginx-common, /etc/logrotate.d/nginx: daily, rotate 14), igual, com rotate 190. O
# mesmo arquivo de log não pode estar em dois blocos (o logrotate acusa "duplicate log entry"), então o do pacote vira
# só um aviso, e o original fica guardado em /var/backups/juimprime.
cat > "$work/logrotate" <<'EOF'
# Gerado por deploy/config-nginx.sh: os registros do nginx (cada acesso, com o IP de quem visitou) guardados por 190
# dias, um arquivo por dia, comprimidos. A política de privacidade promete 6 meses (Marco Civil da Internet, art. 15).
# É o bloco do pacote do Debian (/etc/logrotate.d/nginx, que o script desliga) com "rotate 190" no lugar de "rotate 14".
/var/log/nginx/*.log {
	daily
	missingok
	rotate 190
	compress
	delaycompress
	notifempty
	create 0640 www-data adm
	sharedscripts
	prerotate
		if [ -d /etc/logrotate.d/httpd-prerotate ]; then \
			run-parts /etc/logrotate.d/httpd-prerotate; \
		fi \
	endscript
	postrotate
		invoke-rc.d nginx rotate >/dev/null 2>&1
	endscript
}
EOF
own_new=0
[ -f "$LOGROTATE_OWN" ] || own_new=1
cmp -s "$work/logrotate" "$LOGROTATE_OWN" || install -m 644 "$work/logrotate" "$LOGROTATE_OWN"
pkg_copy=''
if [ -f "$LOGROTATE_PKG" ] && grep -q '^[^#]*/var/log/nginx/' "$LOGROTATE_PKG"; then
  pkg_copy="$COPIES/logrotate-nginx.original-$STAMP"
  cp -p "$LOGROTATE_PKG" "$pkg_copy"
  cat > "$LOGROTATE_PKG" <<EOF
# Desligado por deploy/config-nginx.sh (loja Ju imprime pra mim): os registros do nginx agora são guardados por 190 dias
# em $LOGROTATE_OWN (um mesmo log não pode estar em dois arquivos). O original do pacote ficou em
# $pkg_copy.
# Num upgrade do nginx, se o apt perguntar por este arquivo, responda N (manter a versão instalada); na dúvida, rode de
# novo: sudo bash /srv/juimprime/current/deploy/config-nginx.sh
EOF
  echo "o /etc/logrotate.d/nginx do pacote virou só um aviso (original em $pkg_copy)"
fi
check=$(logrotate -d /etc/logrotate.conf 2>&1 || true)
if grep -q 'duplicate log entry' <<<"$check"; then
  grep 'duplicate log entry' <<<"$check" | head -n 5
  [ -z "$pkg_copy" ] || cat "$pkg_copy" > "$LOGROTATE_PKG"
  [ "$own_new" = 0 ] || rm -f "$LOGROTATE_OWN"
  echo "Outro arquivo em /etc/logrotate.d também cuida de /var/log/nginx (acima). Voltei o logrotate como estava;"
  echo "a página \"voltamos já\" ficou instalada. Mande a mensagem acima para quem cuida do site."
  exit 1
fi
grep -m 1 'rotating pattern: /var/log/nginx/\*\.log' <<<"$check" || echo "(não achei o bloco do nginx no logrotate -d; confira: sudo logrotate -d $LOGROTATE_OWN)"
echo "ok: $LOGROTATE_OWN (conferido com logrotate -d)"

step "Conferindo"
code() { curl -s -o /dev/null -m 10 -w '%{http_code}' "$@" 2>/dev/null || true; }
node_code=$(code http://127.0.0.1:3000/api/health)
http_code=$(code http://127.0.0.1/)
https_code='' listening=$(ss -ltn 2>/dev/null || true)
# Com HTTPS, a página se confere pelo 443: depois do certbot, o bloco da porta 80 pode só redirecionar para o https (sem
# o include; pelo IP ele responde 404), e o do 443 é o do site, também pelo IP (-k: o certificado é do domínio).
web=http://127.0.0.1 k='' tunnel=8080:127.0.0.1:80 view=http://localhost:8080 cert_note=''
h2=''
if grep -q ':443 ' <<<"$listening"; then
  https_code=$(code -k https://127.0.0.1/)
  web=https://127.0.0.1 k=k tunnel=8443:127.0.0.1:443 view=https://localhost:8443
  cert_note='; o navegador avisa que o certificado não é de "localhost": Avançado → continuar'
  # o protocolo que o nginx combina pelo 443 (ALPN): 2 = HTTP/2 ligado; 1.1 = ainda não
  h2=$(curl -sk --http2 -o /dev/null -m 10 -w '%{http_version}' https://127.0.0.1/ 2>/dev/null || true)
fi
echo "site (Node, 127.0.0.1:3000/api/health): $node_code"
echo "pelo nginx, porta 80: $http_code${https_code:+ · porta 443: $https_code}"
[ -z "$h2" ] || echo "protocolo pelo 443: HTTP/$h2 (tem de ser 2: HTTP/2 ligado)"
echo "a página direto, por fora (tem de ser 404: ela é só interna): $(code -k "$web/manutencao.html")"
echo "a prévia, daqui do servidor (200): $(code -k "$web/manutencao-previa")"
if [ "$node_code" != 200 ]; then
  echo "O site (Node) não respondeu agora: quem visita vê a página \"voltamos já\" (503). Antes da primeira publicação é"
  echo "normal; depois dela, veja: journalctl -u juimprime -n 40"
elif [ "$http_code" = 200 ] || [ "$https_code" = 200 ]; then
  echo "ok: o site continua no ar (200)"
else
  echo "Atenção: o Node responde, mas o nginx devolveu $http_code${https_code:+/$https_code}. Confira: curl -sI http://127.0.0.1/"
fi

cat <<EOF

Para ver a página:
  - prévia, sem derrubar nada (daqui do servidor):
      curl -s$k $web/manutencao-previa | head -n 12
    no seu computador, por um túnel SSH (deixe aberto e abra $view/manutencao-previa no navegador$cert_note):
      ssh -L $tunnel ${SUDO_USER:-usuario}@10.0.100.80
  - de verdade, parando o site por uns segundos (quem visitar nesse meio-tempo vê a página):
      sudo systemctl stop juimprime.service; sleep 2; curl -s${k}I $web/ | head -n 6; sudo systemctl start juimprime.service
    Espere o 503 e o Retry-After: 120. Depois: curl -s http://127.0.0.1:3000/api/health (o site de volta).
Cópias do que mudou: $COPIES
EOF
