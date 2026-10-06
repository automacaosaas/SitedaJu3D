# Passagem de contexto para uma sessão nova (01/10/2026)

Para quem for continuar o trabalho sem lembrar das conversas anteriores (por exemplo, uma sessão na nuvem).
Quem guia: Pedro (colaborador). Dono do repositório e das contas: `automacaosaas` (powershop.bras@gmail.com), que
também mexe nas mesmas branches via Claude. **Este arquivo não tem segredos e não deve ganhar nenhum.**

Loja "Ju, imprime pra mim?" (JU IMPRIME PARA MIM LTDA, CNPJ 67.771.044/0001-96, Ouro Preto/MG): capas para
retinoscópio e avião para régua de grau, impressas em 3D e personalizáveis (Borboletoscópio, Dinossauroscópio, Aviãoscopia).

## Estado atual

- **Atualização de 06/10/2026: o site de teste roda a `teste/rastreio-vitrine`**, a junção feita pelo Pedro de todas as
  branches abaixo (zip a cada junção; 44 suítes passam). Nenhuma delas está na `main` ainda.
  - **Rastreio (`rastreio/correios`, `RASTREIO.md`):**
    - a API Rastro está liberada no contrato da Ju; o teste ponta a ponta com um pacote real deu certo;
    - a API exige o idioma `pt-BR` (sem ele, erro SRO-018);
    - o código de rastreio só vale com o dígito verificador certo (padrão S10), no painel e no servidor;
    - na Expedição, o envio só sai no clique em "Confirmar envio" (o código conferido mostra um aviso verde);
    - um código de pacote antigo, com eventos de antes do pagamento, não conclui o pedido nem avisa ninguém, e o painel mostra
      "Código de outro pacote?";
    - a pesquisa de satisfação dos Correios sai do detalhe dos eventos;
    - reabrir um pedido entregue não o fecha de novo com a entrega antiga;
    - migração `013_rastreio_ultimo.sql` (o painel lê só o último evento).
  - **Vitrine:**
    - a volta à home pela logo não pisca mais a borboleta nem o cabeçalho pela metade (`vitrine/sem-piscar`, PR #14);
    - a home volta na peça que a pessoa estava vendo (`vitrine/lembrar-peca`, do Pedro);
    - foto da borboleta em 135 KB (`vitrine/borboleta-leve`);
    - as quatro fotos da vitrine têm versão de 768 px, escolhida por `srcset` (celular e computador 1x/2x baixam só ela;
      `vitrine/foto-celular`);
    - o pré-carregamento é da peça em que a home abre, não mais sempre da borboleta (`vitrine/preload-peca`). Números em
      `PERFORMANCE-QA.md`.
  - **Do Pedro:**
    - "Meus pedidos" em cards, com etapas, filtros e "Rastrear pacote" (`conta/meus-pedidos`). **Não mexer em
      `dist/account.js` e `dist/account.css` até ela entrar na `main`;**
    - botão para remover os dados de pessoa jurídica (`conta/remover-pj`);
    - o dicionário de traduções só carrega em inglês e espanhol, e a demonstração não é pré-carregada em conexão fraca
      (`otimizacao/carregamento`).
  - **Para o lançamento:**
    - a tarefa do cron-job.org (sem ela, com o app dormindo na Hostinger, o rastreio só roda quando alguém abre o painel);
    - verificar o domínio no Resend (os e-mails do rastreio ainda só chegam ao e-mail de teste).
- **Atualização de 05/10/2026 (noite): branch `rastreio/correios`**, feita sobre a `bling/resiliencia` (`285ea15`). Traz o
  rastreio automático pelos Correios (API Rastro, mesmo contrato do frete) e a aba "Pronto para envio" virou **Expedição**,
  com o campo do código pronto para o leitor de código de barras. O e-mail com o código sai quando o código entra; o pedido
  vai sozinho para Concluídos (= entregue) quando os Correios registram a entrega. "Meus pedidos" tem a linha do tempo.
  Migração `012_rastreio.sql`. Tudo em `RASTREIO.md`.
- **Atualização de 05/10/2026: branch `vitrine/3d-nas-consultas` (enviada ao GitHub).** Ela já tem a `main` até `6c6bb1a`
  (galeria de vistas, macaco novo, fluxo de caixa, desempenho, página Fale com a Ju com perguntas frequentes e o pedido em
  etapas no painel) e a paginação da lista de pedidos (`claude/project-thread-3y8z4a`, `9d1bc0f`). Acrescenta o que o dono
  pediu entre 03 e 05/10. 39 suítes passam. Detalhes e verificação em `CONSULTAS-3D-QA.md`.
  - **Home:**
    - saiu a seção "O 3D nas suas consultas" (fichas técnicas, GSAP/Lenis);
    - "Personalizar o meu" com a paleta;
    - "Nossa coleção" com os cards dos lados menores e o do centro maior, a peça saindo por cima do card;
    - ícone no "Entrar ou cadastrar";
    - o carrinho dos cards gira antes de o mini-carrinho subir.
  - **Página de cada peça (`borboletoscopio.html` etc., `product-landing.js`):**
    - 3D que gira, e as cores da peça em bolinhas no canto da imagem;
    - "Personalizar o meu" abre as cores na própria página; no celular, a peça fica presa no alto, o header some e um carrinho flutuante adiciona a peça;
    - acordeões de produção, envio e trocas;
    - "Sobre a peça" com as cores e a observação.
  - **Carrinho:**
    - recomendações (até 3 peças e "Ver mais");
    - informações da compra;
    - selos dos meios de pagamento vindos da conta do Mercado Pago (`GET /api/payments/methods`, veja `MERCADOPAGO-SETUP.md`);
    - a barra do frete grátis sobe quando entra uma peça.
  - **Mini-carrinho:** "Complete o kit" com até 3 peças da mesma categoria, que não somem, com o número no botão; ao fechar, ele desliza.
  - **Tarefa D feita a pedido do dono:** saíram "Preço ilustrativo" (cards), "valores ilustrativos nesta prévia" (página da peça) e a nota da coleção. Os preços ainda serão corrigidos.
  - **Servidor local:** com `--fake-correios`, usa a regra de frete grátis e o prazo da loja. O simulador do Mercado Pago responde `/v1/payment_methods`.
- **Branch de partida (até 01/10): `juncao/pr2-auditoria`.** É a mesma versão que está no site de teste
  (https://wheat-llama-936569.hostingersite.com, na Hostinger) no commit `ae011d4`. Este arquivo foi acrescentado depois.
- A Hostinger **não** está ligada ao GitHub: o Pedro sobe um `.zip` na mão. No lançamento, o site de produção nasce ligado ao GitHub.
- A `main` (`4edf5bc`) está atrasada de propósito. O dono abre um PR para trazer tudo para ela.
- A branch junta: o PR #2 do dono (`claude/nice-feynman-38ipn1`: Mercado Pago, Pix 5%, barra rotativa, banner e
  página de produto compactos, modelos 3D comprimidos), a nota fiscal com o Bling e a "Auditoria da Vitrine Ju"
  (`AUDITORIA-UX.md`, achados A1 a L2): mini-carrinho, página por produto, sitemap e robots, grade em Produtos, link das
  cores, 3D maior no celular, menu do celular, prévia de link, texto com no mínimo 12 px.
- `npm test`: 34 suítes passam.
- `/api/health` no site de teste: banco ok, pagamentos em `test`, frete `correios`, Bling `connected`.
  `legal` e `fiscal` aparecem `pending` (ver pendências).

## Regras de trabalho (obrigatórias)

1. Trabalhe numa branch **nova** a partir de `juncao/pr2-auditoria`. Não faça merge, não mexa na `main` nem em outras
   branches, não faça deploy. Só envie a branch nova ao GitHub quando o Pedro mandar.
2. **Segredos nunca no chat nem em arquivos** (chaves do Mercado Pago, Resend, Bling, `DATA_KEY`, `INDEX_KEY`, `AUTH_SECRET`
   etc.). Nunca peça nem repita valores: o Pedro cola direto na Hostinger. Se aparecerem num print, avise para cobrir.
3. Dados de teste (cartão, conta) só em `localhost`. Não crie contas nem digite credenciais em sites reais.
4. Antes de cada etapa, `git fetch` e conte o que mudou no GitHub. Relate todo commit seu (hash e mensagem).
5. Rode `npm test` antes de cada commit. Se mexer em páginas, Termos/legal, política de segurança (CSP) ou produtos, rode
   também `node tools/sync-legal.cjs`, `node tools/sync-meta.cjs`, `node tools/sync-csp.cjs` e
   `node tools/build-product-pages.cjs` (os testes falham se estiverem desatualizados).
6. Estilo: o repositório usa CRLF no disco (não normalize), com diff mínimo. Texto da loja em português, com tradução EN/ES em
   `dist/translations.js` (linhas `PT|EN|ES`) e regras dinâmicas em `dist/i18n-core.js`. Texto visível com no mínimo 12 px.
   Sem dependências novas. Sem scripts inline (CSP): só o import map (com hash) e blocos JSON-LD.
7. Ver o site local: `npm install` e `node tools/dev-server.cjs --fake-mp --fake-correios --fake-cep --fake-bling`
   (porta 8844; o servidor mostra o acesso do painel de teste ao iniciar). Os "fakes" ficam em `tools/`.
8. Zip para a Hostinger **só quando o Pedro pedir**, depois de varrer segredos:
   `git -c core.autocrlf=false archive --format=zip -o ../site-ju-teste-<hash>.zip HEAD package.json package-lock.json server.cjs server vercel.json api db dist`.
   Quem sobe na Hostinger é o Pedro.
9. Antes do lançamento, reconfirmar com a equipe os dados da empresa (regime ME/Simples, IE, CNAE e dados fiscais).

## Mapa do código

- `dist/`: site estático (HTML, módulos JS, CSS). `api/`: funções servidas por `server/create-server.cjs`. `db/migrations/`: MySQL
  (aplicadas ao iniciar). `tools/`: servidor local, "fakes" e geradores. `tests/`: suítes (`npm test`, ou `node tests/x.mjs`).
- **Migrações:** cada uma é gravada pelo nome do arquivo em `schema_migrations`. Por isso `010_pedidos_lista.sql` e `010_envio.sql`
  convivem: as duas já rodaram e **não devem ser renomeadas**. A próxima migração nova é a **011**.
- **Lista do painel no MySQL:** `ADMIN_ORDER_SELECT` (`api/_lib/store-mysql.js`) escolhe as colunas que `orders.adminView` lê. Campo
  novo no painel entra nessa lista também; `tests/store-contract.mjs` confere isso, mesmo sem banco.
- **Envio internacional (05/10/2026, branch `envio/internacional`):** parte nova do painel (`dist/admin-international.js`,
  `api/admin/international-quote.js`). Cota o Exporta Fácil com o contrato dos Correios para um país e mostra os dados de alfândega e o
  passo a passo. Os serviços que o contrato não tem aparecem com a mensagem dos Correios. Detalhes em `FRETE-SETUP.md`, seção
  "Envio internacional". O checkout continua só para o Brasil.
- **Preço e Pix:** `dist/commerce-config.js` (loja) e `api/_lib/catalog.js` (servidor) precisam dar o mesmo resultado
  (`tests/pix.mjs` e `tests/payments.mjs` conferem). O servidor decide o desconto pela forma de pagamento realmente usada.
- **Pagamento:** `api/payments/`, `api/_lib/mercadopago.js`, `dist/checkout.js`, `dist/live-payment.js` (`MERCADOPAGO-SETUP.md`).
- **Frete:** `api/shipping/`, `api/_lib/shipping*.js` (`FRETE-SETUP.md`).
- **Nota fiscal:** `api/_lib/fiscal.js` (dados fiscais), `nfe.js`, `invoicing.js`, `bling.js`, `nfe-providers/bling.js`,
  `api/admin/bling.js`, painel em `dist/admin.js` (`NFE-SETUP.md`).
- **Empresa e Termos:** `api/_lib/legal.js` → `node tools/sync-legal.cjs`; mude `TERMS_VERSION` quando o texto legal mudar.
- **Páginas geradas:** `borboletoscopio.html`, `dinossauroscopio.html`, `aviaoscopia.html`, a grade de `produtos.html`,
  `sitemap.xml` e `robots.txt` (`tools/build-product-pages.cjs`); prévia de link e dados para buscadores (`tools/sync-meta.cjs`).
- **Página do produto, aba Foto (04/10/2026):** galeria de fotos reais da peça (nem o 3D nem imagens geradas): miniaturas à esquerda
  no computador, arrastar de lado no celular; o 3D continua na aba ao lado, e escolher uma cor leva a ele. **Padrão: 4 fotos por peça**,
  nesta ordem — frente, três quartos, costas e um detalhe de perto (o rosto, a cabine) —, todas 4:5 (960 x 1200), recortadas do fundo,
  com a peça do mesmo tamanho e no mesmo lugar e uma sombra leve no chão; o detalhe enche o quadro, como o zoom das lojas
  (`STANDARD`/`GALLERY` em `dist/gallery.js`; cada peça só diz o nome do detalhe dela). As fontes (fotos e vídeos do Luiz) ficam em
  `design/vistas/`, com o recorte de cada foto em `design/vistas/fotos.json`; o que pedir de foto para uma peça nova está em
  `design/vistas/PADRAO.md`. `node tools/galeria-vistas/gerar.cjs` grava em `dist/assets/vistas/` (tira o chuvisco da compressão,
  amplia com Lanczos e realça); depois, suba `VIEWS_VERSION`. Peça sem fotos reais (hoje, o macaco): só a foto da vitrine, no mesmo
  quadro. Peça nova (unicórnio, girafa): entra em `GALLERY` e em `fotos.json` quando estiver à venda.
- **Celular:** a tela da peça mostra só as partes, as cores e a compra; Detalhes, Cores, Entrega e Trocas ficam no (i) do topo, e as
  combinações prontas e o link das cores, na aba Cores dele.
- Outros documentos úteis: `HOSTINGER-SETUP.md`, `ADMIN-SETUP.md`, `LEGAL-SETUP.md`, `RESEND-SETUP.md`, `COLLABORATOR_PROMPT.md`.

## Decisões já tomadas

- **Pix:** 5% de desconto só nas peças, nunca no frete.
- **Prazo de produção:** 3 a 5 dias úteis.
- **Cartão:** texto "3x sem juros"; a loja configura isso no Mercado Pago depois (hoje a tabela de parcelas ainda mostra juros em 2x e 3x).
- **Frete:** Correios com contrato próprio, PAC marcado por padrão (SEDEX também); PAC grátis a partir de R$ 500.
- **Preços** R$ 129 / 139 / 159: aguardando confirmação; desde 05/10, sem o aviso de "ilustrativo" no site (pedido do dono).
- **Nota fiscal:** Bling, em toda venda (pessoa física e jurídica), emitida quando a Ju marca "concluído" no painel. Empresa ME no
  Simples Nacional, MG. A conta do Bling deve estar em homologação no primeiro teste (o site pausa se detectar produção).
- Sem faixa de cookies e sem analytics por enquanto (analytics conflita com a Política de Privacidade atual).
- **Lançamento:** banco novo e limpo, domínio `juimprimepramim.com.br`, site de produção ligado ao GitHub.

## Tarefas (o Pedro diz qual fazer; uma por vez)

- **A. Correções de layout.** O Pedro vai mandar o relatório. Mostre o plano antes de mexer e confira em 375 px e em computador.
- **B. Nota fiscal.** Feito no site em 01/10: duas naturezas no Bling (cliente sem IE `15111617940`, com IE
  `15111617959`; ver `NFE-SETUP.md`), escolhidas pelo tipo de cliente; texto da contadora; empresa sem IE como não
  contribuinte. Falta no Bling: formas de pagamento (17/03/04) e conta em homologação. Depois, zip e teste real em
  homologação: próximo número (11, série 1), CFOP de cada caso, e se o Bling duplica o texto do Simples ou a linha do DIFAL.
- **C. Atendimento.** Quando o Pedro passar e-mail e WhatsApp: `api/_lib/legal.js` (e-mail e telefone) e `dist/commerce-config.js`
  (`whatsapp`), depois `node tools/sync-legal.cjs`. Com o número, o "Fale com a Ju" aparece sozinho no menu do celular.
- **D. Preços.** Os selos "ilustrativos" já saíram (05/10, pedido do dono). Falta só trocar os valores quando forem confirmados
  (`dist/commerce-config.js` e `api/_lib/catalog.js`, que precisam bater).

## Pendências por responsável

- **Equipe (Pedro e Ju):** teste de pedido de ponta a ponta no site de teste (cartão de teste APRO e Pix de teste, e-mails, painel);
  configurar os 3x sem juros no Mercado Pago e conferir se o webhook aponta para a Hostinger; confirmar preços; passar e-mail e WhatsApp;
  passar o id da natureza do Bling.
- **Macacoscópio à venda (02/10/2026):** faltam preço, peso embalado, NCM e as lâmpadas compatíveis (o que muda em
  `VITRINE-AVIAO-MACACO-QA.md`). Hoje é novidade com "Ver em 3D", já com o modelo do Meshy em cores fixas.
- **Depende de conteúdo ou decisão (auditoria):** ficha técnica (C2), fotos reais e vídeo (C4), Sobre e Contato (G1; depois remover o
  `noindex` dessas páginas), depoimentos (G3), "Avise-me" nos Sensoriais (B4), regra de cor do tema (F4 e H2; sugestão: tema do
  produto na vitrine e no produto, rosa Ju no fluxo de compra e no institucional), analytics com aviso de consentimento (K1).
- **Dono:** levar o PR #2 e a `juncao/pr2-auditoria` para a `main`; confirmar se rotacionou a chave do Resend que vazou em print (28/09).
- **Antes do lançamento:** domínio na Hostinger (atualizar `SITE_URL`, o endereço de retorno do app do Bling e o webhook do Mercado
  Pago); verificar o domínio no Resend (hoje os e-mails só chegam ao e-mail de teste); Mercado Pago em `live` na conta do CNPJ;
  Bling em produção (certificado A1, plano); revisão jurídica (`LEGAL-SETUP.md`); bloquear a indexação do site de teste.
- **Antes do lançamento — página de Contato (`contato.html`, ficou como a prévia aprovada em 05/10):** confirmar com a equipe
  (1) o número do WhatsApp (`whatsapp` em `dist/commerce-config.js`; o botão aparece sozinho na página e no menu do celular);
  (2) se `contato@juimprimepramim.com.br` é o e-mail oficial (criar a caixa no domínio; se for, preencher `email` em
  `api/_lib/legal.js` e rodar `node tools/sync-legal.cjs`; criar `CONTACT_EMAIL` na Hostinger se as mensagens do formulário
  devem ir para ela em vez do `ORDER_NOTIFY_EMAIL`); (3) o horário "segunda a sexta, das 9h às 18h"; (4) o FAQ promete enviar o
  código de rastreio quando a peça for postada: desde a `rastreio/correios` o site manda sozinho, quando a Ju informa o código
  no painel (`RASTREIO.md`).

## Como entregar

Ao terminar cada tarefa: nome da branch, commits (hash e mensagem), arquivos alterados, resultado do `npm test` e o que conferir no
navegador. O Pedro leva isso a uma sessão local, que baixa a branch, testa, compara com o que o dono publicou, gera o zip e orienta o envio.
