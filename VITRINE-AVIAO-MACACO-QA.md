# Aviãoscopia montado na vitrine + Macacoscópio (novidade)

Branch `vitrine/aviao-macaco` (feita a partir de `integracao/mercado-pago`, 2026-10-01). Ainda não publicada.

## O que mudou

- **Imagem do avião corrigida.** Banner, cards do catálogo e popup agora são renders do CAD real (STL de 21/08/2026), de frente, com as
  16 aberturas **vazadas** (a régua é do cliente) e os números ao lado. Antes eram uma imagem com “lentes” brancas e um rasgo preto na base.
  Como o STL não tem os números, eles entram como decalque com relevo; se houver um STL mais novo da frente, basta rodar os renders de novo
  (`tools/render-aviao-macaco/README.md`). A imagem do popup passou de `aviaoscopia-regua.webp` para `aviaoscopia.webp`.
- **Demonstração de montagem do avião.** Clicar no avião aproxima a peça como nas outras; ela se **abre em duas metades** (a da frente avança e
  vai para cima e para a esquerda, a de trás recua para baixo e para a direita, com um giro leve), a **régua de grau sobe por baixo, por entre
  elas**, e as metades **se fecham em volta da régua** com um estalo curto e um brilho que atravessa a frente. Chamadas: “Aviãoscopia” e “Régua
  de grau”. Percurso de 2,6 s (o encaixe do retinoscópio continua com 1,56 s). Configuração em `SHOWCASE.aviaoscopia.demo.assemble`.
- **Macacoscópio como novidade, sem compra.** Quarta vitrine do banner (`SOON.macacoscopio` em `products.js`, fora de `PRODUCTS`): sem preço,
  catálogo, carrinho nem personalização; no lugar de “Escolha sua cor” aparece o selo “Novidade · em breve” e o convite da demonstração vira
  “Em breve”, sem link. Tema creme/banana e folhagem de fundo. Quando a modelagem ficar pronta, a entrada passa para `PRODUCTS`.
- **Demonstração do macaco.** A base do equipamento, com a coluna preta, sobe por dentro do macaco e a cabeça do equipamento desce por cima
  (`demo.head`). Chamadas: “Macacoscópio” e “Equipamento”. As imagens são **provisórias**, recortadas das fotos (`tools/render-aviao-macaco`);
  trocando as três imagens e os números em `SHOWCASE.macacoscopio.demo` a animação continua igual.
- **Motor da demonstração** (`hero-demo.js`): três jeitos, escolhidos pelos dados: encaixe (retinoscópio), equipamento em duas partes
  (`head`) e montagem (`assemble`). Nada específico de produto no código. Novos: `--cy-shift` (desloca o palco), `.demo-sheen`, `.demo-head`,
  alinhamento `right` nas chamadas.

## Arquivos

- Novos: `dist/assets/aviaoscopia.webp`, `aviaoscopia-front.webp`, `aviaoscopia-back.webp`, `aviaoscopia-ruler.webp`,
  `product-macacoscopio-cutout.webp`, `macacoscopio-base.webp`, `macacoscopio-head.webp`, `tools/render-aviao-macaco/*`.
- Substituídos: `product-aviaoscopia-cutout.webp`, `card-aviaoscopia.webp`, `card-preview-aviaoscopia.webp`. Removido: `aviaoscopia-regua.webp`.
- Alterados: `dist/products.js`, `hero-demo.js`, `hero-demo.css`, `carousel.js`, `carousel.css`, `hero-scenery.js`, `translations.js`,
  `tests/hero-demo.mjs`, `tests/carousel.cjs`, `COLLABORATOR_PROMPT.md`.

## Verificação

- 23 suítes verdes (`node tools/run-tests.mjs`).
- Chrome headless na vitrine local, quadros em instantes exatos (animações pausadas e buscadas): desktop e celular, avião e macaco;
  link direto `#produto/macacoscopio`; ciclo das quatro vitrines; textos em EN e ES; movimento reduzido (a cabeça do equipamento aparece);
  console limpo.
- Não testado: Safari/iOS, aparelho físico, DPR 2 com as imagens provisórias do equipamento (ficam um pouco macias).

## Em aberto

- Nome oficial do equipamento (a legenda diz só “Equipamento”) e fotos limpas ou modelo 3D do macaco e do equipamento.
- A prévia 3D do avião na personalização ainda é o modelo antigo (`models.js`).
- Decisão da Ju: manter o avião com os furos abertos na vitrine (como vendido) ou mostrar a régua dentro.
