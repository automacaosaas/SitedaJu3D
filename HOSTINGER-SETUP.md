# Hostinger: site de teste por upload de arquivo

O site roda na Hostinger como **aplicativo Node.js** (plano Unlimited). O arquivo de entrada é `server.cjs`, que só liga o
servidor de `server/create-server.cjs`: ele serve `dist/` e as funções de `api/` nos mesmos endereços da Vercel, com os
cabeçalhos de `vercel.json`. A única dependência é `mysql2`, o conector do banco, que a Hostinger instala a partir do
`package.json` e do `package-lock.json`.

Enquanto a loja não for validada, o site na Hostinger é só de **teste**, num domínio temporário. O GitHub **não** é
conectado à Hostinger: a integração publica a cada push, e a regra do projeto é não publicar nada antes da validação.

## 1. Gerar o arquivo

Na pasta do projeto, a partir de um commit (o arquivo sai exatamente como está no commit, sem o que não vai para o servidor):

```bash
git -c core.autocrlf=false archive --format=zip -o ../site-ju-teste.zip HEAD package.json package-lock.json server.cjs server vercel.json api db dist
```

O `.zip` leva `package.json`, `package-lock.json`, `server.cjs`, `server/`, `vercel.json`, `api/`, `db/` (migrações do banco)
e `dist/`. Ficam de fora `node_modules`, os testes, a documentação e os originais em `design/`.

## 2. Enviar pelo painel

hPanel → **Sites** → **Adicionar site** → **Envie seu código, nós o hospedamos** → **Usar domínio temporário** →
**Faça upload dos arquivos** → escolha o `.zip`.

Configurações de build:

| Campo | Valor |
|---|---|
| Framework | Outro (Other). Não é Express, Next ou Vite. |
| Versão do Node.js | 24 (22 também funciona) |
| Comando de build | vazio: não há etapa de build |
| Diretório de saída | vazio: é um app de servidor, não um site estático |
| Arquivo de entrada | `server.cjs` |

## 3. Banco de dados (MySQL)

1. hPanel → **Bancos de dados** → **MySQL**: crie um banco e um usuário com senha forte. Anote o **nome do banco**, o
   **usuário** e o **host** que o painel mostra (em geral `localhost` quando o app roda no mesmo plano; se o painel mostrar
   outro endereço, use o dele).
2. As tabelas são criadas sozinhas quando o app liga (`db/migrations/`). Não é preciso importar nada pelo phpMyAdmin.
3. Se o painel do app oferecer um assistente para conectar o banco, ele pode gravar as variáveis por conta própria; o
   servidor aceita tanto os campos separados abaixo quanto uma `DATABASE_URL` no formato
   `mysql://usuario:senha@host:3306/banco`.

## 4. Variáveis de ambiente

hPanel → o site → **Variáveis de ambiente**. Salvar republica o app.

| Nome | Valor no site de teste | Para quê |
|---|---|---|
| `APP_ENV` | `preview` | Modo de teste. Em `production`, os caminhos de teste fecham e o site volta a aparecer no Google. |
| `SITE_URL` | `https://<endereço temporário>` (sem barra no fim) | Links dos e-mails e a proteção de origem dos formulários. Sem ela, criar conta falha. |
| `DB_HOST` | o host do passo 3 | Endereço do banco. |
| `DB_NAME` | o nome do banco | |
| `DB_USER` | o usuário do banco | |
| `DB_PASSWORD` | a senha do usuário do banco | Marque como secreta. |
| `DATA_KEY` | 32 bytes aleatórios em base64 | Criptografa CPF e telefone. **Nunca pode mudar nem se perder.** |
| `INDEX_KEY` | outros 32 bytes aleatórios em base64 | Garante um CPF por conta. **Nunca pode mudar nem se perder.** |
| `AUTH_SECRET` | outros 32 bytes aleatórios em base64 | Protege os códigos enviados por e-mail. |

Para gerar cada um dos três valores aleatórios, rode no seu computador (uma vez para cada variável; cada valor sai
diferente):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cole cada valor direto no painel da Hostinger e guarde uma cópia de `DATA_KEY` e `INDEX_KEY` num gerenciador de senhas.
Não mande esses valores por chat, e-mail ou GitHub. Sem banco nem chaves, o site de teste continua funcionando com as contas
em memória (somem quando o app reinicia).

Não coloque ainda a chave do Resend: sem `RESEND_API_KEY`, a tela de conta mostra o código de teste na própria página. As
do Mercado Pago entram só para o teste de pagamentos (seção 4.1). `PORT` é definida pela Hostinger; sem ela, o servidor usa 3000.

Prefira os campos separados (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`): a senha vai como está, sem cuidado extra. Numa
`DATABASE_URL`, caracteres como `@ : / ? #` na senha precisam ser escritos em código `%xx`.

### 4.1 Pagamentos de teste (Mercado Pago) e painel da Ju

Com `APP_ENV=preview`, o Mercado Pago roda sempre em **modo de teste**: só as credenciais de teste funcionam e nenhum valor real
é cobrado (com `APP_ENV=production`, os pagamentos só ligam com `MP_MODE` escolhido de propósito). Onde pegar cada valor está em
`MERCADOPAGO-SETUP.md` e `ADMIN-SETUP.md`.

| Nome | Valor | Secreta |
|---|---|---|
| `MP_PUBLIC_KEY` | Public Key **de teste** da aplicação | não |
| `MP_ACCESS_TOKEN` | Access Token **de teste** | **sim** |
| `MP_WEBHOOK_SECRET` | assinatura secreta do webhook | **sim** |
| `ORDER_NOTIFY_EMAIL` | e-mail da Ju que recebe os pedidos pagos (precisa do Resend para sair) | não |
| `ADMIN_EMAIL` | e-mail da equipe que entra no painel `/admin.html` | não |
| `ADMIN_PASSWORD` | senha do painel, com **12 caracteres ou mais** | **sim** |

Webhook no painel do Mercado Pago (modo de teste): `https://<endereço temporário>/api/payments/webhook`, evento **Order**.
Diferente das prévias da Vercel, o site da Hostinger é público, então o webhook chega. Conferir: `/api/health` mostra
`"payments":"test"` e `"mp":{"token":true,"publicKey":true,"webhookSecret":true}`.

Os pedidos ficam no banco (tabelas `orders`, `order_items` e `order_events`, criadas sozinhas quando o app liga) e só
quem está logado com a identificação completa consegue pagar. `ADMIN_EMAIL` e `ADMIN_PASSWORD` criam a primeira pessoa
do painel no primeiro login; nesse login aparece um QR Code para o app autenticador do celular, e dali em diante todo
login pede a senha e o código do app. `/api/health` mostra `"admin":"bootstrap"` antes do primeiro login e `"ready"`
depois. Detalhes, e o que fazer se o celular se perder, em `ADMIN-SETUP.md`.

No checkout, a prevenção de fraude avançada do SDK fica desligada enquanto for teste: ela injeta um script embutido que a
política de segurança do site não permite. Antes de cobrar de verdade, enviar o identificador do aparelho do jeito documentado
pelo Mercado Pago (`security.js` + cabeçalho `X-meli-session-id` no servidor), sem afrouxar a política.

### 4.2 Frete real (Correios)

Sem estas variáveis o checkout cobra o frete fixo de exemplo. Com elas (e com os dados da loja preenchidos em
`api/_lib/shipping-config.js`), o frete é calculado por CEP com o contrato da Ju. Onde tirar cada valor, os dados da loja, as
regras e como conferir estão em `FRETE-SETUP.md` e `FRETE-CORREIOS-passo-a-passo.md`.

| Nome | Valor | Secreta |
|---|---|---|
| `CORREIOS_USER` | usuário da API dos Correios | não |
| `CORREIOS_CODE` | código de acesso da API | **sim** |
| `CORREIOS_CONTRACT` | número do contrato | não |
| `CORREIOS_CARD` | número do cartão de postagem | não |
| `CORREIOS_DR` | DR (a "Unidade Gestora" do contrato); obrigatória, sem ela o frete real fica desligado | não |
| `SHIP_FROM_CEP` | CEP de onde a Ju despacha | não |

`/api/health` mostra `"shipping":"off"` (faltam variáveis), `"pending"` (variáveis ok, dados da loja incompletos) ou
`"correios"` (cotando). O código de acesso não vai por chat, e-mail nem GitHub.

## 5. Conferir

- `https://<endereço temporário>/api/health` responde `{"ok":true,...}` com `"accounts":"mysql"`, `"db":"ok"` e
  `"dataKeys":"ok"` depois do passo 4. Nenhum valor secreto aparece ali.
- No computador, com Node instalado: `node tools/smoke-accounts.mjs https://<endereço temporário>` percorre o cadastro,
  a sessão, a identificação e a entrada com senha, e diz o que falhou. Ele cria uma conta de teste `@exemplo.com`.
- A home abre, a prévia 3D dos três produtos carrega e o console do navegador fica sem erros.
- Com o Mercado Pago de teste (seção 4.1): uma compra com o cartão de teste aparece em "Meus pedidos" (conta) e no painel
  `/admin.html` como pendente; concluir, recusar e reabrir funcionam, e recarregar a página mantém tudo.
- `curl -I https://<endereço temporário>/` mostra `x-frame-options: SAMEORIGIN`, `nosniff` e `x-robots-tag: noindex, nofollow`.
- A CDN da Hostinger (`server: hcdn`) troca o cabeçalho `content-security-policy` por `upgrade-insecure-requests`. Por isso a
  política completa também vai numa tag `<meta http-equiv="Content-Security-Policy">` em cada página (sem `frame-ancestors`,
  que o `<meta>` não aceita; o `x-frame-options` cobre isso). `tests/headers.mjs` mantém as duas cópias iguais.

## 6. Atualizar

Gere um `.zip` novo (passo 1) e envie de novo pelo painel (no site: **Implantações** → **Reimplantar** / enviar arquivos). Cada envio
substitui o anterior. O banco e as contas continuam; migrações novas são aplicadas sozinhas quando o app liga.

## Depois da validação

- Domínio `juimprimepramim.com.br` (titular: CNPJ da empresa) apontado para o app de produção.
- `APP_ENV=production` e `SITE_URL=https://juimprimepramim.com.br` no app de produção, com banco, chaves e Resend.
- Só então conectar o GitHub, com autorização do dono do repositório, escolhendo a branch que publica.

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| 503 "Service Unavailable" em todas as páginas | O app não está escutando. A Hostinger carrega o arquivo de entrada com `require()`: ele precisa ligar o servidor sem depender de `require.main` (`tests/server.mjs` verifica isso). Confira também se o arquivo de entrada é `server.cjs` e veja os logs de execução do app. Logo depois de um deploy, espere um ou dois minutos. |
| Página de erro da Hostinger no deploy | Arquivo de entrada diferente de `server.cjs`, ou versão do Node abaixo de 18. Veja o log do deploy. |
| `/api/health` mostra `"db":"error"` | Host, usuário, senha ou nome do banco errados, ou o usuário sem permissão no banco. O log de execução mostra o código do erro (por exemplo `ER_ACCESS_DENIED_ERROR`). |
| `/api/health` mostra `"accounts":"memory"` | Faltam `DB_HOST`, `DB_NAME` ou `DB_USER`. |
| `/api/health` mostra `"dataKeys":"missing"` | `DATA_KEY` ou `INDEX_KEY` ausente ou sem 32 bytes em base64 (em produção isso desliga a identificação). |
| Log mostra "db: migração falhou" | Veja a mensagem na mesma linha; o site continua no ar, só as contas ficam indisponíveis. |
| Site abre, mas criar conta dá erro | `SITE_URL` ausente ou diferente do endereço aberto (com ou sem `www`, `http` x `https`). |
| Prévia 3D não carrega | Veja o console: um bloqueio de CSP aparece como erro "Content Security Policy". |
| `/api/health` responde 404 | O `.zip` foi gerado sem a pasta `api/`. |
| `/api/health` mostra `"admin":"waiting"` | Falta `ADMIN_EMAIL` ou `ADMIN_PASSWORD`, ou a senha tem menos de 12 caracteres. |
| Painel diz "O tempo para digitar o código acabou" | Passaram 10 minutos entre a senha e o código, ou foram 5 códigos errados. Entre com a senha de novo. |
| Código do app sempre "incorreto" | Relógio do celular errado: ative a data e hora automáticas. Um código também não serve duas vezes. |
