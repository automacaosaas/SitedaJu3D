# Bling sem parar a loja: fila, disjuntor e avisos

**Objetivo:** se o Bling cair, ficar lento ou pedir pausa (limite de chamadas), a loja continua vendendo, nenhum pedido se
perde, o cliente não vê erro e a Ju continua trabalhando no painel. As notas fiscais esperam numa fila e saem sozinhas
quando o Bling voltar.

Branch `bling/resiliencia` (05/10/2026), feita sobre `vitrine/3d-nas-consultas` (`03f066f`). Testes:
`tests/bling-resilience.mjs` (novo) e as suítes de antes.

## 1. Auditoria: onde o Bling era chamado

**O cliente nunca dependeu do Bling.** Estes caminhos não chamam o Bling:

- vitrine;
- carrinho;
- frete;
- pagamento (Mercado Pago);
- webhook;
- e-mails do pedido;
- "Meus pedidos".

O catálogo e os preços são do próprio site (`api/_lib/catalog.js`, `dist/commerce-config.js`), e as peças são feitas
sob encomenda, sem estoque. Por isso a parte do plano sobre **guardar estoque e produtos localmente não se aplica**:
não há nada vindo do Bling para guardar.

O Bling só aparece no **painel da Ju**, na emissão da NF-e. Os pontos fracos estavam todos lá:

| Onde | O problema | Como ficou |
|---|---|---|
| Abrir o painel (`dist/admin.js` → `GET /api/admin/bling`) | O painel esperava a lista de naturezas do Bling: com o Bling travado, até 20 s para abrir | O cartão do Bling carrega depois dos pedidos, guarda a lista da última hora e não chama o Bling com o disjuntor aberto |
| "Confirmar pedido" (`POST /api/admin/order-status`) | Esperava o Bling responder; uma falha virava "Nota fiscal com problema" | A nota é gravada na fila antes de qualquer chamada. Se o Bling não responde, ela fica "na fila" e a confirmação vale do mesmo jeito |
| Bling fora do ar | A nota ficava com erro até a Ju clicar em "Tentar de novo" | A fila tenta de novo sozinha |
| Bling travado | Cada nota esperava o tempo-limite (20 s) | O disjuntor para de chamar depois de 3 falhas seguidas |
| Limite de chamadas (429) | Virava erro na hora | Espera e tenta de novo; o site respeita 3 chamadas por segundo |
| Notas "emitindo…" | Só eram conferidas quando a Ju abria o painel (o e-mail do cliente esperava) | A fila confere sozinha |
| Renovação da conexão | Só acontecia quando a Ju abria o painel. Um mês sem abrir derrubava a conexão | A fila renova toda semana; se cair mesmo assim, a Ju recebe e-mail |
| Criação de nota que cai no meio | Uma nova tentativa poderia criar nota em dobro | Procura a nota no Bling e segue com ela; só pede conferência à mão se não tiver certeza (seção 3) |
| Alertas | Nenhum | Aviso no painel e e-mail (seção 6) |

## 2. Como funciona agora

### A fila (a própria nota é a tarefa)

Ao confirmar um pedido, a nota é **gravada no banco antes de qualquer chamada ao Bling** (situação `fila`). Depois:

1. **Tentativa na hora.** O site tenta emitir na mesma hora, como antes. Com o Bling bem, a Ju vê "Nota fiscal nº …
   emitida" na hora. O painel espera **no máximo 8 segundos**: se o Bling estiver lento, a resposta volta antes ("enviando
   ao emissor…") e a tentativa continua depois, ainda com a nota reservada.
2. **Falha passageira.** A nota continua na fila e a confirmação vale do mesmo jeito. Contam como passageiras:
   - o Bling sem resposta, lento ou com erro 5xx;
   - o disjuntor aberto;
   - o limite de chamadas (429);
   - a consulta do CEP fora do ar.

   A fila tenta de novo depois de **1, 5 e 15 minutos, e então a cada hora**.
3. **Bling desconectado ou emissão pausada.** A nota espera sem gastar tentativas e sai na hora em que a Ju conecta o
   Bling de novo ou clica em "Liberar a emissão".
4. **Desistência.** Depois de **2 dias** de falhas, a nota vira "com problema" e a Ju recebe e-mail. Não deve acontecer,
   mas evita uma nota esquecida na fila.

Outras situações que a fila cuida:

- **Bling voltou:** quando ele volta a responder, a fila adianta todas as notas que esperavam por ele, em vez de cada
  uma esperar a sua vez (que podia ser em até 1 hora).
- **Nota "emitindo…":** é conferida sozinha, com intervalos crescentes (30 s, 1, 2, 5, 10 e 30 min, depois a cada
  hora). Se passar de um dia nisso, a Ju recebe e-mail.
- **E-mail da nota que não saiu (Resend fora):** é reenviado depois (5 min, 15 min, 1 h e 3 h).
- **Uma tentativa por vez em cada nota:** quem tenta reserva a nota por até 5 minutos (`locked_until`). O painel, a
  fila e vários processos nunca enviam a mesma nota juntos. Só quem reservou libera a reserva, então uma tentativa
  atrasada nunca solta a de outra.
- **Pedido que volta para Pendentes ou é recusado:** se a nota dele ainda não saiu, ela sai da fila e só é emitida se o
  pedido for confirmado de novo. Pedido recusado nunca ganha nota. Se a nota **já foi enviada** à Fazenda ("emitindo…"),
  ela continua sendo acompanhada até o fim, porque existe para a Fazenda. Se o pedido estiver recusado, o painel avisa
  para cancelar a nota no Bling.
- **Uma nota com problema nunca trava as outras:** se algo der errado com uma nota durante a volta, ela fica para dali a
  15 minutos e as seguintes saem normalmente. Uma volta presa por mais de 10 minutos não segura as próximas.

Quem roda a fila (`api/_lib/invoice-queue.js`):

- o servidor Node da Hostinger, **uma volta por minuto** (`server/create-server.cjs`, depois das migrações);
- o próprio painel, depois de responder, toda vez que abre.

### O disjuntor (`api/_lib/bling.js`)

- O estado fica na linha do Bling em `integrations`, então o painel e todos os processos veem o mesmo.
- **3 falhas seguidas** abrem o disjuntor. Durante a pausa, ninguém chama o Bling: a resposta é imediata, "fora do ar
  ou instável".
- A pausa começa em **1 minuto e dobra** a cada nova falha (2, 4, 8… até **30 minutos**).
- Quando a pausa acaba, **uma chamada testa** o Bling, e as outras esperam mais 30 s. Se o teste der certo, o disjuntor
  fecha.
- Contam como falha: rede fora, tempo esgotado e erro 5xx, além do limite de chamadas que não passou nem depois das
  novas tentativas. O tempo-limite de 20 s vale para a resposta inteira: um Bling que começa a responder e trava no meio
  também é cortado.
- Uma recusa de dado (400) prova que o Bling está no ar e fecha o disjuntor.
- **"Tentar agora"**, na nota da fila, é a Ju pedindo o teste na hora, sem esperar a pausa.

### Ritmo e limite de chamadas

- No máximo **3 chamadas por segundo** saem de cada processo, na ordem em que pediram, como o Bling pede
  (`BLING_REQUESTS_PER_SECOND`).
- **429 (pediu pausa):** a mesma chamada vai de novo depois de 1 s e de 2 s, ou do `Retry-After` do Bling, se vier. Se
  ainda assim não passar, a nota volta para a fila.
- **Leituras com erro 5xx** vão de novo uma vez, um segundo depois.

## 3. Criação que cai no meio: o site procura a nota, nunca faz outra

Se a criação da nota (`POST /nfe`) cai **depois de sair do site**, o Bling pode ter criado a nota sem o site saber o
código dela. Isso acontece com:

- tempo esgotado;
- conexão derrubada no meio;
- erro 502 ou 504 do gateway;
- uma resposta que começou e travou no meio.

Uma nova tentativa às cegas criaria **outra** nota. Por isso o site faz assim:

1. A nota fica na fila marcada "procurar no Bling", com o segundo exato de emissão que o site mandou.
2. Na tentativa seguinte, o site procura no Bling, entre as notas daquele dia ainda não enviadas, a do **mesmo CPF ou
   CNPJ** emitida **naquele segundo**.
3. **Achou exatamente uma:** segue com ela e envia para a Fazenda, sem criar outra. Fica registrado no histórico ("Nota
   encontrada").
4. **Não achou, ou achou mais de uma:** o site não escolhe. A nota fica "com problema", com o passo a passo para conferir
   no Bling (Vendas → Notas Fiscais de Saída):
   - **se a nota não existir lá:** "Tentar de novo";
   - **se existir:** enviar aquela nota pelo próprio Bling.
5. **Bling fora do ar na hora da busca:** a marca continua, e a busca é feita de novo na tentativa seguinte.

A busca usa a lista de notas do Bling (`GET /nfe` com tipo, situação e dia de emissão). Ela foi testada com o Bling
simulado. **No Bling real, vale um teste em homologação**, para confirmar que o filtro de data e o formato da data de
emissão são os mesmos. Se não forem, a busca não acha nada e cai no passo 4, que é seguro: pede para conferir à mão.

Os outros casos voltam para a fila normalmente, sem busca:

- **Conexão recusada:** a chamada nem saiu.
- **503 e 429:** o Bling não fez nada.
- **Tempo esgotado depois do envio:** o site já tem o código da nota, e a próxima tentativa só lê a situação dela. Nunca
  envia duas vezes. Se o Bling responder que a nota "já foi enviada", o site confere a situação real dela antes de chamar
  aquilo de recusa.

## 4. A peça nunca sai sem a nota

Com a emissão de NF-e ligada, um pedido em "Pronto para envio" **só passa para "Enviados" com a nota autorizada**:

- **No painel:** no lugar do campo do rastreio aparece "🔒 Envio bloqueado até a nota fiscal ser autorizada. A peça não
  pode sair sem a nota.". Se a nota estiver com problema, o aviso diz para resolvê-lo; se estiver na fila, diz que ela
  sai sozinha.
- **No servidor**, que é a garantia de verdade: mesmo um pedido feito por fora do painel é recusado (`409 invoice_pending`).

Com a emissão desligada, nada muda.

## 5. Se a Hostinger desligar o app sem visitas

O servidor Node roda a fila sozinho, uma volta por minuto, e o painel também roda a fila toda vez que abre. Se a
Hostinger desligar o app quando não há visitas, as tentativas automáticas esperariam a próxima visita. Para isso existe
o endereço **`/api/fila/rodar`**, para uma tarefa agendada chamar: ele acorda o app e roda uma volta da fila.

- **Ligar:** criar a variável `CRON_SECRET` na Hostinger, com 24 caracteres ou mais, aleatórios e secretos. Sem ela, o
  endereço não existe.
- **Agendar:** o hPanel **não tem Cron Jobs para app Node.js** (conferido em 05/10/2026: em Avançado só há "Acesso
  SSH" e "Registro de atividades"). Por isso, usar o **cron-job.org** (gratuito), com uma tarefa **a cada 5 minutos**:
  - URL: `https://<site>/api/fila/rodar`;
  - na aba Advanced, o cabeçalho `Authorization` com o valor `Bearer <CRON_SECRET>`.

  O histórico da tarefa deve mostrar 200 e `{"ok":true,…}`. Um 401 quer dizer segredo diferente nos dois lugares; um
  404, que a variável ainda não entrou (falta salvar com reimplantação).
- **Segurança:** sem o segredo certo, a resposta é 401. Há limite de chamadas por endereço, e a resposta traz só
  números, nunca dados de pedidos.

**Como saber se a Hostinger desliga o app:** `/api/health` agora mostra:
- `uptime`: os segundos desde que o processo ligou;
- `queue.lastRound`: quando a fila rodou pela última vez.

Abra o `/api/health`, deixe o site sem visitas por uns 30 minutos e abra de novo. Se o `uptime` voltar a um número
pequeno, a Hostinger desliga o app, e a tarefa agendada é necessária.

**Resultado no site de teste (05/10/2026): a Hostinger desliga, sim.** O app reiniciou às 20:06 depois de uns 10 minutos
sem visitas. O log mostra só as linhas de início, sem erro e sem reimplantação. **A tarefa agendada é obrigatória antes
do lançamento**; sem ela, uma nota na fila espera a próxima visita ao site. Nada se perde, mas atrasa.

## 6. Avisos para a Ju

**No topo de Pedidos, uma faixa:**
- **amarela:** "Integração com o Bling em modo de espera devido a instabilidade externa. Seus pedidos continuam salvos
  com segurança…", com quantas notas estão na fila e a hora da próxima tentativa;
- **vermelha:** conexão expirada ou emissão pausada, com o link para o cartão do Bling.

**Em cada pedido:** "Nota fiscal na fila: …", em azul (não é erro), com a próxima tentativa e o botão **Tentar agora**.

**No cartão "Nota fiscal · Bling":**
- "O Bling está instável desde…";
- a lista **Últimos acontecimentos com o Bling**: falhas, pausas automáticas, retornos e avisos enviados.

**Por e-mail** (para `ORDER_NOTIFY_EMAIL`, no máximo um de cada tipo por hora):
- Bling instável **há 10 minutos** (instabilidades curtas não viram e-mail);
- o Bling voltou;
- a conexão expirou ("conecte de novo");
- uma nota que saiu da fila sem ser emitida ou que ficou parada em processamento.

`/api/health` mostra `"bling": "unstable"` enquanto o disjuntor está aberto.

## 7. Registro (log)

Tabela `integration_log`, guardada por 90 dias. Registra:
- falhas, com a operação, o código HTTP, o tempo e o pedido;
- o limite de chamadas;
- as aberturas do disjuntor e os retornos;
- a conexão perdida;
- as pausas;
- as criações incertas;
- os avisos enviados.

As chamadas que dão certo não entram. O painel mostra os 6 mais recentes; o resto fica no phpMyAdmin. Cada falha também
sai no log do servidor (`bling: … falhou — …`).

## 8. Banco de dados: migração `011_bling_fila.sql`

Roda sozinha quando o servidor sobe. Ela:

- acrescenta em `invoices` as colunas `next_attempt_at`, `retries` e `locked_until`;
- acrescenta em `integrations` as colunas `failures`, `failing_since`, `open_until`, `last_error` e `alerted_at`;
- cria a tabela `integration_log`;
- faz as notas que estavam "processando" serem conferidas de novo logo na primeira volta.

**Atenção:** a migração foi escrita sem um MySQL local; os testes do banco de verdade rodam só com `TEST_DB_*`. Na
primeira subida na Hostinger, confira no log do servidor a linha `db: migração aplicada — 011_bling_fila.sql` e, no
painel, que os pedidos abrem.

## 9. Como ver funcionando no computador

```
node tools/dev-server.cjs --fake-mp --fake-correios --fake-cep --fake-bling
```

1. No painel (`/admin.html`), conecte o Bling simulado.
2. Para derrubar o Bling simulado, abra `/__fake-bling/falha?modo=rede`. Outros modos: `lento`, `erro`, `limite`,
   `queda`, `gateway`, `corpo`. Dá para limitar a falha às próximas N chamadas (`&vezes=N`) ou a um tipo de chamada (`&so=POST%20/nfe`).
3. Confirme um pedido: ele confirma na hora e a nota fica "na fila". Depois de 3 falhas aparece a faixa amarela.
4. Abra `/__fake-bling/falha` sem modo: o Bling volta, e a fila (uma volta a cada 15 s no servidor local) emite as
   notas sozinha.

Testes automáticos: `node tests/bling-resilience.mjs`.

## 10. Limites conhecidos

- **Vercel (não usada hoje):** não há processo contínuo, então a fila anda quando o painel abre.
- **Vários processos na Hostinger:** cada um tem o seu ritmo de 3 chamadas por segundo. A reserva da nota impede envio
  em dobro, e um 429 eventual só atrasa um pouco.
- **Mercado Pago e Correios** são outras dependências externas, fora deste plano. Pagamento e frete continuam chamando
  esses serviços na hora da compra.
