# Renders e recortes do Aviãoscopia e do Macacoscópio

Ferramentas usadas para gerar as imagens da vitrine do avião e do macaco (2026-10-01) e para conferir a animação em Chrome de verdade.
Rodam no PC da Ju (Windows), só com Node 24 e o Chrome instalado; nada disso vai para o site publicado.

## Avião (renders do CAD)

O avião é renderizado com three.js a partir dos STL do projeto de 21/08/2026
(`C:\Users\LUIZ\Documents\modelos_ju3d\Airplane Oftalmology1\airplane 21 08 2026\STL`): `BodyShell` (frente), `BodyShellbACK` (trás),
`Cockpit_Windshield`, `Engine_Pylons`, `Wing_Stars`, `NoseCone_Front/Back`. As peças pequenas não estão na posição montada; a posição
foi achada à mão e está em `plane.html` (`SPEC`). O STL não tem os números ao lado dos furos: eles são um decalque com relevo (`numbersDecal`).
A régua de grau é modelada no próprio `plane.html` (`rulerGroup`: acrílico, máscara preta, 16 lentes, cabo), alinhada aos furos medidos no STL.

```
node tools/render-aviao-macaco/serve.cjs                       # porta 8851: /vendor (three.js do site), /stl, /photos, /assets
node tools/render-aviao-macaco/runpage.cjs "variants=full,front,back,ruler&ss=2&size=1254&rulerh=1850" saida.png plane.html
node tools/render-aviao-macaco/runpage.cjs "variants=ped&ss=2&size=1254&radius=96&ph=110&fill=.95" saida.png plane.html
```

Variantes: `full` (as duas metades montadas: recorte da vitrine e dos cards), `front`, `back` (vista pela face interna), `ruler` (tela mais alta: o cabo
pende abaixo do avião), `ped` (avião na pilastra: foto do popup). Todas usam a mesma câmera, então as camadas se encaixam pixel a pixel.
Valores finais: corpo `#0c3290`, detalhes `#c4122e`, motores `#f19c00`, exposição `.95`, `envi=.7`, enquadramento `h=.8933`, `bottom=.076`
(deixa o recorte com 90,4 % de altura e 7 % de folga embaixo, como as outras peças). Cada `runpage` grava `saida-<variante>.png`.
Para as imagens do site: converter com `ffmpeg -i x.png -c:v libwebp -quality 90 x.webp`; a régua é recortada (`crop=287:1640:483:212`).

## Macaco (recortes das fotos, provisório)

`monkey-lab.html` recorta o macaco da foto na mão (`WhatsApp Image … 23.28.15.jpeg`) e a base e a cabeça do equipamento da foto montada
(`… 23.28.16.jpeg`), com contornos desenhados à mão, e monta uma prévia (`assembled` e `exploded`) para conferir o alinhamento.
As fotos ficam em `C:\Users\LUIZ\OneDrive\ANIMAÇÃO_JU3D`. Quando o modelo do macaco e fotos limpas do equipamento existirem, é só
trocar as três imagens e os números de `SHOWCASE.macacoscopio.demo` em `dist/products.js` (o resultado do `runpage` imprime as frações).

```
node tools/render-aviao-macaco/runpage.cjs "" saida.png monkey-lab.html
```

## Conferir a animação

`frames.cjs` abre a vitrine local (`node tools/dev-server.cjs`, porta 8847 com `PORT=8847`), clica na peça, pausa as animações e grava quadros em
instantes exatos (`TIMES=0,500,1000 node frames.cjs aviaoscopia saida 1440 900`; 5.º e 6.º argumentos: largura, altura, `mobile`).
`sheet.cjs` junta os quadros numa folha de contato.
