# "O 3D nas suas consultas" + página Escolha o seu

Feito na branch `vitrine/3d-nas-consultas` (a partir de `c73dcf4`). Ainda não publicada.
- 2026-10-03: primeira versão.
- 2026-10-04: refeita no estilo da referência "Product Information" (ficha técnica com o produto flutuando e, embaixo, as outras peças da categoria).
- 2026-10-04, segunda rodada: modo cinema (GSAP + ScrollTrigger + SplitText + Lenis) e os cards de "Nossa coleção" com as cores das peças.
- 2026-10-04, terceira rodada: a rolagem passou a ser só o gatilho (nada preso ao progresso). No desktop, a história virou uma tela fixa, com uma ficha por vez: a atual sai inteira antes da próxima entrar, e nenhum título vaza embaixo.
- 2026-10-04, quarta rodada:
  - fichas só com "Personalizar o meu" (a peça já aparece encaixada);
  - peças centralizadas no celular;
  - carrossel do celular com o cartão da vez no centro, bolinhas e setas;
  - "Nossa coleção" com os laterais no tom da página e só o do centro na cor da peça;
  - botão, setas e "Ver encaixado" do banner refeitos.

## O que é

**Na home, logo depois do banner e antes de "Nossa coleção":**

- **A história.** Uma ficha técnica por peça, família por família:
  1. Encaixe para retinoscópio: Borboletoscópio e Dinossauroscópio.
  2. Encaixe para régua de esquiascopia: Aviãoscopia.
  3. Encaixe para lâmpada de fenda: Macacoscópio, "Em breve".
- **No desktop,** a história é uma tela fixa: a ficha à esquerda e a peça já encaixada no equipamento, flutuando, à direita. Rolando, troca a peça da vez (a cada 88% de tela rolada):
  - primeiro saem, inteiras, a ficha e a peça atuais (0,4 s);
  - depois a nova peça chega girando, e a ficha dela se constrói sozinha até o fim (veja "Tecnologia");
  - o fundo da página inteira passa para as cores da peça (as mesmas do banner).
  
  Nunca aparecem duas fichas ao mesmo tempo, nem o título da próxima cortado embaixo.
- **Pontos na lateral** mostram onde a pessoa está e levam a cada peça.
- **A ficha técnica** traz só o que a loja já afirma: encaixe (equipamento), partes com cores à sua escolha, produção (prazo da loja) e envio. O macaco mostra as cores fixas, "Feito em impressão 3D" e "Disponibilidade: em breve".
- **A ação** de cada ficha: "Personalizar o meu" abre o ateliê; no macaco, "Ver em 3D" abre a prévia. Não há "Ver encaixado" aqui, porque a peça já aparece encaixada ao lado. O botão segue o do banner: degradê sutil, sombra difusa e ícone de gota.
- **No celular e no tablet** (sem tela fixa), cada ficha traz a sua peça logo acima. Ela se constrói sozinha ao chegar a 75% da tela e volta a se esconder se a pessoa rolar de volta. O fundo troca de cor do mesmo jeito.
- **Peças de oftalmologia.** Um carrossel com as peças da categoria: a peça encaixada flutuando sobre uma nuvem da sua cor (sem borda), o nome, o subtítulo e o preço (ou "Em breve").
  - Tocar num cartão leva, rolando suave, à ficha técnica da peça lá em cima.
  - No celular: o cartão da vez fica no centro da tela, com uma ponta dos vizinhos dos dois lados. Desliza com o dedo, encaixando no centro. Embaixo ficam bolinhas (a do cartão da vez alongada; tocar leva a ele) e setas compactas.
  - No desktop: arrastar com o mouse (com impulso), setas de vidro translúcido nas bordas e teclas ← →.
- **"Escolha o seu"** leva para `escolha.html`: um banner por família, cada um abrindo a página Produtos só com as peças daquele encaixe (`produtos.html?encaixe=retinoscopio | regua | lampada`).
  - Na página Produtos, um selo mostra o encaixe.
  - O × do selo volta a mostrar todas as peças, e "Outros encaixes" volta para a Escolha o seu.

**"Nossa coleção" (logo abaixo):**
- Só o card do centro ganha a cor exclusiva da sua peça (o degradê do banner). Os laterais ficam no tom da página, que segue o banner.
- Ao trocar de card, as cores deslizam suavemente: são propriedades registradas (`@property --rail-*`), animadas junto com o movimento do card.
- Continuam iguais a foto (sem o encaixe) e o card do meio maior, por cima dos vizinhos. Categoria, detalhes e botões usam o mesmo tom do card.
- Só na home; a página Produtos não muda.

**Banner (botão, setas e "Ver encaixado"):**
- **"Personalizar o meu":**
  - a cor da peça com um degradê de luz bem sutil e sombra difusa;
  - cantos de 18 px (menos oval), letra mais espaçada e o ícone de gota;
  - no hover, cresce 2% e ganha brilho.
- **"Ver encaixado":** vira um link discreto com o ícone de olho, centralizado logo abaixo do botão.
- **Setas:** vidro translúcido (fundo branco a 50% com desfoque) e chevron fino. No hover, o vidro clareia e o chevron anda 3 px para onde aponta.
- **No celular:** o botão ocupa a linha inteira e as setas flutuam nas bordas da pilastra, longe dele. O deslizar com o dedo continua.

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
- **A rolagem é só o gatilho (sem `scrub`).** Quando uma ficha entra, a revelação roda sozinha até o fim, mesmo que a pessoa pare de rolar. É uma timeline com `ease: power3.out`, de cerca de 1,2 s:
  - as letras do nome sobem de dentro de uma máscara por linha (SplitText): opacidade 0 → 1, `y` 30 → 0, intervalo de 0,03 s;
  - as palavras da visão geral sobem em sequência;
  - as linhas da ficha técnica surgem uma a uma, e os itens de cada linha entram em cascata (0,03 s);
  - por último, o botão.
- **Desktop: tela fixa** (`.fit-pin`, `position: sticky`). A história mede uma tela + 88% de tela para cada peça seguinte (`--fit-count`). A peça da vez sai da posição dentro dela:
  - a primeira ficha dispara quando a história chega a 75% da tela;
  - rolar de volta para cima esconde tudo de novo.
  
  Na troca, a ficha e a peça atuais saem inteiras antes de a próxima começar (a nova só entra aos 0,4 s), e a cor da página troca junto. É a mesma ideia de `toggleActions: "play none none reverse"`, aplicada a uma ficha por vez.
- **Celular: gatilho a 75%.** Cada ficha, com a sua peça, dispara a `start: "top 75%"` e se esconde de novo ao rolar de volta (`onEnter` toca a timeline, `onLeaveBack` faz o `reverse`). Os títulos da seção, o carrossel e "Escolha o seu" usam `toggleActions: "play none none reverse"`.
- **A cor de fundo da página inteira** é `.fit-backdrop`, uma camada fixa por peça, só opacidade. Fica logo depois do fundo do banner (`.hero-bg`, que se estende pela página dentro de `.page`): acima dele e abaixo de todo o conteúdo. A cor nova cobre a anterior, sem clarear no meio.
- **Desempenho:** só `transform` e opacidade nas animações; a sombra da peça acompanha o tom de cada uma.
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
  - Ritmo da revelação de cada ficha: a função `reveal`.
  - Troca de peça na tela fixa: `show`.
  - Distância de rolagem por peça: o `88vh` em `.fit-tour.is-pinned .fit-story`, em `dist/fit-tour.css`.
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

## Verificação (2026-10-04, tela fixa com gatilho)

- `npm test`: 35 suítes verdes. `tests/fit-tour.mjs` também confere:
  - as bibliotecas guardadas e as licenças;
  - o carregamento sem bloquear a página;
  - as regras do Lenis;
  - nenhum `scrub`;
  - os parâmetros da revelação;
  - a tela fixa com uma ficha por vez;
  - o gatilho a 75%;
  - o texto dividido no idioma certo;
  - os cards coloridos da coleção.
- No Chrome headless, 33 verificações de interação (incluem as da quarta rodada: fichas sem "Ver encaixado", botão, link e setas do banner, cores da coleção com troca suave, peças centralizadas no celular, carrossel do celular com cartão central e bolinhas, setas do banner longe do botão). As demais:
  - a ficha começa a se construir ao chegar a 75% e termina sozinha, sem mais rolagem;
  - em cada peça, só a ficha dela na tela, inteira, com a peça e a cor certas;
  - na troca, a atual sai antes de a próxima começar, e as peças não se sobrepõem;
  - rolar de volta esconde;
  - Lenis; cartão e pontos;
  - área do produto travando e destravando a página;
  - "Ver encaixado";
  - inglês e espanhol;
  - celular com gatilho a 75% e reverso;
  - movimento reduzido e modo de reserva;
  - console limpo.
- Telas conferidas: 1280×720 (todas as fichas cabem na tela fixa), 1440×900 e 390×844.
- Não testado: Safari/iOS e aparelho físico.

## Em aberto

- A página Escolha o seu é a primeira versão; o dono vai personalizar.
- Girafa e unicórnio entram quando forem entregues (veja "Onde mexer").
