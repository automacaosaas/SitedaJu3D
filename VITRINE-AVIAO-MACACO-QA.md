# Aviãoscopia montado na vitrine + Macacoscópio (novidade)

Feito na branch `vitrine/aviao-macaco` (a partir de `integracao/mercado-pago`, 2026-10-01) e levado para `vitrine/aviao-macaco-juncao`,
que parte da `juncao/pr2-auditoria` do Pedro (891e57a). Ainda não publicada.

## Ajustes pedidos depois (2026-10-01, segunda rodada)

- **Macaco:** cabeça com o topo bem arredondado e um bojo leve, como a peça impressa. Orelhas em meia esfera, uma concha com o miolo bege
  côncavo. Banana menor, centrada na parte de baixo da barriga e dentro dela.
- **Avião:** as janelas da cabine eram um "tampão" plano posto sobre um nariz curvo; agora a face delas fica rente à curva do nariz, no lugar dos
  furos (`drape` em `plane.html`). As duas metades do capacete vermelho vinham 4,8 mm afastadas do meio e soltas acima do topo; agora se
  encontram no meio e assentam no topo (`capOn`), no mesmo tamanho.
- **Régua:** o acrílico ganhou um contorno ardósia firme, e na demonstração a régua aparece inteira, com o cabo preto nítido (sem desbotar e
  sem o reflexo colorido por cima: `tool.bounce: false`). No desktop o avião vem um pouco menor para a régua caber inteira (`zoom.wide`);
  no celular o rótulo da régua fica centrado embaixo do cabo e o "Personalizar o meu" logo abaixo (`zoom.compact`, `ctaY`).
- **Barra do topo:** símbolo oficial do Pix (também no carrinho e no pagamento), setas ▲▼ juntas na lateral e sem o botão de pausa. Usar uma
  seta para a rotação automática, que também para com o mouse ou o foco em cima e não roda com movimento reduzido (WCAG 2.2.2).
- **Prévia de link do avião** (`og-aviaoscopia.jpg`): a mesma arte, com o avião novo no lugar do antigo (`og-patch.html`).

## O que mudou

- **Imagens no mesmo universo visual das outras.** Tudo agora é render 3D com luz de estúdio (`tools/render-aviao-macaco`), e as camadas de cada
  demonstração saem com a mesma câmera da foto da vitrine, então se sobrepõem pixel a pixel:
  - **Avião**, do CAD real (STL de 21/08/2026). A versão anterior mostrava a face interna da peça (a face plana, dos ímãs), por isso parecia
    "desconfigurada". Agora as metades estão montadas como no avião de verdade: faces planas no meio, faces bojudas para fora, com bandeja funda,
    janelas da cabine, estrelas encaixadas nas asas, motores, nariz e os números gravados do próprio CAD. Novos: vitrine, popup na pilastra,
    cards do catálogo e as camadas da montagem (frente, trás e régua).
  - **Régua de esquiascopia**, modelada das fotos: acrílico, impressão preta com "PLUS (+)", 16 lentes com a curvatura de cada grau e cabo.
    Sem a etiqueta com nome/CRM.
  - **Lâmpada de fenda portátil**, modelada das fotos: base cinza martelada com a placa de aço e a barra em T, carcaça com os dois anéis,
    coluna preta, prisma e cabeça binocular com objetivas tratadas e as "orelhas" pretas.
  - **Macaco**, no estilo de brinquedo da borboleta e do dinossauro, fiel à peça impressa (rosto, orelhas, braços, banana, patinhas).
- **Montagem do avião.** A peça se aproxima como nas outras e abre em vista explodida: a metade da frente vem para perto e a de trás recua
  (com paralaxe entre os furos). A régua sobe por entre elas, com "PLUS (+)" e as lentes passando atrás dos furos. As metades fecham puxadas
  pelos ímãs, com um estalo curto, sombra nas lentes e um brilho que atravessa a frente. Chamadas: "Aviãoscopia" e "Régua de esquiascopia".
- **Encaixe do macaco.** Mesma ideia aprovada: a carcaça com a coluna sobe por dentro do macaco e o prisma com a cabeça binocular desce por cima.
  O resultado é igual à foto do macaco montado na lâmpada. Chamadas: "Macacoscópio" e "Lâmpada de fenda". No celular, as chamadas e o
  "Em breve" ficam na faixa livre abaixo da carcaça (`ctaY`).
- **Textos.** "Régua de esquiascopia" e "Lâmpada de fenda" nas chamadas e avisos, em PT/EN/ES. O subtítulo do macaco passou a ser
  "Capa para lâmpada de fenda portátil".
- **Macacoscópio como novidade, sem compra.** Continua a quarta vitrine do banner (`SOON.macacoscopio`), sem preço, catálogo nem carrinho.

## Verificação

- 34 suítes verdes na branch da junção (`npm test`; eram 23 na branch original).
- Chrome headless na vitrine local, quadros em instantes exatos: avião e macaco em 1280×720, 1440×900 e 1920×1080, e no celular/tablet em
  360×740, 390×844 e 820×1180. O encaixe do retinoscópio na borboleta continua igual.
- Também conferidos: link direto `#produto/macacoscopio`, o ciclo das quatro vitrines, EN/ES, movimento reduzido, popup e card do avião,
  console limpo.
- Não testado: Safari/iOS e aparelho físico.

## Em aberto

- (resolvido em 02/10/2026) A prévia 3D da personalização do avião agora é o CAD real (`export-glb.cjs`).
- O subtítulo do avião continua "Avião magnético para régua de grau" (texto da loja); as chamadas da demonstração usam "régua de esquiascopia".

## Macacoscópio na coleção e na página Produtos (02/10/2026, proposta A do Pedro)

- Um card do Macacoscópio no fim de "Nossa coleção" (home) e da grade da página Produtos: foto, nome, "Capa para lâmpada de fenda
  portátil", o selo "Em breve" e "Ver encaixado" no lugar de preço e carrinho. Sem personalização nem página própria.
- "Ver encaixado" usa o endereço novo `#produto/<peça>/encaixe` (`carousel.js`, `demoFromRoute`): a vitrine vai para a peça, a página
  sobe até o banner e a demonstração abre; o endereço volta a `#produto/<peça>`. Da página Produtos, vai para `index.html#produto/macacoscopio/encaixe`.
- Imagens novas `card-macacoscopio.webp` e `card-preview-macacoscopio.webp` (mesmo enquadramento dos outros cards).
- Testes: `tests/storefront.mjs` confere o card da grade e do carrossel e o endereço; `tests/assets.mjs` e `tests/catalog.cjs` conhecem as novidades.
