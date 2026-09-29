# Frete real com a API dos Correios (contrato da Ju)

O checkout calcula o frete **por CEP**, na hora da compra, com a **tabela do contrato da Ju nos Correios**. O cliente vê as
opções (PAC e/ou SEDEX) com preço e prazo, escolhe, e o pedido guarda o serviço, o prazo e o custo da etiqueta. Sem os dados
abaixo, nada muda: o site continua cobrando o frete fixo de exemplo (R$ 18,00). A **etiqueta** continua sendo gerada no
Correios Empresa; este guia cobre só a **cotação**.

## Como funciona

1. Na etapa de entrega, o cliente digita o CEP. O navegador manda ao servidor só **o que pesar** (produto e quantidade) e o CEP:
   `POST /api/shipping/quote`. Nenhum preço sai do navegador.
2. O servidor monta os **volumes** (caixas) do pedido, consulta a API dos Correios (Preço e Prazo de cada serviço) e devolve as
   opções, da mais barata para a mais cara. O prazo mostrado é o **prazo de produção da Ju + o dos Correios**.
3. Na hora de pagar, `POST /api/payments/create` **cota de novo no servidor** e só aceita a opção que o cliente viu (mesmo
   serviço e mesmo valor). Se o valor mudou, responde `409 shipping_changed` com as opções novas; o checkout volta à entrega,
   avisa e o cliente escolhe de novo. O Mercado Pago cobra itens + o frete calculado pelo servidor.
4. O pedido guarda `shipping_info` (serviço, prazo, valor cobrado, **custo da etiqueta**, volumes). O painel da Ju e os e-mails
   mostram isso; o cliente nunca vê o código do contrato nem o custo da etiqueta.
5. A cotação e o pagamento usam o **mesmo cache** (10 minutos), então o valor mostrado e o cobrado saem da mesma consulta.

## O que configurar

### Variáveis de ambiente (hPanel → Variáveis de ambiente)

| Nome | Valor | Secreta |
|---|---|---|
| `CORREIOS_USER` | usuário da API (CWS → Gestão de acesso a API's) | não |
| `CORREIOS_CODE` | código de acesso da API (mesma tela, "Gerar código") | **sim** |
| `CORREIOS_CONTRACT` | número do contrato | não |
| `CORREIOS_CARD` | número do cartão de postagem | não |
| `CORREIOS_DR` | DR (Diretoria Regional), se aparecer na tela do cartão | não |
| `SHIP_FROM_CEP` | CEP de onde a Ju despacha | não |

Passo a passo de onde tirar cada dado nos Correios: `FRETE-CORREIOS-passo-a-passo.md`. O código de acesso nunca vai por chat, e-mail
ou GitHub. Se ele for gerado de novo nos Correios, o site para de cotar até a variável ser atualizada.

### Dados da loja: `api/_lib/shipping-config.js`

Fica no código (não no hPanel), preenchido a partir das respostas da Ju:

| Campo | O que é |
|---|---|
| `services` | os serviços oferecidos, com o **código de 5 dígitos do contrato** (Correios Empresas → Cartões de Postagem → "CONTRATO AG"). `code: null` = não oferecer |
| `production` | `minDays` e `maxDays`: dias úteis de produção, somados ao prazo dos Correios |
| `labelFeeCents` | taxa extra por etiqueta (volume), em centavos; `0` se a etiqueta custa só o frete |
| `freeShipping` | `null` ou `{fromCents, service}`: a partir desse subtotal, o serviço indicado é grátis para o cliente (a Ju continua pagando a etiqueta; o painel mostra o custo) |
| `boxes` | por produto: `unit` (1 peça embalada), `perBox` (quantas cabem numa caixa) e `full` (a caixa cheia). Medidas em cm, peso em gramas, **com a embalagem** |

Regras: nenhum lado acima de 105 cm, soma dos três lados até 200 cm, peso até 30 kg (limites dos Correios; o arquivo é
recusado se passar). Menos que 16 × 11 × 2 cm, o site usa o mínimo dos Correios. **Produtos diferentes não dividem caixa**: cada
produto forma os seus volumes, e a API cota cada volume (caixas idênticas são cotadas uma vez e multiplicadas). Uma caixa que
sobra com mais de uma peça, mas não cheia, é cotada como caixa cheia (lado seguro).

Enquanto qualquer valor obrigatório estiver `null` ou inválido, o frete real fica **desligado** (`pending`): nada é chutado.

### Conferir

`GET /api/health` → `"shipping"`:

| Valor | Significa |
|---|---|
| `off` | faltam as variáveis dos Correios (ou o CEP de origem) |
| `pending` | variáveis ok, mas os dados da loja em `shipping-config.js` estão incompletos |
| `correios` | cotando de verdade |

## Testar

- **Sem credenciais, no computador:** `node tools/dev-server.cjs --fake-mp --fake-correios` sobe o site com os Correios e o Mercado
  Pago simulados e caixas de **exemplo** (não são as reais). Preços e prazos do simulador são uma fórmula inventada.
- **Automáticos:** `node tests/shipping.mjs` (peças, motor, endpoint, pagamento, textos) e `npm test`.
- **Com o contrato, depois de publicar:** cote alguns CEPs de regiões diferentes e compare **centavo a centavo** com o Correios
  Empresa para a mesma caixa, serviço e CEP. Teste 1, 2 e 3 peças, PAC e SEDEX, um pedido logo abaixo e outro logo acima do
  frete grátis, um CEP inexistente, e uma compra de teste do Mercado Pago (o total é itens + frete escolhido).

## Erros e o que o cliente vê

| Situação | Resposta | Mensagem |
|---|---|---|
| CEP incompleto ou sem atendimento nos serviços oferecidos | `422 no_service` | "Não encontramos envio para esse CEP." |
| Correios fora do ar, credenciais recusadas, tempo esgotado | `503 shipping_unavailable` | "Não conseguimos calcular o frete agora. Tente de novo em instantes." (botão *Tentar de novo*) |
| Consultas demais (40 por endereço a cada 10 minutos) | `429 too_many_requests` | "Muitas consultas seguidas…" |
| O valor mudou desde que o cliente escolheu | `409 shipping_changed` | "O valor do frete mudou. Confira o novo valor antes de pagar." |

Um serviço fora do contrato (403 dos Correios) some das opções sem derrubar os outros; o motivo fica no log do servidor, sem
nenhum segredo. Se todos os serviços falharem por erro dos Correios, a compra **não avança**: nunca se cobra um frete inventado.

## Fora deste passo

- Comprar a etiqueta e mandar o código de rastreio por e-mail (a etiqueta segue no Correios Empresa).
- Caixa compartilhada entre produtos diferentes.
- Valor declarado (seguro) e serviços adicionais.
- Antes de cobrar de verdade (`MP_MODE=live`), confirme `"shipping":"correios"`: sem isso o site cobra o frete fixo de exemplo.
