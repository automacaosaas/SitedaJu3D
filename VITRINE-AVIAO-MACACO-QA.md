# Aviãoscopia montado na vitrine + Macacoscópio (novidade)

Branch `vitrine/aviao-macaco` (feita a partir de `integracao/mercado-pago`, 2026-10-01). Ainda não publicada.

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

- 23 suítes verdes (`node tools/run-tests.mjs`).
- Chrome headless na vitrine local, quadros em instantes exatos: avião e macaco em 1280×720, 1440×900 e 1920×1080, e no celular/tablet em
  360×740, 390×844 e 820×1180. O encaixe do retinoscópio na borboleta continua igual.
- Também conferidos: link direto `#produto/macacoscopio`, o ciclo das quatro vitrines, EN/ES, movimento reduzido, popup e card do avião,
  console limpo.
- Não testado: Safari/iOS e aparelho físico.

## Em aberto

- A "Prévia 3D" da personalização do avião ainda é o modelo antigo (`models.js`).
- O subtítulo do avião continua "Avião magnético para régua de grau" (texto da loja); as chamadas da demonstração usam "régua de esquiascopia".
