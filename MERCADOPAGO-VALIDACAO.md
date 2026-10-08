# Mercado Pago: como validar antes de vender de verdade

Roteiro do dono para sair do teste e ligar os pagamentos reais com segurança. São sete etapas: as quatro primeiras no
**ambiente de teste** (nenhum dinheiro de verdade), depois a troca para **produção**, uma **compra real de valor baixo**
com estorno e, por fim, o **botão de emergência**. Como o site funciona por dentro está em `MERCADOPAGO-SETUP.md`.

> **Regra de ouro:** credencial, token e assinatura secreta só são colados direto no servidor (ou no hPanel), por
> você. Nunca no chat, no e-mail, no WhatsApp, num print ou no Git. Se um aparecer num print, troque-o no painel do
> Mercado Pago.

## 1. Onde colocar cada credencial

No painel do Mercado Pago: **Suas integrações** → a aplicação **Checkout Transparente** da conta do CNPJ.

| Variável | De onde vem | No teste | Na produção |
|---|---|---|---|
| `MP_PUBLIC_KEY` | Credenciais → Public Key | a de **teste** | a de **produção** |
| `MP_ACCESS_TOKEN` | Credenciais → Access Token (segredo) | o de **teste** | o de **produção** |
| `MP_WEBHOOK_SECRET` | Webhooks → Configurar notificações → assinatura secreta | a do modo de teste | a do modo de produção (se o painel mostrar outra) |
| `MP_MODE` | escrito por você | vazio (o site de teste é sempre teste) | `live` |
| `APP_ENV` | escrito por você | `preview` | `production` |
| `SITE_URL` | escrito por você | o endereço do site de teste | `https://juimprimepramim.com.br` (sem barra no fim) |
| `ORDER_NOTIFY_EMAIL` | o e-mail da Ju | o e-mail da Ju | o e-mail da Ju |

**Onde colar:**

- **Servidor próprio:** `sudo nano /srv/juimprime/shared/.env`, uma linha `NOME=valor` por variável (comentário só em
  linha própria: um `#` depois do valor vira parte do valor). Salvar e rodar `sudo systemctl restart juimprime.service`.
- **Hostinger (site de teste):** hPanel → o site → **Variáveis de ambiente**. Salvar republica o app. A Hostinger não
  lê arquivo `.env`.

**Nunca** ponha credenciais de produção num site com `APP_ENV=preview`: o site mostraria "AMBIENTE DE TESTE" e mandaria
e-mails `[TESTE]`, enquanto o Mercado Pago cobraria de verdade. E nunca misture: credenciais de teste com `MP_MODE=live`
não cobram ninguém, e o pedido real nunca é confirmado.

Se as credenciais de teste forem recusadas (no log do site aparece `401` com `invalid_credentials`), use **contas de
teste**: Suas integrações → **Contas de teste** → crie um vendedor e um comprador (Brasil). Entre com o vendedor de
teste, crie nele uma aplicação Checkout Transparente e use as credenciais **de produção dessa conta de teste**: o
dinheiro dela é de mentira. Continue com `APP_ENV=preview`.

## 2. O que o `/api/health` deve mostrar

Abra `https://<site>/api/health` depois de cada mudança. Só aparecem "sim/não" e modos, nunca valores.

| Momento | `payments` | `paymentsBlocked` | `mp` | Outros |
|---|---|---|---|---|
| Teste (etapas 3 e 4) | `"test"` | `false` | `token`, `publicKey` e `webhookSecret` todos `true` | `orderMail: true`, `db: "ok"` |
| Produção ligada (etapa 6) | `"live"` | `false` | todos `true` | `orderMail: true`, `db: "ok"`, `shipping: "correios"`, `nfe` e `bling` como combinado com a contadora |
| Emergência (etapa 7) | `"off"` | `true` | `token` e `publicKey` `true` | o checkout volta à demonstração |
| `APP_ENV=production` sem `MP_MODE` | `"off"` | `true` | — | é a trava: nada cobra até você escrever `MP_MODE` |

No servidor próprio aparece também `"release"`: o commit que está no ar (`SERVIDOR-SETUP.md`).

## 3. Testes no ambiente de teste

Faça tudo no **site de teste** com as credenciais de teste. Use uma conta de cliente sua no site (um e-mail diferente
do da conta do Mercado Pago). No checkout aparece a faixa **AMBIENTE DE TESTE** e o bloco "Como testar neste ambiente".

### 3.1 Webhook de teste

1. Painel → **Webhooks** → **Configurar notificações** → **Modo de teste**.
2. URL: `https://<site de teste>/api/payments/webhook`.
3. Eventos: marque **só "Order"**. Outros eventos não atrapalham (o site responde 200 e ignora), mas não servem.
4. Salve e copie a **assinatura secreta** para `MP_WEBHOOK_SECRET` (etapa 1). Reinicie ou republique.
5. Use **Simular notificação** com um ID qualquer: o esperado é **200** com `"ignored"` (`not_found` ou
   `not_an_order`: o pedido não existe, e o Mercado Pago não insiste). `401` quer dizer assinatura errada; `503`, o
   banco do site fora do ar.

### 3.2 Cartões de teste

Cartões: Mastercard `5480 8328 0103 3311`, Visa `4235 6477 2802 5682`, Elo débito `5067 7667 8388 8311`. Código
`123`, validade `11/30`, CPF `12345678909`. **O nome do titular escolhe o resultado.** Para cada linha, anote o que a
tela mostrou, o pedido no painel da Ju e os e-mails.

| Nome do titular | O que o cliente deve ver | Painel da Ju |
|---|---|---|
| `APRO`, 1x | "Seu pedido ganhou vida." | o pedido em **Pendentes**; e-mail `[TESTE] Novo pedido pago` para a Ju e o comprovante para o cliente |
| `APRO`, 3x | igual; a tabela de parcelas mostra 3x **sem juros** (se mostrar juros, falta configurar o "3x sem juros" na conta) | igual, "Cartão de crédito · 3x" |
| `APRO`, **6x e 12x** (com juros) | igual | **o teste mais importante:** o pedido precisa ir para **Pendentes**. Se ficar esperando pagamento e o histórico do pedido mostrar `payment_mismatch`, pare e chame o técnico: o Mercado Pago somou os juros ao total |
| `CONT` | "Estamos confirmando." (a página confere sozinha a cada 5 segundos) | nada até o Mercado Pago decidir |
| `OTHE` | "O banco do cartão não aprovou o pagamento. Tente outro cartão ou pague com Pix." | nada (tentativa encerrada) |
| `FUND` | "O cartão não tem limite disponível para esta compra…" | nada |
| `SECU`, `EXPI`, `FORM` | "Algum dado do cartão não confere (número, validade ou código de segurança)…" | nada |
| `CALL` | "O banco do cartão pediu para você autorizar esta compra…" | nada |
| `LOCK` | "Este cartão está bloqueado ou inativo…" | nada |
| `ATTE` | "Foram muitas tentativas com este cartão…" | nada |
| `INST` | "O cartão não aceita esse número de parcelas…" | nada |
| `BLAC` | "O pagamento não passou pela análise de segurança do Mercado Pago…" | nada |
| Elo **débito** com `APRO` | aprovado, só em 1x | "Cartão de débito" |

No ambiente de teste, o código do Mercado Pago aparece pequeno entre parênteses depois da frase (por exemplo
`(insufficient_amount)`). Anote-o se a frase não combinar com a tabela: o Mercado Pago às vezes usa outro nome, e a
frase volta para a geral ("O pagamento não foi aprovado…"). **No site real esse código nunca aparece.**

### 3.3 Pix de teste

1. Escolha **Pix**: aparecem o QR Code, o copia e cola e "Válido por 59:59".
2. Um Pix de teste normalmente **fica pendente** (não há banco de verdade para pagar). A documentação do Mercado Pago diz
   que um Pix de teste com o nome do comprador **APRO** é aprovado sozinho: crie uma conta no site com o nome "APRO" e
   tente. Se não aprovar, tudo bem: o Pix é comprovado na compra real (etapa 6).
3. Com um Pix esperando, clique em **"← Alterar dados ou pagamento"** e gere outro. No painel do Mercado Pago, o
   primeiro pedido deve aparecer **cancelado**: o código antigo não pode mais ser pago junto com o novo.
4. Deixe um Pix passar de 1 hora: a página mostra "O tempo passou." e **"Gerar novo código Pix"**. O novo código nasce e
   o antigo é cancelado. Pix que não foi pago some de "Meus pedidos" depois de 2 horas.

### 3.4 Avisos do Mercado Pago, repetição e cobrança dupla

- Painel → **Webhooks** → histórico de notificações: cada aviso **Order** deve ter resposta **200**. `401`: assinatura
  diferente (ou o relógio do servidor errado); `503`: banco fora do ar (o Mercado Pago tenta de novo depois).
- Um aviso repetido não muda nada: no painel da Ju, o histórico do pedido mostra "pago" **uma vez** e cada e-mail
  chega uma vez.
- **Duplo clique** em pagar: um pedido só.
- **Internet caindo na hora:** no computador, abra as ferramentas do navegador (F12) → Rede → **Offline** logo depois
  de clicar em pagar. Volte para **Online** e clique em pagar de novo: o site usa a mesma tentativa, então aparece **um**
  pedido no painel e no Mercado Pago, nunca dois.

### 3.5 Estorno e e-mails pelo painel

- Num pedido de teste pago: **Recusar**. O estorno aparece como "Estornado" (ou "Estorno em andamento"; use
  **Conferir estorno**), o Mercado Pago mostra a devolução e o cliente recebe o e-mail de pedido recusado com o
  estorno.
- Estorne outro pedido **direto no painel do Mercado Pago**: o pedido da Ju marca o estorno sem mudar de etapa.
- Noutro pedido: **Confirmar** (NF-e de homologação no Bling, sem valor fiscal) → **Enviado** com um código de
  rastreio → **Concluído**. Confira os e-mails de cada etapa no idioma do cliente.
- Os e-mails para um endereço que não é o da conta do Resend só chegam com o **domínio verificado** no Resend.

### 3.6 No navegador: o *device id*

Na etapa de pagamento, o site carrega `https://www.mercadopago.com/v2/security.js` (prevenção de fraude do Mercado
Pago; melhora a aprovação). No computador, abra o console (F12 → Console) na etapa de pagamento: **não** pode haver
erro vermelho de "Content Security Policy" citando `mercadopago.com`. Se houver, mande um print **só do console** (sem
dados de cartão) para o técnico.

## 4. Antes de ligar a produção

Na conta do Mercado Pago do CNPJ:

- [ ] **Credenciais de produção** ativadas (ramo, site, termos).
- [ ] **Chave Pix** cadastrada na conta (sem ela não há QR Code de Pix).
- [ ] **3x sem juros** configurado (o site anuncia "3x sem juros").
- [ ] **Nome na fatura** do cartão que o cliente reconheça (por exemplo "JU IMPRIME").
- [ ] **Taxas** e **prazo de liberação** do dinheiro (Pix e cartão) conferidos.
- [ ] **Webhook do modo de produção:** Webhooks → **Modo de produção** → URL
  `https://juimprimepramim.com.br/api/payments/webhook`, **só "Order"**. Copie a assinatura secreta (se for diferente
  da de teste, a de produção vale).

No site:

- [ ] Domínio com HTTPS e `SITE_URL=https://juimprimepramim.com.br`.
- [ ] Resend com o domínio verificado.
- [ ] Frete real ligado (`/api/health` → `"shipping":"correios"`).
- [ ] Com a contadora: `NFE_ENVIRONMENT=producao` e o Bling em produção (`NFE-SETUP.md`). O site **nunca** emite nota
  real para um pedido que foi pago no modo de teste, mas o lançamento combinado é com o **banco novo e limpo**.

## 5. Ligar a produção

No `.env` do servidor de produção (`/srv/juimprime/shared/.env`):

```
APP_ENV=production
SITE_URL=https://juimprimepramim.com.br
MP_PUBLIC_KEY=<public key de produção>
MP_ACCESS_TOKEN=<access token de produção>
MP_WEBHOOK_SECRET=<assinatura do webhook de produção>
MP_MODE=live
```

(Os `<…>` são só os lugares: cole os valores você mesmo, sem os sinais.) Depois:
`sudo systemctl restart juimprime.service` e confira o `/api/health` da etapa 2 (`"payments":"live"`).

**Ensaio opcional, recomendado:** antes do `live`, use `MP_MODE=test` com as credenciais **de teste** no domínio de
produção. A faixa diz "AMBIENTE DE TESTE" e nenhum dinheiro se move, mas o webhook já passa pelo domínio real e pelo
HTTPS. Repita um `APRO` e um Pix; depois troque para as credenciais de produção e `MP_MODE=live`.

## 6. Compra real de valor baixo, e o estorno

A peça mais barata é uma lâmpada (R$ 90, R$ 85,50 no Pix, mais o frete). Use os seus dados e os seus cartões.

1. **Pix** pelo app do seu banco: o QR é de verdade. Em segundos o pedido fica **Pendente** no painel (o histórico
   mostra "pago" pelo webhook ou pela consulta), os e-mails chegam **sem** `[TESTE]` e o pagamento aparece no painel do
   Mercado Pago.
2. **Cartão em 3x:** a tabela de parcelas tem que mostrar **3x sem juros**. Pague.
3. No painel da Ju, **Recusar** os dois pedidos **antes** de Confirmar (assim nenhuma nota fiscal é emitida). O estorno
   fica "Estornado" ou "Estorno em andamento", o dinheiro volta para a conta e para o cartão (o do cartão pode levar
   uma ou duas faturas) e chega o e-mail de pedido recusado.
4. Confira depois: o extrato do banco, a fatura do cartão (o nome na fatura) e o painel do Mercado Pago (pagamento e
   devolução).
5. Se a nota fiscal de produção também precisar ser provada, combine com a contadora numa venda que ela aprovar
   (Confirmar → nota autorizada no Bling → manter a venda, ou cancelar a nota no prazo legal e depois estornar).

Nos primeiros dias, acompanhe o log: `journalctl -u juimprime -f` (procure `payments/` e `orders:`). Uma recusa de
cartão aparece com a nossa referência (`JU-…`) e o `x-request-id` do Mercado Pago, que é o que o suporte deles pede.
Dados do cliente e tokens nunca vão para o log.

## 7. Botão de emergência

**Para parar de cobrar na hora:** apague o valor de `MP_MODE` (deixe a linha `MP_MODE=`) e rode
`sudo systemctl restart juimprime.service` (na Hostinger: apagar `MP_MODE` no hPanel). O `/api/health` mostra
`"payments":"off"` e `"paymentsBlocked":true`, o checkout volta para a demonstração (ninguém é cobrado) e os avisos do
Mercado Pago ficam na fila dele até você religar (o site responde 503 e ele tenta de novo depois). Os pedidos já pagos
continuam no painel; os estornos voltam a funcionar quando religar.

**Se o problema for uma versão nova do site** (e não o Mercado Pago): `sudo systemctl start juimprime-rollback.service`
volta para a versão anterior (`SERVIDOR-SETUP.md`).

## Se algo der errado

| Sintoma | O que fazer |
|---|---|
| Parcelado com juros fica esperando e o histórico mostra `payment_mismatch` | Parar a venda em parcelas com juros e chamar o técnico: o total do Mercado Pago veio diferente do pedido. |
| Webhook com `401` no histórico do Mercado Pago | `MP_WEBHOOK_SECRET` diferente da assinatura do modo certo (teste ou produção), ou o relógio do servidor errado (`stale_signature` no log). |
| Webhook com `503` | O banco do site fora do ar: `/api/health` → `db`. O Mercado Pago tenta de novo sozinho. |
| "Não foi possível carregar as formas de pagamento" | Bloqueador de anúncios ou internet. Se acontecer com todo mundo, olhe o console (etapa 3.6). |
| O pagamento de teste é recusado logo de cara com `invalid_credentials` | Use as contas de teste (etapa 1). |
| O cliente diz que pagou o Pix e o pedido não andou | Painel do Mercado Pago (o pagamento existe?) e o histórico de webhooks. A página do cliente também confere a cada 5 segundos. |
| O cliente não recebe e-mail | Resend sem domínio verificado, ou `ORDER_NOTIFY_EMAIL`/`RESEND_API_KEY` faltando (`/api/health` → `orderMail`, `mail`). |
