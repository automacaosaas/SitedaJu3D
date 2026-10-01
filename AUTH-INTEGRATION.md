# Contas: como funcionam

Contas reais, no servidor. A entrada é pelo e-mail: a pessoa recebe um código de 6 números ou, se já criou senha,
entra com ela. O banco é o MySQL da Hostinger (`db/migrations/`); a configuração do painel está em `HOSTINGER-SETUP.md`.

## Fluxo

1. **E-mail** (`POST /api/auth/start`): gera o código, guarda só o HMAC dele e envia pelo Resend. A resposta é igual
   para quem já tem conta e para quem não tem, para ninguém descobrir quem é cliente.
2. **Código** (`POST /api/auth/verify`): vale 10 minutos, uma vez, com até 5 tentativas.
   - Conta existente: entra na hora.
   - E-mail novo: recebe uma permissão de 15 minutos, de uso único, para terminar o cadastro.
3. **Cadastro** (`POST /api/auth/register`): nome, senha (opcional no servidor; a tela pede) e a escolha de receber
   novidades, que começa desmarcada.
4. **Senha** (`POST /api/auth/login`): e-mail ou senha errados dão a mesma resposta.
5. **Esqueci a senha**: o mesmo código, com `purpose: 'reset'`, e `POST /api/auth/reset`. A nova senha encerra as
   sessões dos outros aparelhos.
6. **Sessão**: cookie `__Host-ju_session` (HttpOnly, Secure, SameSite=Lax), 30 dias, renovada pelo uso. O banco guarda
   só o SHA-256 do token. `GET /api/auth/me` diz quem está logado (`{user: null}` para visitante);
   `POST /api/auth/logout` encerra.

O link do e-mail (`conta.html#verificar?c=…&k=…`) preenche o código e confirma sozinho.

## Identificação do comprador

`GET` e `PUT /api/account/profile`, usados no checkout (etapa **Identificação**, entre Carrinho e Entrega) e em
**Meus dados**, na conta. O formulário (`dist/identification.js`) segue a referência da FARM Rio aprovada pela equipe:

- e-mail da conta (não editável ali), **Nome** e **Sobrenome**, **CPF** e **Telefone**;
- **Incluir dados de pessoa jurídica**: CNPJ (numérico ou alfanumérico, emitido desde julho de 2026), razão social e
  inscrição estadual ou "isenta". A nota sai no CNPJ; o CPF continua sendo o de quem compra;
- "Quero receber comunicações promocionais", desmarcado.

O CPF é obrigatório na primeira vez e depois aparece mascarado (`***.982.247-**`), com a opção **Alterar**.

## Meus pedidos e Excluir minha conta

- `GET /api/account/orders`: os pedidos da própria conta (status, peças, valores e data), sem ids de pagamento nem
  documentos. Aparecem os pagos e os que ainda aguardam pagamento; tentativas que nunca foram pagas (cartão recusado,
  Pix expirado) ficam no banco, mas não na lista. Os pedidos de demonstração da aba (pagamentos desligados) aparecem
  junto, marcados como simulação.
- **Excluir minha conta**, em Meus dados: `POST /api/account/delete-start` envia um código ao e-mail da própria conta
  (finalidade `delete`, com e-mail próprio nos três idiomas) e `POST /api/account/delete` com o código apaga a conta,
  as sessões e os códigos, e limpa o cookie. O link do e-mail (`conta.html#excluir?...`) só preenche o código: a exclusão
  espera o clique. Um código de exclusão nunca serve para entrar nem para trocar a senha, e vice-versa.
- Os pedidos continuam no banco pelo prazo exigido para a nota fiscal, com o retrato do comprador e sem o vínculo com a
  conta (`customer_id` vazio). O mesmo e-mail e o mesmo CPF podem criar uma conta nova depois.

## Onde fica cada dado

| Dado | Como | Por quê |
|---|---|---|
| Senha | scrypt (N=2^14, r=8, p=5), parâmetros gravados com o hash | irreversível; nativo do Node, sem módulo compilado |
| CPF | AES-256-GCM (`DATA_KEY`) + índice HMAC (`INDEX_KEY`) | um CPF por conta sem guardar o número aberto |
| Telefone | AES-256-GCM (`DATA_KEY`) | dado pessoal sem necessidade de busca |
| CNPJ, razão social, IE | colunas normais | dados públicos da empresa |
| Sessão | SHA-256 do token | uma cópia do banco não abre contas |
| Código | HMAC com `AUTH_SECRET` | nunca guardado aberto |

No navegador, `sessionStorage` guarda só nome e e-mail para o cabeçalho. Senha, token e CPF nunca vão para o
armazenamento do navegador (`tests/account-commerce.mjs` verifica).

**`DATA_KEY` e `INDEX_KEY` não podem mudar nem se perder**: sem elas, CPFs e telefones gravados ficam ilegíveis.
Guarde as duas num gerenciador de senhas.

## Ambientes

| Onde | Contas | Código |
|---|---|---|
| Computador (`npm run dev`) | memória, somem ao reiniciar | no terminal e na pasta de saída de e-mails |
| Site de teste sem banco (`APP_ENV=preview`) | memória | na própria página, sem Resend |
| Site de teste com banco | MySQL | na página sem Resend; por e-mail com Resend |
| Produção (`APP_ENV=production`) | MySQL obrigatório; sem banco, contas desligadas (503) | só por e-mail; sem Resend, recusa |

## Proteções

- Toda alteração exige a origem do próprio site (`SITE_URL`).
- Limites no banco: um código a cada 30 s e 5 a cada 10 min por e-mail; 20 por hora por IP; 60 conferências por 10 min
  por IP; 10 tentativas de senha a cada 15 min por e-mail e 30 por IP.
- Erros de campo voltam com o nome do campo, e a tela aponta o campo em português (traduzido para EN/ES).

## Testes

- `tests/accounts.mjs`: regras do serviço e camada HTTP, com relógio controlado.
- `tests/store-contract.mjs`: memória e MySQL se comportam igual (MySQL quando `TEST_DB_*` estiver definido).
- `tests/account-commerce.mjs`: o adaptador do navegador ligado à API real, em processo.
- `tests/email-auth.mjs`: envio do código pelo Resend, falhas e as proteções das páginas.
- `node tools/smoke-accounts.mjs <endereço>`: percorre o fluxo inteiro num site de teste publicado.

## Ainda não

Endereços salvos, cartão salvo no Mercado Pago, exportação dos dados (LGPD) e troca de e-mail.
