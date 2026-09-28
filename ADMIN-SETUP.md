# Painel da Ju

Painel interno para a equipe acompanhar os pedidos pagos, em `/admin.html`. Os pedidos vêm do banco de dados (MySQL na
Hostinger), os mesmos que o checkout grava. Nada fica guardado no navegador.

## O que ele faz

- **Pedidos pendentes** (tela inicial): todo pedido pago, de teste ou real, entra aqui sozinho, o mais antigo primeiro.
- Em cada pedido: peças e cores, quem recebe, WhatsApp, endereço de entrega, observações e os dados da **nota fiscal**
  (nome e CPF mascarado, ou razão social, CNPJ e inscrição estadual).
- **Marcar como concluído** ou **Recusar pedido** (motivo opcional, visto só pela equipe). Concluídos e recusados ficam em
  abas separadas, com **Reabrir** para desfazer um engano. Recusar não estorna: o estorno é feito no Mercado Pago.
- **Gráfico** dos últimos 14 dias e **calendário** com os pedidos de cada dia. O faturamento não conta os recusados.
- Etiqueta de origem em cada pedido: **Teste Mercado Pago** ou **Pedido real**.
- Pedidos aguardando pagamento ou cancelados não aparecem, e a equipe não consegue mudar o status deles.

## Como entrar: senha e código do celular

1. E-mail e senha.
2. Um código de 6 dígitos do **app autenticador** no celular (Google Authenticator, Microsoft Authenticator ou similar).

No **primeiro acesso**, o painel mostra um **QR Code**: no app, toque em adicionar e leia o código (ou digite a chave que
aparece em "Não consegue ler o QR Code?"). Depois digite o código de 6 dígitos que o app mostrar. A partir daí, todo login
pede a senha e o código do app. A sessão dura 12 horas.

Guarde bem o celular com o app. Se ele se perder, veja "Perdi o celular" abaixo.

## Configurar (Hostinger)

hPanel → o site → **Variáveis de ambiente**:

| Nome | Valor | Secreta |
|---|---|---|
| `ADMIN_EMAIL` | `powershop.bras@gmail.com` (o e-mail da equipe) | não |
| `ADMIN_PASSWORD` | uma senha forte, com **12 caracteres ou mais** | **sim** |

Essas duas variáveis só criam a **primeira** pessoa do painel, no primeiro login, e só enquanto não existe ninguém no
banco. Depois disso quem vale é o banco: a senha fica guardada com scrypt (não dá para ler de volta) e trocar
`ADMIN_PASSWORD` no painel da Hostinger não muda nada. Uma senha com menos de 12 caracteres é recusada, e
`/api/health` mostra `"admin":"waiting"`.

O painel também precisa do banco e das chaves do site (`DB_*`, `DATA_KEY`, `AUTH_SECRET`), as mesmas das contas: o segredo
do app autenticador fica criptografado com a `DATA_KEY`.

`/api/health` mostra o estado do painel, sem nenhum valor:

| `admin` | Quer dizer |
|---|---|
| `off` | sem banco (em produção) |
| `waiting` | ninguém cadastrado e `ADMIN_EMAIL`/`ADMIN_PASSWORD` ausentes ou senha curta |
| `bootstrap` | pronto para o primeiro login |
| `ready` | já existe quem administre |

**Local:** `node tools/dev-server.cjs` (com ou sem `--fake-mp`) libera `http://localhost:8844/admin.html` com um acesso só
de teste (e-mail e senha aparecem no terminal). O QR Code aparece igual; os dados somem quando o servidor para.

## Segurança

- A senha é conferida só no servidor. O navegador guarda apenas um cookie `__Host-ju_admin` (HttpOnly, Secure,
  SameSite=Strict), que os scripts da página não conseguem ler. No banco fica só o SHA-256 do token.
- Depois da senha, a sessão só serve para digitar o código: dura 10 minutos e aceita 5 códigos errados. Com o código
  certo, o servidor emite um **token novo** para a sessão completa.
- Cada código vale uma vez só (o mesmo código não entra duas vezes) e aceita 30 segundos de diferença no relógio do celular.
- Limites: 8 tentativas de senha por e-mail e 15 por endereço de internet a cada 10 minutos; 10 códigos a cada 15 minutos.
- Tudo fica registrado na tabela `admin_audit`: logins, tentativas erradas, ativação do app, saídas e cada mudança de
  status (quem fez, o quê e quando). A mudança também entra no histórico do próprio pedido (`order_events`).
- Tabelas: `admin_users`, `admin_sessions` e `admin_audit` (`db/migrations/003_painel.sql`), criadas sozinhas quando o
  app liga.

## Perdi o celular / preciso trocar a senha

Por enquanto, pelo phpMyAdmin da Hostinger (tabela `admin_users`):

- **Trocar o celular:** apague o conteúdo de `totp_secret_enc` e `totp_enabled_at` da linha da pessoa. No próximo login
  aparece um QR Code novo.
- **Trocar a senha:** apague a linha da pessoa. No próximo login, `ADMIN_EMAIL` e `ADMIN_PASSWORD` criam o acesso de novo,
  com a senha que estiver no painel da Hostinger (e um QR Code novo).

Uma tela para trocar senha e celular pelo próprio painel fica para uma próxima etapa.

## Testes

`node tests/admin.mjs` cobre o código do app (vetores oficiais da RFC 6238), a criação da primeira pessoa, senha e código
com as duas sessões, limites, auditoria, os endpoints (cookie, origem, só pedidos pagos, mudanças registradas) e o QR Code.
`node tests/store-contract.mjs` confere as tabelas do painel na memória e, com `TEST_DB_*`, no MySQL.
