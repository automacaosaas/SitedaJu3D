# Catálogo separado e Julia estática — 18/09/2026

Publicação autorizada pelo responsável após apresentação da prévia local:
“Ok, pode subir, mas salva a versao antiga, para caso eu queira voltar para ela”.

## Backup e retorno

A tag anotada `backup/antes-catalogo-2026-09-18` foi enviada e conferida no GitHub
antes da atualização de main. Ela aponta para a produção anterior:
`d02e77720bf7f07edcf5bdcc9f0a20be26090f2e`.

Para voltar, criar um commit de reversão da mudança de catálogo, testar e enviar
à main pelo fluxo normal GitHub → Vercel. Usar `git revert` do commit de
publicação, após revisar alterações posteriores, sem reset nem force push.
A tag preserva os arquivos anteriores mesmo após novas alterações em main.
Esse backup cobre o site versionado; não representa backup de um banco externo.

## Alterações

- Julia estática, sem textos promocionais ou controle de pausa. Saudação com o
  primeiro nome da sessão acima da personagem; perfil mantém o painel direito.
- `produtos.html` separado, categorias Oftalmologia e Sensoriais (em breve).
- Carrossel de cards na home, com setas e rolagem horizontal. Arraste com mouse
  captura o ponteiro somente após movimento; toque usa rolagem nativa.
- Produto/legenda abre personalização; botão adiciona cores padrão ao carrinho.
- Novas imagens de catálogo em fundo branco, sem alterar imagens da vitrine.
- Navegação da conta e do carrinho aponta para a página de produtos.

Na revisão para publicação, foram corrigidos: setas ocultas em larguras menores;
captura prematura que desviava cliques no catálogo; regras móveis herdadas dos
cards antigos; animação residual das asas decorativas; cabeçalho apertado no
catálogo móvel; sombra retangular causada pelo filtro sobre PNG opaco.

A primeira imagem isolada do Aviãoscopia usava o arquivo antigo com moldura
vazia. Foi substituída por uma edição de `assets/aviaoscopia-regua.png`, mantendo
as 16 lentes/aros em duas colunas de oito, os números e o rasgo retangular.

## Validação executada

- `node tests/carousel.cjs`
- `node tests/plane-geometry.mjs`
- `node tests/commerce.mjs`
- `node tests/account-commerce.mjs`
- `node --check` em todos os módulos JS de dist, incluindo carousel, controller,
  models, viewer, catalog, account, checkout e site-shell.
- `git diff --check`.

Todos passaram. Navegador Chromium: 360 × 800, 390 × 844, 430 × 932,
1366 × 650 e 1920 × 1080. Em cada medida, os três produtos foram abertos pelo
catálogo, passando por imagem, personalização 3D e resumo. Cada parte recebeu
uma cor e foi restaurada; fechamento e reabertura funcionaram. Capturas da
prévia 3D mostraram peças e pilastras enquadradas. Giro, zoom e retorno à vista
inicial foram exercitados nos tamanhos de computador. Corpo branco do avião foi
conferido em 390 × 844. Botão principal móvel dentro da tela e sem overflow
horizontal nos pontos medidos.

Conta e catálogo inspecionados nas cinco medidas. Imagens carregadas;
Oftalmologia/Sensoriais alternam corretamente. Adição direta pela home abriu o
carrinho com a borboleta nas cores padrão e preservou o avião existente.
Seta do catálogo móvel deslocou a faixa e o clique no avião abriu seu modal.
Nenhum erro/aviso de aplicação registrado no console desses percursos.

## Limites

Não houve teste em iPhone/Android físicos, leitor de tela ou WebGL desabilitado.
Toque físico e inércia nativa continuam sujeitos a conferência em aparelho.
Autenticação, códigos, pedidos e pagamento permanecem demonstrativos, aguardando
integração com backend. Os testes de autenticação são automatizados; a jornada
completa de cadastro/recuperação não foi repetida visualmente nesta publicação.
As miniaturas personalizadas anteriormente salvas no carrinho são preservadas.

## Imagem corrigida

Ferramenta integrada imagegen, edição precisa do objeto. Arquivo final:
`dist/assets/catalog-aviaoscopia.png`. Instrução: remover apenas a pilastra,
usar fundo branco, preservar avião azul-royal, topo/estrelas vermelhos, motores
amarelos, cabine prateada, exatamente 16 lentes/aros e números na ordem original
(esquerda 0.5/1/1.5/2/2.5/3/3.5/4; direita 5/6/7/8/9/10/12/15), mantendo
o rasgo retangular inferior. O resultado foi inspecionado antes de integrar.
