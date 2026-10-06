# Nota fiscal eletrônica (NF-e) automática

A nota de cada venda é emitida sozinha, por um serviço de NF-e com API, **quando a Ju confirma o pedido no painel**
("Confirmar pedido", que leva o pedido para Pronto para envio). Pedido recusado antes de confirmar não gera nota.

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
| "sai quando você confirmar o pedido" | Pedido pago, ainda pendente | Nada |
| "Nota fiscal na fila: …" | O emissor não respondeu (fora do ar, instável, pedindo pausa), está desconectado ou com a emissão pausada. O pedido está salvo | Nada: a nota sai sozinha quando o emissor voltar. **Tentar agora** força uma tentativa (veja `BLING-RESILIENCIA.md`) |
| "emitindo…" | O serviço ainda está processando | Nada: o site confere sozinho (ou **Atualizar** depois de alguns instantes) |
| "Nota fiscal nº … · PDF · XML" | Autorizada | Nada; o cliente já recebeu |
| "Nota fiscal com problema: …" | Recusada ou faltando dado (a mensagem diz o quê) | Corrigir e clicar em **Tentar de novo** (recusa da Fazenda: corrigir a nota no Bling) |
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

O site guarda a autorização criptografada no banco (tabela `integrations`, migração `008_bling.sql`) e renova sozinho.
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
- O código da nota no Bling fica guardado no pedido. "Tentar de novo" reenvia **a mesma nota**, nunca cria outra. Uma
  nota cancelada no Bling é substituída por uma nova.
- Uma rejeição da Fazenda aparece no pedido com as palavras do Bling (ex.: "Nota recusada pela Fazenda: 234 - Rejeicao:
  IE do destinatario nao vinculada ao CNPJ…"). O painel não edita os dados do cliente, então **a correção é feita na
  própria nota, no Bling** (IE, CNPJ, endereço…). Depois, "Tentar de novo" reenvia a nota **como ela está no Bling**, sem
  regravar com os dados do pedido, para não desfazer a correção. Também dá para enviar pelo próprio Bling: o "Tentar de
  novo" seguinte só busca a nota autorizada.
- Se a nota não chegou à Fazenda (o envio falhou no caminho), "Tentar de novo" atualiza a nota com os dados do pedido
  (`PUT /nfe/{id}`) e envia.
- `/api/health` mostra `"bling"`: `off`, `not_configured` (faltam as variáveis), `disconnected`, `connected` ou
  `paused`.

### Corrigir uma nota rejeitada pela Fazenda (no Bling)

Testado em homologação em 03/10/2026 (nota nº 20). O painel do site não edita os dados do cliente: a correção é feita na
nota, no Bling, e o site só reenvia.

1. No Bling, abra a nota rejeitada (Vendas → Notas Fiscais de Saída) e veja o motivo.
2. Corrija o dado recusado. IE, CNPJ e endereço do cliente ficam no cadastro do contato: lápis ao lado do nome do
   contato, na própria nota.
3. Marque **todos** os itens como **Faturado** (abra cada item da nota, marque "Faturado" e salve o item). Os itens que
   vêm do site chegam sem essa marca, e sem ela o Bling considera o valor faturado zero: zera a parcela e não salva a
   nota ("Não é possível adicionar parcelas quando o valor faturado for zero").
4. Em **Cálculo de imposto → Mostrar mais**, confira **Total faturado = Total dos produtos**.
5. Em **Pagamento**: Condição de pagamento **0** → **Gerar parcelas** → confira **parcela = Total da nota** e a forma
   (Cartão de crédito, Pix…). Se faltar marcar um item, a parcela sai menor que a nota (no teste, R$ 139,59 numa nota
   de R$ 290,01).
6. **Salvar** (não precisa enviar pelo Bling).
7. No painel do site, **Tentar de novo** no pedido: a nota sai autorizada com o mesmo número e o cliente recebe o e-mail.

Limitações do Bling vistas no mesmo teste:

- **CNPJ com letras** (emitido desde julho de 2026): o Bling criou contatos repetidos para o mesmo CNPJ, e com repetidos
  o lápis não salva ("O CNPJ já está cadastrado no contato…"); "Importar endereço da SEFAZ" falha ("Formato do XML
  incorreto"). Com CNPJ só de números o contato foi reaproveitado (EMPRESA TESTE: 3 notas, 1 contato).
- A API não mostra um campo para mandar o item já "Faturado": perguntar ao suporte do Bling. Se existir, o site passa a
  mandar e o passo 3 deixa de ser preciso.

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
- **DIFAL**: zerado. Nas vendas para pessoa física (ou empresa sem inscrição estadual) de outro estado, a nota traz a
  linha "Valores totais do ICMS Interestadual: DIFAL da UF destino R$ 0,00 + FCP R$ 0,00; DIFAL da UF Origem R$ 0,00",
  como na nota nº 10 (mantida pela contadora em 01/10/2026).
- **Empresa sem inscrição estadual** (marcada como "isenta" no checkout): vai como **não contribuinte** (regra 2,
  CFOP 6107), decisão da contadora em 01/10/2026.
- **Frete**: modalidade 0 (por conta do emitente), com o valor destacado no campo do frete e somado ao total.
- **Informações complementares** (texto da contadora, 01/10/2026): "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO
  SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE IPI. Pedido nº: JU-…". Quem escreve é o site, com o número
  do pedido da loja; o campo "Informações complementares" da natureza no Bling fica **vazio** para não repetir
  (confirmado pela contadora em 06/10/2026). O texto vai sem acentos ("NAO", "CREDITO"). Falta ela confirmar se é
  "ME OU EPP" (como está) ou "ME EPP" (como no documento dela), e se pode ficar sem acentos.
- Não usados: 5102, 6102 e 6108 são de revenda; o CSOSN 101 exige informar a alíquota do crédito, e o contador não
  pediu isso.

Tudo isso já está em `api/_lib/fiscal.js`. **Com o Bling, CFOP, CSOSN e PIS/COFINS precisam estar na natureza de
operação dentro do Bling, com estas mesmas regras**, porque é ela que manda. No primeiro teste em homologação,
conferir no DANFE:
- o CFOP de cada caso;
- se o Bling já escreve sozinho o texto do Simples ou a linha do DIFAL; se escrever, o site tira os dele para não repetir.

## As naturezas de operação no Bling (01/10/2026)

A orientação da contadora era uma natureza com três regras, mas no Bling as regras separam só por **estado** (e produto),
não por tipo de cliente. Por isso são **duas** naturezas, e o site escolhe a de cada venda (`bling.natureId` em
`api/_lib/fiscal.js`); o painel marca cada uma como "usada nas notas · cliente sem IE / com IE":

| Natureza (id no Bling) | Para quem | MG | Outros 26 estados |
|---|---|---|---|
| Venda de produção do estabelecimento (`15111617940`) | pessoa física e empresa **sem** inscrição estadual | 5101 | **6107** |
| Venda de produção do estabelecimento – contribuinte (`15111617959`) | empresa **com** inscrição estadual | 5101 | **6101** |

Nas duas: série 1, tipo saída, Simples Nacional, indicador de presença 2 (não presencial, pela internet),
**consumidor final ligado**, CSOSN 102 em todas as regras (sem alíquotas, FCP, benefício, ST nem partilha), PIS e COFINS
CST 49 (alíquota 0, base 100), aba IPI no padrão do Bling e **informações complementares vazias**. "Exterior" (EX) fica
fora das regras. As naturezas "5101" e "6101" criadas antes não são usadas pelo site.

O site informa o tipo de cliente em cada nota: pessoa física e empresa sem inscrição estadual vão como não contribuinte
(9), empresa com inscrição estadual como contribuinte (1).

**Formas de pagamento** no Bling: três, ativas, com o tipo de pagamento da NF-e: Pix **17**, cartão de crédito **03** e
cartão de débito **04** (se houver mais de uma do mesmo tipo, a marcada como padrão). Sem elas a nota sai com a forma
padrão do Bling. O site consulta essa lista uma vez por hora: depois de cadastrar, esperar 1 hora ou reiniciar o app.

## O que ainda falta

1. **No Bling:** naturezas, formas de pagamento, certificado A1 e os testes em homologação estão feitos (01 a
   03/10/2026). Falta conferir o telefone da loja em "Dados da empresa" (sai com 8 dígitos no DANFE) e, na virada para
   produção, mudar o ambiente para "1 - Produção" e o próximo número da série 1 para **11** (o contador é o mesmo da
   homologação, que já passou do 20).
2. **Contadora:**
   - **Respondido em 06/10/2026:**
     - a primeira nota de produção pelo Bling é a **nº 11** da série 1;
     - o "Total aproximado de tributos" das duas naturezas usa a **tabela IBPT**;
     - o campo "Informações complementares" da natureza fica vazio;
     - empresa sem inscrição estadual vai como **não contribuinte** (CFOP 6107);
     - a linha do DIFAL zerado continua nas vendas para pessoa física de outro estado.

     O site já faz os três últimos itens; os dois primeiros são configurados no Bling.
   - **Falta:**
     - revisar os DANFEs de homologação: nº 13 (MG, 5101), nº 14 (SP, pessoa física, 6107, com a linha do DIFAL) e
       nº 17 (RS, contribuinte, 6101);
     - confirmar "ME OU EPP" ou "ME EPP" no texto, e se pode ficar sem acentos.

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
node tools/dev-server.cjs --fake-mp --fake-bling   # Bling simulado: conectar no painel e confirmar um pedido
```

Mercado Pago e serviço de NF-e simulados, com **dados fiscais de exemplo** (sem valor fiscal; nunca usados em produção).
No simulador, um comprador com "REJEITAR" no nome tem a nota recusada e um com "DEMORAR" fica em "emitindo…" até
clicar em Atualizar. `node tests/nfe.mjs` cobre a montagem, as regras de ambiente, a consulta de CEP e o fluxo inteiro; `node tests/bling.mjs`
cobre a conexão com o Bling, a nota enviada, as novas tentativas, a renovação da autorização e a conferência do ambiente.
