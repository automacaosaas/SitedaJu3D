# "O 3D nas suas consultas" + página Escolha o seu

Feito na branch `vitrine/3d-nas-consultas` (a partir de `c73dcf4`). Ainda não publicada.
- 2026-10-03: primeira versão.
- 2026-10-04: refeita no estilo da referência "Product Information" (ficha técnica com o produto flutuando e, embaixo, as outras peças da categoria).

## O que é

**Na home, logo depois do banner e antes de "Nossa coleção":**

- **A história.** Uma ficha técnica por peça, família por família:
  1. Encaixe para retinoscópio: Borboletoscópio e Dinossauroscópio.
  2. Encaixe para régua de esquiascopia: Aviãoscopia.
  3. Encaixe para lâmpada de fenda: Macacoscópio, "Em breve".
- **No desktop,** a peça já encaixada no equipamento fica fixa e flutuando à direita, sobre uma faixa arredondada. Conforme a pessoa rola:
  - a ficha da vez aparece à esquerda, linha por linha (família, nome, visão geral, ficha técnica, ações);
  - a peça troca: a anterior sai para cima e a nova sobe de baixo;
  - a faixa passa suavemente para as cores da peça (as mesmas do banner).
- **Pontos na lateral** mostram onde a pessoa está e levam a cada peça.
- **A ficha técnica** traz só o que a loja já afirma: encaixe (equipamento), partes com cores à sua escolha, produção (prazo da loja) e envio. O macaco mostra as cores fixas, "Feito em impressão 3D" e "Disponibilidade: em breve".
- **As ações** de cada ficha:
  - "Personalizar o meu" abre o ateliê; no macaco, "Ver em 3D" abre a prévia.
  - "Ver encaixado" sobe até o banner e abre a demonstração.
- **No celular e no tablet,** cada ficha traz a sua peça flutuando logo acima, e a faixa troca de cor do mesmo jeito.
- **Peças de oftalmologia.** Um carrossel com as peças da categoria: a peça encaixada, o nome, o subtítulo e o preço (ou "Em breve"). Cada cartão abre a personalização.
  - No celular: deslizar com o dedo (rolagem nativa, encaixando no cartão).
  - No desktop: arrastar com o mouse (com impulso), setas e teclas ← →.
  - Uma barra mostra a posição.
- **"Escolha o seu"** leva para `escolha.html`: um banner por família, cada um abrindo a página Produtos só com as peças daquele encaixe (`produtos.html?encaixe=retinoscopio | regua | lampada`).
  - Na página Produtos, um selo mostra o encaixe.
  - O × do selo volta a mostrar todas as peças, e "Outros encaixes" volta para a Escolha o seu.

## Tecnologia

- **Reveal pela rolagem no próprio CSS** (`animation-timeline: view()` e `animation-range`), sem script na rolagem. Cada linha sobe e aparece conforme entra na tela, então a ordem sai naturalmente. Também pelo CSS:
  - os cartões do carrossel ganham presença conforme deslizam para dentro (`view(x)`);
  - a barra do carrossel segue a linha do tempo da rolagem dele (`scroll-timeline`).
  
  Navegadores sem esse recurso recebem o mesmo efeito por `IntersectionObserver`.
- **Cores com `@property`,** para a faixa e os destaques mudarem de cor suavemente.
- **Peça fixa com `position: sticky`.** A peça ativa é escolhida por `IntersectionObserver`: a última ficha que passou do meio da tela. Uma rolagem rápida também chega na peça certa.
- **Desempenho:**
  - `will-change` só nos elementos animados;
  - a flutuação só roda na peça ativa e perto da tela;
  - as imagens só carregam perto da tela.
- **Acessibilidade.** Com movimento reduzido: nada flutua nem desliza, a ficha aparece inteira e as trocas são diretas. A peça fixa é decorativa (o texto descreve tudo); os pontos e os cartões são links de verdade.
- **Sem GSAP nem Lenis.** O CSS nativo já faz o trabalho sem bibliotecas. O site só carrega scripts próprios (política de segurança `script-src 'self'`). E a rolagem continua a do navegador: suave por padrão e sem brigar com o banner, o cabeçalho que esconde e o leitor de tela.

## Onde mexer

- **Famílias e a ordem delas:** `FAMILIES` em `dist/products.js`. Uma peça nova (girafa, unicórnio) entra na lista da família quando existir em `PRODUCTS` ou `SOON`, com a demonstração do banner (`SHOWCASE.<peça>.demo`). Ela aparece sozinha na história, no carrossel e na Escolha o seu.
- **Enquadramento e texto:** `FIT` em `dist/fit-tour.js`.
  - `frame` (`scale` e `y`: tamanho e altura da peça na figura).
  - `fade` (onde o equipamento some, só nesta seção).
  - `overview` (troca a descrição da loja só aqui).
- **Visual:** `dist/fit-tour.css`.
- **Movimento:** `dist/fit-tour-motion.js`.
- **Filtro da página Produtos:** `dist/catalog.js` e `productGrid(categoria, família)` em `dist/product-grid.js`.
- **Depois de mudar dados ou textos:** `node tools/build-product-pages.cjs`. Ele grava a seção em `index.html` (entre `<!-- fit-tour -->` e `<!-- /fit-tour -->`) e gera `escolha.html` (com o head, o header e o footer de `produtos.html`, e no sitemap). `tests/product-landing.mjs` falha se ficar desatualizado.
- **Textos novos:** em `dist/translations.js` (PT|EN|ES).

## Como a figura encaixada é montada

São as mesmas camadas da demonstração do banner, no mesmo espaço, então se sobrepõem pixel a pixel:
- parede de trás;
- equipamento, com a mesma queda;
- cabeça da lâmpada;
- sombra da peça sobre o equipamento;
- frente.

Todas com fundo transparente, então a faixa muda de cor por trás sem recortes. As imagens não mudaram nem foram duplicadas. Se o macaco ou a lâmpada mudarem de imagem, a seção acompanha sozinha; só o enquadramento (`FIT.macacoscopio.frame` e `fade`) pode precisar de ajuste.

## Verificação (2026-10-04)

- `npm test`: 35 suítes verdes. A suíte `tests/fit-tour.mjs` confere:
  - famílias, figura encaixada e as fichas;
  - peça fixa, pontos e carrossel;
  - posição na home, Escolha o seu e o filtro;
  - as regras de movimento.
- No Chrome headless, 22 verificações de interação:
  - peça e faixa certas em cada ficha; a peça fica fixa na mesma altura;
  - reveal linha a linha; rolagem rápida; pontos;
  - carrossel com setas, arrastar com o mouse (sem abrir o cartão), teclas, toque no celular e clique abrindo o ateliê;
  - "Ver encaixado" abrindo a demonstração;
  - movimento reduzido, inglês e console limpo.
- Telas conferidas: 1280×720, 1440×900, 1920×1080, 820×1180 e 390×844, sem rolagem lateral.
- Não testado: Safari/iOS e aparelho físico.

## Em aberto

- A página Escolha o seu é a primeira versão; o dono vai personalizar.
- Girafa e unicórnio entram quando forem entregues (veja "Onde mexer").
