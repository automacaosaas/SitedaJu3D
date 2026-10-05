# Renders do Aviãoscopia, do Macacoscópio e dos aparelhos

Ferramentas que geram as imagens da vitrine do avião e do macaco (2026-10-01): modelos 3D em three.js, renderizados em Chrome headless
(WebGL por software) com luz de estúdio. Rodam no PC da Ju (Windows) só com Node 24, ffmpeg e o Chrome; nada disso vai para o site publicado.

## Estúdio (`studio.js`)

Ambiente de softboxes para os reflexos e um renderizador que soma 40 passadas: luz principal como um softbox próximo (sombras macias e queda
suave nas faces planas), uma luz de cúpula sorteada a cada passada (sombras de contato) e um deslocamento de subpixel (antisserrilhado).
O resultado é um PNG transparente com cara de foto de produto. Também tem `cropToContent` (recorta a margem transparente e devolve onde a camada
fica no quadrado da vitrine) e `artBox` (os números `art` de `products.js`: h, bottom, foot).

## Modelos (milímetros, x à direita, y para cima, z para quem olha)

- `ruler.js` — régua de esquiascopia: acrílico, impressão preta com "PLUS (+)" e os graus, 16 lentes com a curvatura de cada grau, cabo.
  Mesma face que o avião mostra (0,5 a 4 à esquerda), **sem a etiqueta com nome/CRM do cabo**.
- `slitlamp.js` — lâmpada de fenda portátil no suporte de mesa, pelo lado do paciente (foto "14.27.59"): grupos `base`, `column` e `top`.
- `monkey.js` — Macacoscópio: luva em C aberta atrás, rosto, orelhas, braços, banana e patinhas. Na escala da lâmpada (coluna Ø 32).
- O avião vem dos STL do projeto de 21/08/2026 (`C:\Users\LUIZ\Documents\modelos_ju3d\Airplane Oftalmology1\airplane 21 08 2026\STL`).
  As metades chegam na posição de impressão: `plane.html` dá meia-volta em cada uma para as faces planas (ímãs) se encontrarem no meio e as
  faces bojudas (bandeja funda, janelas, estrelas) ficarem para fora. Os números gravados já estão no STL. As janelas (um tampão plano para
  os furos de um nariz curvo) são assentadas na superfície do nariz ajustada em volta dos furos (`drape`); as metades do capacete vermelho se
  encontram no meio e descem até o topo (`capOn`).

## Páginas

```
node serve.cjs                                                                   # porta 8851: /vendor (three.js do site), /stl, /photos, /assets
node runpage.cjs "variants=full,front,back,ruler,card,ped" saida.png plane.html   # avião: vitrine, metades, régua, card 768 e popup na pilastra
node runpage.cjs "layers=monkey,base,top&above=.5&below=2.1" saida.png monkeylamp.html   # macaco + lâmpada com a câmera da vitrine
node runpage.cjs "w=1000&h=1550&exposure=1.06" saida.png slitlamp.html           # lâmpada sozinha (camadas: full, base, column, top)
node runpage.cjs "w=600&h=2400" saida.png ruler.html                             # régua sozinha
node runpage.cjs "" saida.png monkey.html                                        # macaco sozinho
node runpage.cjs "layers=monkey,base,top&above=.5&below=2.1&model=rodin" saida.png monkeylamp.html   # o mesmo, com o modelo 3D do site
node art.cjs imagem.webp                                                          # h, bottom e foot de uma imagem de vitrine
node runpage.cjs "" og.png og-patch.html                                          # prévia de link do avião: troca só o avião na arte
node export-glb.cjs                                                               # prévia 3D do avião (dist/assets/models/aviaoscopia.glb), simplificada e comprimida
node close-frames.cjs macacoscopio saida                                          # quadros da saída de uma demonstração (Voltar)
```

Cada `runpage` grava `saida-<camada>.png` e imprime as frações para `products.js` (`tool`/`head`: width, top, ratio; âncoras das chamadas).
Converter para o site: `ffmpeg -i x.png -c:v libwebp -quality 90 x.webp`. `plane.html?orbit=35,25` gira a câmera para conferir as peças;
`envtest.html` mostra o ambiente em três esferas.

Arquivos do site gerados aqui: `product-aviaoscopia-cutout`, `aviaoscopia` (popup), `card-aviaoscopia`, `card-preview-aviaoscopia` (384),
`aviaoscopia-front`, `aviaoscopia-back`, `aviaoscopia-ruler`, `macacoscopio-base`, `macacoscopio-head` (a foto do macaco,
`product-macacoscopio-cutout`, agora vem da foto recortada por `tools/modelo-macaco/recortar_foto.py`; veja `VITRINE-AVIAO-MACACO-QA.md`).

## Conferir a animação

`frames.cjs` abre a vitrine local (`PORT=8844`, o servidor do painel), clica na peça, pausa as animações e grava quadros em instantes exatos
(`TIMES=0,500,1000 node frames.cjs aviaoscopia saida 1440 900`; 5.º argumento `mobile`). `sheet.cjs` junta os quadros numa folha de contato.

## Macaco procedural em GLB (foi o provisório da prévia 3D)

`node export-glb.cjs macaco-procedural.glb 0.0001 monkey-glb.html` gera o macaco de `monkey.js` em GLB, com as cores pintadas
passadas para os vértices (cores fixas, nada colorível). Foi a prévia 3D do site até 02/10/2026; agora `dist/assets/models/macacoscopio.glb`
é o modelo do Meshy (`tools/modelo-macaco/meshy/`, veja `VITRINE-AVIAO-MACACO-QA.md`), então não grave por cima dele.
`glb.js` é o gravador de GLB das duas exportações.
