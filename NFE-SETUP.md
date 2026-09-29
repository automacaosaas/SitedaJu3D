# Nota fiscal eletrônica (NF-e) automática

A nota de cada venda é emitida sozinha, por um serviço de NF-e com API, **quando a Ju confirma o pedido no painel**
("Marcar como concluído"). Pedido recusado não gera nota, então nunca é preciso cancelar uma nota por recusa.

## Como funciona

1. A Ju marca o pedido como concluído.
2. O servidor monta a nota com os dados do pedido: comprador (nome e CPF, ou razão social, CNPJ e inscrição estadual),
   endereço com o código IBGE da cidade (consultado pelo CEP), peças e cores, frete, forma de pagamento e os dados
   fiscais de `api/_lib/fiscal.js`.
3. A nota vai para o serviço de NF-e por conexão criptografada, com a chave de acesso dele. O serviço assina com o
   **certificado A1** da empresa (enviado direto para o painel do serviço, nunca para o site) e manda para a Fazenda.
4. A nota autorizada volta com número, chave de acesso, PDF (DANFE) e XML:
   - no painel da Ju, no próprio pedido: "Nota fiscal nº … · PDF · XML";
   - para o cliente, por e-mail ("Nota fiscal do seu pedido") e em **Meus pedidos** ("Ver nota fiscal").

O CPF vai do pedido (criptografado no banco) direto para o serviço. Ninguém precisa ver nem digitar, e ele não fica
guardado junto com a nota. Cada pedido tem uma nota só: confirmar de novo ou clicar em "Tentar de novo" numa nota já
autorizada não emite outra.

## Situações da nota no painel

| O que aparece | Quer dizer | O que fazer |
|---|---|---|
| "sai quando você marcar como concluído" | Pedido pago, ainda pendente | Nada |
| "emitindo…" | O serviço ainda está processando | Clicar em **Atualizar** depois de alguns instantes |
| "Nota fiscal nº … · PDF · XML" | Autorizada | Nada; o cliente já recebeu |
| "Nota fiscal com problema: …" | Recusada ou faltando dado (a mensagem diz o quê) | Corrigir e clicar em **Tentar de novo** |
| "Pedido recusado com nota emitida" | A nota saiu e depois o pedido foi recusado | Cancelar a nota no painel do serviço (a Fazenda aceita em até 24 horas) |

## Emissor: Bling

O contador escolheu o **Bling** (API v3). No Bling ficam a empresa, o certificado, a numeração e as regras de imposto; o
site manda cada venda e lê de volta a nota autorizada. O conector é `api/_lib/nfe-providers/bling.js`, e a conexão com
a conta (autorização e tokens) é `api/_lib/bling.js`.

### 1. O que o contador configura no Bling

- Cadastro da empresa e **certificado A1** (enviado direto no Bling, nunca para o site).
- **Série e próximo número** das NF-e. A empresa já emitiu pelo emissor do SEBRAE: a numeração continua de onde parou
  (ou numa série nova), senão a Fazenda recusa por duplicidade.
- Uma **natureza de operação** de venda ("venda de produção do estabelecimento") com as regras de CFOP, CSOSN,
  PIS/COFINS e DIFAL: dentro de MG, outro estado para consumidor final e outro estado para empresa com inscrição estadual.
- **Formas de pagamento** com o tipo certo: Pix (17), cartão de crédito (03) e cartão de débito (04). O site escolhe
  sozinho a forma ativa de cada tipo.
- **Ambiente**: homologação enquanto testamos; produção só no lançamento (veja o passo 5).

### 2. Aplicativo do site no Bling (uma vez, por quem administra a conta)

Bling → **Central de Extensões → Área do Integrador → Criar aplicativo**:

- Visibilidade: privada (só para esta conta), se o Bling oferecer.
- **Link de redirecionamento**: o endereço do painel, exatamente como o site mostra no cartão "Nota fiscal · Bling":
  - site de teste: `https://wheat-llama-936569.hostingersite.com/admin.html`;
  - loja: `https://juimprimepramim.com.br/admin.html`.
- Escopos: **Notas fiscais eletrônicas (NF-e)**, **Naturezas de operação** e **Formas de pagamento**.
- Ao salvar, o Bling mostra o **Client ID** e o **Client Secret**. Eles vão direto para a Hostinger (tabela abaixo),
  nunca por WhatsApp nem por e-mail.

| Nome | Valor | Secreta |
|---|---|---|
| `NFE_PROVIDER` | `bling` | não |
| `BLING_CLIENT_ID` | o Client ID do aplicativo | não |
| `BLING_CLIENT_SECRET` | o Client Secret do aplicativo | **sim** |
| `NFE_ENVIRONMENT` | `producao` só na loja, no lançamento | não |

### 3. Conectar a conta (pelo Painel da Ju)

1. Painel da Ju → cartão **Nota fiscal · Bling** (embaixo do calendário) → **Conectar ao Bling**.
2. O Bling abre: entrar com a conta da empresa e **permitir** o aplicativo.
3. O Bling volta para o painel, que mostra "Bling conectado" e a lista de **naturezas de operação** com os códigos.

O site guarda a autorização criptografada no banco (tabela `integrations`, migração `007_bling.sql`) e renova sozinho.
A renovação vale 30 dias, e abrir o painel renova toda semana. Se ficar um mês sem ninguém abrir o painel, o cartão
avisa "A conexão com o Bling expirou" e é só conectar de novo. **Desconectar o Bling** apaga a autorização do site e pede
ao Bling para revogá-la.

### 4. Dados fiscais no site (`api/_lib/fiscal.js`)

Com o Bling, o site só precisa de:

- `bling.natureId`: o **código da natureza de venda**, que o painel mostra depois de conectar;
- o **NCM** de cada peça;
- o texto de **informações complementares**.

Série, CFOP, CSOSN e PIS/COFINS ficam no Bling, e o site não pede. UF (MG), regime (Simples Nacional, CRT 1) e
inscrição estadual já estão preenchidos. Enquanto faltar algum dado, nenhuma nota sai e o pedido mostra o que falta.

### 5. Homologação e produção

No Bling, o ambiente é uma configuração da **conta**, não de cada nota. Por isso o site confere o ambiente no XML de
cada nota que envia:

- Se o **site de teste** receber uma nota em **produção** (valor fiscal de verdade), ele registra a nota como é, avisa
  no pedido e **pausa a emissão**. Aí é conferir com o contador (dá para cancelar no Bling em até 24 horas) e clicar em
  **Liberar a emissão** no cartão do Bling.
- Se a **loja** (com `NFE_ENVIRONMENT=producao`) receber uma nota em **homologação**, dá erro no pedido: mudar o
  ambiente no Bling e clicar em **Tentar de novo**, que sai uma nota nova.

Roteiro:
1. **Testes:** Bling em homologação, site de teste conectado. Concluir pedidos de teste e o contador conferir XML e DANFE.
2. **Lançamento:** desconectar o site de teste, colocar o Bling em produção, conectar a loja e pôr
   `NFE_ENVIRONMENT=producao` na Hostinger da loja.

### Como o site conversa com o Bling

- Pedido concluído → `POST /nfe` (a nota com o comprador, as peças, o frete e a forma de pagamento) →
  `POST /nfe/{id}/enviar` (sem o e-mail do Bling; quem avisa o cliente é o site) → `GET /nfe/{id}` (número, chave,
  PDF e XML).
- O código da nota no Bling fica guardado no pedido. "Tentar de novo" corrige e reenvia **a mesma nota**
  (`PUT /nfe/{id}`), nunca cria outra. Uma nota cancelada no Bling é substituída por uma nova.
- Uma rejeição da Fazenda aparece no pedido com as palavras do Bling (ex.: "Rejeição 539: …").
- `/api/health` mostra `"bling"`: `off`, `not_configured` (faltam as variáveis), `disconnected`, `connected` ou
  `paused`.

## Referência: a última nota antes do site

A nota **nº 10, série 1** (19/09/2026, emissor do SEBRAE, natureza "Venda Fora do Estado") foi a última emitida antes do
Bling. **No Bling, a série 1 continua na nº 11.** Ela usou:

- CSOSN **102** e origem **0** (já no site);
- CFOP **6107** (venda de produção a não contribuinte de outro estado): a regra da natureza no Bling deve dar o mesmo;
- NCM **3923.10.90** para o item "CAIXA 21 × 29 × 17", que não é uma das três peças (para elas o contador indicou 3926.90.90);
- o texto do Simples Nacional nas informações complementares (já no site). O emissor do SEBRAE ainda acrescentou a
  linha do DIFAL (R$ 0,00); se o Bling também acrescentar o texto do Simples sozinho, o site tira o dele para não repetir.

Depois dos testes em homologação, confirmar no Bling que a próxima nota de produção continua sendo a nº 11. E não
emitir mais pelo emissor do SEBRAE, senão a numeração se cruza.

## Dados fiscais definidos pelo contador (29/09/2026)

Empresa no Simples Nacional que **fabrica** o que vende: por isso os CFOPs são os de "produção do estabelecimento".

| Venda | CFOP | CSOSN | PIS/COFINS |
|---|---|---|---|
| Dentro de MG | 5101 | 102 | CST 49 |
| Outro estado, pessoa física ou empresa sem inscrição estadual | 6107 | 102 | CST 49 |
| Outro estado, empresa com inscrição estadual (contribuinte) | 6101 | 102 | CST 49 |

- **NCM** das três peças: **3926.90.90** (outras obras de plásticos).
- **DIFAL**: zerado. Nas vendas para pessoa física de outro estado, a nota traz a linha "Valores totais do ICMS
  Interestadual: DIFAL da UF destino R$ 0,00 + FCP R$ 0,00; DIFAL da UF Origem R$ 0,00", como na nota nº 10.
- **Frete**: modalidade 0 (por conta do emitente), com o valor destacado no campo do frete e somado ao total.
- **Informações complementares**: "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NÃO GERA DIREITO A
  CRÉDITO FISCAL DE ICMS, ISS E IPI." (mais o número do pedido).
- Não usados: 5102, 6102 e 6108 são de revenda; o CSOSN 101 exige informar a alíquota do crédito, e o contador não
  pediu isso.

Tudo isso já está em `api/_lib/fiscal.js`. **Com o Bling, CFOP, CSOSN e PIS/COFINS precisam estar na natureza de
operação dentro do Bling, com estas mesmas regras**, porque é ela que manda. No primeiro teste em homologação,
conferir no DANFE:
- o CFOP de cada caso;
- se o Bling já escreve sozinho o texto do Simples ou a linha do DIFAL; se escrever, o site tira os dele para não repetir.

## O que ainda falta

1. **Contador, no Bling:** a natureza de operação de venda com as regras da tabela acima, série 1 com próximo número 11,
   formas de pagamento Pix e cartão, certificado A1 e o ambiente de homologação.
2. **Site:** o código dessa natureza (`bling.natureId` em `api/_lib/fiscal.js`), que o painel mostra depois de
   conectar o Bling. É o único dado fiscal que falta.

CNAE (resolvido em 29/09/2026): a 22.29-3-99 (artefatos de plástico) já é da empresa, pelo CNPJ. O comprovante de
inscrição estadual da SEFAZ-MG só tem espaço para uma CNAE secundária (mostra a 1813-0/01), então não lista todas; não
precisa incluir nada.

## CEP conferido antes de cobrar

No pagamento, o servidor consulta o CEP (ViaCEP). CEP que não existe, ou que é de outro estado, volta para o cliente
corrigir antes de pagar ("Não encontramos esse CEP…"). Se o serviço de CEP estiver fora do ar, a venda segue normalmente
e a nota confere de novo depois. O endereço de um pedido pago não se edita pelo painel: se ainda assim o endereço
estiver errado, a nota daquele pedido precisa ser feita à mão no serviço.

## Testar localmente

```bash
node tools/dev-server.cjs --fake-mp --fake-nfe     # serviço de NF-e genérico simulado
node tools/dev-server.cjs --fake-mp --fake-bling   # Bling simulado: conectar no painel e concluir um pedido
```

Mercado Pago e serviço de NF-e simulados, com **dados fiscais de exemplo** (sem valor fiscal; nunca usados em produção).
No simulador, um comprador com "REJEITAR" no nome tem a nota recusada e um com "DEMORAR" fica em "emitindo…" até
clicar em Atualizar. `node tests/nfe.mjs` cobre a montagem, as regras de ambiente, a consulta de CEP e o fluxo inteiro; `node tests/bling.mjs`
cobre a conexão com o Bling, a nota enviada, as novas tentativas, a renovação da autorização e a conferência do ambiente.
