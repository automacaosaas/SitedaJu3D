# Servidor próprio da loja

O site roda num servidor só da loja (Debian 13, `10.0.100.80` na rede interna), com nginx na frente, o banco MariaDB
na mesma máquina e publicação automática pelo GitHub. Os arquivos ficam em `deploy/`. Este guia vale também para
refazer tudo num servidor novo.

## Como fica no servidor

| O quê | Onde |
|---|---|
| Código no ar | `/srv/juimprime/current` (aponta para uma pasta em `releases/`; o commit fica no arquivo `REVISION`) |
| Versões anteriores (as 5 últimas) | `/srv/juimprime/releases/<commit>` |
| Configuração secreta | `/srv/juimprime/shared/.env` (só root e o usuário do site leem) |
| Branch publicada | `/srv/juimprime/shared/deploy.conf` (a `main`) |
| Cópias do banco | `/srv/juimprime/shared/backups` (uma antes de cada versão com migração nova; ficam as 10 mais novas) |
| Usuário que roda o site | `juimprime` (sem login) |
| Serviço do site | `juimprime.service` (Node 24 em `127.0.0.1:3000`; reinicia sozinho se cair) |
| Publicação automática | `juimprime-deploy.timer` (a cada minuto) → `juimprime-deploy.service` → `deploy/deploy.sh` |
| Voltar uma versão | `juimprime-rollback.service` → `deploy/deploy.sh --rollback` |
| Aviso de falha | `juimprime-deploy-alert.service` → `tools/deploy-alert.cjs` (e-mail para `ORDER_NOTIFY_EMAIL`) |
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
   - instala o serviço, a publicação automática, a volta de versão, o aviso por e-mail e o nginx (e o
     `mariadb-client`, para as cópias do banco);
   - libera, sem senha, só o necessário: o site pode se reiniciar, e o operador pode publicar, voltar a versão e
     reiniciar;
   - mostra a **Deploy Key**.

   Pode (e deve) rodar de novo quando `deploy/` mudar: a publicação avisa no journal. O `.env`, o `deploy.conf`, as
   chaves, o banco e o nginx (com o domínio e o HTTPS do certbot) nunca são sobrescritos. O script não mexe em
   firewall, SSH nem em outros sites.
3. **Deploy Key no GitHub.** Repositório → Settings → Deploy keys → Add deploy key. Colar a chave que o script
   mostrou e deixar **Allow write access desmarcado**: o servidor só baixa o código.
4. **Preencher o `.env`.** Rodar `sudo nano /srv/juimprime/shared/.env` e completar os campos vazios (painel,
   e-mail, Mercado Pago, Correios, Bling; os nomes estão em `HOSTINGER-SETUP.md` e nos guias de cada serviço).
   **Guardar uma cópia de `DATA_KEY` e `INDEX_KEY` num gerenciador de senhas:** sem elas, CPFs e telefones gravados
   ficam ilegíveis.
5. **Primeira publicação.** Rodar `sudo systemctl start juimprime-deploy.timer`, e depois
   `sudo systemctl start juimprime-deploy.service` para não esperar o minuto. Conferir em
   `http://10.0.100.80/api/health` (`"db":"ok"` e `"release"` com o commit da `main`).

   A chave cadastrada no GitHub precisa ser **a do servidor**: `sudo ssh-keygen -lf /srv/juimprime/.ssh/id_ed25519.pub`
   mostra a impressão digital (SHA256), que deve ser igual à da chave em Settings → Deploy keys, marcada como só
   leitura. Uma chave pessoal (Settings → SSH keys da conta) não serve: o servidor nunca a usa, e ela daria escrita em
   todos os repositórios. Nunca cole a chave privada em lugar nenhum.

## Como a publicação funciona

O servidor **puxa** do GitHub (nada no GitHub entra no servidor): a cada minuto, `deploy/deploy.sh` confere a branch
de `deploy.conf` com a Deploy Key só de leitura. Com um commit novo:

1. **Monta** a versão em `releases/<commit>`: `npm ci` sem rodar scripts de pacotes e o arquivo `REVISION` com o commit.
2. **Trava de segurança:** recusa um commit sem `server.cjs` e `package.json`, ou sem o `HOST` do
   `server/create-server.cjs` (o site ficaria aberto em todos os endereços). Uma branch errada para aqui.
3. **Testes** dentro da versão nova, **antes** de trocar: sem nenhuma variável do servidor (nenhum segredo chega aos
   testes) e com prioridade baixa (o site no ar não sente). Pula só o teste pesado dos modelos 3D, que o GitHub já
   roda (`TEST_SKIP` em `deploy.conf`; `TEST_SKIP=` roda todos, `TESTS=off` pula os testes, o que não é recomendado).
   Falhou: o site nem é tocado.
4. **Cópia do banco** (`mariadb-dump`, a senha num arquivo temporário só do usuário do site, nunca na linha de comando)
   quando a versão traz migração nova em `db/migrations`. Sem a cópia, a versão não entra.
5. **Troca** `current` de uma vez, reinicia o site e confere o `/api/health`: `ok`, banco `ok` **e** o commit novo
   respondendo (`"release"`). Até uns 3 minutos.
6. Não respondeu: volta sozinho para a versão anterior. Esse commit não é tentado de novo até chegar outro.
7. Qualquer falha manda **um e-mail** para `ORDER_NOTIFY_EMAIL` com o motivo e o final do registro (um por commit; sem
   commit, por exemplo o GitHub fora do ar, um por dia). Só funciona depois da primeira publicação e com o Resend
   configurado no `.env`.

Uma publicação leva de 2 a 5 minutos, quase tudo nos testes. **Tudo o que entra na `main` vai para o ar sozinho.**

**Migrações só somam.** Elas rodam quando o site liga e a volta de versão **não** as desfaz: a versão anterior precisa
continuar funcionando com o banco novo. Coluna ou tabela nova, sim; apagar ou renomear, só em duas etapas (primeiro o
código para de usar, numa publicação; a migração que apaga vem depois). Se algo der muito errado, a cópia em
`shared/backups` é o caminho de volta do banco.

## Produção: a branch `main`, protegida no GitHub

O servidor publica a **`main`** (`BRANCH=main` em `deploy.conf`; o setup já escreve assim num servidor novo). As
mudanças chegam a ela por pull request. No GitHub, repositório → **Settings** → **Branches** (ou **Rules** →
**Rulesets**) → regra para `main`:

- exigir pull request antes de juntar;
- exigir que o teste passe: marcar o check **`test`** (workflow "Testes", `.github/workflows/tests.yml`);
- bloquear *force push* e a exclusão da branch;
- não permitir passar por cima da regra.

Em repositório privado, isso pede o plano GitHub Pro/Team. Combinem quem pode juntar na `main` (o dono e o Pedro). A
Hostinger continua sendo o site de teste, pelo `.zip`.

## Dia a dia

- **Publicar:** juntar o pull request na `main`. Em poucos minutos o servidor baixa, testa, troca e confere (acima).
- **Publicar na hora** (ou tentar de novo um commit que falhou, depois de corrigir o motivo):
  `sudo systemctl start juimprime-deploy.service`. Para forçar o mesmo commit:
  `sudo -u juimprime /usr/local/lib/juimprime/deploy.sh --force`.
- **Ver qual versão está no ar:**
  - `curl -s http://127.0.0.1:3000/api/health` mostra `"release":"<commit>"` (os 12 primeiros caracteres) e
    `"db":"ok"`; de fora, `https://<domínio>/api/health`;
  - `readlink /srv/juimprime/current` mostra a pasta da versão, e `cat /srv/juimprime/current/REVISION` o commit.
- **Ver o que aconteceu:**
  - `journalctl -u juimprime-deploy -n 80` mostra as publicações (e os avisos);
  - `cat /srv/juimprime/.deploy-tests.log` mostra os testes da última tentativa;
  - `journalctl -u juimprime -f` mostra o site em tempo real (as mensagens `rastreio:`, `bling:`, `db:` e
    `payments/` aparecem aqui).
- **Voltar uma versão:** `sudo systemctl start juimprime-rollback.service`. Volta para a versão anterior guardada,
  confere o `/api/health` e **segura a publicação automática**: a ponta atual da `main` (a versão com problema) não
  volta sozinha. O próximo commit novo na `main` (por exemplo, o *revert* do problema) é publicado normalmente.
  - Para uma versão específica: `sudo -u juimprime /usr/local/lib/juimprime/deploy.sh --rollback <commit>` (as
    guardadas: `ls -t /srv/juimprime/releases`).
  - Para voltar a publicar a ponta sem esperar um commit novo: o `--force` acima.
  - A volta de versão não desfaz migrações (veja "Migrações só somam").
- **Cópia do banco na hora:** `sudo -u juimprime /usr/local/lib/juimprime/deploy.sh --backup` (fica em
  `shared/backups`).
- **Depois de editar o `.env`:** `sudo systemctl restart juimprime.service`.
- **Trocar a branch publicada:** editar `deploy.conf` com `sudo nano /srv/juimprime/shared/deploy.conf` e publicar
  na hora.
- **Quando `deploy/` mudar no Git:** depois que a versão estiver no ar, o journal da publicação mostra
  `Aviso: o kit do servidor mudou no Git`. Rodar `sudo bash /srv/juimprime/current/deploy/setup-servidor.sh` (instala o
  `deploy.sh`, as unidades e o sudoers novos; nada mais é mexido) e conferir com `systemctl list-timers` e o journal.

## Se a saída pela porta 22 estiver bloqueada

O servidor fala com o GitHub por SSH na porta 22. Se o provedor bloquear essa saída (o journal mostra `Não consegui
baixar a branch` com `timed out`), use o mesmo GitHub pela porta 443:

1. `sudo nano /srv/juimprime/shared/deploy.conf` e trocar a linha do repositório por
   `REPO=ssh://git@ssh.github.com:443/automacaosaas/SitedaJu3D.git`;
2. conferir que `/srv/juimprime/.ssh/known_hosts` tem a linha `[ssh.github.com]:443` (o setup a acrescenta, conferida
   pela mesma impressão digital publicada pelo GitHub; se faltar, rodar o setup de novo);
3. `sudo systemctl start juimprime-deploy.service` e olhar o journal.

Teste rápido do acesso, como o usuário do site:
`sudo -u juimprime ssh -i /srv/juimprime/.ssh/id_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=/srv/juimprime/.ssh/known_hosts -T git@github.com`
(responde com o nome do repositório; o código de saída 1 é normal).

## Domínio e HTTPS

O `10.0.100.80` só existe na rede interna. Para o domínio funcionar:

1. **Rede:** o IP público `201.77.147.2` encaminha as portas **80** e **443** para `10.0.100.80`. Feito pelo provedor
   em 07/10/2026: de fora (Madri, Kiev, Miami) a porta 80 já responde. De dentro da própria rede o IP público não abre,
   porque o roteador não faz o "retorno" (hairpin); teste sempre de fora ou pelo celular no 4G/5G. O servidor também tem
   IPv6 (`2804:2b44:ffff:bebe::80`), para o registro `AAAA`.
2. **Domínio:** `juimprimepramim.com.br` **ainda não está registrado** (consulta ao Registro.br em 07/10/2026). Registrar
   no Registro.br com o CNPJ da empresa antes de tudo.
3. **DNS:** criar os registros `A` (`201.77.147.2`) e `AAAA` (`2804:2b44:ffff:bebe::80`) de `juimprimepramim.com.br` e de
   `www`.
4. **nginx e certificado:**
   - trocar `server_name _` pelo domínio em `/etc/nginx/sites-available/juimprime`;
   - rodar `sudo certbot --nginx -d juimprimepramim.com.br -d www.juimprimepramim.com.br`. Ele emite o certificado
     gratuito, liga o HTTPS e renova sozinho.
5. **`.env`:** `SITE_URL=https://juimprimepramim.com.br`, e reiniciar o site.
6. **Recomendado: `www` → domínio sem `www` (301).** O endereço oficial das páginas (o `<link rel="canonical">`, o
   `sitemap.xml`, os webhooks do Mercado Pago e dos Correios) é `https://juimprimepramim.com.br`, sem `www`. Depois do
   certbot, acrescentar em `/etc/nginx/sites-available/juimprime` um bloco só para o `www`, que manda tudo (sem exceção)
   para o mesmo caminho no domínio sem `www`, e tirar o `www` do `server_name` do bloco principal:

   ```nginx
   server {
       listen 443 ssl;
       listen [::]:443 ssl;
       server_name www.juimprimepramim.com.br;
       ssl_certificate /etc/letsencrypt/live/juimprimepramim.com.br/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/juimprimepramim.com.br/privkey.pem;
       return 301 https://juimprimepramim.com.br$request_uri;
   }
   ```

   (o certbot já cria o redirecionamento de `http://` para `https://`.) Conferir com `sudo nginx -t` e
   `sudo systemctl reload nginx`; depois `curl -sI https://www.juimprimepramim.com.br/produtos.html` responde `301` com
   `location: https://juimprimepramim.com.br/produtos.html`. Aproveitar para conferir se o bloco do `443` tem HTTP/2
   (`listen 443 ssl http2;` ou `http2 on;`): a home pede umas 40 folhas de estilo e scripts, e o HTTP/1.1 enfileira.
   O `deploy/nginx-juimprime.conf` do repositório é só o ponto de partida do setup; a configuração viva é a do servidor.

### Google (indexação)

O site sai do Google pelo cabeçalho `X-Robots-Tag: noindex, nofollow`, decidido **pelo endereço pedido**, não pelo
`APP_ENV` (`api/_lib/runtime.js`): o domínio da loja (`juimprimepramim.com.br` e `www`) pode ser indexado mesmo com o
servidor ainda em `APP_ENV=preview`; o domínio temporário da Hostinger, `localhost` e o IP puro continuam fora. O domínio
vem do `SITE_URL` (quando é um nome público) ou, na falta, do `COMPANY.website` de `api/_lib/legal.js`; `INDEX_HOSTS`
(opcional, separado por vírgulas) acrescenta outros. Conferir:

- `curl -sI https://juimprimepramim.com.br/ | grep -i x-robots-tag` não mostra nada;
- `curl -s https://juimprimepramim.com.br/api/health` mostra `"indexable":true` (e `false` pelo endereço temporário).

Depois, no Google Search Console: propriedade de domínio (registro TXT no Registro.br), enviar
`https://juimprimepramim.com.br/sitemap.xml` e pedir a indexação da home em "Inspeção de URL".

## Cópia do banco na nuvem (Backblaze B2)

Todo dia às 03:30 o servidor faz a cópia do banco (`mariadb-dump`), confere se ela está inteira, tranca com uma chave
**pública** age e envia para um bucket do Backblaze B2 (`deploy/backup-nuvem.sh`, `juimprime-backup.timer`). Quem
abre a cópia é só quem tem a chave **privada**, que fica com vocês, fora do servidor: nem quem invadir o servidor nem
quem tiver acesso ao Backblaze lê os dados dos clientes. A chave do Backblaze que fica no servidor é **só de escrita**:
daqui ninguém apaga nem lê as cópias. Se o envio falhar, chega um e-mail para `ORDER_NOTIFY_EMAIL` (um por dia). As 10
cópias mais novas também ficam no servidor, em `shared/backups`.

Ligar (uma vez):

1. **Backblaze:** criar a conta em backblaze.com (B2 Cloud Storage), com a região dos dados nos EUA (**US West** ou
   **US East**): é o que diz a Política de Privacidade; com a da Europa (EU Central), o texto dela muda
   (`LEGAL-SETUP.md`). Em **Buckets → Create a Bucket**: um nome único
   (por exemplo `juimprime-backup-<algo>`), **Private**, criptografia padrão ligada. Em **Lifecycle Settings** do bucket,
   regra própria: arquivos ficam 120 dias e depois saem (`daysFromUploadingToHiding` 120, `daysFromHidingToDeleting` 1).
2. **Chave do servidor:** em **Application Keys → Add a New Application Key**: nome `servidor-juimprime`, acesso só ao
   bucket acima, **Type of Access: Write Only**. Anote o `keyID` e a `applicationKey` (ela aparece uma vez só). Não
   mande por chat nem e-mail.
3. **Chave age (no seu computador):** instale o age (`winget install --id FiloSottile.age`) e rode
   `age-keygen -o juimprime-backup.key`. Ele mostra a chave pública (`age1…`). Guarde o arquivo `juimprime-backup.key`
   num gerenciador de senhas e numa segunda cópia (pen drive): **sem ele, as cópias não abrem**.
4. **No servidor:** `sudo bash /srv/juimprime/current/deploy/setup-servidor.sh` (instala o age, o rclone e o timer) e
   depois `sudo bash /srv/juimprime/current/deploy/backup-config.sh`: ele pede o nome do bucket, o `keyID`, a
   `applicationKey` (não aparece na tela) e a chave pública `age1…` (pode pôr uma segunda, por exemplo a da Júlia),
   testa o envio e faz a primeira cópia.

Conferir: `journalctl -u juimprime-backup -n 20` e a pasta do mês no bucket. Copiar na hora:
`sudo systemctl start juimprime-backup.service`.

Restaurar (num servidor instalado com o setup): baixar o arquivo do bucket pelo site do Backblaze e rodar, no computador
que tem a chave privada, `age -d -i juimprime-backup.key diario-<data>.sql.gz.age > copia.sql.gz`. Levar o
`copia.sql.gz` ao servidor e: `gunzip -c copia.sql.gz | sudo mariadb juimprime`. Os CPFs e telefones gravados só
voltam a ser lidos com o mesmo `DATA_KEY` e `INDEX_KEY` do `.env` — guarde também uma cópia deles no gerenciador
de senhas.

## No lançamento

Junto com o domínio:

- **No `.env`:** `APP_ENV=production` e `MP_MODE=live`, com as credenciais reais do Mercado Pago da conta do CNPJ,
  e `NFE_ENVIRONMENT=producao`, com o Bling em produção (`NFE-SETUP.md`). O passo a passo do Mercado Pago, do teste
  à primeira venda real, está em `MERCADOPAGO-VALIDACAO.md`.
- **Mercado Pago:** o webhook apontando para `https://juimprimepramim.com.br/api/payments/webhook`, e o
  parcelamento em 3x sem juros configurado na conta (o site anuncia 3x sem juros).
- **Bling:** o link de redirecionamento do aplicativo trocado para `https://juimprimepramim.com.br/admin.html`, e a
  conta conectada de novo pelo painel.
- **Resend:** o domínio verificado, porque sem isso os e-mails só chegam ao e-mail de teste.
- **Branch:** publicar a `main` (protegida, acima), depois de levar para ela a versão aprovada.

## Ainda falta (servidor)

- Ligar a cópia diária do banco na nuvem (acima, "Cópia do banco na nuvem"): o código está pronto; faltam a conta do
  Backblaze, a chave só de escrita e a chave age.
- **Firewall (`deploy/firewall.sh`, aplicar já):** o servidor tem IPv6 público (`2804:2b44:ffff:bebe::80`), e no IPv6
  não há o filtro do encaminhamento de portas. Sem firewall, o SSH fica visível para a internet. O script (nftables):
  - deixa entrar só o site (80 e 443) e o ping;
  - aceita o SSH só das redes internas;
  - vale para IPv4 e IPv6.

  Rodar com `sudo bash firewall.sh`. Depois de aplicar, abrir **outra** sessão SSH para confirmar que o acesso
  continua e digitar `OK` em até 2 minutos; sem isso, as regras de antes voltam sozinhas. Se o provedor administra o
  servidor de um IP público, acrescentar esse IP em `EXTRA_SSH_V4` antes de rodar.
