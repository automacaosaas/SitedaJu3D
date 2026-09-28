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
- estilos do site e do Google Fonts, com arquivos de fonte do `fonts.gstatic.com`;
- imagens do site, `data:` e `blob:` (miniaturas do carrinho e texturas 3D) e do site público, de onde vem o logo dos e-mails;
- `frame-ancestors 'self'`: nenhum outro site pode exibir a loja dentro de uma moldura.

`node tools/dev-server.cjs` aplica os mesmos cabeçalhos (menos o cache), então um bloqueio aparece também no computador.
`tests/headers.mjs` confere a CSP contra as páginas.

**Ao editar o import map de `index.html`**, o hash muda. O teste avisa e mostra o valor novo, que deve ir para o
`script-src` do `vercel.json`.

**Ao juntar com `integracao/mercado-pago`**, a CSP precisa liberar o SDK e os campos seguros do Mercado Pago
(`sdk.mercadopago.com`, `*.mercadopago.com`, `*.mercadolibre.com`, `*.mlstatic.com`). Isso deve ser testado no navegador,
com um pagamento de teste, antes de publicar.

**Ao mudar para a Hostinger**, os mesmos cabeçalhos vão para o servidor Node.

**Ao trocar uma imagem ou um modelo**, use um nome novo ou mude o `?v=`. Com o cache novo, um visitante pode ver a versão
anterior por até um dia.

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
