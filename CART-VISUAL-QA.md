# Carrinho — reformulação visual local

Base: `7a78d10` da `origin/main`, incluindo o header responsivo e as páginas de informação do colaborador. A atualização foi incorporada antes da edição. Esta reformulação foi validada localmente e aprovada para publicação.

Prévia: http://localhost:4173/checkout.html. O cenário de teste usa a origem `localhost`, separada do carrinho já existente em `127.0.0.1`.

## Implementação

- `dist/cart-view.js`: apresentação reutilizável dos itens, swatches, seleção, estado vazio e resumo. Recebe o carrinho e o conjunto de IDs selecionados; não cria outro store ou configurador.
- `dist/cart-page.css`: composição responsiva específica do carrinho. Duas colunas acima de 900px, uma abaixo; ajustes intermediários até 1150px e compactação até 600px. Resumo sticky somente no desktop. Largura máxima de 1148px.
- `dist/checkout.js`: usa a nova apresentação e reposiciona o mesmo indicador de etapas ao alternar carrinho/entrega. Eventos e cálculos existentes mantidos.
- `dist/checkout.html`: reutiliza o header `.header`/`site-shell.js` recém-aprovado, dentro de `.page` para a proteção de foco do menu móvel. Remove o rodapé decorativo dessa página; importa os estilos do carrinho.
- `dist/comprar-agora.html`: carrega os mesmos estilos para o estado de carrinho vazio usado pelo fluxo direto.
- `dist/icons.js`: acrescenta lápis, cadeado e caminhão ao sistema SVG existente.

### Dados e comportamento

- Seleção continua em um único `Set` de IDs em `checkout.js`, com `selectedItems` de `cart-store.js`. Selecionar todos conta linhas/configurações; o resumo e o badge contam unidades. O seletor geral tem estado parcial (indeterminate).
- Subtotal, frete e total usam `totals()`. Valores unitários e prazo vêm de `COMMERCE`; nenhum preço da imagem foi fixado no componente.
- O lápis circular e o link de edição usam o mesmo `data-action="edit"`: gravam apenas o ID em `EDIT_KEY` e abrem o configurador existente em `index.html#produto/...`. `cart-bridge.js` restaura as cores e preserva a quantidade. Nesse contexto, o resumo apresenta apenas “Salvar e voltar ao carrinho”, com retorno automático após salvar. Fechar pelo X ou Escape retorna ao carrinho sem salvar alterações no item. O fluxo normal continua com Adicionar ao carrinho e Comprar agora. `shopping.css` permite que a ação única ocupe toda a largura no celular.
- Swatches usam `PRODUCTS[item.productId].parts` e `color(item.selection[part.id])`. Só partes personalizáveis aparecem; o nome da parte e da cor fica disponível no label acessível e tooltip.
- A imagem de cada card vem do asset original de `PRODUCTS.image`, igual ao catálogo, com `object-fit: contain`, sem recoloração, filtro ou geração de imagem. A fotografia mantém suas cores originais; a combinação escolhida aparece nas bolinhas. A captura 3D existente continua disponível no resumo de entrega, sem mudar seu funcionamento.
- Pix e Cartão ficam no final do resumo, após Compra segura e Produção sob demanda. O banner de demonstração e “(exemplo)” no frete/prazo permanecem. Não foram habilitados pagamentos reais nem um serviço novo de segurança/autenticação.
- A frase “feito com carinho, pela Ju.” e sua substituta decorativa não aparecem em `checkout.html`.
- Estado desmarcado com borda tracejada, ações desabilitadas quando nada está selecionado, foco visível, quantidade limitada pelo store e alvos de toque dos controles principais de 44px. Operações do carrinho são síncronas; o fluxo de pagamento mantém seu bloqueio assíncrono existente.

## Verificações

Testes existentes passaram: `node tests/commerce.mjs`, `node tests/account-commerce.mjs` e `node tests/catalog.cjs`. Sintaxe dos módulos e `git diff --check` conferidos.

No Chromium embutido, com carrinho de teste separado:

- Adição dos três produtos reais pelo catálogo/configurador e total de R$ 445,00 (inclui o frete demonstrativo de R$ 18,00).
- Seleção individual, seleção geral, desmarcar todos, estado parcial e CTA desabilitado com total zero.
- Seleção de avião e dinossauro: R$ 298,00 + R$ 18,00 = R$ 316,00. “Finalizar pedido” abriu entrega só com essas duas peças; retorno ao carrinho manteve a seleção.
- Quantidade do avião de 1 para 2: R$ 318,00 + R$ 18,00 = R$ 336,00. Redução novamente para 1 também verificada.
- Edição pelo lápis no celular: corpo do avião azul-royal restaurado; alteração para lilás salva; retorno mostrou lilás/vermelho/amarelo e preservou quantidade 2. Fotografia original preservada.
- Remoção coletiva de borboleta e dinossauro preservou o avião desmarcado; remoção individual do avião mostrou estado vazio. Reposição de um avião para a prévia final.
- Menu móvel abriu, navegou para Produtos e fechou por Escape, devolvendo foco ao botão de abertura; menu de perfil abriu e fechou.
- Medidas em 360, 375, 390, 412, 430, 768, 820, 1024, 1366, 1440, 1600 e 1920px: sem overflow horizontal da página/header e sem sobreposição de imagem, quantidade e preço. Capturas revisadas em desktop e mobile; texto e valores legíveis, layout com proporções limitadas no desktop.
- Pix, Cartão, Compra segura e Produção sob demanda presentes; encerramento sem a frase decorativa.

Limitações: validação em viewports do Chromium, sem aparelho físico, Safari ou leitor de tela real. O site continua demonstrativo: frete, preços, prazo e meios de pagamento dependem da integração futura. A busca não existe no header compartilhado; não foi acrescentada uma ação sem função. Fotos não simulam as cores escolhidas, como solicitado; o configurador 3D existente permite conferi-las.

## Ajuste do retorno da edição

Validado no navegador: salvar sem alterar cores retorna automaticamente ao carrinho, com o mesmo item e quantidade; alterar a cor e fechar no X retorna preservando a combinação anterior do carrinho; Escape no resumo também retorna. Em 390×844, somente “Salvar e voltar ao carrinho” aparece na área de compra e ocupa sua largura inteira. Abrir o produto pela vitrine continua mostrando as duas ações normais. Arquivos adicionais desse ajuste: `dist/cart-bridge.js` e `dist/shopping.css`.
