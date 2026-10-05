# Branch `vitrine/3d-nas-consultas`: o que ficou

Feito a partir de `c73dcf4`. Os commits estão só no computador: a branch ainda não foi enviada.

## Histórico

- **2026-10-03 e 2026-10-04:** a seção "O 3D nas suas consultas" (fichas técnicas na home, com GSAP e Lenis) foi criada e refinada em cinco rodadas.
- **2026-10-04: seção retirada a pedido do dono** ("não quero mais a área de Ficha técnica"). Saíram:
  - a seção da home;
  - `fit-tour-motion.js`;
  - as bibliotecas GSAP e Lenis, com as licenças.

  O que a seção usava e continua servindo foi para `escolha.js` / `escolha.css`.
- **Mesmo dia:**
  - a paleta voltou ao "Personalizar o meu" no lugar do lápis;
  - a peça agora sai por cima do card em "Nossa coleção";
  - o menu do perfil ganhou ícone;
  - o carrinho e a página do produto foram refeitos.
- **2026-10-05 (pedidos do dono depois de testar no celular):**
  - **Página do produto, escolhendo as cores no celular:**
    - o header não aparece mais por cima da peça (era o bug de girar o modelo e subir a tela);
    - a peça fica presa no alto e, passada a paleta, vai sendo empurrada para cima junto com a rolagem, até sair (`.pl-focus`, `pin()` em `product-landing.js`);
    - ao abrir, a tela para com o botão ativo e a paleta logo abaixo da peça.
  - **"Personalizar o meu" ativo:**
    - a cor entra da esquerda como tinta (degradê das cores da loja correndo devagar sob uma trama de quadradinhos);
    - letra branca e um × que avisa que outro clique fecha.
  - **Cards da página Produtos e de "Nossa coleção":** só o relógio com "3 a 5 dias úteis" e sem "Preço ilustrativo" (os preços serão corrigidos depois).
  - **"Nossa coleção":**
    - os cards dos lados menores (80%) e recolhidos atrás do central, que ficou um pouco maior;
    - a peça do centro salta mais alto, com um leve quique. No celular ela sobe menos, para não encostar no texto.
  - **Botão do carrinho nos cards:** o carrinho dá uma volta, com um pulinho, e só depois de 0,6 s o mini-carrinho sobe.
  - **Barra do frete grátis:**
    - no mini-carrinho, sobe do valor de antes até o novo quando entra uma peça (inclusive por "Complete o kit"), com a caixa acendendo e um brilho correndo;
    - no carrinho, o mesmo acontece ao aumentar a quantidade;
    - o servidor local (`--fake-correios`) passou a usar a regra da loja (frete grátis a partir de R$ 500 no PAC e produção de 3 a 5 dias). Antes, a barra não aparecia no teste local.
  - **Recomendações do carrinho:**
    - até 3 peças e, no fim, o card "Ver mais" (página Produtos);
    - no celular, setas finas sobre a fileira, que somem nas pontas.
  - **Correção:** a fileira de recomendações alargava a página do carrinho no celular (`.cart-more` com `minmax(0, 1fr)`).
- **2026-10-05, segunda leva:**
  - **Merge da `main`** (galeria de vistas, macaco novo, painel com fluxo de caixa, desempenho) em `237ac77`. O único conflito foi em `translations.js`, e ficaram as duas listas. Backup: tag `backup/3d-nas-consultas-antes-merge-2026-10-05`.
  - **Página do produto:**
    - as cores viraram bolinhas no canto de cima da imagem (foto ou 3D): na foto mostram as originais e, personalizando, mudam na hora;
    - a lista de cores e a observação ("As janelas da cabine…") foram para "Sobre a peça";
    - saiu "valores ilustrativos nesta prévia";
    - no celular, com o header fora de cena, um carrinho flutua no canto superior direito e adiciona a peça nas cores escolhidas.
  - **Home:** saiu a nota "Preços ilustrativos…" da coleção.
  - **Carrinho:**
    - "Ver mais" pequeno, com um + num círculo fino;
    - as quatro informações lado a lado no computador, e os meios de pagamento numa faixa só;
    - os selos vêm da conta do Mercado Pago (`/api/payments/methods`, veja `MERCADOPAGO-SETUP.md`), em três grupos: Pix, Crédito e Débito (débito virtual Caixa).
  - **Mini-carrinho:**
    - "Complete o kit" mostra até 3 peças da mesma categoria da que entrou, e elas não somem depois de adicionadas;
    - o botão ganha um selo com quantas estão no carrinho, e o carrinho corre pelo botão ao adicionar;
    - a barra do frete continua subindo;
    - ao fechar, o mini-carrinho desliza para baixo (para a direita no computador) em vez de sumir.

## O que ficou

**Banner da home**
- **"Personalizar o meu"** (também na demonstração):
  - ícone da paleta, que balança no hover;
  - degradê quase imperceptível na cor da peça;
  - sombra viva (`0 10px 25px`);
  - 3% maior no hover e 98% no clique.
- **"Ver encaixado":** um link discreto com o ícone de olho, logo abaixo do botão.
- **Setas:** vidro translúcido; o chevron anda 3 px no hover. No celular, as setas ficam nas bordas da pilastra.

**"Nossa coleção" (home)**
- **Cores dos cards:**
  - só o card do centro ganha a cor exclusiva da peça (o degradê do banner);
  - os laterais ficam no tom da página;
  - as cores deslizam na troca (`@property --rail-*`).
- **A peça sai por cima do card,** com o fundo transparente (`translateY(-17%) scale(1.15)`). A parte de baixo continua com as descrições. A margem de cima do carrossel abre espaço para as antenas.
- **Onde mexer:**
  - `railTone` em `dist/catalog.js`;
  - o bloco no fim de `dist/carousel.css`.

**Menu do perfil**
- "Entrar ou cadastrar" / "Minha conta" com o ícone de perfil (`site-shell.js`).

**"Voltar à vitrine"**
- Vidro sutil, seta fina e efeito ímã com o mouse (`journey.css` e `site-shell.js`).

**Carrinho** (`cart-view.js`, `cart-page.css`, `payment-marks.js`)
- **Resumo do pedido:** sem "Compra segura" e "Produção sob demanda".
- **Depois do resumo, na largura toda:**
  - **"Você também pode gostar"** ("Comece por uma destas" com o carrinho vazio):
    - as peças que ainda não estão no carrinho, cada uma na cor dela, levando à sua página;
    - no celular, uma fileira que desliza de lado.
  - **Quatro linhas com ícone,** cada uma com link para a política:
    - entrega (`termos.html#producao`);
    - formas de pagamento (`#precos`);
    - feito sob encomenda;
    - trocas (`trocas.html`).
    
    Os textos dizem só o que os Termos dizem.
  - **"Métodos de pagamento aceitos":**
    - Pix, Visa, Mastercard, American Express, Elo e Hipercard;
    - com "Pagamento processado pelo Mercado Pago".
    - Os desenhos de Visa, Amex e Mercado Pago são do simple-icons 16.34.0 (CC0). O Pix é o símbolo oficial. Mastercard são os dois círculos. Elo e Hipercard estão escritos por extenso.

**Página de cada peça** (`borboletoscopio.html` etc.; gerada por `tools/build-product-pages.cjs`, com `product-landing.js` e `product-landing.css`)
- **Ordem, de cima para baixo:**
  1. a peça;
  2. a categoria, uma vez só, como selo;
  3. nome e subtítulo;
  4. preço, com o Pix em destaque;
  5. as cores originais em bolinhas clicáveis;
  6. **"Adicionar nas cores originais"** (principal) e **"Personalizar o meu"** com a paleta (secundário);
  7. acordeões: Feito sob encomenda, Envio e Trocas;
  8. "Sobre a peça" com a descrição.
- **3D / 360°:**
  - "Foto | Girar em 360°" troca a foto pelo modelo 3D do configurador (`viewer.js`, GLB), que gira sozinho até o primeiro toque;
  - o 3D não prende a rolagem: sem zoom pela roda e, no celular, arrastar na vertical rola a página;
  - para de girar fora da tela;
  - carrega só quando é pedido.
- **"Personalizar o meu"** abre a escolha das cores logo abaixo dos botões:
  - abas das partes e as 12 cores;
  - cada cor pinta o modelo na hora;
  - o título vira "Suas cores" e o botão vira "Adicionar com estas cores";
  - o carrinho recebe as cores e a miniatura do 3D;
  - "Restaurar cores" volta às originais.
  
  No celular, enquanto a paleta está à vista, a peça fica presa no alto, menor.
- **Ao adicionar:** o botão pulsa e um check se desenha ("Adicionado"); o mini-carrinho abre 0,65 s depois.
- **Sem JavaScript:** a página continua como antes (foto, link para o configurador da vitrine e o botão do mini-carrinho).
- **Import map:** a página carrega o mesmo da home. O hash dele já estava na política de segurança.

**Página "Escolha o seu" e o filtro `produtos.html?encaixe=`**
- Continuam no ar (`escolha.js`, `escolha.css`, `escolha.html`, sitemap).
- Hoje **nenhuma página aponta para `escolha.html`**: o link vinha da seção retirada. Fica a decisão do dono: linkar em algum lugar ou retirar.

## Onde mexer

- **Textos novos:** `dist/translations.js` (PT|EN|ES).
- **Depois de mudar dados ou textos das páginas de produto:** rode `node tools/build-product-pages.cjs`. `tests/product-landing.mjs` falha se ficar desatualizado.
- **Famílias de encaixe:** `FAMILIES` em `dist/products.js`. O enquadramento da figura da Escolha o seu fica em `FIT`, em `dist/escolha.js`.

## Verificação (2026-10-04)

- **`npm test`:** 35 suítes verdes. Novidades nos testes:
  - `tests/escolha.mjs`: home sem a seção e arquivos removidos;
  - `tests/storefront.mjs`: carrinho com recomendações, informações e selos;
  - `tests/product-landing.mjs`: ordem da página, selo único, acordeões, import map e as regras do 3D e do carrinho.
- **No Chrome headless (1440×900, 1280×800 e 390×844):**
  - **carrinho cheio e vazio:** sem o bloco antigo, recomendações certas e selos;
  - **página do produto:**
    - 3D carregando;
    - cores trocando chips, título, botão e modelo;
    - carrinho com as cores escolhidas e a miniatura;
    - check desenhando;
    - mini-carrinho;
    - acordeão;
    - peça presa no alto no celular, soltando depois da paleta;
    - avião com 3 partes em inglês;
  - **console limpo.**
- **Não testado:** Safari/iOS e aparelho físico.

## Em aberto

- **Escolha o seu:** linkar ou retirar (veja acima).
- **Girafa e unicórnio:** entram quando forem entregues.
