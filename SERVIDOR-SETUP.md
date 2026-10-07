# Servidor próprio da loja

O site roda num servidor só da loja (Debian 13, `10.0.100.80` na rede interna), com nginx na frente, o banco MariaDB
na mesma máquina e publicação automática pelo GitHub. Os arquivos ficam em `deploy/`. Este guia vale também para
refazer tudo num servidor novo.

## Como fica no servidor

| O quê | Onde |
|---|---|
| Código no ar | `/srv/juimprime/current` (aponta para uma pasta em `releases/`) |
| Versões anteriores (as 5 últimas) | `/srv/juimprime/releases/<commit>` |
| Configuração secreta | `/srv/juimprime/shared/.env` (só root e o usuário do site leem) |
| Branch publicada | `/srv/juimprime/shared/deploy.conf` |
| Usuário que roda o site | `juimprime` (sem login) |
| Serviço do site | `juimprime.service` (Node 24 em `127.0.0.1:3000`; reinicia sozinho se cair) |
| Publicação automática | `juimprime-deploy.timer` (a cada minuto) → `juimprime-deploy.service` → `deploy/deploy.sh` |
| nginx | `/etc/nginx/sites-available/juimprime` (porta 80 → `127.0.0.1:3000`) |
| Banco | MariaDB, banco e usuário `juimprime`, só em `127.0.0.1` |

**Vantagem sobre a Hostinger:** o site nunca "dorme". A fila de notas fiscais (a cada minuto) e o rastreio dos
Correios (a cada 10 minutos) rodam dentro do próprio site, sem o cron-job.org. O `/api/fila/rodar` continua
disponível como reserva.

## Instalar (uma vez)

1. **Acesso por chave.** Do computador da equipe, entrar com uma chave SSH, e não com senha. A senha do usuário só é
   digitada pela pessoa, nunca por um assistente nem por um script.
2. **Configurar o servidor.** Copiar a pasta `deploy/` para o servidor e rodar `sudo bash deploy/setup-servidor.sh`. O
   script:
   - instala o Node 24 LTS do site oficial, conferindo o arquivo pelo SHA-256 (o Node 20 do Debian já não recebe
     atualizações de segurança);
   - cria o usuário `juimprime`, as pastas, o banco e o usuário do banco (com senha aleatória);
   - cria o `.env` com as chaves aleatórias `DATA_KEY`, `INDEX_KEY`, `AUTH_SECRET` e `CRON_SECRET`;
   - instala o serviço, a publicação automática e o nginx;
   - libera, sem senha, só três comandos: o site pode se reiniciar, e o operador pode publicar e reiniciar;
   - mostra a **Deploy Key**.

   Pode rodar de novo quando `deploy/` mudar: o `.env`, as chaves e o banco nunca são sobrescritos. O script não
   mexe em firewall, SSH nem em outros sites.
3. **Deploy Key no GitHub.** Repositório → Settings → Deploy keys → Add deploy key. Colar a chave que o script
   mostrou e deixar **Allow write access desmarcado**: o servidor só baixa o código.
4. **Preencher o `.env`.** Rodar `sudo nano /srv/juimprime/shared/.env` e completar os campos vazios (painel,
   e-mail, Mercado Pago, Correios, Bling; os nomes estão em `HOSTINGER-SETUP.md` e nos guias de cada serviço).
   **Guardar uma cópia de `DATA_KEY` e `INDEX_KEY` num gerenciador de senhas:** sem elas, CPFs e telefones gravados
   ficam ilegíveis.
5. **Primeira publicação.** Rodar `sudo systemctl start juimprime-deploy.timer`, e depois
   `sudo systemctl start juimprime-deploy.service` para não esperar o minuto. Conferir em
   `http://10.0.100.80/api/health`.

## Dia a dia

- **Publicar:** subir na branch de `deploy.conf`. Em até um minuto o servidor baixa, instala, reinicia e confere
  o `/api/health`. Se a versão nova não responder, ele volta sozinho para a anterior e não tenta aquele commit de
  novo até chegar outro.
- **Publicar na hora:** `sudo systemctl start juimprime-deploy.service`.
- **Ver o que aconteceu:**
  - `journalctl -u juimprime-deploy -n 50` mostra as publicações;
  - `journalctl -u juimprime -f` mostra o site em tempo real (as mensagens `rastreio:`, `bling:` e `db:` aparecem
    aqui).
- **Depois de editar o `.env`:** `sudo systemctl restart juimprime.service`.
- **Trocar a branch publicada:** editar `deploy.conf` com `sudo nano /srv/juimprime/shared/deploy.conf` e publicar
  na hora.
- **Voltar uma versão à mão:** apontar `current` para outra pasta de `releases/` e reiniciar o serviço. O normal é
  reverter o commit no Git, e o servidor publica sozinho.

## Domínio e HTTPS

O `10.0.100.80` só existe na rede interna. Para o domínio funcionar:

1. **Rede:** o IP público da loja (a saída hoje aparece como `201.77.147.2`) precisa encaminhar as portas **80** e
   **443** para `10.0.100.80`. Isso é feito pelo provedor ou pelo roteador. Em 06/10/2026, as duas portas ainda não
   respondiam pelo IP público.
2. **DNS:** criar os registros `A` de `juimprimepramim.com.br` e `www` apontando para o IP público.
3. **nginx e certificado:**
   - trocar `server_name _` pelo domínio em `/etc/nginx/sites-available/juimprime`;
   - rodar `sudo certbot --nginx -d juimprimepramim.com.br -d www.juimprimepramim.com.br`. Ele emite o certificado
     gratuito, liga o HTTPS e renova sozinho.
4. **`.env`:** `SITE_URL=https://juimprimepramim.com.br`, e reiniciar o site.

## No lançamento

Junto com o domínio:

- **No `.env`:** `APP_ENV=production` e `MP_MODE=live`, com as credenciais reais do Mercado Pago da conta do CNPJ,
  e `NFE_ENVIRONMENT=producao`, com o Bling em produção (`NFE-SETUP.md`).
- **Mercado Pago:** o webhook apontando para `https://juimprimepramim.com.br/api/payments/webhook`, e o
  parcelamento em 3x sem juros configurado na conta (o site anuncia 3x sem juros).
- **Bling:** o link de redirecionamento do aplicativo trocado para `https://juimprimepramim.com.br/admin.html`, e a
  conta conectada de novo pelo painel.
- **Resend:** o domínio verificado, porque sem isso os e-mails só chegam ao e-mail de teste.
- **Branch:** publicar a `main`, depois de levar para ela a versão aprovada.

## Ainda falta (servidor)

- Cópia de segurança diária do banco (`mariadb-dump` agendado), guardada fora do servidor.
- Firewall: hoje o servidor não tem nenhum. O site só escuta em `127.0.0.1` e o banco também, mas vale fechar tudo
  menos as portas 22, 80 e 443, com cuidado para não perder o acesso SSH.
