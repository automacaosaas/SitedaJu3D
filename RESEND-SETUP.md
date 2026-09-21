# Ativar o envio de e-mails (Resend) — passo a passo

O código já está pronto. A chave do Resend é um segredo: **nunca cole a chave no
chat, no repositório ou em qualquer arquivo.** Ela vai só no terminal (prompt
oculto) ou nas variáveis de ambiente da Vercel.

Situação em 20/09/2026: a conta do Resend é `powershop.bras` e **não tem nenhum
domínio cadastrado**. Sem domínio verificado, o Resend só entrega para o e-mail da
própria conta e apenas com o remetente de teste `onboarding@resend.dev`. Isso
basta para **testar**; para clientes reais é preciso o passo 3.

## 1. Testar agora, no seu computador (não publica nada)

1. Resend → **API Keys** → **Create API key**. Nome livre (ex.: “teste local”),
   permissão **Sending access**. Copie a chave (ela só aparece uma vez).
2. No terminal, dentro da pasta do projeto:

   ```bash
   node tools/dev-server.cjs --ask-key
   ```

   Cole a chave quando pedir e tecle Enter. Ela **não aparece na tela** e não é
   gravada.
3. Abra `http://localhost:8844/conta.html`, clique em **Criar conta** e use o
   **mesmo e-mail da sua conta do Resend**. Vai aparecer a tela de progresso, o
   e-mail chega na sua caixa de entrada e o botão abre o site já confirmando.
4. Cada disparo aparece no terminal. Erros comuns:
   - `403 … You can only send testing emails to your own email address`: o e-mail
     usado não é o da conta do Resend (ou falta domínio verificado).
   - `401 API key is invalid`: a chave foi copiada incompleta ou foi apagada.
5. Para parar: `Ctrl+C`.

## 2. Testar no site publicado (Vercel)

**Opção A — integração oficial (recomendada, a chave nunca passa pelas suas mãos):**
Resend → **Settings** → **Integrations** → **Vercel** → **Go to Vercel
Integration** → escolha o projeto do site. A integração cria a variável
`RESEND_API_KEY` sozinha. `AUTH_SECRET` é opcional: sem ela, o servidor deriva a
assinatura dos códigos da própria `RESEND_API_KEY`.

**Opção B — manual:** Vercel → projeto → **Settings** → **Environment Variables**
→ crie `RESEND_API_KEY` para **Production** e **Preview**.

Depois disso é preciso **um novo deploy** (variáveis só valem para deploys novos),
e o código desta entrega precisa estar publicado. Confira:

- Abra `/api/health` no endereço do site. O esperado é
  `{"ok":true,"mail":"resend","secret":true,"secretFrom":"RESEND_API_KEY","key":true,"sender":"test"}`.
  `mail: "off"` significa que falta a chave; `sender: "test"` significa que ainda
  usa o remetente de teste.
- Se `/api/health` responder 404, o projeto da Vercel usa `dist/` como raiz e a
  pasta `api/` precisa ir para `dist/api/`.
- Resend → **Logs** mostra cada envio; Vercel → **Logs** mostra erros das funções.

Variáveis opcionais: `AUTH_SECRET` (32+ caracteres, recomendada antes de contas
reais), `MAIL_FROM` (depois do domínio), `MAIL_REPLY_TO`.

## 3. Domínio de envio (para clientes reais)

1. Tenha um domínio (ex.: `juimprimepramim.com.br`). O endereço
   `siteda-ju3-d.vercel.app` **não** serve: o DNS dele não é seu.
2. Resend → **Domains** → **Add domain** (um subdomínio como
   `mail.seudominio.com.br` isola a reputação de envio).
3. Copie os registros DNS (SPF/DKIM) para o painel de onde o domínio é gerenciado.
4. Volte ao Resend, clique **Verify** e aguarde **Verified**.
5. Na Vercel, defina `MAIL_FROM` como `Ju imprime pra mim <acesso@seudominio.com.br>`
   e faça novo deploy. Se preferir, crie uma chave nova restrita a esse domínio.

## Voltar ao modo anterior

Apague `RESEND_API_KEY` na Vercel e faça redeploy: o site volta a mostrar o código
de teste na tela, sem nenhuma outra alteração.

## Testar sem enviar

`node tools/dev-server.cjs` (sem `--ask-key`) sobe o site com as funções em
`http://localhost:8844` e grava cada e-mail em uma pasta temporária (o caminho
aparece no terminal), sem usar o Resend.
