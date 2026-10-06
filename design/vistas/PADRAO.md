# Padrão de fotos da galeria (aba Foto)

Toda peça tem **6 fotos**, de posições bem diferentes entre si (o giro e a altura da câmera mudam), sempre nesta ordem:

| # | Foto | O que mostra |
|---|------|--------------|
| 1 | Frente | A peça inteira, de frente. É a que abre a galeria. |
| 2 | Três quartos | A peça inteira, virada uns 45° (vê a frente e um lado). |
| 3 | Lado | O perfil (as peças planas, como a borboleta e o avião, a 60° e para o outro lado, senão viram uma tira fina). |
| 4 | Três quartos de trás | A peça inteira, virada 150° e vista um pouco do alto (vê as costas e o topo). |
| 5 | De cima | A peça inteira vista bem do alto (55°): o ângulo de vitrine. |
| 6 | Detalhe de perto | A parte de cima da peça bem de perto: o rosto, a cabine. Enche o quadro, como o zoom das lojas. |

No site, as seis saem no mesmo formato (4:5, retrato, 1200 x 1500), com fundo transparente, a peça do mesmo tamanho e no mesmo
lugar em todas e uma sombra leve no chão.

## De onde vêm (desde 05/10/2026): render do modelo 3D

As fotos são renderizadas do modelo 3D da própria peça (o mesmo da aba 3D), no Blender: luz de estúdio, as cores da vitrine, alta
resolução, e o detalhe de perto é uma câmera perto de verdade (não uma ampliação). Peça nova com modelo 3D:

1. O modelo em `dist/assets/models/<peça>.glb` (e em `dist/asset-models.js`).
2. Em `tools/render-vistas/renderizar.cjs`, o enquadramento do detalhe dela (`DETALHE`: a altura do centro e a do quadro).
3. `GLTF_NM=<node_modules do gltf-transform> node tools/render-vistas/renderizar.cjs <peça>` grava os 6 renders em `renders/`
   (uns 5 minutos por peça, só no processador). Confira os 6.
4. As 6 entradas em `fotos.json` (`"fundo": "render"`), a peça em `GALLERY` (`dist/gallery.js`) com o nome do detalhe (e a tradução
   em `dist/translations.js`), `node tools/galeria-vistas/gerar.cjs <peça>`, `VIEWS_VERSION` e `npm test`.

## Se for usar imagens da peça (fotos ou imagens prontas)

Também dá (`"fundo": "recortar"` em `fotos.json`), e a peça diz quais fotos tem em `GALLERY` (`views`, da frente ao detalhe de perto).
É o caso da borboleta desde 06/10/2026: as 4 imagens que a Ju mandou (frente, três quartos, costas e o rostinho), em fundo preto.
O gerador tira o fundo (para o detalhe, diga a cor: `"cor_fundo": "#000000"`), corta o reflexo abaixo do chão (`"chao"`: a altura,
ou uma reta por dois pontos quando a peça está em perspectiva) e põe a peça no quadro padrão. Linhas claras na borda da imagem ficam de
fora pelo recorte. A qualidade depende das fontes: quanto maior a imagem, melhor.

- As três vistas inteiras (frente, três quartos, costas) com **a mesma câmera, a mesma luz e a mesma distância** — pode ser uma
  imagem com as três lado a lado, como as de agora, ou três imagens separadas.
- **Fundo liso**, preto ou cinza-claro, sem nada encostando na peça; a peça inteira na foto, com folga em volta.
- **Resolução**: a peça com pelo menos **1500 px de altura** (as de agora têm uns 700 px, por isso o detalhe de perto fica mole).
- Mandar o **arquivo original** — no WhatsApp, como *Documento*, não como foto (como foto, o WhatsApp comprime e perde nitidez).
  Vídeo da peça girando também serve (as vistas saem de quadros dele), em alta qualidade e também como *Documento*.

## Como uma foto entra no site

1. Os arquivos ficam nesta pasta (`design/vistas/`).
2. Em `fotos.json`, cada foto diz a fonte, o instante do vídeo (se for vídeo) e o recorte; o detalhe é um recorte 4:5.
3. Em `dist/gallery.js`, a peça entra em `GALLERY` com o nome do detalhe dela (por exemplo, `'Rosto de perto'`), e o nome ganha
   tradução em `dist/translations.js`.
4. `node tools/galeria-vistas/gerar.cjs` grava as fotos em `dist/assets/vistas/`; depois, suba `VIEWS_VERSION` em `dist/gallery.js`
   e rode `npm test`.
