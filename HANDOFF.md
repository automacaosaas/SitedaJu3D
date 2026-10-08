# Passagem de contexto para uma sessão nova (01/10/2026)

Para quem for continuar o trabalho sem lembrar das conversas anteriores (por exemplo, uma sessão na nuvem).
Quem guia: Pedro (colaborador). Dono do repositório e das contas: `automacaosaas` (powershop.bras@gmail.com), que
também mexe nas mesmas branches via Claude. **Este arquivo não tem segredos e não deve ganhar nenhum.**

Loja "Ju, imprime pra mim?" (JU IMPRIME PARA MIM LTDA, CNPJ 67.771.044/0001-96, Ouro Preto/MG): capas para
retinoscópio e avião para régua de grau, impressas em 3D e personalizáveis (Borboletoscópio, Dinossauroscópio, Aviãoscopia).

## Estado atual

- **Atualização de 07/10/2026: publicação automática endurecida e o Mercado Pago pronto para validar** (branch
  `trabalho/deploy-mp`).
  - **Produção = `main`**, publicada sozinha pelo servidor próprio (puxa do GitHub a cada minuto com a Deploy Key só de
    leitura; nada de GitHub Actions por SSH nem webhook). **Tudo o que entra na `main` vai para o ar em 2 a 5 minutos.**
    Proteger a `main` no GitHub: pull request, o check `test` obrigatório, sem *force push* (`SERVIDOR-SETUP.md`).
  - **Cada publicação:** trava de segurança (site completo e `HOST`), `npm ci --ignore-scripts`, `REVISION`, os testes
    dentro da versão nova antes de trocar (sem segredos; pula só `tests/model-details.mjs`), cópia do banco antes de
    migração nova, `/api/health` com `ok`, `db:"ok"` e o `release` novo; falhou, volta sozinha e manda e-mail para
    `ORDER_NOTIFY_EMAIL`.
  - **Voltar uma versão:** `sudo systemctl start juimprime-rollback.service` (segura a publicação até o próximo commit).
  - **Migrações só somam:** a volta de versão não desfaz o banco (detalhes em `SERVIDOR-SETUP.md`).
  - **Ver o que está no ar:** `/api/health` → `"release"`; `cat /srv/juimprime/current/REVISION`.
  - **Kit mudou (`deploy/`)?** Depois de publicado, rodar `sudo bash /srv/juimprime/current/deploy/setup-servidor.sh`
    uma vez (o journal avisa).
  - **Mercado Pago:** webhook só com o tópico Order (outros tópicos e ids desconhecidos respondem 200; sem banco, 503;
    assinatura com mais de 15 minutos, recusada), o Pix deixado para trás é cancelado no Mercado Pago ("Gerar novo
    código" e "Alterar dados"; `POST /api/payments/cancel`), a mesma tentativa até uma resposta definitiva (sem
    cobrança dupla depois de um *timeout*), o *device id* (`security.js` + `X-meli-session-id`), motivos de recusa em
    português (o código só no modo de teste), CNPJ como empresa, e nunca uma NF-e real para um pedido pago em modo de
    teste. Guia do dono, do teste à primeira venda real: **`MERCADOPAGO-VALIDACAO.md`**.
- **Atualização de 06/10/2026 (noite): servidor próprio da loja no ar** (`SERVIDOR-SETUP.md`). Debian 13 no endereço
  interno `10.0.100.80`, com Node 24, MariaDB e nginx. A Hostinger continua como site de teste até o lançamento.
  - **Publicação:** o servidor confere o GitHub a cada minuto. Subiu na branch configurada, ele baixa, instala,
    reinicia e confere o `/api/health`. Se a versão nova não responder, volta sozinho para a anterior.
  - **Branch publicada:** por enquanto a `servidor/proprio` (a `teste/rastreio-vitrine` mais o kit do servidor).
    Depois do PR para a `main`, o servidor passa a publicar a `main` (desde 07/10, o padrão do setup; num servidor já
    instalado, trocar `BRANCH=` em `/srv/juimprime/shared/deploy.conf`). A `teste/rastreio-vitrine` e a `main` de
    antes do PR não têm o `HOST`: a trava de segurança da publicação as recusa.
  - **Chave do servidor no GitHub:** Deploy Key somente leitura; o servidor só baixa o código.
  - **No código:**
    - a pasta `deploy/` (instalação, publicação automática, serviço e nginx), `SERVIDOR-SETUP.md` e `tests/deploy.mjs`;
    - a variável `HOST` no `server/create-server.cjs` (o site escuta só em `127.0.0.1`; sem ela, nada muda na
      Hostinger);
    - o `.gitattributes`, que mantém `deploy/` em LF.
  - **Vantagem:** o site não "dorme". A fila de notas e o rastreio rodam sozinhos, sem o cron-job.org.
  - **Rede:** o IP público `201.77.147.2` encaminha as portas 80 e 443 para o servidor (07/10). O provedor está
    configurando o IPv6.
  - **Falta:**
    - a configuração secreta (`/srv/juimprime/shared/.env`), preenchida pelo dono direto no servidor;
    - o DNS do domínio e o HTTPS (certbot);
    - firewall antes de o IPv6 ser ligado (no IPv6 não há o filtro do encaminhamento de portas);
    - cópia de segurança diária do banco, fora do servidor (desde 07/10 há uma antes de cada migração nova);
    - no lançamento: Mercado Pago real (com o 3x sem juros configurado), Bling em produção, webhook e endereço de
      retorno do Bling no domínio, e domínio verificado no Resend.
  - **Acesso ao servidor:** só por chave SSH. Ninguém manda senha por chat.
  - **Pedidos ao Pedro:** juntar a `servidor/proprio` na `teste/rastreio-vitrine`, e no `tests/server.mjs` (linha
    75) aceitar `\r?\n` (no Windows ele falha por causa da quebra de linha; no servidor passa).
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
   `node tools/build-product-pages.cjs` (os testes falham se estiverem desatualizados). Mexeu nos imports dos módulos da home
   ou em `products.js`/`hero-motion.js`: `node tools/sync-modulepreload.cjs` e `node tools/sync-entry.cjs` (PageSpeed, 08/10/2026).
   Trocou um arquivo pedido com `?v=` (modelo 3D, vista da galeria, fonte): mude o `?v=` e rode `node tools/sync-versions.cjs`
   (com `?v=` o navegador guarda o arquivo por um ano; `tests/versioned-assets.mjs` falha se o `?v=` não mudar).
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
  convivem: as duas já rodaram e **não devem ser renomeadas**. A última é a `015_mensagens.sql` (07/10: Mensagens do painel);
  a próxima migração nova é a **016**.
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
- **Vitrine de novidade das lâmpadas de fenda (08/10/2026):** `fenda.html` (endereço curto `/fenda`, que o servidor abre como
  `fenda.html`) e o banner "Novidade · Lâmpada de fenda" da home (entre a vitrine e "Nossa coleção", entre `<!-- novidade -->` e
  `<!-- /novidade -->` no `index.html`). Marcação em `dist/fenda-stage.js`, gravada por `node tools/build-product-pages.cjs`; movimento em
  `dist/fenda.js`; estilos em `dist/fenda.css` e, os do banner, em `dist/catalog.css` (a home não ganhou folha nova). Reaproveita a peça
  encaixada da página Escolha o seu (aqui com a lâmpada inteira: `fitFigure` aceita `frame`/`fade`), o fundo da vitrine da home, o selo
  "Novidade" e o "Monte seu kit" da página da peça. As três peças ficam nítidas lado a lado, com setas de vidro na altura do nome (no
  celular também; a da direita dá dois toques de aviso ao abrir). "Voltar", no alto, volta à página de onde a pessoa veio na mesma
  altura (`history.back`) ou, sem ela, abre `index.html#novidade`. O palco se desfaz embaixo na página (máscara no fundo). A página leva
  à compra: "Comprar" (direto para `comprar-agora.html`) e "Adicionar ao carrinho" sob o nome; "Ver detalhes" abre preço, cores e
  descrição; ao rolar entram as ofertas (um cartão por faixa do kit, nas cores das peças; no celular, fileira com setas e pontos). O kit
  chega com a faixa mais vantajosa (3 por R$ 210) e o cartão dela marcado "No seu kit"; escolher outro cartão troca o kit. Sem "Falar com
  a Ju": o convite a um colega no WhatsApp fica discreto no rodapé. Na home, a novidade é uma faixa sem bordas no degradê das três peças
  (nasce da vitrine e se desfaz em "Nossa coleção"), com título no padrão da coleção ("Novas peças. Para a lâmpada de fenda."), as
  peças (cada uma abre a vitrine nela), as faixas do kit com a de 3 marcada, "Escolha os seus" e "Escolher os meus" (vai a
  `fenda.html#ofertas`); as peças entram dos lados ao rolar (`animation-timeline: view()`, onde o navegador tem; nos outros, ficam
  paradas). Peça nova da família `lampada` (FAMILIES em `products.js`) entra sozinha. Flyer (conversa, Status) e a prévia do link (`assets/og-fenda.jpg`):
  `node tools/flyer-fenda/render.cjs` (rode de novo quando mudar uma peça, o preço ou o kit). `tests/fenda.mjs` confere tudo.
- **Página do produto, aba Foto:** galeria de fotos da peça: miniaturas à esquerda no computador, arrastar de lado no celular; o 3D
  continua na aba ao lado, e escolher uma cor leva a ele. **Só FOTOS REAIS** (06/10/2026: nem render do 3D nem imagem gerada): as fotos do
  Luiz em três vistas (`design/vistas/*-3-vistas.webp`), **4 por peça** — frente, três quartos, costas e um detalhe de perto —, todas 4:5
  (1200 x 1500), recortadas do fundo (preto ou claro, sem o reflexo do chão), com a peça do mesmo tamanho e uma sombra leve no chão
  (`STANDARD`/`GALLERY` em `dist/gallery.js`; recortes em `design/vistas/fotos.json`; `node tools/galeria-vistas/gerar.cjs`; depois,
  suba `VIEWS_VERSION`; peça nova: `design/vistas/PADRAO.md`). O macaco, sem fotos reais, mostra só a da vitrine. Com os arquivos
  originais das fotos (mandados como Documento), a galeria fica mais nítida. `tools/render-vistas` (renders do 3D) ficou só como
  ferramenta; não entra na galeria.
- **Borboleta 3D, rosto (06/10/2026):** a cabeça do arquivo de impressão do Luiz (`BORBOLETA COMPLETO.3mf`, Bambu Studio) no corpo do
  site: `tools/modelo-borboleta/trocar_cabeca.py` tira a cabeça antiga e põe a do 3MF no centro dela (mesma largura); olhos e
  sobrancelhas vêm da pintura do arquivo, o sorriso (arco em relevo) e as bochechas (ovais em volta do relevo) ganham as cores da peça real
  (preto e rosa), rosto creme. Acerto de 06/10 à noite: o brilho de cada olho é rosa, o sorriso é a faixa sobre o arco do sulco (o
  círculo ajustado no fundo dele) e as bochechas ficam dentro da borda em relevo, como na peça real. Materiais: body, details, face, eyes, cheeks.
- **Fotos reais, recorte liso (06/10/2026):** `smoothEdge` em `tools/galeria-vistas/vistas.html` alisa o contorno no quadro final
  (gaussiana e novo corte com antisserrilhado; a cor da beirada vem de dentro da peça). Na página de cada peça, só as fotos reais
  (a foto da vitrine, de outra cor, saiu das miniaturas e da foto grande). Depois `tools/modelo-novidades/reduzir-comprimir.cjs`.
- **Dinossauro 3D (05/10/2026):** o modelo do Meshy (`Meshy_AI__1005212758_model-edit.glb`, só a forma), com os 2 espinhos da peça
  nova, pintado por `tools/modelo-dino/meshy/preparar_meshy.py` (Blender 5.2): cada parte é o relevo cercado pelo sulco dele — body;
  details (os 2 espinhos e as 5 bolinhas de cada pé); eyes (olhos e sobrancelhas); teeth (4 dentes); highlight (o brilho oval de cada
  olho). Depois, a compressão Meshopt de sempre e `?v=` em `dist/asset-models.js`. `tools/modelo-dino/crista.cjs` era do modelo anterior.
- **Girafa e unicórnio (06/10/2026):** já são novidades na vitrine (GiraffeLamp e UnicornLamp, `SOON` em `products.js`; o macaco agora é MonkeyLamp), no molde do
  macaco e com as cores de cada bicho. Sem foto real ainda, as imagens (vitrine, card, miniatura do card e a vista da galeria) são
  renders do 3D de cada um (`tools/render-vistas/render.py` com `ocupa`/`base` da vitrine e dos cards); no "Ver encaixado", a lâmpada
  encolhe na proporção do tubo de cada um (`fit` em `products.js`). Quando chegar a foto: troque os arquivos e meça `art` de novo. **3D de cada um (06/10/2026):**
  os modelos do Rodin (`rodin-v2_-0 (10).glb`, girafa; `(11)`, unicórnio) com as cores fixas em materiais, sem textura, por
  `tools/modelo-novidades/preparar_novidade.py` (Blender 5.2): a cor de cada face vem da textura e segue o relevo (lateral, pé, entalhes);
  por dentro, liso, na cor do corpo (some o borrado das bolinhas da girafa); o miolo das orelhas é a concha; as 5 estrelas do unicórnio
  refeitas regulares, em pé e iguais, longe das nuvens. Depois `tools/modelo-novidades/reduzir-comprimir.cjs` (metade dos triângulos
  com a borda de cada cor travada + Meshopt; ~1 MB cada) e o `?v=` em `dist/asset-models.js`. As cores fixas da vitrine são as do modelo.
- **Celular:** a tela da peça mostra só as partes, as cores e a compra; Detalhes, Cores, Entrega e Trocas ficam no (i) do topo, e as
  combinações prontas e o link das cores, na aba Cores dele.
- Outros documentos úteis: `HOSTINGER-SETUP.md`, `ADMIN-SETUP.md`, `LEGAL-SETUP.md`, `RESEND-SETUP.md`, `COLLABORATOR_PROMPT.md`.

## Decisões já tomadas

- **Pix:** 5% de desconto só nas peças, nunca no frete.
- **Prazo de produção:** 3 a 5 dias úteis.
- **Cartão:** texto "3x sem juros"; a loja configura isso no Mercado Pago depois (hoje a tabela de parcelas ainda mostra juros em 2x e 3x).
- **Frete:** Correios com contrato próprio, PAC marcado por padrão (SEDEX também); PAC grátis a partir de R$ 500.
- **Preços confirmados (05/10/2026):** Borboletoscópio R$ 265, Dinossauroscópio R$ 265, Aviãoscopia R$ 285 — e o 2.º avião (e os
  seguintes) na mesma compra sai por R$ 215 (`extraPrices` em `dist/commerce-config.js` = `extraPrice` em `api/_lib/catalog.js`; o
  servidor divide a linha em dois preços exatos para o Mercado Pago e a nota, e o site mostra "Levando 2, o segundo sai por R$ 215,00").
  Sem os avisos de "ilustrativo".
- **Textos (05/10/2026, pedidos do Luiz):** borboleta e dino "feitos para encaixe no retinoscópio da marca Welch Allyn"; avião "para
  régua de esquiascopia", "compatível com régua de esquiascopia de 4,7 cm x 27,9 cm. Marca usada como molde: Luneau. Para saber mais medidas, entre em contato" (o "entre em contato" abre o e-mail da Ju). Peças da lâmpada de
  fenda: o macaco se chama **MonkeyLamp**; a girafa e o unicórnio, quando entrarem, **GiraffeLamp** e **UnicornLamp**.
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
- **C. Atendimento.** Feito em 07/10/2026: WhatsApp **(31) 99198-1151** (`WHATSAPP = '5531991981151'` em `api/_lib/legal.js`;
  o telefone das páginas legais sai dele) e e-mail `juimprimepramim@gmail.com`; o botão do WhatsApp aparece no Contato (com o
  número embaixo), no menu do celular e na confirmação do pedido, e o número entrou nos dados da loja para o Google. Para trocar:
  `api/_lib/legal.js` (`COMPANY.email`, `COMPANY.hours`, `WHATSAPP`, só números com 55 e DDD), depois `node tools/sync-legal.cjs` e
  `node tools/sync-meta.cjs`. As mensagens do formulário ficam guardadas no painel, em **Mensagens** (ícone de conversa; ver `ADMIN-SETUP.md`).
- **D. Preços.** Feito em 05/10/2026 (valores acima; `dist/commerce-config.js` e `api/_lib/catalog.js` batem, `tests/payments.mjs` confere).

## Pendências por responsável

- **Equipe (Pedro e Ju):** teste de pedido de ponta a ponta no site de teste (cartão de teste APRO e Pix de teste, e-mails, painel);
  configurar os 3x sem juros no Mercado Pago e conferir se o webhook aponta para a Hostinger; confirmar preços;
  passar o id da natureza do Bling. (E-mail e WhatsApp: recebidos e publicados em 07/10.)
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
  (1) ~~o número do WhatsApp~~ feito em 07/10: (31) 99198-1151 (`WHATSAPP` em `api/_lib/legal.js`); falta só confirmar se o número
  atende ligações (hoje o site mostra só WhatsApp, sem link de ligação) e configurar o WhatsApp Business com mensagem de ausência;
  (2) se `contato@juimprimepramim.com.br` é o e-mail oficial (criar a caixa no domínio; se for, preencher `email` em
  `api/_lib/legal.js` e rodar `node tools/sync-legal.cjs`; criar `CONTACT_EMAIL` na Hostinger se as mensagens do formulário
  devem ir para ela em vez do `ORDER_NOTIFY_EMAIL`); (3) o horário "segunda a sexta, das 9h às 18h" (`COMPANY.hours`; aparece no topo do Contato e no cartão de ajuda). O FAQ do
  rastreio já foi atualizado em 06/10 (acompanhamento automático em Meus pedidos).

## Como entregar

Ao terminar cada tarefa: nome da branch, commits (hash e mensagem), arquivos alterados, resultado do `npm test` e o que conferir no
navegador. O Pedro leva isso a uma sessão local, que baixa a branch, testa, compara com o que o dono publicou, gera o zip e orienta o envio.
