# Padrão de fotos da galeria (aba Foto)

Toda peça à venda tem **4 fotos**, sempre nesta ordem:

| # | Foto | O que mostra |
|---|------|--------------|
| 1 | Frente | A peça inteira, de frente. É a que abre a galeria. |
| 2 | Três quartos | A peça inteira, virada uns 45° (vê a frente e um lado). |
| 3 | Costas | A peça inteira, por trás (ou três quartos de trás). |
| 4 | Detalhe de perto | A parte de cima da peça bem de perto: o rosto, a cabine. Enche o quadro, como o zoom das lojas. |

No site, as quatro saem no mesmo formato (4:5, retrato), recortadas do fundo, com a peça do mesmo tamanho e no mesmo lugar em
todas e uma sombra leve no chão. Peça que ainda não tem fotos reais mostra só a foto da vitrine, no mesmo quadro.

## O que pedir de foto para uma peça nova

- As três vistas inteiras (frente, três quartos, costas) com **a mesma câmera, a mesma luz e a mesma distância** — pode ser uma
  imagem com as três lado a lado, como as de agora, ou três imagens separadas.
- **Fundo liso**, preto ou cinza-claro, sem nada encostando na peça; a peça inteira na foto, com folga em volta.
- **Resolução**: a peça com pelo menos **1500 px de altura** (as de agora têm uns 700 px, por isso o detalhe de perto fica mole).
- Mandar o **arquivo original** — no WhatsApp, como *Documento*, não como foto (como foto, o WhatsApp comprime e perde nitidez).
  Vídeo da peça girando também serve (as vistas saem de quadros dele), em alta qualidade e também como *Documento*.

## Como entra no site

1. Os arquivos ficam nesta pasta (`design/vistas/`).
2. Em `fotos.json`, cada foto diz a fonte, o instante do vídeo (se for vídeo) e o recorte; o detalhe é um recorte 4:5.
3. Em `dist/gallery.js`, a peça entra em `GALLERY` com o nome do detalhe dela (por exemplo, `'Rosto de perto'`), e o nome ganha
   tradução em `dist/translations.js`.
4. `node tools/galeria-vistas/gerar.cjs` grava as fotos em `dist/assets/vistas/`; depois, suba `VIEWS_VERSION` em `dist/gallery.js`
   e rode `npm test`.
