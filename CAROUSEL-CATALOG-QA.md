# Publicação do carrossel de catálogo

Publicação autorizada após apresentação da prévia local: “pode subir”.
Base confirmada por fetch: `9c07e313e4ef2c8b27f13b5fa8e7f5cb0fdd53aa`.
Backup anterior à publicação: `backup/antes-carrossel-catalogo-2026-09-19`.
Para retornar, revisar commits posteriores e criar um revert do commit desta
publicação; não usar reset ou force push.

## Escopo

- Carrossel compartilhado entre a home e a página Produtos, com destaque central,
  setas, indicadores, teclado, arraste e navegação horizontal por trackpad.
- Categorias e cores provenientes de products.js; preços de commerce-config.js.
- Imagens cadastradas em products.js, também no fallback das miniaturas do carrinho.
- Vitrine principal, modelos, regras de cores e controlador do modal sem mudanças.
- Revisão pré-publicação: altura suficiente para os botões dos cartões, alvos de
  toque de 44 px nos indicadores, cancelamento correto de gestos e bloqueio de
  cliques após arraste antes de alcançar os handlers do modal ou carrinho.

## Verificações executadas

- Testes Node: catalog.cjs, carousel.cjs, plane-geometry.mjs, commerce.mjs e
  account-commerce.mjs. Sintaxe de todos os módulos JS em dist; git diff --check.
- O novo teste exercita os handlers reais do catálogo com eventos simulados:
  ciclos com 1/2/3/7 itens, gestos cancelados/curtos/verticais, supressão de clique,
  transferência de captura, setas, teclado e bloqueio do arraste nativo de imagens.
- Chromium em 360 × 800, 390 × 844, 430 × 932, 1366 × 650 e 1920 × 1080:
  cada cartão centralizado por indicador; imagens carregadas, ações dentro da
  área do carrossel, indicadores com 44 px e ausência de overflow horizontal.
- Nos mesmos cinco tamanhos, os três produtos passaram por apresentação,
  personalização/3D e resumo. Cada parte recebeu outra cor e retornou à seleção
  anterior. Canvas presente, quantidade correta de partes no resumo, fechamento
  e botão de compra dentro da tela. Nenhum erro/aviso registrado no console.

## Limites

A matriz usa viewport de navegador e inspeção de DOM. Não equivale a teste em
aparelho físico ou inspeção visual exaustiva dos modelos. Toque nativo em iPhone/
Android, leitor de tela, giro/zoom e WebGL indisponível não foram repetidos nesta
publicação. Os testes anteriores desses recursos continuam em QA.md.
Autenticação e pagamentos seguem demonstrativos, aguardando backend.
