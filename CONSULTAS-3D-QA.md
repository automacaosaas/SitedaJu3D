# "O 3D nas suas consultas" + página Escolha o seu

Feito na branch `vitrine/3d-nas-consultas` (a partir de `c73dcf4`). Ainda não publicada.
- 2026-10-03: primeira versão.
- 2026-10-04: refeita no estilo da referência "Product Information" (ficha técnica com o produto flutuando e, embaixo, as outras peças da categoria).
- 2026-10-04, segunda rodada: modo cinema (GSAP + ScrollTrigger + SplitText + Lenis) e os cards de "Nossa coleção" com as cores das peças.

## O que é

**Na home, logo depois do banner e antes de "Nossa coleção":**

- **A história.** Uma ficha técnica por peça, família por família:
  1. Encaixe para retinoscópio: Borboletoscópio e Dinossauroscópio.
  2. Encaixe para régua de esquiascopia: Aviãoscopia.
  3. Encaixe para lâmpada de fenda: Macacoscópio, "Em breve".
- **No desktop,** a peça já encaixada no equipamento fica fixa e flutuando à direita. Conforme a pessoa rola:
  - o fundo da página inteira passa, de forma contínua, para as cores da peça (as mesmas do banner);
  - a ficha da vez se constrói à esquerda (veja "Tecnologia");
  - a peça troca: a anterior sobe girando para um lado e a nova chega de baixo girando ao contrário.
- **Pontos na lateral** mostram onde a pessoa está e levam a cada peça.
- **A ficha técnica** traz só o que a loja já afirma: encaixe (equipamento), partes com cores à sua escolha, produção (prazo da loja) e envio. O macaco mostra as cores fixas, "Feito em impressão 3D" e "Disponibilidade: em breve".
- **As ações** de cada ficha:
  - "Personalizar o meu" abre o ateliê; no macaco, "Ver em 3D" abre a prévia.
  - "Ver encaixado" sobe até o banner e abre a demonstração.
- **No celular e no tablet,** cada ficha traz a sua peça logo acima, e o fundo troca de cor do mesmo jeito.
- **Peças de oftalmologia.** Um carrossel com as peças da categoria: a peça encaixada flutuando sobre uma nuvem da sua cor (sem borda), o nome, o subtítulo e o preço (ou "Em breve").
  - Tocar num cartão leva, rolando suave, à ficha técnica da peça lá em cima.
  - No celular: deslizar com o dedo (rolagem nativa, encaixando no cartão).
  - No desktop: arrastar com o mouse (com impulso), setas e teclas ← →.
  - Uma barra mostra a posição.
- **"Escolha o seu"** leva para `escolha.html`: um banner por família, cada um abrindo a página Produtos só com as peças daquele encaixe (`produtos.html?encaixe=retinoscopio | regua | lampada`).
  - Na página Produtos, um selo mostra o encaixe.
  - O × do selo volta a mostrar todas as peças, e "Outros encaixes" volta para a Escolha o seu.

**"Nossa coleção" (logo abaixo):** cada card ganhou o degradê da sua peça. Continuam iguais a foto (sem o encaixe) e o card do meio maior, por cima dos vizinhos. Categoria, detalhes e botões usam o tom da própria peça. Só na home; a página Produtos não muda.

## Tecnologia (modo cinema)

O dono pediu GSAP + ScrollTrigger + Lenis e uma revelação de texto no estilo Apple. As bibliotecas ficam no próprio site:
- `dist/vendor/gsap.min.js`, `ScrollTrigger.min.js` e `SplitText.min.js`: GSAP 3.15.0, licença padrão gratuita da GSAP, que permite uso comercial; veja `GSAP-LICENSE.txt`.
- `dist/vendor/lenis.min.js`: Lenis 1.3.26, MIT; veja `LENIS-LICENSE.txt`.

Assim a política de segurança continua `script-src 'self'`. O módulo da seção (`fit-tour-motion.js`) busca esses arquivos depois que a página abre (cerca de 145 KB minificados), sem atrasar o banner.

- **Rolagem suave (Lenis).**
  - Suaviza a roda do mouse; o toque no celular continua nativo.
  - Janelas (`dialog`, `[role="dialog"]`), o menu de idioma e o carrossel rolam por conta própria.
  - Para enquanto a área do produto trava a página (`html.modal-open`).
  - Com movimento reduzido, não liga.
- **Uma posição contínua manda em tudo.** A rolagem vira uma posição entre as peças (0 → 1 → 2 → 3). Dela saem, sem animações brigando entre si:
  - **a cor de fundo da página inteira:** `.fit-backdrop`, uma camada fixa por peça, só opacidade. Fica logo depois do fundo do banner (`.hero-bg`, que se estende pela página dentro de `.page`): acima dele e abaixo de todo o conteúdo;
  - **a peça fixa:** só `transform` e opacidade; a sombra acompanha o tom de cada peça;
  - **a ficha ativa e os pontos.**
- **Texto (ScrollTrigger com `scrub`).** Acompanha a velocidade da rolagem e é suavizado pelo Lenis:
  - as letras do nome sobem de dentro de uma máscara por linha (SplitText), da esquerda para a direita;
  - as palavras da visão geral sobem e acendem em sequência;
  - as linhas da ficha técnica entram em cascata;
  - ao sair, a ficha inteira sobe e esmaece;
  - cada linha ganha força ao chegar no centro da tela e esmaece de leve ao passar dele;
  - o botão fica sempre inteiro quando a ficha está na tela.
- **Idiomas.** A visão geral é dividida já no idioma escolhido:
  - a fonte em PT fica em `data-text`;
  - o texto é traduzido com `translate()` do `i18n.js`;
  - o elemento recebe `translate="no"`, para o i18n não traduzir palavra por palavra;
  - a divisão é refeita no evento `ju:language`.
  
  Os nomes das peças não se traduzem.
- **Leitores de tela.** O SplitText põe o texto inteiro em `aria-label` e esconde os pedaços (`aria: 'auto'`).
- **Reserva.** Se as bibliotecas não carregarem, fica a versão anterior:
  - faixa arredondada;
  - reveal pelo CSS (`animation-timeline: view()`);
  - peça ativa por `IntersectionObserver`.

## Onde mexer

- **Famílias e a ordem delas:** `FAMILIES` em `dist/products.js`. Uma peça nova (girafa, unicórnio) entra na lista da família quando existir em `PRODUCTS` ou `SOON`, com a demonstração do banner (`SHOWCASE.<peça>.demo`). Ela aparece sozinha na história, no fundo, no carrossel e na Escolha o seu.
- **Enquadramento e texto:** `FIT` em `dist/fit-tour.js`.
  - `frame` (`scale` e `y`: tamanho e altura da peça na figura).
  - `fade` (onde o equipamento some, só nesta seção).
  - `overview` (troca a descrição da loja só aqui).
- **Visual:** `dist/fit-tour.css`.
- **Movimento:** `dist/fit-tour-motion.js`.
  - Ritmo da troca das peças: a função `render`.
  - Pontos de início e fim de cada revelação: os `scrub(...)`.
- **Cards coloridos da coleção:** `railTone` em `dist/catalog.js` e o bloco no fim de `dist/carousel.css`.
- **Filtro da página Produtos:** `dist/catalog.js` e `productGrid(categoria, família)` em `dist/product-grid.js`.
- **Depois de mudar dados ou textos:** `node tools/build-product-pages.cjs`. Ele grava a seção em `index.html` (entre `<!-- fit-tour -->` e `<!-- /fit-tour -->`) e gera `escolha.html` (com o head, o header e o footer de `produtos.html`, e no sitemap). `tests/product-landing.mjs` falha se ficar desatualizado.
- **Textos novos:** em `dist/translations.js` (PT|EN|ES).
- **Atualizar GSAP ou Lenis:** `npm pack gsap@<versão> lenis@<versão>`, depois copiar os `.min.js` de `dist/` (sem a linha `sourceMappingURL`) e ajustar as versões em `tests/fit-tour.mjs`.

## Como a figura encaixada é montada

São as mesmas camadas da demonstração do banner, no mesmo espaço, então se sobrepõem pixel a pixel:
- parede de trás;
- equipamento, com a mesma queda;
- cabeça da lâmpada;
- sombra da peça sobre o equipamento;
- frente.

Todas com fundo transparente, então o fundo da página muda de cor por trás sem recortes. As imagens não mudaram nem foram duplicadas. Se o macaco ou a lâmpada mudarem de imagem, a seção acompanha sozinha; só o enquadramento (`FIT.macacoscopio.frame` e `fade`) pode precisar de ajuste.

## Verificação (2026-10-04, modo cinema)

- `npm test`: 35 suítes verdes. `tests/fit-tour.mjs` também confere:
  - as bibliotecas guardadas e as licenças;
  - o carregamento sem bloquear a página;
  - as regras do Lenis;
  - a posição contínua;
  - o texto dividido no idioma certo;
  - os cards coloridos da coleção.
- No Chrome headless, 27 verificações de interação:
  - por peça: cor da página, peça no lugar e ficha montada;
  - letras subindo da máscara; ficha anterior saindo; giro na troca;
  - roda do mouse suave com o Lenis; trackpad para o lado no carrossel;
  - cartão e pontos levando à ficha;
  - área do produto travando e destravando a página;
  - "Ver encaixado";
  - inglês e troca para espanhol;
  - celular, movimento reduzido e modo de reserva com as bibliotecas bloqueadas;
  - console limpo.
- Telas conferidas: 1280×720, 1440×900 e 390×844.
- Não testado: Safari/iOS e aparelho físico.

## Em aberto

- A página Escolha o seu é a primeira versão; o dono vai personalizar.
- Girafa e unicórnio entram quando forem entregues (veja "Onde mexer").
