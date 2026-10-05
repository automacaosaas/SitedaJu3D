# Pagamentos com o Mercado Pago

Este documento explica o que foi construído, como ligar em modo de **teste** (sem cobrança real) e o que falta antes de vender de verdade.

## A escolha: Checkout Transparente com Bricks e API de Orders

| Opção do Mercado Pago | O que é | Por que sim / não aqui |
|---|---|---|
| Checkout Pro | Leva o cliente para uma página do Mercado Pago | É a mais simples, mas tira o cliente do site e não mostra o Pix e o resumo do pedido no estilo da Ju. |
| **Checkout Transparente + Bricks (escolhida)** | O pagamento acontece dentro do nosso checkout; o cartão é digitado em campos seguros do Mercado Pago | Mantém a experiência da loja, aceita Pix e cartão de crédito e débito (com parcelas) e o número do cartão nunca passa pelo nosso servidor. |
| Checkout Transparente sem Bricks | Nós desenhamos até os campos do cartão | Mais trabalho e mais responsabilidade de segurança, sem ganho para uma loja deste tamanho. |

A aplicação no painel do Mercado Pago precisa ser do tipo **Checkout Transparente** (API de Orders). Só assim aparecem as **credenciais de teste**.

## Como funciona

1. O cliente monta o carrinho, entra na conta, confirma a identificação (nome, sobrenome, CPF e telefone, para a nota fiscal e a etiqueta) e preenche a entrega.
2. No passo de pagamento aparece o **Payment Brick** do Mercado Pago (Pix, crédito, débito).
3. Ao pagar, o navegador manda ao nosso servidor `POST /api/payments/create` só **o que foi escolhido** (peças, quantidades, cores), os dados de entrega e o resultado do Brick (um token do cartão, nunca o número).
4. O servidor confere a sessão e a identificação, **recalcula os preços** (`api/_lib/catalog.js`), **grava o pedido no banco** e só então cria a order no Mercado Pago e responde com o estado: aprovado, Pix aguardando (com QR Code e copia-e-cola), em análise ou recusado.
5. O Mercado Pago avisa por **webhook** (`POST /api/payments/webhook`). O servidor confere a assinatura, **lê o pedido de volta no Mercado Pago** confere se a referência e o valor batem com o pedido gravado e, se estiver pago, marca o pedido como pago no banco e manda um e-mail para a Ju (o que produzir, cores, endereço, contato) e outro para o cliente (comprovante no idioma dele).
6. Enquanto um Pix espera, a página consulta `GET /api/payments/status` a cada 5 segundos e avança sozinha quando o pagamento cai.
7. Os selos de "Métodos de pagamento aceitos" no carrinho vêm da própria conta: `GET /api/payments/methods` lê `GET /v1/payment_methods` no Mercado Pago com o Access Token (no servidor). Ficam só os ativos de Pix, crédito e débito, e a resposta é guardada por 6 horas. Com os pagamentos desligados, ou se o Mercado Pago não responder, o carrinho mostra a lista padrão (`FALLBACK_METHODS` em `dist/payment-marks.js`): Pix, Visa, Mastercard, Elo, American Express, Hipercard e o débito virtual Caixa. **O Pix aparece sempre**, porque é regra da loja e o checkout sempre o oferece. As credenciais de teste não listam o Pix: em 05/10/2026, a conta de teste respondeu Visa, Mastercard, Elo, American Express, MP Card e Elo Débito.

Os pedidos ficam no banco (MySQL: `orders`, `order_items` e `order_events`, em `db/migrations/002_pedidos.sql`), com um retrato do comprador e da entrega no momento da compra; CPF e telefone vão criptografados. A resposta do pagamento, o webhook e a consulta do Pix atualizam o mesmo pedido, e quem chega primeiro faz a mudança: o pedido é marcado como pago uma vez só e cada e-mail sai uma vez só. O cliente vê os pedidos em "Meus pedidos" (conta) e a Ju no painel `/admin.html` (ver `ADMIN-SETUP.md`). Se a conta for excluída, o pedido continua guardado para a nota fiscal, sem o vínculo com a conta.

## Desconto no Pix (5%)

Quem paga com Pix paga 5% a menos **nas peças** (o frete não tem desconto, e o frete grátis continua contando o valor cheio das peças, que é o que o cliente vê no carrinho).

- No passo de pagamento, dois cartões ficam acima do Brick: **Pix** (com a faixa verde "5% OFF NO PIX · economize R$ X") e **Cartão** (crédito ou débito, até 12x). O Brick abre só com a forma escolhida e com o valor dela.
- Quem decide o desconto é o **servidor**: ele aplica só quando o Brick informa Pix (`api/_lib/catalog.js`, `applyPixDiscount`). O desconto é calculado por unidade (R$ 129,00 → R$ 122,55; R$ 139,00 → R$ 132,05; R$ 159,00 → R$ 151,05), então os itens enviados ao Mercado Pago continuam somando exatamente o total cobrado.
- O pedido guarda o subtotal pelo preço de tabela e o total cobrado; o desconto é a diferença. Os e-mails da Ju e do cliente mostram a linha "Desconto no Pix (5%)". Não há mudança no banco.
- Para mudar a porcentagem, altere `PIX_DISCOUNT_BPS` em `api/_lib/catalog.js` **e** `pixDiscountBps` em `dist/commerce-config.js` (em pontos-base: 500 = 5%). `tests/payments.mjs` falha se os dois ficarem diferentes.

## Ligar em modo de teste (passo a passo)

### 1. Credenciais de teste (no painel do Mercado Pago)

Em **Suas integrações** → sua aplicação → **Credenciais de teste**: copie a **Public Key** e o **Access Token**.
Quem cola o Access Token é você. Ele nunca deve ir para o GitHub, para um chat ou para um arquivo do projeto. As credenciais de teste só aparecem em aplicações do tipo Checkout Transparente e, como as de produção, começam com `APP_USR`; o que as torna "de teste" é vir da aba **Credenciais de teste**.

### 2. Variáveis na Vercel

Projeto `siteda-ju3-d` → **Settings** → **Environment Variables**. Salve cada uma marcando **Preview** (a de segredo como *Sensitive*):

| Nome | Valor | Segredo? |
|---|---|---|
| `MP_PUBLIC_KEY` | Public Key de teste | não |
| `MP_ACCESS_TOKEN` | Access Token de teste | **sim** |
| `MP_WEBHOOK_SECRET` | "Assinatura secreta" do webhook (passo 3) | **sim** |
| `ORDER_NOTIFY_EMAIL` | e-mail onde a Ju recebe os pedidos pagos | não |

O envio de e-mails já usa a chave do Resend que está configurada (`RESEND_API_KEY`).

**Segurança embutida:** em Preview e no computador o modo é sempre "teste". No site publicado (Production) os pagamentos ficam **desligados** mesmo que as chaves estejam salvas, até existir `MP_MODE`:

- `MP_MODE=test` na Production: o site público passa a usar as credenciais de **teste** (nenhum valor real se move).
- `MP_MODE=live` na Production: cobra de verdade. **Só depois do checklist abaixo.**

### 3. Webhook

No painel: sua aplicação → **Webhooks** → **Configurar notificações**.

- URL do modo de teste: `https://wheat-llama-936569.hostingersite.com/api/payments/webhook` (Hostinger; ver `HOSTINGER-SETUP.md`, seção 4.1)
- Evento: **Order** (`orders`)
- Copie a **assinatura secreta** e salve como `MP_WEBHOOK_SECRET` (passo 2).

Atenção: as prévias da Vercel ficam atrás de login, então o Mercado Pago **não consegue** entregar o webhook nelas. O cartão e o Pix funcionam nas prévias (o navegador consulta o estado), mas os **e-mails de pedido pago só saem** quando o webhook chega. Para testar os e-mails: use `MP_MODE=test` na Production (mesmas credenciais de teste) ou faça o teste pelo servidor local com `--fake-mp`.

### 4. Conferir

Abra `/api/health` no site: deve aparecer `"payments":"test"` e `"mp":{"token":true,"publicKey":true,"webhookSecret":true}`. Nenhum valor secreto é mostrado.

### 5. Testar

No checkout aparece a faixa **AMBIENTE DE TESTE** e um bloco "Como testar neste ambiente".

- Cartão aprovado: Mastercard `5480 8328 0103 3311`, validade `11/30`, código `123`, nome do titular **APRO**, CPF `12345678909`. Também há Visa `4235 6477 2802 5682` e Elo (débito) `5067 7667 8388 8311`, com o mesmo código e validade.
- O nome do titular escolhe o resultado: `APRO` aprova, `OTHE` recusa (erro geral), `CONT` deixa pendente; a tabela oficial tem outros casos (`FUND` saldo insuficiente, `SECU` código inválido etc.).
- No campo de e-mail do pagamento use um endereço **diferente** do e-mail da sua conta do Mercado Pago. Se o ambiente de teste exigir o e-mail de comprador de teste (`test@testuser.com`), o servidor tenta primeiro o e-mail real e, só no modo teste, repete com o de teste; o e-mail real fica guardado no pedido para o comprovante.
- **Pix de teste fica sempre pendente** (não existe pagamento real para confirmar). Para ver um pedido aprovado, use o cartão.

Lista oficial dos cartões de teste: painel do Mercado Pago → Documentação → Cartões de teste.

## Testar sem credenciais

```bash
node tools/dev-server.cjs --fake-mp
```

Abre o site em `http://localhost:8844` com um Mercado Pago e um Brick **simulados**: dá para percorrer cartão aprovado, recusado, em análise e Pix (para "pagar" um Pix aberto, use o endereço `http://localhost:8844/__fake-mp/pay?id=<código>` que aparece no terminal). Os e-mails são gravados numa pasta temporária em vez de enviados.

Com as credenciais de teste reais, sem gravá-las em lugar nenhum:

```bash
node tools/dev-server.cjs --ask-mp
```

O terminal pede a Access Token e a Public Key (a digitação fica oculta). Localmente o webhook não chega (o Mercado Pago não alcança o seu computador), então não há e-mail de pedido pago, mas todo o resto funciona.

## Testes automáticos

`node tests/payments.mjs` cobre: catálogo do servidor igual ao da loja, preços sempre recalculados no servidor, modos de operação, conversão do Brick para a API de Orders, assinatura do webhook (válida, adulterada, chave errada), os três endpoints com um Mercado Pago e um Resend falsos e o banco em memória (comprador logado e identificado, pedido gravado, pago uma vez e e-mails uma vez, valor diferente recusado, consulta só pelo dono do pedido, validação, idempotência, limites, erros) e os e-mails em três idiomas. As demais suítes continuam em `tests/`.

## Antes de cobrar de verdade

Nada disto foi decidido ainda. Cada item precisa de uma decisão da Ju:

- [ ] Ativar as **credenciais de produção** no Mercado Pago (setor, site, termos) e conferir a conta que recebe.
- [ ] **Preços, frete e prazo reais** (hoje são exemplos em `dist/commerce-config.js` e `api/_lib/catalog.js`; os dois precisam mudar juntos, e um teste avisa se ficarem diferentes).
- [ ] Regra de **retirada / entrega**, número do **WhatsApp** da loja.
- [ ] **Políticas**: privacidade, troca e devolução, prazos de produção sob encomenda.
- [ ] **Domínio verificado no Resend**, para o cliente receber o comprovante (hoje o Resend só entrega para o dono da conta).
- [ ] **3D Secure** para cartões (`config.online.transaction_security` na API de Orders) e regras de **parcelamento** (hoje até 12x).
- [x] **Banco de pedidos** com histórico, painel da Ju e "Meus pedidos". Faltam rastreio, nota fiscal e reenvio de e-mails pelo painel.
- [ ] Conferir as **taxas** vigentes no Mercado Pago.
- [ ] Frete real ligado: `/api/health` mostra `"shipping":"correios"` (ver `FRETE-SETUP.md`). Sem isso o site cobra o frete fixo de exemplo (R$ 18,00).
- [ ] Só então salvar as credenciais de produção **e** `MP_MODE=live` na Production, e fazer uma compra real de valor baixo com estorno.

## O que o código garante

- O Access Token e o segredo do webhook só existem no servidor; o navegador recebe apenas a Public Key.
- O navegador não decide preço: o servidor recalcula tudo e recusa carrinho inválido.
- O número do cartão nunca passa pelo nosso servidor; o token do cartão não é registrado em log nem devolvido ao navegador.
- Cada clique em pagar gera um identificador; repetir o pedido (duplo clique, falha de rede) cai no mesmo pedido e na mesma order em vez de cobrar duas vezes.
- Um pedido só vira "pago" se a referência e o valor informados pelo Mercado Pago baterem com o que foi gravado no banco.
- O webhook só age depois de conferir a assinatura e de ler o pedido no Mercado Pago; e-mails repetidos são descartados pela chave de idempotência do Resend.
- Sem chaves (ou na Production sem `MP_MODE`) tudo volta ao protótipo de demonstração.

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| O checkout continua no modo de demonstração | Faltam `MP_PUBLIC_KEY`/`MP_ACCESS_TOKEN`, ou estão só em outro ambiente (Preview x Production), ou a Production está sem `MP_MODE`. Veja `/api/health`. |
| "Não foi possível carregar as formas de pagamento" | O navegador bloqueou `sdk.mercadopago.com` (bloqueador de anúncios) ou está sem internet. |
| Erro ao pagar com detalhe entre parênteses (só no modo teste) | É o motivo devolvido pelo Mercado Pago; ele mostra o campo ou a regra que falhou. |
| Pagou o cartão mas não chegou e-mail | Webhook não chegou (prévia com login, URL errada, `MP_WEBHOOK_SECRET` diferente) ou `ORDER_NOTIFY_EMAIL`/`RESEND_API_KEY` ausentes. O log da função na Vercel diz qual. |
| E-mail chegou para a Ju mas não para o cliente | Sem domínio verificado o Resend só entrega ao dono da conta. |
| Pix parado em "aguardando" no teste | É o esperado no ambiente de teste. |
| "Muitas tentativas seguidas" | Limite de segurança por endereço de internet e por conta (20 e 8 em 10 minutos); espere um pouco. |

## Depois

- Rastreamento e nota fiscal por e-mail (os modelos de e-mail já existem; faltam os gatilhos).
- Estorno parcial (hoje o painel estorna o valor total ao recusar; ver ADMIN-SETUP.md).
- Frete com o Melhor Envio (PAC), nota fiscal e rastreio por e-mail e no site.
