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

## O que falta para ligar

1. **Contador:** escolher o serviço de NF-e e informar os dados fiscais (a mensagem pronta está na conversa e abaixo).
2. **Dados fiscais:** trocar cada `[PREENCHER: …]` de `api/_lib/fiscal.js`: UF da empresa, regime (CRT), inscrição
   estadual, série, CFOP dentro e fora do estado, CSOSN, CST de PIS e COFINS, NCM de cada peça e o texto de
   informações complementares. Os dados da empresa (razão social, CNPJ) ficam em `api/_lib/legal.js`.
3. **Conector do serviço escolhido:** um arquivo em `api/_lib/nfe-providers/` que traduz a nota para a API dele. O resto
   (montagem, registro, painel, e-mails, testes) já está pronto e testado com um serviço simulado.
4. **Certificado A1:** enviado por vocês direto no painel do serviço.
5. **Variáveis na Hostinger:**

| Nome | Valor | Secreta |
|---|---|---|
| `NFE_PROVIDER` | o nome do serviço (ex.: `focusnfe`) | não |
| `NFE_TOKEN` | a chave da API do serviço | **sim** |
| `NFE_ENVIRONMENT` | `producao` só no site de verdade, quando for vender | não |

Sem `NFE_ENVIRONMENT=producao`, e sempre no site de teste, as notas vão para a **homologação** da Fazenda, que não tem
valor fiscal: o painel mostra a etiqueta "homologação" e o e-mail avisa. É a mesma regra de dois passos das chaves do
Mercado Pago. `/api/health` mostra `"nfe"` (`off`, `test` ou `live`) e `"fiscal"` (`pending` enquanto faltar dado).

## Perguntas para o contador

1. Qual serviço de NF-e com API você usa ou recomenda (Focus NFe, NFE.io, Nuvem Fiscal, PlugNotas, Bling…)?
2. Regime tributário (Simples Nacional?), inscrição estadual e CNAE.
3. NCM das peças impressas em 3D.
4. CFOP para venda dentro do estado e para outros estados (produção própria?).
5. CSOSN do ICMS e CST de PIS e COFINS.
6. Série e número inicial das notas; testar antes em homologação.
7. Texto obrigatório de informações complementares.
8. DIFAL nas vendas para consumidor final de outros estados.
9. Frete na nota como por conta do emitente.

## CEP conferido antes de cobrar

No pagamento, o servidor consulta o CEP (ViaCEP). CEP que não existe, ou que é de outro estado, volta para o cliente
corrigir antes de pagar ("Não encontramos esse CEP…"). Se o serviço de CEP estiver fora do ar, a venda segue normalmente
e a nota confere de novo depois. O endereço de um pedido pago não se edita pelo painel: se ainda assim o endereço
estiver errado, a nota daquele pedido precisa ser feita à mão no serviço.

## Testar localmente

```bash
node tools/dev-server.cjs --fake-mp --fake-nfe
```

Mercado Pago e serviço de NF-e simulados, com **dados fiscais de exemplo** (sem valor fiscal; nunca usados em produção).
No simulador, um comprador com "REJEITAR" no nome tem a nota recusada e um com "DEMORAR" fica em "emitindo…" até
clicar em Atualizar. `node tests/nfe.mjs` cobre a montagem, as regras de ambiente, a consulta de CEP e o fluxo inteiro.
