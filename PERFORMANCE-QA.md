# Desempenho e cabeçalhos — QA

Data: 27/09/2026. Base: `main` em `7b327c6` ("integra modelos Rodin preservando a vitrine atual"). Branch local:
`otimizacao/desempenho`. Nada foi publicado; esta entrega aguarda validação antes de qualquer push ou deploy.

## O que mudou

| Área | Antes | Depois |
|---|---|---|
| Modelo do Aviãoscopia | 11,8 MB (7,4 MB trafegados com brotli, 6,6 s na produção) | 1,95 MB (≈1,5 MB com gzip) |
| Modelo do Borboletoscópio | 6,0 MB | 0,99 MB |
| Modelo do Dinossauroscópio | 2,6 MB | 0,53 MB |
| Logo (`logo-ju.webp`, todas as páginas) | 1254 px, 371 KB | 336 px, 11 KB |
| Recorte do Borboletoscópio (imagem principal da home) | 785 KB | 194 KB |
| Recorte do Aviãoscopia | 700 KB | 142 KB |
| Imagem do modal: Borboletoscópio | PNG 1.181 KB | WebP 58 KB |
| Imagem do modal: Aviãoscopia com régua | PNG 1.432 KB | WebP 76 KB |
| Imagem do modal: Dinossauroscópio | PNG 215 KB | WebP 17 KB |
| Ilustração da página de conta | PNG 2.001 KB | WebP 225 KB |
| Three.js r180 | `three.module.js` + `three.core.js`, 2,0 MB sem minificar | versões `.min` oficiais, 0,7 MB |
| Fontes | `@import` dentro de `theme.css` (descobertas só depois do CSS) | `<link>` com `preconnect` no `<head>` de cada página |
| Cache de imagens, modelos e Three.js | `max-age=0` | 1 dia, depois atualização em segundo plano por até 7 dias |
| Cabeçalhos de segurança | só HSTS | CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |

Primeira visita à home no computador: as imagens caem de cerca de 3,2 MB para cerca de 0,6 MB.

## Como foi feito

- **Modelos**: `gltf-transform meshopt <entrada> <saída> --quantize-position 16` (gltf-transform 4.5). Compressão
  `EXT_meshopt_compression` com posições em 16 bits. Os três modelos mantêm os mesmos materiais (`body`, `details`,
  `engines`, `fixed`, `face`, `eyes`), o mesmo número de triângulos e as mesmas medidas (desvio dos limites abaixo de
  0,001%). O decodificador oficial do Three.js r180 fica em `dist/vendor/libs/meshopt_decoder.module.js` e é ligado em
  `dist/asset-models.js`. As URLs dos modelos ganharam `?v=meshopt1` para ninguém reaproveitar o arquivo antigo.
- **Imagens**: sharp 0.34, WebP qualidade 90 (`alphaQuality 95`, `effort 6`). Diferença medida contra o original (PSNR)
  entre 41,9 e 48,7 dB, faixa em que não há diferença visível. O logo foi reduzido para 336 px (3× o maior tamanho
  exibido, 112 px).
- **Originais**: os PNG de alta resolução saíram de `dist/assets/` para `design/originais/`. Continuam no repositório,
  mas não são mais publicados. `tools/make-email-logo.cjs` agora lê o logo de lá.
- **Three.js**: `three.module.min.js` e `three.core.min.js` do pacote `three@0.180.0`. Os arquivos antigos eram idênticos
  ao r180 oficial (só mudavam as quebras de linha), então o comportamento não muda.
- **Script da prévia de e-mail**: saiu do HTML para `dist/email-preview.js`, para a CSP não depender de script embutido.

## Cabeçalhos (`vercel.json`)

A CSP libera só o que o site usa:

- scripts do próprio site, o import map pelo hash exato e `wasm-unsafe-eval` (o decodificador Meshopt usa WebAssembly);
- estilos e fontes do próprio site (desde 07/10/2026 as fontes saem de `dist/assets/fonts/`, não do Google Fonts);
- imagens do site, `data:` e `blob:` (miniaturas do carrinho e texturas 3D) e do site público, de onde vem o logo dos e-mails;
- `frame-ancestors 'self'`: nenhum outro site pode exibir a loja dentro de uma moldura.

`node tools/dev-server.cjs` aplica os mesmos cabeçalhos (menos o cache), então um bloqueio aparece também no computador.
`tests/headers.mjs` confere a CSP contra as páginas.

**O import map** (09/10/2026: um só, igual em todas as páginas com módulos, com o `?v=` de cada módulo) é escrito por
`node tools/sync-versions.cjs`, que também põe o hash dele no `script-src` do `vercel.json` e na tag
`<meta http-equiv="Content-Security-Policy">` de cada página (`tools/sync-csp.cjs`, que tira os hashes velhos). Não edite à mão.

**A política também está em `<meta>`** em todas as páginas, porque a CDN da Hostinger substitui o cabeçalho CSP pelo dela.
O `<meta>` é a política do cabeçalho sem `frame-ancestors`; `tests/headers.mjs` exige que as duas fiquem iguais.

**Ao juntar com `integracao/mercado-pago`**, a CSP precisa liberar o SDK e os campos seguros do Mercado Pago
(`sdk.mercadopago.com`, `*.mercadopago.com`, `*.mercadolibre.com`, `*.mlstatic.com`). Isso deve ser testado no navegador,
com um pagamento de teste, antes de publicar.

**Ao mudar para a Hostinger**, os mesmos cabeçalhos vão para o servidor Node.

**No servidor Node (08/10/2026)**, a CSP, o `X-Frame-Options` e o `Permissions-Policy` vão só nos documentos (páginas, a
página 404, o SVG, o XML e o `/api`): scripts, estilos, imagens, fontes e modelos levam só `nosniff`, HSTS,
`Referrer-Policy` e o cache, cerca de 1,1 KB a menos em cada resposta. O `ETag` nasce do conteúdo servido, não da data:
uma publicação que não muda um arquivo mantém o `ETag` dele, e quem volta recebe 304 em vez de baixar de novo.
`tests/server.mjs` confere as duas coisas.

**Ao trocar uma imagem ou um modelo**, use um nome novo ou mude o `?v=`. Sem `?v=`, um visitante pode ver a versão
anterior por até um dia. **Com `?v=`** (modelos 3D, vistas da galeria, fontes), o servidor Node manda
`max-age=31536000, immutable` (07/10/2026): o navegador guarda por um ano sem perguntar de novo, então trocar o arquivo
sem mudar o `?v=` deixa quem já visitou com o antigo. Para isso não passar despercebido, `tools/versioned-assets.json`
guarda o `?v=` e uma impressão digital de cada um desses arquivos: `tests/versioned-assets.mjs` falha se um deles mudar com
o mesmo `?v=`. Depois de trocar o arquivo e o `?v=`, rode `node tools/sync-versions.cjs`.

**As folhas de estilo e os scripts do próprio site** (09/10/2026, PageSpeed "ciclos de vida eficientes de cache": iam com
`max-age=0` e eram revalidados, um pedido cada, uns 50 na home, a cada visita) também vão com `?v=`, mas esse `?v=` é a
impressão digital do conteúdo (`server/asset-version.cjs`, 8 dígitos hex, sem contar o fim de linha), escrito pela ferramenta,
nunca à mão: `node tools/sync-versions.cjs` põe o `?v=` em todo `<link rel="stylesheet">`, `<script src>` e
`<link rel="modulepreload">` das páginas (cópias em `<noscript>` também), escreve o import map (cada módulo, como
`"./cart-store.js"`, e o `"three"` apontando para o endereço com `?v=`: os `import` do código continuam como estão e chegam ao
arquivo versionado) e acerta os `?v=` escritos dentro de scripts (`journey.js`, que pré-carrega o dicionário cedo, e
`consent.js`, que pede `consent.css`). O import map vem antes do primeiro script da página, para o que o `journey.js` pré-carrega
já seguir o mapa. Na segunda visita, nenhum CSS ou JS é pedido de novo.

- **Rode `node tools/sync-versions.cjs` depois de mexer em qualquer arquivo de `dist/`** (e depois dos outros geradores,
  que escrevem as páginas sem os `?v=` e o mapa e as passam por ele). `tests/versioned-assets.mjs` falha enquanto alguma página
  pede um arquivo sem a impressão digital atual dele, e mostra como acertar.
- **O servidor só dá o ano com a impressão certa:** `?v=` diferente da do arquivo (uma página aberta antes de uma publicação
  pedindo logo depois dela) recebe o arquivo com `max-age=0`, como antes, e o conteúdo novo nunca fica um ano guardado num
  endereço velho. Na volta de versão (`deploy.sh --rollback`), cada arquivo antigo volta ao endereço antigo, que o navegador de
  quem já o tinha continua servindo certo.
- **Conflito ao juntar branches** numa linha de `?v=`, no import map ou no hash da CSP: aceite qualquer um dos lados e rode
  `node tools/sync-versions.cjs`, que reescreve tudo a partir dos arquivos.

## Testes

- `npm test` roda todas as suítes (`tools/run-tests.mjs`). `npm test -- carousel` roda só as que têm "carousel" no nome.
- Novas: `tests/headers.mjs` (CSP e cache) e `tests/assets.mjs` (todo arquivo citado existe, é WebP ou GLB comprimido,
  respeita o orçamento de tamanho, e nada sem uso é publicado).
- `.github/workflows/tests.yml` roda `npm test` no GitHub a cada push e pull request. Só verifica: não publica nada.
- `package.json` não tem dependências nem `"type"`, para as funções em `api/` continuarem CommonJS na Vercel.

Resultado local (Node 24.21): 14 de 14 suítes passaram, e `node --check` passou em todos os arquivos JS.

## Verificação no navegador

Feita com o servidor local aplicando a CSP, no navegador embutido do Claude:

- Home, Produtos, Sobre, Contato, Carrinho, Comprar agora, Conta e Prévia do e-mail: nenhuma imagem quebrada, as três
  fontes carregadas e nenhum erro ou bloqueio de CSP no console.
- Prévia 3D dos três produtos carregando os modelos comprimidos, com troca de cor.
- Aviãoscopia comparado lado a lado com a produção: visualmente idêntico, com os 16 furos, os números e o rasgo
  retangular.
- Home em 375 px: logo nítido.

Limites: não houve teste em iPhone ou Android físicos, e o deploy de prévia da Vercel não foi feito (depende de push).
Antes do merge, conferir a prévia da Vercel e os cabeçalhos com `curl -I`.

## Como reverter

`git revert <commit>` desfaz tudo. Para voltar só os modelos, restaure os três `.glb` do commit `7b327c6` e remova o
`setMeshoptDecoder` de `dist/asset-models.js`. Os PNG originais estão em `design/originais/`.

## 30/09/2026: modelos corrigidos recomprimidos

Os três `.glb` corrigidos na `main` (commits `8faccd9` a `4b71a54`: olhos, sobrancelhas, dentes e crista do dinossauro,
turbinas do avião, relevo e rosto da borboleta) foram comprimidos com o mesmo processo de cima: `meshopt` do
gltf-transform 4.5.1, nível `high`, `--quantize-position 16`, seguido de `unpartition()`.

| Modelo | Sem compressão | Meshopt |
|---|---|---|
| Aviãoscopia | 14,98 MB | 2,51 MB |
| Borboletoscópio | 9,72 MB | 1,54 MB |
| Dinossauroscópio | 5,22 MB | 0,81 MB |

Mesmos materiais e o mesmo número de triângulos por material. Renderizados lado a lado com os originais, nos closes do
rosto, da crista, das turbinas e das bolinhas, a diferença média ficou abaixo de 0,2 nível de cinza (em 255), ou seja,
ruído de renderização. As URLs passaram para `?v=meshopt2-…`.

Nesta máquina o Windows (Controle de Aplicativo) bloqueia o módulo nativo `sharp`, que a CLI carrega ao iniciar. Como os
modelos não têm textura, a compressão foi feita com as mesmas bibliotecas da CLI (`@gltf-transform/core`, `extensions`,
`functions` e `meshoptimizer`), com o mesmo passo a passo do comando `meshopt`, sem carregar o `sharp`.

O Aviãoscopia comprimido tem 2.452 KB, perto do limite de 2.500 KB de `tests/assets.mjs`.

## 02/10/2026: Aviãoscopia do CAD real na prévia 3D

O `aviaoscopia.glb` da prévia 3D (antes um modelo gerado por IA) passou a vir dos STL reais do projeto de 21/08/2026, montados
como nos renders da vitrine (`tools/render-aviao-macaco/plane.html`): as duas metades com as faces bojudas para fora, janelas da
cabine rentes ao nariz, capacete assentado no topo, estrelas, turbinas e os números gravados. `node tools/render-aviao-macaco/export-glb.cjs`
exporta o modelo já soldado e roda a CLI gltf-transform 4.5.1: `simplify --ratio 0 --error 0.00007` (simplifica até o limite de erro,
então guarda detalhe onde a forma tem) e `meshopt --level high --quantize-position 16`. O capacete vem com ~275 mil triângulos de ruído
por metade e é agrupado numa grade de 0,25 mm antes. Mesmos materiais (`body`, `details`, `engines`, `fixed`), sem textura nem cor por
vértice. Resultado: 387 mil triângulos, 1.688 KB (o anterior tinha 2.452 KB). A URL ganhou `?v=cad-21-08-meshopt1`.
`tests/model-details.mjs` e `tests/asset-models.mjs` passaram a medir o avião real (furos, estrelas, turbinas, janelas e capacete).

## 06/10/2026: fotos da vitrine em 768 px para celular

A foto da peça na vitrine aparece com 190 a 390 px de largura (medido de 320 a 1920 px de tela). Por isso cada uma das quatro
fotos da vitrine ganhou uma versão de 768 px, com o mesmo recorte reduzido (a caixa do alfa difere menos de 1 px da grande em
escala):

| Foto | 1254 px | 768 px |
|---|---|---|
| `product-borboletoscopio-cutout` | 135 KB | 65 KB |
| `product-dinossauroscopio-cutout` | 34 KB | 18 KB |
| `product-aviaoscopia-cutout` | 61 KB | 35 KB |
| `product-macacoscopio-cutout` | 77 KB | 30 KB |

**Onde cada versão é usada:**

- **Vitrine:** `srcset` com as duas versões e `sizes` medido (`HERO_SIZES` em `products.js`). Celular (até 3x) e computador
  (1x e 2x) baixam a de 768 px. Só telas grandes e muito densas pegam a de 1254 px.
- **Pré-carregamento da primeira foto:** feito pelo `page-entry.js`, para a peça em que a home vai abrir (a do endereço, a
  lembrada pelo `journey.js` ou, sem nenhuma, a borboleta), com o mesmo `srcset` e o mesmo `sizes` da vitrine. Até 06/10 era
  um `<link rel="preload">` fixo no `index.html`, que baixava a borboleta mesmo para quem voltava a outra peça.
- **Imagem de reserva do `index.html`:** o mesmo `srcset` e `sizes`, com `loading="lazy"` e escondida enquanto a página
  espera a vitrine. Assim nunca baixa outra peça. Ela aparece se a vitrine falhar (aos 2,5 s) ou sem JavaScript.
- **Demonstração:** `DEMO_SIZES`, porque a peça aparece 1,4 a 1,6 vez maior. Celular 2x e computador 1x reaproveitam a de
  768 px; telas 3x e retina pegam a de 1254 px.
- **Página da peça:** `PHOTO_SIZES`, gerado por `tools/build-product-pages.cjs`.
- **Carrinho e mini-carrinho:** a de 768 px direto (`artSmall`), que já está no cache depois da vitrine.

**Pré-carregamento da peça certa, medido com rede de celular simulada** (latência 150 ms, 1,6 Mbit/s, 375 px em 2x; três
rodadas de cada):

| Caminho | Antes | Depois |
|---|---|---|
| Direto na home (borboleta) | foto pedida aos 0,56 s; página aos 4,4 s | foto pedida aos 0,60 s; página aos 4,4 s |
| Da página do avião para a home | borboleta pedida à toa; avião aos 3,75 s; página aos 4,85 s | sem a borboleta; avião aos 0,62 s; página aos 3,8 s |

**Conferido pelo registro de rede do Chrome:**

- iPhone (390 px, 3x), Android (360 px, 2x), notebook (1280 px, 1x) e Mac (1440 px, 2x) baixam só a de 768 px na home, sem
  repetir arquivo.
- Uma tela de 1920 px em 2,5x baixa a de 1254 px.

**Como foi feito:** a borboleta sai do PNG original (`design/originais/`); as outras três saem das fotos atuais, porque o
avião e o macaco foram refeitos depois que os originais foram guardados. Reduzidas e gravadas em WebP com perda, qualidade 80,
pelo codificador do Chrome (libwebp). `tests/assets.mjs` limita cada versão de 768 px a 80 KB, e `tests/storefront.mjs`
confere o `srcset` e os `sizes` em todos os lugares.

## 08/10/2026: PageSpeed do domínio oficial (branch `trabalho/pagespeed2`)

O PageSpeed de `www.juimprimepramim.com.br` dava celular 75 / computador 90 e SEO 66 (o `X-Robots-Tag: noindex` de
`APP_ENV=preview`). Base: `5465b26` (vitrine de nuvens, demonstração nova, janela da peça e carrosséis), com o trabalho de
`trabalho/pagespeed` (SEO por endereço, fontes da própria loja, CSS fora da primeira pintura) juntado e terminado.

**Medido no caminho de produção** (`APP_ENV=production SITE_URL=https://juimprimepramim.com.br node server.cjs`, endereço
`juimprimepramim.com.br`), Chrome sem interface emulando um celular médio: 412×823, densidade 2,6, CPU 4× mais lenta,
1,6 Mbit/s com 150 ms de ida e volta, sem cache, perfil novo a cada rodada. Rodadas alternadas antes/depois (a mesma carga na
máquina), mediana:

| Página | | FCP | LCP | CLS | TBT | Bytes | Pedidos |
|---|---|---|---|---|---|---|---|
| Home (7 rodadas) | antes | 1,65 s | 7,27 s | 0 | 2,02 s | 893 KiB | 62 |
| | depois | 1,50 s | 5,36 s | 0 | 1,41 s | 770 KiB | 61 |
| Página da peça (5) | antes | 1,20 s | 2,85 s | 0 | 86 ms | 404 KiB | 43 |
| | depois | 1,26 s | 3,35 s* | 0 | 164 ms | 402 KiB | 43 |
| Carrinho (5) | antes | 1,06 s | 2,70 s | 0,011 | 274 ms | 343 KiB | 43 |
| | depois | 1,12 s | 2,31 s | 0 | 297 ms | 344 KiB | 43 |

Na home, toda rodada melhorou o LCP (de 1,6 a 2,9 s); as animações fora do compositor na carga caíram de 1 para 0 e os
reflows forçados de 10 para 1 (a leitura de `document.fonts`, ~5 ms). *Na página da peça o LCP oscila entre o logo e a foto
nas duas versões (às vezes a foto nem entra como candidata); os arquivos chegam nos mesmos tempos. A diferença que sobra vem
de o servidor de teste ser HTTP/1.1: as fontes agora dividem as 6 conexões com os scripts da própria loja (antes vinham do
Google, por outras conexões). Com o HTTP/2 no nginx (SERVIDOR-SETUP.md) isso some. Os números do PageSpeed (Lighthouse com
rede simulada, outra máquina) não são estes; servem para comparar antes e depois.

**O que mudou:**

- **SEO:** indexável o domínio da loja e o `www` (em `preview` e em `production`); qualquer outro endereço (temporário da
  Hostinger, `localhost`, IP) segue com `noindex`. `/api/health` diz `indexable`. `<link rel="canonical">` nas páginas do
  sitemap. 301 de `www` para o domínio sem `www` documentado em `SERVIDOR-SETUP.md` (passo do dono no nginx).
- **Fontes da loja** (`dist/assets/fonts/`, OFL), `font-display: swap` e fallbacks métricos; **sem preload**: medido, o
  preload do DM Sans tirava banda da primeira pintura (página da peça 1,27 → 1,50 s) e, no carrinho, fazia os scripts
  passarem do prazo de 2 s do `journey.js`, que mostrava a página antes do carrinho (rodapé pulando, CLS 0,27 em 3 de 5).
- **Cabeça das páginas:** `<meta charset>` primeiro, import map antes do primeiro módulo; na home, `modulepreload` de todo o
  grafo estático (gerado: `tools/sync-modulepreload.cjs`) e as folhas que a primeira pintura não usa (`product-page.css`,
  `mobile-modal.css`, `hero-demo.css`, `mini-cart.css`, `commerce.css`) em `media="print"`, ligadas por `late-css.js`, com
  cópia em `<noscript>`. A janela da peça, a demonstração e o mini-carrinho só abrem com elas aplicadas, inclusive pelos
  endereços `#produto/<peça>`, `/personalizar`, `/3d` e `/encaixe` na chegada; sem prazo (no celular lento abre um pouco depois,
  nunca sem estilo). Conferido: as folhas tardias não mudam nada visível na home antes de abrir algo.
- **Abertura:** a página aparece quando a foto da frente está decodificada e a vitrine medida (fontes: no máximo 150 ms a
  mais); sem resposta, 2,5 s depois dos scripts, 7,5 s no máximo. Só a foto da frente tem `src` na montagem; a primeira entra
  sem esmaecer; o loader sai só por opacidade. `page-entry.js` pré-carrega qualquer uma das seis peças com o mesmo `srcset`
  (dados gerados de `products.js` por `tools/sync-entry.cjs`, que também escreve as cores iniciais do `journey.js`).
- **Imagens:** versões de 768 px da girafa e do unicórnio; cards da coleção com `srcset` 384w/768w; `card-borboletoscopio`,
  `retinoscopio` e `aviaoscopia-ruler` recodificados (WebP q78 no Chrome, ruído invisível do alfa limpo; 82 → 42, 95 → 48 e
  76 → 66 KB, iguais à vista); a demonstração se prepara no primeiro sinal de interesse ou bem depois da carga.
- **Main thread:** preços sem `Intl` (o primeiro `Intl.NumberFormat` custava ~130 ms no celular lento; mesmo texto);
  `header-scroll.js`, vitrine e galeria medem pelo `ResizeObserver`; o carrossel de sugestões do carrinho não lê o layout
  logo depois de desenhar.
- **Servidor:** Brotli 11 em segundo plano para o site inteiro (nunca no laço de eventos; arquivo grande sai sem compressão
  só na primeira resposta); CSS minificado na hora de servir (`server/minify-css.cjs`, 396 → 329 KB antes da compressão;
  `tests/css-minify.mjs` confere token a token); `?v=` com um ano de cache (`immutable`), os outros como antes.

**Feito em 09/10/2026** (antes ficara de fora pelo conflito entre branches paralelas): `?v=<impressão do conteúdo>` em todo
JS e CSS do site, com um ano de cache, e o import map único que leva o `?v=` a todos os `import`. Gerado e conferido por
`tools/sync-versions.cjs` (seção "Cabeçalhos" acima); o conflito entre branches se resolve rodando a ferramenta de novo.

**Capturas de antes e depois** (home no computador e no celular, coleção, página da peça, carrinho, janela da peça, kit,
demonstração, contato, Produtos; com e sem movimento reduzido): idênticas pixel a pixel, menos as mudanças pretendidas —
a demonstração por `#produto/<peça>/encaixe` (antes a janela da peça abria por cima), a borda das fotos dos cards (agora a de
384 px no computador 1x) e o corpo do unicórnio na demonstração (a foto de 768 px).
