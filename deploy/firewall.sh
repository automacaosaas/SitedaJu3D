#!/usr/bin/env bash
# Firewall do servidor (nftables), para IPv4 e IPv6. Rodar como root, numa sessão SSH:
#   sudo bash firewall.sh
# Deixa entrar da internet só o site (80 e 443) e o ping. O SSH (22) só entra das redes internas (10.x, 100.64.x do
# provedor, 172.16.x, 192.168.x e as faixas locais do IPv6). Não mexe na saída: GitHub, npm e as APIs continuam.
# Trava de segurança: depois de aplicar, o script pede para você abrir OUTRA sessão SSH e digitar OK em 2 minutos. Sem
# isso (por exemplo, se o acesso cair), ele volta sozinho para as regras de antes. Veja SERVIDOR-SETUP.md.
set -euo pipefail

# Redes que podem entrar por SSH, além das internas. 201.77.147.194: de onde o administrador do provedor (usuário
# gleber) entrava em 06/10/2026. Confirmar com o provedor e acrescentar outros endereços separados por vírgula.
EXTRA_SSH_V4="201.77.147.194/32"
CONF=/etc/nftables.conf
STAMP=$(date +%Y%m%d-%H%M%S)

[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0"; exit 1; }
command -v nft >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nftables >/dev/null

ssh_v4="10.0.0.0/8, 100.64.0.0/10, 172.16.0.0/12, 192.168.0.0/16${EXTRA_SSH_V4:+, $EXTRA_SSH_V4}"
new=$(mktemp)
cat > "$new" <<EOF
#!/usr/sbin/nft -f
# Gerado por deploy/firewall.sh em $(date '+%d/%m/%Y %H:%M'). Regras anteriores em $CONF.antes-$STAMP.
flush ruleset

table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;
        iif "lo" accept
        ct state established,related accept
        ct state invalid drop
        # ICMPv6 é obrigatório para o IPv6 funcionar; o ping do IPv4 com limite.
        meta l4proto ipv6-icmp accept
        icmp type echo-request limit rate 10/second accept
        # O site, para todo mundo.
        tcp dport { 80, 443 } accept
        # SSH só das redes internas.
        ip saddr { $ssh_v4 } tcp dport 22 accept
        ip6 saddr { fe80::/10, fc00::/7 } tcp dport 22 accept
        # Endereço automático (DHCP) do IPv4 e do IPv6.
        udp dport { 68, 546 } accept
    }
    chain forward {
        type filter hook forward priority filter; policy drop;
    }
    chain output {
        type filter hook output priority filter; policy accept;
    }
}
EOF

nft -c -f "$new" || { echo "As regras novas têm erro: nada foi alterado."; rm -f "$new"; exit 1; }
echo "== Regras atuais (guardadas em /root/nft-antes-$STAMP.nft):"
nft list ruleset | tee "/root/nft-antes-$STAMP.nft"
[ -f "$CONF" ] && cp -a "$CONF" "$CONF.antes-$STAMP"

nft -f "$new"
echo
echo "== Firewall aplicado. AGORA: abra OUTRA janela, entre de novo no servidor (ssh luis@10.0.100.80)"
echo "   e, se entrar, volte aqui e digite OK + Enter em até 2 minutos. Sem isso, as regras de antes voltam sozinhas."
answer=""
read -r -t 120 answer || true
if [ "$answer" != "OK" ]; then
  nft flush ruleset
  nft -f "/root/nft-antes-$STAMP.nft" 2>/dev/null || true
  rm -f "$new"
  echo "Sem confirmação: as regras de antes voltaram. Nada foi gravado."
  exit 1
fi
install -m 755 "$new" "$CONF"
rm -f "$new"
systemctl enable nftables >/dev/null 2>&1
echo "Confirmado: firewall gravado em $CONF e ligado também depois de reiniciar o servidor."
