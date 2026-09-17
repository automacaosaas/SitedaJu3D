# Validação do protótipo de compra

Data: 17/09/2026. Ambiente: servidor local http://127.0.0.1:4173/, navegador Chromium embutido no Codex. Base de produção não alterada.

## Automação executada

- `node tests/commerce.mjs` — PASS: persistência, escolhas dos três produtos, agrupamento, edição sem duplicar, quantidade, totais em centavos, dados locais inválidos, falha de armazenamento, snapshot do pedido, expiração/renovação/aprovação Pix, cartão e recusa de aprovação no modo real.
- `node tests/carousel.cjs` — PASS: dois ciclos, direção inversa, gesto vertical, cancelamento, limiar, supressão de clique, toque central/lateral, setas, teclado e movimento reduzido. Eventos simulados.
- `node tests/plane-geometry.mjs` — PASS: 16 aberturas, sequência dos graus, canal retangular inferior, contraste dos rótulos e materiais fixos.
- Verificação de sintaxe dos módulos JavaScript novos e alterados; revisão de whitespace do diff.

## Percurso de navegador executado

| Verificação | Resultado |
|---|---|
| Borboleta com corpo rosa/lilás e detalhes azul/branco | Cores mantidas na sacola e no resumo |
| Dinossauro azul com crista e bolinhas rosa | Seleção e miniatura presentes |
| Avião azul, estrelas/topo rosa, motores amarelos | Três grupos registrados na sacola |
| Recarregar a sacola | Itens, quantidade e cores preservados |
| Incrementar quantidade e editar borboleta | Um item com quantidade 2; troca de corpo sem duplicação |
| Remover último item | Estado vazio e link para voltar à coleção |
| Pedido com borboleta e dinossauro | Dois itens distintos e total demonstrativo R$286 com entrega |
| Enviar formulário vazio | Bloqueado; foco no primeiro campo obrigatório |
| WhatsApp formatado com DDD | Aceito pelo formulário |
| Pix aguardando | Código de demonstração, temporizador e escolhas presentes |
| Copiar código Pix | Confirmação visível, sem código bancário real |
| Expirar e renovar Pix | Estado expirado; novo código de tentativa sem perder os itens |
| Aprovar Pix | Confirmação demonstrativa; sacola limpa; resumo preservado no pedido |
| Cartão recusado | Mensagem e possibilidade de nova tentativa/alteração de método |
| Cartão aprovado | Confirmação com forma de pagamento; nenhum campo de cartão presente |
| Navegação por teclado | Tab no atalho do resumo com contorno visível; foco nos títulos ao mudar etapa |
| Console | Nenhum erro de aplicação registrado durante os fluxos testados |

## Responsividade

- 390×844: fluxo completo Pix (incluindo expiração/renovação/confirmação), carrinho, edição, formulário e resumo.
- 360×800 e 430×932: carrinho e entrega; sem overflow horizontal, com rótulos nos campos e acesso ao resumo.
- 1440×1000 / 1440×1200: composição em duas colunas, miniaturas, resumo, checkout e fluxo de cartão.
- Capturas existentes em `outputs/checkout-prototipo` na raiz do workspace: carrinho desktop/mobile, entrega mobile, Pix mobile, cartão desktop e `responsividade.json`.

## Ajuste encontrado e corrigido

A captura do canvas móvel carregava o enquadramento estreito da prévia e tornava a peça pequena na sacola. A miniatura agora usa câmera ortográfica quadrada com limites do modelo e da pilastra; restaura o renderer após a captura. O modelo em si não foi alterado.

## Limites da evidência

Esta validação não usou iPhone/Android físicos nem leitor de tela real. Viewports reduzidos não equivalem a teste de toque nativo em Safari. O carrossel tem testes de eventos simulados, e a navegação por setas/modal foi exercitada no navegador. O respeito a movimento reduzido vem das regras CSS existentes e da nova regra para a animação de espera; não foi feita uma auditoria completa de acessibilidade.

Pagamentos são simulações locais. Nenhum provedor, banco, webhook ou cotação de frete foi acionado. A matriz Pix é apenas ilustração e o texto de copia e cola é explicitamente não bancário. Pagamento confirmado não marca preparação/envio como concluídos.

## Revisão sugerida pelo responsável

1. Abrir a coleção local, personalizar qualquer peça, concluir e adicionar à sacola.
2. Rever tamanhos, identidade e resumo das cores, sobretudo no celular.
3. Testar checkout com dados fictícios e escolher Pix/cartão.
4. Confirmar textos, preços finais, frete, prazo e WhatsApp.
5. Aprovar explicitamente as alterações antes de qualquer commit/push/deploy.
