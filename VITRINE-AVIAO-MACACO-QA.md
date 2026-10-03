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

## Macacoscópio em 3D e o caminho para a venda (02/10/2026)

**Decisões do dono:** cores fixas (marrom, bege e amarelo; sem personalização); Pix com os mesmos 5% dos outros; prazo de 3 a 5 dias
úteis; descrição atual ("Um macaquinho para acompanhar o olhar dos pequenos").

**Já no site (ainda como novidade, sem venda):** "Ver em 3D" no banner (ação principal da novidade), no convite ao fim da demonstração
e nos cards da coleção e da página Produtos. Abre a área do produto **só para ver** (`#produto/macacoscopio/3d`, `data-mode="preview"`):
Foto | 3D, as cores fixas da peça e o aviso "Ainda não está à venda" no lugar do preço e da compra. `#produto/macacoscopio` continua só
levando a vitrine até ele.

**Modelo 3D (02/10/2026):** `dist/assets/models/macacoscopio.glb` é o macaco do Rodin (`rodin-v2_-0 (7).glb`, recebido em 01/10/2026), no lugar do
provisório da vitrine. A textura de cor virou cinco materiais fixos, sem textura: `fur` (marrom), `face` (bege: rosto, barriga,
orelhas e os pés), `features` (preto: olhos, sobrancelhas, nariz e boca), `banana` e `highlight` (o brilho branco de cada olho).
- A placa do rosto e a barriga são decididas pela forma (o sulco em volta de cada uma), porque a textura pinta a parede do sulco num
  marrom-claro igual ao bege na sombra.
- Os contornos que se veem de perto são cortados na própria malha, ao longo da forma: o olho até onde o relevo começa (com um brilho
  oval igual nos dois), a concha das orelhas até onde a borda começa a subir, os pés (almofada e dedos) até onde o relevo deles começa.
- Por dentro do tubo tudo é marrom (a textura projetava ali a barriga e os olhos).
- Superfície lisa: as ondinhas de "camada de impressão" do Rodin (1 a 3 milésimos) são alisadas na direção da normal; ficam parados os
  relevos de verdade (olhos, nariz, boca, sobrancelhas, banana, mãos, orelhas, sulcos e pés).

`tools/modelo-macaco/preparar_cores.py` (Blender) refaz o arquivo, igual byte a byte, a partir do GLB do Rodin, com 60% das faces
(300 mil triângulos); depois, `meshopt` como abaixo: 1.197 KB. `tests/model-details.mjs` confere as cores em pontos do rosto, dos
olhos, das orelhas, da barriga, da banana, dos pés, das costas e de dentro do tubo.

**Foto da vitrine e cards (02/10/2026):** `product-macacoscopio-cutout.webp` (banner, aba "Foto" e demonstração), `card-macacoscopio.webp`
e `card-preview-macacoscopio.webp` vêm da foto enviada em 02/10/2026 (`design/originais/macacoscopio-foto.webp`, já com o fundo
transparente). `tools/modelo-macaco/recortar_foto.py` (Blender) a encaixa no quadro das fotos da vitrine: a mesma altura e a mesma margem
de baixo das outras e o tubo centrado no eixo da lâmpada; a coluna preta (350 px no quadro de 1254) fica atrás do tubo da foto (cerca de
388 px), então a demonstração encaixa igual, com as mesmas camadas da lâmpada. Se vier uma foto com fundo claro, o mesmo script recorta:
o fundo e a sombra no chão são a região neutra ligada à borda da imagem, e a borda do macaco tem alfa pela mistura com o fundo.
`products.js`: art h .8732, bottom .0534, foot .3118. `tools/modelo-macaco/vitrine_webp.py` grava os WebP (foto e cards com a altura e a
margem de baixo dos cards anteriores). Para fazer a foto a partir do modelo 3D, `monkeylamp.html?model=rodin`
(`tools/render-aviao-macaco/monkey-rodin.js`) renderiza o modelo do site com a câmera da vitrine.

**Pendências para pôr à venda** (sem elas o macaco não pode entrar em `PRODUCTS`: o frete para de calcular para todos sem o peso,
e a nota fiscal pausa sem o NCM):
- **preço** (valor);
- **peso embalado** e se cabe na caixa compartilhada (`api/_lib/shipping-config.js`);
- **NCM** confirmado pela contadora (`api/_lib/fiscal.js`; os outros usam 3926.90.90);
- **lâmpadas de fenda compatíveis** (texto da página; não inventar compatibilidade);
- (opcional para vender) o **arquivo 3D real**.

Com esses dados: o macaco passa de `SOON` para `PRODUCTS` com `parts: []` (cores fixas), preço no site e no servidor
(`dist/commerce-config.js` e `api/_lib/catalog.js`), peso, NCM, página própria (`node tools/build-product-pages.cjs`), card com preço e
carrinho, e a área do produto mostra as cores fixas com o preço e a compra.

**Para trocar o modelo 3D (por exemplo, pelo arquivo de impressão)**
1. Exportar o macaco montado como `.glb` (y para cima, frente virada para +z), com as cores nos materiais ou nos vértices e **sem
   texturas**. Os materiais não podem se chamar `body`, `details` ou `engines` (esses nomes ficam coloríveis no site).
2. Comprimir como os outros modelos (PERFORMANCE-QA.md):
   `npx -y @gltf-transform/cli@4.5.1 meshopt entrada.glb dist/assets/models/macacoscopio.glb --level high --quantize-position 16`
   (se ficar acima de 2,5 MB, antes: `simplify entrada.glb menor.glb --ratio 0 --error 0.0001`).
3. Em `dist/asset-models.js`, trocar o `?v=` do macaco por um valor novo (os navegadores não reaproveitam o arquivo antigo).
4. `npm test`: `tests/asset-models.mjs` confere que o macaco carrega, não tem textura nem parte colorível, assenta na pilastra e
   cabe nela; `tests/model-framing.mjs`, que não corta em nenhuma rotação; `tests/assets.mjs`, a compressão e o limite de tamanho;
   `tests/model-details.mjs`, as cores do modelo do Rodin (num modelo novo, trocar esses pontos).
   Se preferir, suba o STL ou o 3MF em `design/modelos/macacoscopio/` (fora do site publicado) e peça a conversão.
