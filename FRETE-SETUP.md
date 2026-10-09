# Frete real com a API dos Correios (contrato da Ju)

O checkout calcula o frete **por CEP**, na hora da compra, com a **tabela do contrato da Ju nos Correios**. O cliente vê as
opções (PAC e/ou SEDEX) com preço e prazo, escolhe, e o pedido guarda o serviço, o prazo e o custo da etiqueta. Sem os dados
abaixo, nada muda: o site continua cobrando o frete fixo de exemplo (R$ 18,00). A **etiqueta** continua sendo gerada no
Correios Empresa; este guia cobre só a **cotação**.

## Como funciona

1. Na etapa de entrega, o cliente digita o CEP. O navegador manda ao servidor só **o que pesar** (produto e quantidade) e o CEP:
   `POST /api/shipping/quote`. Nenhum preço sai do navegador.
2. O servidor monta os **volumes** (caixas) do pedido, consulta a API dos Correios (Preço e Prazo de cada serviço) e devolve as
   opções, da mais barata para a mais cara. O prazo mostrado é o **prazo de produção da Ju + o dos Correios**. A opção que já vem
   **marcada é o PAC**, mesmo quando o SEDEX sai mais barato (acontece em CEPs da cidade da Ju); o cliente troca se quiser, e a
   escolha dele é mantida quando o frete é cotado de novo.
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
| `CORREIOS_DR` | DR (Diretoria Regional): a "Unidade Gestora" na tela do contrato (Correios Empresas → Consultar Contratos). **Obrigatória**: a API dos Correios exige a DR junto com o contrato | não |
| `SHIP_FROM_CEP` | CEP de onde a Ju despacha | não |

**Servidor próprio:** esses valores entram por `sudo bash /srv/juimprime/current/deploy/config-loja.sh` (opção 2), não pelo hPanel (`SERVIDOR-SETUP.md`).

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
| `sharedBox` | **uma caixa para qualquer mistura de produtos**: as medidas (cm), `maxPieces` (quantas peças cabem), `tareG` (a caixa pronta para fechar, sem peça: papelão, enchimento e fita) e `pieceG` (o peso, em gramas, de uma peça de cada produto, sozinha). A caixa pesa a **tara + as peças** que leva |
| `boxes` | alternativa, usada só se não houver `sharedBox`: por produto, `unit` (1 peça embalada), `perBox` (quantas cabem numa caixa) e `full` (a caixa cheia). Medidas em cm, peso em gramas, **com a embalagem** |

Regras: nenhum lado acima de 105 cm, soma dos três lados até 200 cm, peso até 30 kg (limites dos Correios; o arquivo é
recusado se passar). Menos que 16 × 11 × 2 cm, o site usa o mínimo dos Correios. Com `sharedBox`, **todos os produtos do pedido vão na mesma caixa**, até `maxPieces` peças (as mais pesadas primeiro); passou disso, vira
mais uma caixa. Com `boxes`, cada produto forma os seus volumes e uma caixa que sobra com mais de uma peça, mas não cheia, é cotada como
caixa cheia (lado seguro). Nos dois casos a API cota cada volume (caixas idênticas são cotadas uma vez e multiplicadas).

Enquanto qualquer valor obrigatório estiver `null` ou inválido, o frete real fica **desligado** (`pending`): nada é chutado.

### Pesos da loja (medidos na balança antes do lançamento)

A caixa é a **"BORBOLETA E DINO"** cadastrada no Correios Empresa: 22 × 20 × 7 cm, até 3 peças (borboleta, dino e avião cabem juntos, e as
três lâmpadas também).

| Peça (sozinha) | Peso |
|---|---|
| Borboletoscópio | 75 g |
| Dinossauroscópio | 60 g |
| Aviãoscopia | 166 g |
| MonkeyLamp (lâmpada macaco) | 24 g |
| GiraffeLamp (lâmpada girafa) | 18 g |
| UnicornLamp (lâmpada unicórnio) | 16 g |
| **Tara da caixa** (`tareG`) | **61 g** |

De onde vem a tara: a loja pesou duas caixas fechadas. As três lâmpadas deram **119 g** (119 − 58 das peças = 61 g de caixa) e borboleta + dino +
avião deram **359 g** (359 − 301 = 58 g). O site usa **61 g**, a maior das duas, para o peso informado aos Correios nunca ficar abaixo da
balança: as três lâmpadas saem com **119 g** (igual à balança) e as três peças com **362 g** (3 g acima). A caixa vazia sozinha foi estimada
em "uns 90 g", mas as duas pesagens de caixa cheia mostram que ela pesa perto de 60 g; se pesar de novo a caixa vazia (com o enchimento e a
fita) e der outro valor, troque só o `tareG`.

Exemplos do que vai para os Correios: 1 lâmpada macaco = 85 g; 1 borboleta = 136 g; 1 avião = 227 g; 4 peças = **2 caixas** (por exemplo,
as três peças com 362 g + uma lâmpada macaco com 85 g), cada caixa com a sua tara.

O mesmo peso vale para o **envio internacional** (a mesma caixa). A NF-e emitida pelo Bling não leva peso nem volumes hoje (são campos
opcionais na nota): o peso que importa para o frete é o da etiqueta, que o Correios Empresa calcula com a caixa cadastrada.

### Conferir

`GET /api/health` → `"shipping"`:

| Valor | Significa |
|---|---|
| `off` | faltam as variáveis dos Correios (ou o CEP de origem) |
| `pending` | variáveis ok, mas os dados da loja em `shipping-config.js` estão incompletos |
| `correios` | cotando de verdade |

## Testar

- **Sem credenciais, no computador:** `node tools/dev-server.cjs --fake-mp --fake-correios` sobe o site com os Correios e o Mercado
  Pago simulados, com a **caixa e os pesos da loja**. Preços e prazos do simulador são uma fórmula inventada (cobra por kg começado no
  Brasil e por 500 g no exterior), então só a cotação com o contrato mostra o preço de verdade.
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

## Endereço preenchido pelo CEP

Na etapa de entrega, ao digitar um CEP completo, o site preenche **rua, bairro, cidade e estado** e leva o cursor para o número. Não há
nada a configurar: funciona sozinho depois de publicado.

- **Como:** o navegador só fala com o próprio site (`GET /api/cep/lookup?cep=01310100`). O servidor consulta o **ViaCEP** e, se ele falhar
  ou não conhecer o CEP, o **BrasilAPI**; nada além do CEP sai do servidor. As respostas ficam guardadas (um dia para CEP encontrado, uma
  hora para CEP que ninguém conhece), então o mesmo CEP não é consultado duas vezes. Limite: 60 consultas por endereço a cada 10 minutos.
- **Só preenche o que o cliente não digitou:** um campo vazio, ou que ainda tem o que o CEP anterior escreveu, é atualizado. O que o cliente
  digitou fica como está. Se o CEP cobre a cidade toda (sem rua e sem bairro), só cidade e estado são preenchidos.
- **Se não der:** CEP que não existe ou serviços fora do ar só mostram um aviso sob o campo ("Preencha o endereço manualmente") e o cliente
  digita tudo, como antes. O cálculo do frete não depende disso.
- **Testar no computador sem internet:** `node tools/dev-server.cjs --fake-cep` (CEPs de exemplo: 01310100, 20040020, 40020000 e 35400000, este
  último da cidade inteira). Automáticos: `node tests/cep.mjs`.

## Envio internacional (painel, 05/10/2026)

Pedido de fora do Brasil, combinado por WhatsApp ou e-mail: no painel, **Envio internacional** (`/admin.html#internacional`). A Ju
escolhe o país e as peças, e o site cota com o mesmo contrato e a mesma caixa do frete nacional.

- **Correios:** `GET /preco/v1/internacional/{código}` (com `sgPaisDestino` no lugar do CEP de destino) e
  `GET /prazo/v2/internacional/exportacao/{código}`, com o mesmo token, contrato e DR. Os serviços ficam em `international` no
  `api/_lib/shipping-config.js`: Exporta Fácil Standard `45128`, Expresso `45110` e Econômico `45209`, os códigos do manual da API
  de Preço.
  - Só respondem os serviços que estão no contrato. Os outros aparecem em "Não cotado", com a mensagem dos Correios: é assim que se
    descobre o que o contrato cobre.
  - Para incluir um serviço, fale com o gerente do contrato; se o código dele for outro, troque em `shipping-config.js`.
- **O que a tela mostra:**
  - frete e prazo de cada serviço, e o total a cobrar (peças + frete);
  - a caixa usada;
  - os dados de alfândega para o Minhas Exportações: código HS `392690` e a descrição em inglês de cada peça, com botões de copiar;
  - o aviso da DU-E acima de US$ 1.000;
  - o passo a passo (cobrar, nota de exportação, pré-postagem, postar e avisar).
- **Endpoint:** `POST /api/admin/international-quote` `{country, items: [{productId, quantity}]}`, só com o login do painel (senha + código).
- **Ainda é manual:**
  - cobrar (link de pagamento do Mercado Pago, cartão);
  - a nota de exportação (natureza com CFOP 7101 no Bling, criada pela contadora);
  - a pré-postagem no Minhas Exportações.

  O checkout do site continua só para o Brasil. O plano completo está em `Plano-vender-para-o-exterior` (Pedro, 05/10/2026).
- **Testar sem internet:** `node tools/dev-server.cjs --fake-correios`. No simulador, Standard e Expresso respondem, o Econômico vem
  como "não contratado" e a Coreia do Norte (KP) não é atendida. Automáticos: `node tests/international.mjs`.

## Fora deste passo

- Comprar a etiqueta e mandar o código de rastreio por e-mail (a etiqueta segue no Correios Empresa).
- Valor declarado (seguro) e serviços adicionais.
- Antes de cobrar de verdade (`MP_MODE=live`), confirme `"shipping":"correios"`: sem isso o site cobra o frete fixo de exemplo.
