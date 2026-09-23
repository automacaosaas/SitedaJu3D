# Demonstração na vitrine + Dinossauroscópio verde-musgo

Publicação autorizada após a prévia local: “pode subir” (2026-09-23).
Base confirmada por fetch: `1741ae4555f1be288ea18f77962372a4351510f6`.
Backup anterior à publicação: `backup/antes-vitrine-demo-2026-09-23`.
Para retornar, revisar commits posteriores e criar um revert do commit desta
publicação; não usar reset ou force push.

**Fora desta publicação:** o Mercado Pago e o painel admin continuam só na branch local
`integracao/mercado-pago`. O trabalho foi feito em cima dela, e aqui entrou só o commit da
vitrine (cherry-pick). O catálogo do servidor (`api/_lib/catalog.js`) só existe nessa branch;
lá ele já recebeu as cores novas do dinossauro.

## O que mudou

- **Demonstração sem popup.** Clicar na peça da frente (Borboletoscópio ou Dinossauroscópio)
  esconde texto, paleta, setas e pilastra, aproxima a peça como uma câmera e muda a luz do
  fundo. O retinoscópio sobe por baixo e encaixa na abertura, com um assentamento físico de
  poucos pixels. Depois aparecem duas chamadas de ficha técnica (só “Borboletoscópio” ou
  “Dinossauroscópio” e “Retinoscópio”) e o convite “Personalize o seu”, que abre
  `#produto/<chave>/personalizar`. O ✕ (“Voltar à vitrine”) e o Escape tocam tudo ao contrário.
  O percurso completo leva até 1,7 s, e o header fica mais discreto durante a demonstração.
- **Clique × arraste:** um arraste nunca abre a demonstração; com ela aberta, ficam travados
  arraste, setas, teclado e roda do mouse. O toque tem layout próprio (chamadas e convite
  abaixo da peça). Com movimento reduzido, só há troca por opacidade.
- **Camadas:** a peça tem duas camadas, com o equipamento entre elas. `layers.back` é a parede
  traseira, alinhada pixel a pixel, e `layers.front` é a própria imagem da vitrine. Com
  `depth: 0`, as camadas entram como vieram.
- **Arquitetura por dados:** `SHOWCASE.<produto>.demo` em `products.js` define o equipamento,
  as camadas, as chamadas, o zoom e as cores. Nada específico de produto fica em
  `hero-demo.js` ou `motion-timeline.js` (Web Animations API, sem biblioteca). O avião
  continua abrindo o popup.
- **Hover na vitrine:** a peça da frente inclina de leve seguindo o mouse (só com mouse).
- **Dinossauroscópio:** renderizado de novo a partir das peças 3D originais (STL), de frente e
  nas cores reais: verde-musgo, crista e bolinhas amarelo-claras, dentes brancos, olhos pretos.
  - A crista escurece de leve nas bordas e tem um contorno fino, só onde encosta no fundo.
    Assim ela aparece bem no fundo claro.
  - Isso vale para a imagem da vitrine, a foto do popup (na pilastra) e a camada de trás da
    demonstração.
  - A paleta ganhou **Verde-musgo** e **Amarelo-claro**, que passam a ser as cores originais do
    dinossauro. O tema da vitrine dele virou verde-sálvia.
  - A prévia 3D da personalização ganhou dentes brancos, e a nota diz “Os olhos permanecem
    pretos e os dentes, brancos.”
  - Tudo traduzido em EN e ES.

## Arquivos

- Novos: `dist/hero-demo.js`, `dist/hero-demo.css`, `dist/motion-timeline.js`,
  `tests/hero-demo.mjs`, `dist/assets/retinoscopio.webp`, `dist/assets/borboletoscopio-back.webp`,
  `dist/assets/dinossauroscopio-back.webp`.
- Alterados: `dist/carousel.js`, `dist/carousel.css`, `dist/index.html` (link do CSS),
  `dist/controller.js` (rota `/personalizar` e check escuro no Amarelo-claro), `dist/products.js`,
  `dist/translations.js`, `dist/models.js` (dentes brancos), `tests/carousel.cjs`,
  `dist/assets/product-dinossauroscopio-cutout.{webp,png}`, `dist/assets/dinossauroscopio.png`.

## Verificação

- 10 suítes de teste verdes na base da `main` (`node tests/<arquivo>`).
- Navegador (Chrome headless, servindo exatamente esta árvore):
  - interação (clique, arraste, setas, Escape, convite, avião no popup);
  - toque e movimento reduzido;
  - 9 tamanhos de tela nos dois produtos;
  - idiomas e rotas;
  - console limpo e sem rolagem horizontal.
- Não testado: Safari/iOS e aparelho físico.
