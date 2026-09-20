# Vitrine principal como banner temático

Publicação autorizada após apresentação da prévia local: “pode subir”.
Base confirmada por fetch: `ef47c81b3e5c39dcb6be79b661bef6b1db4effe1`.
Backup anterior à publicação: `backup/antes-vitrine-banner-2026-09-20`.
Para retornar, revisar commits posteriores e criar um revert do commit desta
publicação; não usar reset ou force push.

## O que mudou

- A vitrine orbital (três peças, duas ao fundo) virou um banner com **um produto por vez**,
  apoiado na pilastra. A passagem é lateral: produto + pilastra saem juntos, os seguintes
  entram pelo lado oposto.
- Fundo do banner **e** faixa do header trocam de cor juntos (cross-fade entre camadas);
  categoria, nome, subtítulo e paleta acompanham a mesma transição.
- Nada de miniaturas, contador ou "Coleção explorar". Categoria real do produto.
- **Uma faixa de cor por tema, do banner ao rodapé:** o fundo (`data-hero-bg`) cobre a `.page`
  inteira, atrás do banner e do catálogo. O degradê do banner continua por baixo dele com a
  mesma geometria (`--hero-h`, medida no JS, então não há emenda) e um véu na cor do site
  (`#fff7f5`) regula a intensidade: 0% no fim do banner, sobe em curva suave até 56% no miolo
  da seção (a seção fica num tom claro do tema, **sem faixa rosa no meio**) e desce até 20% no
  rodapé, que volta a aprofundar o tema. A rampa do rodapé começa em `max(fim da primeira
  rampa, fim da página − --foot-ramp)`, então as paradas do degradê nunca se sobrepõem. As
  nuvens esmaecem antes do limite do banner. O catálogo desenha por cima (`.page-inner`).
- **Personalização abaixo do banner:** "NOSSA COLEÇÃO", título e linha de apoio, o link "Ver
  catálogo completo", a nota de preços, o rodapé do site e, nos cards, **só estas partes**: os
  botões (Personalize o seu e carrinho, com sombra e hover na mesma família de cor), a categoria
  ("OFTALMOLOGIA"), o valor "Categoria" e os pontinhos do carrossel (o alvo de toque de 44 px
  não muda) usam o tema ativo (`accentColor`, `textColor`, `mutedColor`), misturados quadro a
  quadro na troca. Sem JS voltam às cores originais do site. `catalog.css` e `catalog.js`
  seguem sem nenhuma alteração; tudo entra por sobrescrita em `carousel.css`, sempre com o
  prefixo `.home` (a página Produtos não muda).
- **Topo do card central conectado ao degradê:** borda no tom do tema (`--theme-soft`) e a
  faixa superior da imagem em degradê do tom do tema (`--theme-wash`, o miolo do fundo
  clareado) até branco, para o card não ficar um retângulo branco solto sobre a lavagem.
- **Card central limpo (sem sombra quadrada):** a sombra e o brilho eram cortados pela borda do
  palco (`overflow: hidden`), o que desenhava retângulos em cima e embaixo do card. Agora o
  palco só recorta na horizontal (`overflow-x: clip; overflow-y: visible`, com `overflow:
  hidden` de reserva em navegador antigo), o brilho no alto saiu e a sombra é curta, suave e no
  tom do tema (`0 30px 46px -32px`), seguindo o contorno arredondado do card.
- **Cards menores no desktop (só na home, ≥ 901 px):** ativo 352 px de largura e ~493 px de altura
  (era 405 × ~574, cerca de 14% menor), laterais 300 px, palco de 526 px (era 620). A imagem e os
  espaçamentos diminuem; o texto das informações não (só o título cai de 28 para 26 px). Ao chegar
  pelo "Escolha sua cor", o carrossel inteiro cabe na janela com folga (165 px acima e abaixo em
  900 px de altura).
- **Rodapé conectado:** não há mais camada de rodapé separada. A mesma faixa de cor aprofunda o
  tema no fim da página (véu de 56% para 20%), trocando junto com o banner.
- **Header sem linha:** a linha branca foi removida. A faixa do header desce 72 px sobre o
  banner e some com máscara em curva suave, então header e banner são um degradê só em todas as
  cores.
- **"Escolha sua cor" virou botão** na cor do tema (trocando com o produto), com as cores
  originais logo abaixo e uma **seta dentro dele que pulsa de leve** (±2 px e opacidade
  0,78–1; desktop e mobile). A seta separada no fim do banner foi removida. Ao clicar: o
  carrossel do catálogo traz o card do produto ao centro (o mesmo caminho do toque em um card
  lateral), a página rola até ele e o botão "Personalize o seu" daquele card pulsa até a pessoa
  passar o mouse, focar ou clicar (ou por 5 ciclos). Com movimento reduzido não pulsa: a seta
  fica parada e o botão do card ganha um contorno estático. No celular o botão desceu um pouco
  (ocupa o lugar que era da seta).
- **Rodapé novo** (home, Produtos, Sobre e Contato): `© 2026 Ju, imprime pra mim? Todos os
  direitos reservados.`, ícone do Instagram (`https://www.instagram.com/juimprimepramim/`, abre
  em nova aba com `noopener noreferrer`, 44 px de alvo de toque) e "feito com carinho, pela Ju."
  em script, como assinatura. A frase "Cor e criatividade em cada camada." saiu. No celular a
  ordem é ícone, direitos, assinatura. Na home o rodapé segue o tema; nas outras páginas usa as
  cores padrão do site. `comprar-agora.html` (fluxo de compra) não foi alterada.
- **Sem botão "Conhecer"** ao passar o mouse na peça; o movimento de hover (subir) continua e o
  cursor vira "mão". Clicar na peça segue abrindo o produto.
- O resto do site (modal, carrinho, outras páginas) mantém o design system rosa.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `dist/carousel.js` | Motor da vitrine: monta o DOM a partir de `PRODUCTS`, `position` contínuo, gestos, teclado, foco, pré-carregamento. |
| `dist/hero-motion.js` (novo) | Matemática pura: pose do produto, texto, mistura de camadas, limiar de gesto, easing. Testável em Node. |
| `dist/carousel.css` | Layout (3 colunas → empilhado), pilastra em CSS, camadas de tema, nuvens, setas. |
| `dist/products.js` | `SHOWCASE` (enquadramento do recorte + tema por produto), `showcase(key)`, `originalColors(key)`. |
| `dist/index.html` | `.hero-shell` envolve header + vitrine; catálogo/rodapé ficam em `.page-inner`. Header inalterado. |
| `dist/shopping.css` | Remove regras antigas da vitrine (`featured-*`, `gallery-*`, `.showcase .collection`). |
| `tests/carousel.cjs` | Reescrito para o novo comportamento. |

## Como funciona

- **Produto ativo:** `position` (float) comanda tudo; `active = round(target)`. Só o bloco ativo
  (peça, texto, paleta) fica interativo (`inert` nos demais).
- **Temas:** `SHOWCASE[key].theme = {bannerStops, headerBackground, textColor, mutedColor,
  accentColor}` (`bannerStops` = as 3 paradas do degradê; a geometria fica no CSS). Produto sem entrada usa `DEFAULT_SHOWCASE`. Sem `if` por produto.
- **Sincronia:** duas pilhas de camadas (banner e header) recebem a mesma opacidade por frame:
  `from` = 1, `to` = fração do trajeto. Só `transform`/`opacity` são animados.
- **Cores da paleta:** `originalColors(key)` = cor padrão de cada parte (`parts[].default`),
  sem repetir. Aviãoscopia: azul-royal, vermelho, amarelo. Borboletoscópio: verde-menta, amarelo.
  Dinossauroscópio: azul-céu, verde-menta.
- **Imagens:** recortes já cadastrados (`catalogImage`), sem recolorir nem redimensionar.
  `art` (altura visível, folga inferior, largura da base) assenta cada peça na pilastra.
- **Gestos:** o dedo acompanha a peça 1:1; limiar de 40 px (18% do curso); arraste nunca abre o
  produto; toque parado abre; `lostpointercapture` e `touch-action: pan-y pinch-zoom` preservados.
  A roda só navega no gesto **horizontal**; a rolagem vertical da página fica livre.
- **Movimento reduzido:** só crossfade (320 ms), sem translação nem escala.
- **Pré-carregamento:** anterior, atual e próximo; imagens só aparecem depois de carregar.
- Sem autoplay.

## Verificações executadas

- `node tests/carousel.cjs`, `catalog.cjs`, `plane-geometry.mjs`, `commerce.mjs`,
  `account-commerce.mjs`; `node --check` em todos os módulos de `dist/`.
- O teste de dados cobre paleta = padrão das partes, imagens existentes e **contraste dos
  temas** (texto ≥ 7:1; subtítulo e categoria ≥ 4,5:1 em todas as paradas do gradiente).
  Ele reprovou o acento do Borboletoscópio (4,37:1), corrigido para `#25664c` (5,16:1).
- Chromium (painel do app), 1920, 1440, 1366, 1024, 901, 768, 430, 412, 390, 375 e 360: nos três
  produtos, título sem tocar a peça, paleta e setas dentro do quadro, sem overflow horizontal.
  A primeira rodada em 1920 achou o título sobre a peça (−71 px); corrigido ao basear os
  tamanhos em `min(100vw, 1560px)` (agora +72 px).
- Gestos com relógio manual e eventos de ponteiro simulados (21 verificações): arraste 1:1,
  limiar, arraste curto, vertical não interceptado, `pointercancel`, loop nos dois sentidos,
  teclado, cliques rápidos (fila limitada a 2), roda vertical livre/horizontal navega, clique
  bloqueado após arraste e durante a transição, `inert`, foco, abrir/fechar modal, aria-labels.
- Movimento reduzido conferido com `matchMedia` forçado (translação 0, escala 1, só opacidade).
- Menu hambúrguer no mobile com header transparente: abre, `.page` inerte, Esc fecha, foco volta.
- Fundo: o `background-image` do degradê é aceito pelo navegador (o raio em `calc()` misturando
  % e px é recusado; por isso a altura do banner vem do JS). A camada tem a altura da `.page`
  (1781 px em 1440). Geometria do véu conferida em 390, 1440 e 1920: a rampa do rodapé começa
  onde a primeira termina (778 px em 1440, 302 px de rampa; 880 px e 240 px em 390; 796 px e
  299 px em 1920), sem overflow. **Achado e corrigido:** na primeira versão as duas rampas se
  sobrepunham em 216 px em 1440 e o navegador empilhava paradas na mesma posição, o que criaria
  um degrau visível; agora a segunda rampa usa `max()`.
- O teste confere: véu na cor exata do site, começa em 0%, sobe e desce sem degraus, máximo
  ≤ 65% (sem faixa rosa no meio) e o rodapé mais escuro que o miolo; contraste de accent/subtítulo
  (≥ 4,5:1) e texto (≥ 7:1) sobre a cor real atrás do texto no miolo e no rodapé; fundo cobre a
  página e vem antes do banner no HTML; palco sem corte vertical; sombras no tom do tema sem
  brilho no alto; nenhuma regra/código toca os cards além das partes permitidas.
- Botões, header e rodapé: contraste do texto branco sobre o botão (≥ 4,5:1, também no hover),
  máscara do header decrescente, animações e o fallback de movimento reduzido. Teste de mutação
  em três rodadas (9 + 14 + 10 regressões plantadas, por exemplo: pílula volta, linha do header
  volta, card restilizado, palco volta a cortar a sombra, véu volta ao rosa cheio, rampas se
  sobrepõem, rodapé tingido separado volta): todas reprovadas.
- No navegador: com o banner no Aviãoscopia, a seta levou o carrossel do catálogo do
  Borboletoscópio ao card do Aviãoscopia, centralizou o carrossel na janela, só o botão desse
  card pulsou (azul-céu) e a pulsação parou ao interagir. Na troca de tema, fundo, header e
  rodapé têm a mesma opacidade a cada passo; destaque, seta e link do catálogo acompanham a
  mistura. Achado e corrigido: no mobile o anel da seta crescia com o banner inteiro.
- Rodada de ajustes finais: teste de mutação com 14 regressões (seta separada volta, rodapé sem
  direitos, Instagram sem `rel` seguro, frase antiga volta, assinatura some, categoria/pontinhos
  perdem o tema, topo do card sem degradê, regra do catálogo sem `.home`, seta do botão
  exagerada, cards do desktop não diminuem, botão não desce no mobile, ícone pequeno, cor nova
  não calculada): as 14 foram reprovadas. Na página Produtos os cards seguem 405 × 574 px, palco
  de 620 px e cores rosa (só o rodapé novo aparece lá). No mobile (390 px): sem seta, botão 31 px
  abaixo da pilastra, chevron pulsando (opacidade 0,78–1), sem overflow.
- Produtos e Sobre: header rosa original, sem overflow, sem erros. Personalização 3D abre a
  partir do banner (canvas criado).

## Limites

- Sem aparelho físico, Safari/iOS ou leitor de tela. Arraste testado com eventos simulados;
  o teste com mouse real pelo painel ficou instável por captura de tela.
- A pilastra agora é CSS (uma só para todos os produtos), não a foto original; ver decisão abaixo.
- "Escolha sua cor" leva ao card do produto; a foto do banner não é recolorida.
- A ida ao card usa um clique programático no card (mesmo caminho do toque em um card lateral),
  então depende da estrutura atual do carrossel do catálogo (`data-product-id`).
- O nome da marca no rodapé foi escrito "imprime" (como na logo e no @juimprimepramim); o pedido
  dizia "imprimi". Confirmar.
- Cards do desktop: o encolhimento é fixo em px (só na home). Em telas muito baixas (< 700 px de
  altura) o carrossel ainda cabe, mas com pouca folga.
