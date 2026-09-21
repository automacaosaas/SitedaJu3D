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

**Opção A — integração oficial (só com domínio verificado):** Resend →
**Settings** → **Integrations** → **Vercel** → **Go to Vercel Integration** →
escolha o projeto do site. Ela cria a variável `RESEND_API_KEY` sozinha, mas o
Resend exige escolher um domínio para gerar a chave (sem domínio aparece “No
domains found”) e o campo do valor é somente leitura. Por isso, enquanto não houver
domínio, use a opção B.

**Opção B — manual (a usada nos testes de 21/09/2026):** Vercel → projeto →
**Settings** → **Environment Variables** → **Add** → nome `RESEND_API_KEY`, tipo
**Secret**, cole a chave. **Enquanto não houver domínio verificado, marque só
Preview.** Sem domínio o Resend recusa qualquer e-mail que não seja o da sua conta
(erro 403), então, com a chave em Produção, o cadastro daria erro para todos os
outros visitantes; sem a chave lá, o site mantém o código de teste. Depois de
verificar o domínio, acrescente Production (⋯ → Edit → Environments).

`AUTH_SECRET` é opcional: sem ela, o servidor deriva a assinatura dos códigos da
própria `RESEND_API_KEY`.

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
