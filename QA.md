# Validação da vitrine e personalização

Execute `node tests/carousel.cjs` antes de publicar mudanças de interação.
O teste usa o controlador real com eventos simulados e cobre o ciclo infinito,
arraste nos dois sentidos, cancelamento, limiar mínimo, prevenção de clique,
seleção lateral, setas, teclado e movimento reduzido.

Execute também `node tests/plane-geometry.mjs` ao alterar o Aviãoscopia. O
teste confirma as 16 aberturas atravessando o suporte, a ordem dos graus,
o canal retangular aberto para a haste plana e o contraste da numeração.

## Regressão de toque

Um toque tem captura implícita no elemento inicial. Ao transferir a captura
para a vitrine, o elemento anterior emite `lostpointercapture`, que pode
propagar até a vitrine. Esse evento não deve cancelar o gesto: somente a perda
real da captura da própria vitrine deve cancelá-lo. O teste reproduz ambos.
Ele não substitui um teste em aparelho físico ou um navegador com toque nativo.

## Matriz visual obrigatória

Validar primeiro 360 × 800, 390 × 844 e 430 × 932; depois desktop amplo.
Em cada tamanho e em cada um dos três produtos:

- Abrir imagem, personalização/3D e resumo; editar e voltar.
- Conferir peça completa, fechamento e ação principal dentro da tela.
- Escolher cada parte e uma cor; conferir a prévia e o resumo.
- Rolar as opções: somente o painel inferior deve rolar; a prévia e os
  botões externos permanecem imóveis. Não pode haver salto ao selecionar cor.
- Fechar e reabrir: o modal fechado não pode aparecer sobre a vitrine,
  e a posição anterior da página deve ser restaurada.
- Conferir rotação, zoom, retorno à vista inicial e ausência de erro WebGL.

Na vitrine, conferir as duas peças laterais reconhecíveis, fundo integrado
ao rosa e pilastras preservadas. Arrastar nos dois sentidos por pelo menos
dois ciclos: nunca abrir modal durante o arraste. Tocar na peça central abre;
tocar na lateral centraliza. Testar setas, teclado e movimento reduzido.
No iPhone Safari e no Android, conferir arraste com um dedo e rolagem vertical
natural, inclusive começando sobre a imagem e sobre a legenda.

## Estrutura a preservar

- O modal móvel usa altura dinâmica e três áreas: prévia, painel rolável e ação.
- A câmera enquadra os limites do produto e da pilastra conforme o espaço real.
- Texto de anúncio acessível não pode aumentar a área rolável do modal.
- Regras de cores permanecem em `dist/products.js`; modelos em `dist/models.js`.
- Não substituir as imagens nem redesenhar os produtos para corrigir layout.
- O Aviãoscopia usa duas colunas de oito aberturas, numeradas na ordem definida
  em `dist/models.js`, e um rasgo inferior retangular que atravessa a base.
- Confirmar o commit publicado na Vercel e testar a URL de produção.

## Limites da validação desta correção

Os testes de eventos são simulados. A matriz móvel foi validada em navegador
Chromium com viewport reduzido; não houve acesso a iPhone/Android físicos.
A confirmação final do comportamento nativo nesses aparelhos permanece uma
verificação manual, sem alegação de teste realizado em Safari real.
