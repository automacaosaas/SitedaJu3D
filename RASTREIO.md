# Rastreio automático pelos Correios (API Rastro)

**Objetivo:** depois que a Ju posta o pacote, o site acompanha a entrega sozinho. O cliente vê a linha do tempo em "Meus
pedidos" e recebe os e-mails certos. O pedido vai para Concluídos quando os Correios registram a entrega. A Ju só é
chamada quando um pacote tem problema.

Branch `rastreio/correios` (05/10/2026), feita sobre `bling/resiliencia` (`285ea15`). Junta a proposta do Pedro e a ideia do
dono. Testes: `tests/tracking.mjs` (novo), `tests/admin.mjs` (o fluxo dos e-mails mudou) e as suítes de antes.

## 1. O caminho do pedido

| Aba do painel | Status | Como entra | E-mail ao cliente |
|---|---|---|---|
| Pendentes | `pendente` | pagamento aprovado | "Pagamento confirmado" (como antes) |
| **Expedição** (antes "Pronto para envio") | `confirmado` | a Ju clica em "Confirmar pedido"; a NF-e sai pelo Bling | "Pedido confirmado" (como antes) |
| Enviados | `enviado` | a Ju informa o código de rastreio (só depois da nota autorizada: a trava `409 invoice_pending` do Pedro continua) | **"Pedido enviado"**, com o código e o botão "Acompanhar a entrega" (vai para "Meus pedidos") |
| Concluídos | `concluido` | **sozinho**, quando os Correios registram a entrega (ou a Ju clica em "Marcar como entregue") | **"Pedido entregue"** |

O que mudou no fluxo dos e-mails:

- **Antes:** o código entrava em silêncio e o e-mail com o código só saía quando a Ju clicava em "Concluir".
- **Agora:** o e-mail com o código sai **quando o código entra**. "Concluído" passou a querer dizer **entregue**.
- **Código corrigido** em Enviados: não manda e-mail de novo. O rastreio do código antigo é apagado.
- **Voltar um passo** (Enviados → Expedição): o código e o rastreio saem do pedido, e ninguém recebe e-mail.

### Expedição: o campo do código

- Ao abrir a aba Expedição, o cursor já está no campo do código do primeiro pedido.
- Dá para digitar, colar ou **ler com o leitor de código de barras** da etiqueta. O leitor digita o código e aperta Enter.
- O envio **só é confirmado no botão "Confirmar envio"** (pedido do Pedro, 06/10/2026). Com um código completo e conferido
  (2 letras, 9 números e 2 letras, como `AA123456785BR`), aparece embaixo do campo "Código … conferido. Clique em Confirmar
  envio…" e o botão fica em destaque; o Enter do leitor leva até o botão, sem enviar.
- **Dígito verificador:** o 9º número confere os outros oito (padrão S10 da UPU, usado pelos Correios). Um número trocado
  na digitação ou na leitura quase nunca passa: o campo avisa "Este código não confere" e o envio não é confirmado. O
  servidor confere de novo (`validTracking` em `api/_lib/orders.js`).
- Um aviso no painel diz se o e-mail foi para o cliente.

## 2. A consulta automática

O site usa a **API Rastro** dos Correios (`GET /srorastro/v1/objetos`) com o **mesmo contrato e o mesmo token do frete**.
Não há variável nova no hPanel.

**Quando roda:**

- no servidor Node, **uma volta a cada 10 minutos** (`server/create-server.cjs`). A primeira vem uns 30 s depois de o app
  ligar;
- quando a Ju abre o painel e há pedidos em Enviados;
- em **`/api/fila/rodar`**, junto com a fila das notas. É a tarefa do cron-job.org que acorda o app na Hostinger. A resposta
  agora traz `tracking: {checked, delivered, failed}`.

**O que consulta:**

- só os pedidos em **Enviados**, cada pacote **a cada 2 horas**, em lotes de até 50 códigos (um pedido aos Correios por
  lote);
- os pacotes nunca consultados primeiro, depois os consultados há mais tempo. No máximo 200 por volta;
- depois de **60 dias** da postagem, o código deixa de ser consultado.

**Os estados do pacote:**

| Estado | Quando |
|---|---|
| `postado` | evento PO |
| `em_transito` | qualquer outro movimento |
| `saiu_para_entrega` | OEC |
| `aguardando_retirada` | LDI (na agência) |
| `entregue` | BDE/BDI/BDR tipo 01 (ou 00) |
| `problema` | as outras baixas (ausente, endereço incorreto, recusado, extraviado…) |
| `devolvido` | devolução ao remetente |
| `nao_encontrado` | os Correios ainda não conhecem o código (postado agora há pouco, ou digitado errado) |

As palavras da descrição servem de reserva, caso os Correios mudem algum código de evento. O horário dos Correios vem sem
fuso e é lido como horário de Brasília.

**Os avisos (cada um sai uma vez só, guardado em `tracking_notices`):**

- **saiu para entrega:** e-mail ao cliente, "Seu pedido saiu para entrega";
- **entregue:** o pedido vai para Concluídos (troca atômica, no histórico como "entregue (Correios)"), e o cliente recebe
  "Pedido entregue";
- **problema ou devolução:** e-mail para a Ju, com o mesmo aviso das notas fiscais (`integration-alerts.js`) e a área
  "ENTREGA". O assunto diz se o pacote "precisa de atenção" ou "está voltando". Cada tipo de problema avisa uma vez.

**Os Correios fora do ar:** a volta para e o resto espera a próxima. **Os Correios recusando** (por exemplo, a API Rastro
não liberada no contrato): o pacote fica marcado como consultado e só é tentado de novo 2 horas depois, sem insistir a cada
10 minutos. O erro aparece no log do servidor com a linha `rastreio: os Correios não responderam…`.

## 3. No painel

- **Enviados:** cada pedido mostra uma faixa com o estado (cor por estado), o último evento, a cidade e a hora, e o botão
  **"Marcar como entregue"** para quando o rastreio não resolver sozinho (o painel pergunta antes).
- **Concluídos:** "Entregue em …" quando a data veio dos Correios.
- **Reabrir um pedido entregue** (o cliente diz que não recebeu, por exemplo): ele volta para Enviados com o rastreio, e a
  entrega que os Correios já tinham registrado não o fecha de novo. Só uma entrega registrada **depois** da reabertura
  leva o pedido a Concluídos outra vez, e aí o cliente recebe "Pedido entregue" de novo.
- A lista do painel lê só o último evento de cada pedido (coluna `tracking_last`), nunca a linha inteira.

## 4. Em "Meus pedidos"

- Pedidos enviados ou entregues mostram o código, o estado e o último evento.
- O botão **"Acompanhar entrega"** abre a linha do tempo vertical, do evento mais recente para o mais antigo, com local e
  hora. O link para o site dos Correios continua.
- `GET /api/account/tracking?ref=JU-…`: exige o cliente logado e só responde sobre pedidos dele, enviados ou entregues
  (os outros dão 404). Usa o que está salvo se a última consulta tem menos de 30 minutos; senão consulta os Correios na
  hora. Com os Correios fora, mostra o que já estava salvo. Pedido já entregue não consulta mais: a linha não muda.
- Os estados aparecem em português, inglês e espanhol. A descrição dos eventos fica como os Correios escrevem.

## 5. Banco de dados: migrações `012_rastreio.sql` e `013_rastreio_ultimo.sql`

Colunas novas em `orders`:

- `tracking_state`;
- `tracking_events` (JSON, até 40 eventos);
- `tracking_checked_at`;
- `delivered_at`;
- `tracking_notices`.

Também cria o índice `orders_tracking (status, tracking_checked_at)`.

A `013` acrescenta `tracking_last`: o último evento, que a lista do painel lê no lugar dos até 40 de `tracking_events`.
Ficou numa migração separada porque a `012` pode já ter rodado no site de teste.

As duas são aplicadas sozinhas quando o app liga. Como a `011`, foram escritas sem um MySQL local: na primeira subida,
confira no log as linhas `db: migração aplicada — 012_rastreio.sql` e `… 013_rastreio_ultimo.sql`.

## 6. Testar

**Local:** `node tools/dev-server.cjs --fake-correios`. O simulador responde a API Rastro e escolhe a história pelo
**8º número** do código (o 9º é o dígito verificador). Códigos de exemplo, todos com o dígito certo:

| 8º número | História | Código de exemplo |
|---|---|---|
| 0 | código desconhecido | `AA123456706BR` |
| 1 | postado | `AA123456710BR` |
| 2, 8 e 9 | em trânsito | `AA123456723BR` |
| 3 | saiu para entrega | `AA123456737BR` |
| 4 | entregue | `AA123456745BR` |
| 5 | destinatário ausente | `AA123456754BR` |
| 6 | devolvido | `AA123456768BR` |
| 7 | aguardando retirada | `AA123456771BR` |

Por exemplo, `AA123456745BR` é entregue na primeira volta, que no servidor local roda a cada 60 s.

**No site de teste (Hostinger), nesta ordem:**

1. **A API Rastro está liberada no contrato?**
   - No log, depois de ligar o app, deve aparecer `rastreio dos Correios: ligado (…)`.
   - Ponha em Enviados um pedido de teste com um código **real** de um pacote já postado pela Ju.
   - Em até 10 minutos (ou chamando `/api/fila/rodar`), a faixa do pedido deve mostrar o último evento.
   - Se o log mostrar `rastreio: os Correios não responderam … correios_rejected` (ou 401/403), peça aos Correios a
     liberação da **API SRO Rastro** para o contrato: Correios Empresas → CWS → Gestão de acesso a API's. O frete continua
     funcionando de qualquer jeito.
2. **"Meus pedidos"** com a conta do comprador desse pedido: "Acompanhar entrega" abre a linha do tempo.
3. **Os e-mails:**
   - "Pedido enviado" sai ao salvar o código;
   - "Pedido entregue" sai quando o pacote for entregue, ou com "Marcar como entregue" num pedido de teste;
   - enquanto o domínio não estiver verificado no Resend, os e-mails só chegam ao e-mail de teste.

## 7. O que fica de fora

- **A etiqueta** continua sendo gerada no Correios Empresa (a pré-postagem pela API é outro passo).
- **Envio internacional:** a seção do painel só cota o frete; esses pedidos não passam pelo checkout e não entram no
  rastreio automático. Se um dia virarem pedidos do site, nada muda: o código internacional dos Correios (`LX…BR`,
  `RR…BR`) tem o mesmo formato e a API Rastro o consulta igual. Depois que o pacote sai do Brasil, quem informa os
  eventos é o correio do outro país, e a API pode trazer menos detalhes.
