# Entrar com o Google e com a Apple

Na página de acesso (`conta.html`), abaixo do formulário de e-mail, aparecem **"Continuar com o Google"** e
**"Continuar com a Apple"**, separados por "ou entre com". É a mesma página que o checkout abre quando a pessoa ainda
não entrou (`conta.html?next=checkout`), e também o painel lateral de conta no computador. Cada botão só aparece quando
as variáveis do provedor estão configuradas (`/api/auth/providers`; `/api/health` mostra `"social":{"google":…,"apple":…}`).

## Como funciona

1. O botão leva a `/api/auth/<google|apple>/start`, que manda o navegador ao provedor com um `state` e um `nonce`
   aleatórios (e, no Google, PKCE). Eles ficam num cookie de 10 minutos, `__Host-ju_social`, HttpOnly e assinado com o
   segredo do servidor.
2. O provedor devolve a pessoa a `/api/auth/<provedor>/callback`: o Google com um GET; a Apple com um POST de formulário
   (`response_mode=form_post`, por isso o cookie da Apple é `SameSite=None`).
3. O servidor troca o código pelo token de identidade direto com o provedor e confere a assinatura (chaves públicas do
   provedor, JWKS), o emissor, o público (o nosso Client ID), a validade e o `nonce`. Na Apple, o pedido vai com um
   segredo assinado em ES256 com a chave `.p8`.
4. A conta (`api/_lib/accounts.js`, `socialSignIn`):
   - **quem volta** é achado pelo identificador da conta no provedor (o `sub`), mesmo que o e-mail tenha mudado;
   - **primeira vez com um e-mail que já tem conta** (criada com código ou senha): a conta é **vinculada**, sem duplicar.
     Só acontece quando o provedor confirma que o e-mail é da pessoa (`email_verified`);
   - **primeira vez com um e-mail novo**: a conta é criada já confirmada, com nome, sobrenome e foto (do Google). Seguir
     é aceitar os Termos, como no cadastro (a versão fica gravada);
   - **e-mail não confirmado pelo provedor**: não entra; a página sugere o código por e-mail.
5. Depois, a mesma sessão de sempre (`__Host-ju_session`) e o destino: o checkout (que pede CPF e telefone na
   identificação), "Meus pedidos", ou a conta. Uma conta nova vê as **boas-vindas** (`conta.html#bem-vindo`), que pedem só
   o que falta para comprar (CPF e telefone) e podem ficar para depois ("Agora não").

**"Ocultar meu e-mail" da Apple:** a conta fica com o endereço privado (`…@privaterelay.appleid.com`), que a Apple
encaminha para o e-mail real. Como a loja não sabe qual é o real, essa conta é separada de uma conta feita com o e-mail
real. Para os e-mails da loja chegarem a esses endereços, é preciso registrar o remetente na Apple (passo 6 abaixo).

**Problemas** nunca aparecem como erro técnico: a página explica (cancelado, tempo esgotado, provedor indisponível,
e-mail não confirmado) e o detalhe vai para o log do servidor (sem tokens nem códigos).

## Endereços de retorno

| Provedor | Site de teste | Loja |
|---|---|---|
| Google | `https://wheat-llama-936569.hostingersite.com/api/auth/google/callback` | `https://juimprimepramim.com.br/api/auth/google/callback` |
| Apple | `https://wheat-llama-936569.hostingersite.com/api/auth/apple/callback` | `https://juimprimepramim.com.br/api/auth/apple/callback` |

O endereço é sempre `SITE_URL` + `/api/auth/<provedor>/callback` (o `SITE_URL` faz o papel do `NEXTAUTH_URL`).

## Google (console.cloud.google.com)

1. Crie um projeto (ex.: "Ju imprime pra mim").
2. **Google Auth Platform → Branding** (tela de consentimento): nome do app "Ju, imprime pra mim?", e-mail de suporte,
   página inicial, Política de Privacidade (`/privacidade.html`) e Termos (`/termos.html`), domínio autorizado
   `juimprimepramim.com.br`. O logo é opcional (com logo o Google pode pedir verificação da marca).
3. **Público:** "Externo". Enquanto estiver em **Teste**, só entram os e-mails da lista de usuários de teste (coloque os da
   equipe); para o lançamento, **Publicar o app**. Com os escopos básicos (`openid`, `email`, `profile`) não há revisão do Google.
4. **Clientes → Criar cliente → Aplicativo da Web.** Em "URIs de redirecionamento autorizados", os dois endereços do Google
   da tabela acima. "Origens JavaScript" não são necessárias (o fluxo é todo pelo servidor).
5. Copie o **ID do cliente** → `GOOGLE_CLIENT_ID` e a **chave secreta** → `GOOGLE_CLIENT_SECRET`.

## Apple (developer.apple.com → Certificates, Identifiers & Profiles)

É preciso estar no **Apple Developer Program** (US$ 99 por ano). Inscrita como empresa, a Apple pede o número D-U-N-S
do CNPJ; como pessoa física, o nome da pessoa aparece no aviso da Apple.

1. **Identifiers → + → App IDs → App:** descrição "Ju imprime pra mim", Bundle ID explícito (ex.:
   `br.com.juimprimepramim`), marque **Sign In with Apple**. (A Apple agrupa o login do site sob um App ID.)
2. **Identifiers → + → Services IDs:** descrição "Ju imprime pra mim (site)", identificador (ex.:
   `br.com.juimprimepramim.web`). Abra, marque **Sign In with Apple → Configure**: Primary App ID = o do passo 1;
   **Domains** = `wheat-llama-936569.hostingersite.com` e `juimprimepramim.com.br` (sem https); **Return URLs** = os dois
   endereços da Apple da tabela. A Apple não aceita `localhost` (para testar no computador, use o simulador abaixo).
   O identificador do Services ID é o `APPLE_CLIENT_ID`.
3. **Keys → +:** nome "Login Apple", marque **Sign in with Apple → Configure** (o App ID do passo 1), registre e **baixe o
   arquivo .p8** (só pode ser baixado uma vez). O **Key ID** → `APPLE_KEY_ID`; o conteúdo do .p8 → `APPLE_PRIVATE_KEY`
   (cole o arquivo inteiro; quebras de linha trocadas por `\n` também funcionam).
4. **Membership details:** o **Team ID** → `APPLE_TEAM_ID`.
5. Se o painel pedir para **verificar o domínio** com o arquivo `apple-developer-domain-association.txt`, avise: o
   servidor hoje não publica nada em `/.well-known/` e é preciso acrescentar essa rota.
6. **E-mails para "Ocultar meu e-mail":** em **Services → Sign in with Apple for Email Communication → Configure**,
   registre o domínio e o endereço que enviam os e-mails da loja (o do `MAIL_FROM`, no Resend, que já cuida do SPF). Sem
   isso, os e-mails de pedido para endereços `@privaterelay.appleid.com` voltam.

## Variáveis (Hostinger → Variáveis de ambiente, salvar com reimplantação)

| Nome | Valor | Secreta |
|---|---|---|
| `GOOGLE_CLIENT_ID` | ID do cliente (termina em `.apps.googleusercontent.com`) | não |
| `GOOGLE_CLIENT_SECRET` | chave secreta do cliente | **sim** |
| `APPLE_CLIENT_ID` | identificador do Services ID | não |
| `APPLE_TEAM_ID` | Team ID (10 caracteres) | não |
| `APPLE_KEY_ID` | Key ID da chave (10 caracteres) | não |
| `APPLE_PRIVATE_KEY` | conteúdo do arquivo .p8 | **sim** |

Também usam `SITE_URL` (base dos endereços de retorno) e `AUTH_SECRET` (assina o cookie do `state`). Lista completa em
`.env.example`. A migração `014_login_social.sql` (tabela `customer_identities` e a coluna da foto) roda sozinha.

## Conferir

- `/api/health` → `"social":{"google":true,"apple":true}`.
- Na página de acesso, os dois botões; entrar com um e-mail novo → boas-vindas pedindo CPF e telefone; sair e entrar de
  novo → a mesma conta; uma conta feita com código + o mesmo e-mail no Google → a mesma conta (sem duplicar).
- Pelo checkout: "Finalizar pedido" → "Continuar com o Google" → volta direto à identificação do checkout.

## No computador (sem credenciais)

`node tools/dev-server.cjs --fake-social` liga um simulador dos dois provedores (`tools/fake-oauth.cjs`, com assinaturas
reais): o botão abre uma tela local para escolher e-mail, nome, e-mail verificado ou não e o "Ocultar meu e-mail" da
Apple. `node tests/social-login.mjs` cobre o fluxo inteiro e cada recusa.

## Decisões e limites

- Vínculo automático só com e-mail confirmado pelo provedor. Sem desvincular pela página: excluir a conta apaga as ligações.
- A Apple envia o nome só na primeira autorização; se a pessoa remover o app nas configurações do ID Apple e entrar de
  novo, ela envia outra vez. O nome salvo na conta não muda sozinho.
- A foto vem só do Google (endereços `lh3.googleusercontent.com`, liberados na política de segurança das páginas).
