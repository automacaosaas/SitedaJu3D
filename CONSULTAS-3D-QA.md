# "O 3D nas suas consultas" + página Escolha o seu

Feito na branch `vitrine/3d-nas-consultas` (a partir de `c73dcf4`, 2026-10-03). Ainda não publicada.

## O que é

- **Na home, logo depois do banner e antes de "Nossa coleção":** um capítulo por família de encaixe, revelado com a rolagem.
  1. Encaixe para retinoscópio: Borboletoscópio e Dinossauroscópio.
  2. Encaixe para régua de esquiascopia: Aviãoscopia.
  3. Encaixe para lâmpada de fenda: Macacoscópio (com o selo "Em breve").
- **Cada capítulo** tem duas partes, alternando o lado no desktop e empilhadas no celular:
  - A peça já encaixada no equipamento, flutuando de leve sobre o degradê da própria peça (as mesmas cores do banner).
  - Uma ficha curta: família, nome, uma linha, três fatos e "Ver encaixado". Esse link sobe até o banner e abre a demonstração da peça.
- **Na família com mais de uma peça:**
  - Setas discretas no desktop e deslizar o dedo no celular. Pontos e teclas ← → também trocam a peça.
  - Avanço automático: é o próprio ponto ativo se preenchendo. Pausa com o mouse ou o foco em cima, fora da tela e com a aba escondida. Para de vez quando a pessoa troca a peça.
  - Com movimento reduzido: sem avanço automático, sem flutuar e sem deslocamentos.
- **"Escolha o seu"** (fim da seção) leva para `escolha.html`: um banner por família, cada um abrindo a página Produtos só com
  as peças daquele encaixe (`produtos.html?encaixe=retinoscopio | regua | lampada`). Na página Produtos, um selo mostra o encaixe:
  o × volta a mostrar todas as peças e "Outros encaixes" volta para a Escolha o seu.

## Onde mexer

- **Famílias e a ordem delas:** `FAMILIES` em `dist/products.js`. Uma peça nova (girafa, unicórnio) entra na lista da família
  quando existir em `PRODUCTS` ou `SOON`, com a demonstração do banner (`SHOWCASE.<peça>.demo`). Antes disso ela não aparece.
- **Textos da ficha e enquadramento:** `FIT` em `dist/fit-tour.js`.
  - `line` e `facts` (`'production'` vira o prazo da loja; `'colors'`, as cores fixas).
  - `frame` (`scale` e `y`: tamanho e altura da peça na figura).
  - `fade` (onde o equipamento some, só nesta seção).
- **Visual:** `dist/fit-tour.css`.
- **Movimento:** `dist/fit-tour-motion.js`.
- **Filtro da página Produtos:** `dist/catalog.js` e `productGrid(categoria, família)` em `dist/product-grid.js`.
- **Depois de mudar dados ou textos:** `node tools/build-product-pages.cjs`. Ele grava a seção em `index.html` (entre
  `<!-- fit-tour -->` e `<!-- /fit-tour -->`) e gera `escolha.html` (com o head, o header e o footer de `produtos.html`, e no sitemap).
  `tests/product-landing.mjs` falha se ficar desatualizado.
- **Textos novos:** em `dist/translations.js` (PT|EN|ES).

## Como a figura encaixada é montada

São as mesmas camadas da demonstração do banner (parede de trás, equipamento com a mesma queda, cabeça da lâmpada, sombra
da peça sobre o equipamento e a frente), no mesmo espaço, então se sobrepõem pixel a pixel. As imagens não mudaram nem foram
duplicadas, e só carregam perto da tela (`loading="lazy"`). Se o macaco ou a lâmpada mudarem de imagem, a seção acompanha
sozinha; só o enquadramento (`FIT.macacoscopio.frame` e `fade`) pode precisar de ajuste.

## Verificação (2026-10-03)

- `npm test`: 35 suítes verdes. A suíte nova, `tests/fit-tour.mjs`, confere:
  - famílias e a figura encaixada;
  - posição da seção na home, ficha e controles;
  - Escolha o seu e o filtro da página Produtos;
  - as garantias de movimento acessível.
- No Chrome headless, 23 verificações de interação:
  - avanço automático, pausa com o mouse, setas, teclas, cliques rápidos seguidos;
  - deslizar no celular, e arrastar na vertical rolando a página;
  - "Ver encaixado" abrindo a demonstração no banner;
  - banners e filtros;
  - movimento reduzido, inglês e console limpo.
- Telas conferidas: 1280×720, 1440×900, 1920×1080, 820×1180, 390×844 e 360×740, sem rolagem lateral.
- Não testado: Safari/iOS e aparelho físico.

## Em aberto

- A página Escolha o seu é a primeira versão; o dono vai personalizar.
- Girafa e unicórnio entram quando forem entregues (veja "Onde mexer").
