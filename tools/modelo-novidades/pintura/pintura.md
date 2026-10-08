# Pintura das lâmpadas no relevo (07/10/2026)

O pedido do dono: "corrigir os relevos das pintinhas, para deixar ele bem delimitado pela sua própria cor, sem vazar nada… os olhos,
a boca e o nariz também estão vazados… deixe tudo alinhado com o relevo, com o modelo 3D". O mesmo vale para o unicórnio (orelhas,
mãos, crina, chifre, arco-íris).

As cores dos modelos do Rodin vinham da textura projetada, que não segue a forma: as manchas da girafa vazavam para fora do relevo, o
olho e as narinas tinham contornos serrilhados, o sorriso era uma faixa torta ao lado do sulco. `lamp-fix.cjs` refaz a pintura a partir
da geometria, em passos:

1. **Planaltos** (`base`): a malha se divide em pedaços separados pelas dobras (ângulo acima de `T` graus). Num pedaço que é quase todo
   de uma cor, os fragmentos pequenos de outra cor de base passam para ela (`fragMaxBy` limita o tamanho por cor: uma mancha inteira não
   é engolida). As manchas enchem o relevo delas; o amarelo em volta perde o marrom que vazou.
2. **Detalhes** (`details`): pedaços fechados por dobras engrossadas; um pedaço pequeno quase todo da cor do detalhe (o olho) fica todo
   dela, e o que vazou dele para o pedaço ao lado volta à cor de lá.
3. **Regiões com sementes** (`regions`, vista de frente): mapa de altura da frente (`depth.cjs`), e cada semente inunda o relevo dela
   até o vale que o separa do vizinho (watershed). Assim saem as mechas da crina e as três faixas do arco-íris (roxo, lavanda e dourado,
   as cores da peça).
4. **Corte em grafo** (`cut`): o que sobrou de borda vai para a dobra mais próxima (`snap.cjs`, α-expansão com o fluxo máximo de
   `maxflow.cjs`).
5. **Projetados** (`projected`): as narinas (o relevo inteiro de cada uma, achado por watershed no mapa de altura) e o sorriso (o fundo
   do sulco, seguido coluna a coluna e desenhado com largura constante).
6. **Faixas retas** (`bands`): a faixa roxa da base do unicórnio e a divisão da crina de trás, numa linha de nível.
7. **Bordas lisas** (`crisp.cjs`): cada cor ganha um campo suave nos vértices e a borda passa a cortar os triângulos no meio (sem
   degraus), com as normais originais.
8. **Bordas exatas pelo relevo** (`exact.cjs`, 07/10/2026, segunda rodada: "o nariz mostra linhas fora do campo do nariz… pinta não
   colorida 100%… olhos vazados… contornos padronizados, no relevo por completo"). Em vez de uma máscara borrada amostrada nos vértices
   (que serrilhava nos triângulos grandes e deixava filetes nas paredes), cada detalhe vira uma função lisa da posição, cortada com
   precisão dentro dos triângulos:
   - `tube` (pintas do pescoço): a superfície do próprio tubo (raio em função do ângulo e da altura, ajustado ao tubo liso) e a pinta
     onde a superfície fica mais alta que ele por mais de `t` — o planalto inteiro de cada pinta, parede incluída. Só até `thetaMax`
     graus da frente (a fenda das costas também tem bordas altas) e abaixo da gola (`yMax`);
   - `exact` (olhos, narinas): o pé de cada relevo, achado em 360 raios no mapa de altura da frente, e a elipse com a mesma área e os
     mesmos momentos (`shape: ellipse`), crescida até conter o relevo (`cover`, até `maxScale`); `mirror` deixa as duas narinas
     iguais e espelhadas;
   - `fromPaint` (o focinho): a borda que a pintura já tinha, só alisada (primeiros harmônicos), e só onde a superfície olha para a
     frente (`facing`): nos flancos íngremes a vista da frente não decide a borda;
   - `mode: line` (o sorriso): o fundo do sulco com largura constante e pontas redondas;
   - `onlyExact`: o preto só existe onde um detalhe o desenhou (os pingos soltos somem);
   - `domes` (as narinas, terceira rodada: "um está mais caído que o outro… tire esse relevo, alinhe"): antes de tudo, os dois relevos
     afundam na superfície em volta, a malha de dentro é redistribuída e dois domos iguais sobem na mesma altura, simétricos; cada
     narina é pintada com a elipse do próprio domo (`dome`); o sorriso ficou mais grosso (`width` 46, como a referência);
   - o `crisp.cjs` subdivide só os triângulos que a borda cruza (`refineTarget`; `refine` por detalhe), para a elipse não sair
     facetada.
9. **Superfícies refeitas para o zoom da galeria** (girafa, 08/10/2026: "risco/reflexo claro na pele amarela na base de cada olho…
   emenda/sombra logo abaixo do focinho, linhas claras entre as pintas, pintas com borda deformada ou manchada"). A malha do Rodin
   tinha dobras e triângulos-agulha que a luz desenhava como riscos claros; as partes com defeito viram a forma que deviam ter, com as
   mesmas cores e o mesmo desenho:
   - `tubeRebuild` (`tube-rebuild.cjs`, no lugar do `tube` do passo 8): o pescoço é o próprio tubo liso (raio ajustado em função do
     ângulo e da altura) e cada pinta, achada onde a superfície sobe acima dele, ganha o contorno alisado e o mesmo relevo (parede
     íngreme que arredonda no topo, altura igual para todas); a malha é refinada onde a superfície dobra e vai para cima dela, com as
     normais da própria superfície, e a pintura marrom cobre exatamente o relevo. Depois de as cores assentarem, `band` alisa a faixa
     sob a cabeça (onde o pescoço abre para a cabeça) e `cheeks` refaz as pintas das bochechas do mesmo jeito;
   - `eyeRebuild` (`eye-rebuild.cjs`): a pele de cima do rosto vira uma superfície lisa (B-spline ajustada à vista de frente, `skin`) e
     os dois olhos, dois domos iguais e espelhados (mesmos eixos, mesma altura), com o pé arredondado (`fillet`); o focinho fica fora do
     alcance (`protect`). `surface-rebuild.cjs` tem o refinamento e a simplificação que os dois usam;
   - `normals: geometry`: as normais saem da forma final (média por área, `normalPasses` vezes com as vizinhas), as mesmas no 3D do
     site e nas fotos (`lamp-assets.cjs` usa `smooth=0`, as do modelo);
   - `ownNormals` (segunda rodada, os fiapos claros em volta do focinho e na base do olho): os triângulos compridos do pé do focinho
     ligam o amarelo plano à parede do focinho, e a parte amarela deles levava a normal inclinada da parede para longe. Perto do
     contorno do focinho (`reach`), cada cor passa a usar a normal da própria superfície (média a distância fixa das faces daquela cor
     que não tocam outra, `crisp.metricField`); a forma não muda e a luz só quebra na borda da tinta, onde a cor já muda. No creme,
     só onde a superfície olha para a frente (`facing`);
   - `domes.maxFoot`: o raio do pé de cada narina fica limitado a 1,35× a elipse dela — um raio da narina esquerda escapava (0,13 em
     vez de 0,07) até a pele sob o olho esquerdo, e o afundamento amassava a pele já refeita ali (a mancha clara na base do olho);
     `smoothRegions` ganhou o par espelhado do lado esquerdo, embaixo da narina.

## Refazer

Precisa do gltf-transform 4 e do meshoptimizer (`npm install @gltf-transform/core@4 @gltf-transform/extensions@4
@gltf-transform/functions@4 meshoptimizer` numa pasta fora do projeto; `GLTF_NM` aponta o node_modules dela). A entrada é o modelo de
antes da correção (a cor ainda é a da textura):

```
git show fb36280:dist/assets/models/girafoscopio.glb > girafa-fonte.glb
GLTF_NM=… node lamp-fix.cjs girafa-fonte.glb ../../../dist/assets/models/girafoscopio.glb girafa.json
git show fb36280:dist/assets/models/unicornioscopio.glb > unicornio-fonte.glb
GLTF_NM=… node lamp-fix.cjs unicornio-fonte.glb ../../../dist/assets/models/unicornioscopio.glb unicornio.json
```

A girafa leva uns 2 minutos e sai igual byte a byte a cada rodada. Depois, o `?v=` em `dist/asset-models.js` e as fotos:
`tools/render-aviao-macaco/lamp-assets.cjs` (vitrine, cards e, com `--vistas`, as vistas da galeria da girafa; numa worktree,
`RENDER_PORT` igual no `serve.cjs` e no `lamp-assets.cjs`, para servir o `dist/` dela), `node tools/galeria-vistas/gerar.cjs girafoscopio`
(e `VIEWS_VERSION` em `dist/gallery.js`), `node tools/og-lampadas.cjs`, `node tools/build-product-pages.cjs` e `node tools/sync-versions.cjs`.
As coordenadas das sementes e das caixas estão em unidades do render (altura 4,1, chão em −1,9, centrado), as mesmas do visualizador.
