# Prompt mestre — Ju imprime pra mim

Você está colaborando no site **“Ju imprime pra mim”**, uma vitrine de produtos
impressos em 3D para tornar consultas oftalmológicas mais lúdicas e coloridas.
Trabalhe diretamente no repositório oficial:

- GitHub: https://github.com/automacaosaas/SitedaJu3D.git
- Branch de produção: `main`
- Produção: https://siteda-ju3-d.vercel.app/
- Baseline deste handoff: commit `64aa4ea2eed21e5714fe864a88b596d7f0bd42ac`

Antes de editar, clone o repositório ou atualize sua cópia e confirme a branch e
o estado do Git. Leia este arquivo, `QA.md` e os arquivos afetados. A branch
`main` e a URL da Vercel são a fonte compartilhada entre os dois colaboradores.
Não trabalhe sobre uma cópia antiga e não sobrescreva alterações existentes.

No começo de cada nova tarefa, recomende em uma frase o modelo e o nível de
esforço mais adequados, equilibrando qualidade e consumo. Em seguida, prossiga
com o trabalho sem interromper para pedir confirmações rotineiras. Use um modelo
mais forte para geometria 3D, interação complexa, auditoria ou decisões visuais;
use um modelo mais econômico para texto, ajustes simples e operações de Git.

## Objetivo e direção do produto

A primeira impressão do site é um banner temático: uma peça por vez, sobre uma
pilastra branca, com o fundo, o header e a seção seguinte na cor do produto
ativo. A experiência deve ser delicada, profissional, lúdica e confiável para um
público formado principalmente por profissionais da oftalmologia. O texto
principal é:

> Mais cor na consulta.  
> Mais encanto em cada olhar.

Na home ele permanece como `h1` oculto (leitores de tela); o banner mostra
categoria, nome e subtítulo do produto ativo.

Texto de apoio: “Peças lúdicas, feitas em 3D. Com as cores que você escolher.”
Não transforme a página em uma loja genérica, infantilizada demais ou carregada
de efeitos. A interação chama atenção com profundidade e movimento suave.

## Identidade visual que deve ser preservada

- Fundo rosa muito claro: `#fff7f5`.
- Painéis: `#fffcfb`.
- Texto principal: `#282326`.
- Texto secundário: `#7b7076`.
- Rosa principal: `#b64c68`.
- Rosa de apoio: `#ee96a5`.
- Linha translúcida: `#65364924`.
- Tipografia de interface: **DM Sans**.
- Títulos editoriais: **Playfair Display**.
- Frases manuscritas: **Parisienne**.
- Logotipo oficial: `dist/assets/logo-ju.png`.

Use bastante respiro, hierarquia editorial, bordas suaves e animações discretas.
Preserve contraste, legibilidade, áreas de toque de pelo menos 44 px e estados
de foco. Não altere a identidade rosa sem solicitação explícita.

Exceção pedida e aprovada: na home, cada produto tem um tema (`SHOWCASE` em
`products.js`) que colore o banner, a faixa do header, o fundo até o fim da
página e, abaixo do banner, só o que foi combinado (título e apoio da seção,
botões Personalize o seu/carrinho, categoria, valor “Categoria” e pontinhos do
carrossel do catálogo, link “Ver catálogo completo” e o rodapé). O resto do site
(modal, carrinho, Produtos e demais páginas) continua rosa. Todo tema precisa
manter contraste (texto ≥ 7:1; subtítulo e destaque ≥ 4,5:1), garantido por
`tests/carousel.cjs`. Um produto novo sem tema usa `DEFAULT_SHOWCASE`.

## Arquitetura atual

O projeto é um site estático, sem etapa de build obrigatória. Os arquivos
publicados ficam em `dist/`:

- `index.html`: estrutura do banner (`.hero-shell`), do catálogo e do modal.
- `theme.css`: identidade geral, tipografia, modal, elementos básicos e o rodapé
  compartilhado (`.site-footer`).
- `carousel.css` e `carousel.js`: banner temático de um produto por vez, fundo e
  header em degradê, pilastra em CSS, e os ajustes de cor/tamanho do catálogo
  restritos à home (prefixo `.home`).
- `hero-motion.js`: matemática pura do banner (pose, mistura de camadas e de
  cores, limiar de gesto, easing), testável em Node.
- `mobile-modal.css`: experiência própria do modal no celular.
- `products.js`: catálogo, paleta, textos, regras das partes personalizáveis e
  `SHOWCASE` (enquadramento do recorte e tema de cada produto).
- `models.js`: geometria 3D ilustrativa e grupos de materiais.
- `viewer.js`: Three.js, câmera, enquadramento, luzes e controles.
- `controller.js`: rotas por hash, modal, personalização, resumo e persistência.
- `vendor/`: Three.js e OrbitControls locais.
- `assets/`: logo e imagens de apresentação.
- `tests/`: testes de regressão executáveis diretamente com Node.js.

O rodapé (Home, Produtos, Sobre e Contato) traz “© 2026 Ju, imprime pra mim?
Todos os direitos reservados.”, o ícone do Instagram
(`https://www.instagram.com/juimprimepramim/`, nova aba com
`rel="noopener noreferrer"`) e “feito com carinho, pela Ju.” em script, como
assinatura. Mantenha os quatro iguais.

`HERO-BANNER-QA.md` documenta o banner (decisões, verificações e limites); leia-o
antes de mexer na vitrine.

Os modelos 3D atuais são prévias procedurais ilustrativas. Os STLs finais ainda
serão fornecidos. Quando chegarem, preserve os grupos de cor e adapte a câmera ao
volume real. As peças podem vir separadas por mesa/arquivo; isso é desejável
porque cada grupo precisa receber uma cor independente.

## Produtos e regras de personalização

1. **Borboletoscópio** — capa para retinoscópio.
   - Corpo: contorno, asas e antenas.
   - Detalhes: partes internas e bolinhas das asas.
   - Rosto e olhos permanecem com as cores originais.
   - Padrão atual: corpo verde-menta e detalhes amarelos.

2. **Dinossauroscópio** — capa para retinoscópio.
   - Corpo: cabeça e corpo do dinossauro.
   - Detalhes: crista e bolinhas laterais das pernas, sempre na mesma cor.
   - Olhos permanecem pretos.
   - Padrão atual: corpo azul-céu e detalhes verde-menta.

3. **Aviãoscopia** — avião magnético para régua de grau.
   - Corpo: fuselagem, asas e cauda.
   - Detalhes: estrelas e topo, sempre na mesma cor.
   - Motores: as duas peças sobre as asas.
   - Janelas prateadas da cabine, lentes e aros permanecem fixos.
   - Padrão atual: corpo azul-royal, detalhes vermelhos e motores amarelos.

A paleta atual fica em `dist/products.js`: verde-menta, azul-céu, azul-royal,
Rosa Ju, lilás, amarelo, vermelho, laranja, branco e preto. Não quebre as
seleções salvas em `localStorage` nem mude os IDs sem uma migração.

## Regras específicas do Aviãoscopia

O avião não pode aparecer como uma moldura vazia nem com um furo redondo na
base. Ele representa a régua encaixada:

- São **16 aberturas circulares**, em duas colunas de oito, simulando janelas.
- Os furos atravessam o suporte e têm aro e lente claros; não são bolinhas
  sólidas ou salientes.
- Coluna esquerda, de cima para baixo: `0.5`, `1`, `1.5`, `2`, `2.5`, `3`,
  `3.5`, `4`.
- Coluna direita, de cima para baixo: `5`, `6`, `7`, `8`, `9`, `10`, `12`,
  `15`.
- Cada valor fica ao lado da abertura correspondente e troca para texto escuro
  quando o corpo recebe uma cor clara.
- A parte inferior usa um rasgo retangular horizontal, largo e baixo, que
  atravessa a base para acomodar a haste plana da régua. Nunca desenhe uma
  bolinha, tubo ou ponto pintado nesse local.
- A imagem principal do modal é `dist/assets/aviaoscopia-regua.png`; o banner e o
  catálogo usam o recorte `dist/assets/product-aviaoscopia-cutout.png`.
- O teste estrutural é `node tests/plane-geometry.mjs`.

## Vitrine principal (banner temático)

O banner mostra um produto por vez: categoria, nome, subtítulo, a peça sobre uma
pilastra branca e o botão “Escolha sua cor” com as cores originais logo abaixo.
A troca é uma passagem lateral: peça e pilastra saem juntas, a próxima entra pelo
lado oposto, e fundo, header, textos e paleta trocam na mesma transição
(780 ms, `cubic-bezier(.22, 1, .36, 1)`). Um único valor contínuo (`position`,
em `carousel.js`) comanda tudo; a matemática pura fica em `hero-motion.js`. O
ciclo é infinito nos dois sentidos e **não há autoplay**.

A peça usa o recorte com transparência já cadastrado (`catalogImage`), sem
recolorir nem redimensionar; a pilastra é CSS (uma só para todos os produtos).
Não use `mix-blend-mode` nem fotos com fundo dentro do banner. `art` em
`SHOWCASE` (altura, folga inferior e base do recorte) assenta cada peça na
pilastra; não escreva lógica por produto no JS.

Gestos: o dedo arrasta a peça 1:1 e conclui ou retorna conforme o limiar (40 px
ou 18% do curso). A rolagem vertical continua natural (`touch-action: pan-y
pinch-zoom`); a roda do mouse só navega no gesto horizontal do trackpad. Um
arraste nunca abre o modal; um toque simples na peça abre o produto. Setas,
teclado e arraste com mouse funcionam. O tratamento de `lostpointercapture` é
intencional: ao transferir a captura implícita do toque do link para a vitrine,
o evento propagado pelo link não pode cancelar o gesto. Respeite
`prefers-reduced-motion` (só crossfade, sem translação nem escala, e o botão do
card ganha um contorno estático em vez de pulsar).

Fundo e tema: uma faixa de cor por tema (`data-hero-bg`) cobre a página inteira,
atrás do banner e do catálogo; o degradê do banner continua por baixo dele e um
véu na cor do site regula a intensidade (0% no fim do banner, 56% no miolo da
seção, 20% no rodapé). A faixa do header desce sobre o banner e some por máscara,
então **não há linha nem cantos entre header, banner e seção**. O palco do
carrossel do catálogo só recorta na horizontal, para a sombra dos cards não virar
retângulo. `--hero-h` (altura do banner) é medida no JS. As cores abaixo do banner
vêm de variáveis `--theme-*` atualizadas quadro a quadro; sem JS valem as cores
originais do site. Não altere `catalog.css` nem `catalog.js` para isso: os
ajustes ficam em `carousel.css`, sempre com o prefixo `.home`, e a página
Produtos não muda.

“Escolha sua cor” leva ao card do produto ativo no carrossel do catálogo (clique
programático no card, o mesmo caminho do toque em um card lateral), rola até ele
e faz pulsar o botão “Personalize o seu” até a pessoa interagir. Isso depende de
`data-product-id` nos cards.

Desktop (≥ 901 px): os cards do catálogo da home são um pouco menores
(ativo 352 px) para o carrossel caber inteiro ao chegar pelo botão. O celular usa
a coluna única, com o botão logo abaixo da pilastra.

## Modal e configurador

O mesmo modal tem três estados: apresentação, personalização e resumo. No
celular, ele usa quase toda a altura útil com `dvh` e safe areas. A prévia fica
estável na parte superior, somente o painel inferior de opções rola, e a ação
principal permanece acessível no rodapé. O botão de fechar fica sempre visível e
a página de fundo permanece travada.

A imagem usa `object-fit: contain`. A prévia 3D enquadra o produto completo e a
pilastra com base nos limites reais da geometria. Há giro, zoom e retorno à vista
inicial. Os controles não cobrem o objeto. A troca de parte ou cor não pode
causar salto do modal, rolagem externa ou perda de foco. O resumo lista cada
parte e a cor escolhida; essa etapa ainda não envia pedido.

## Acessibilidade e compatibilidade

- Preserve HTML semântico, nomes acessíveis e região `aria-live`.
- Teclado, setas e foco visível devem continuar funcionando.
- Respeite `prefers-reduced-motion`.
- Preserve rolagem vertical com `touch-action: pan-y pinch-zoom` na vitrine.
- Preserve rotação por toque no canvas 3D sem conflitar com o painel rolável.
- Teste Safari do iPhone e Android reais sempre que houver acesso. Emulação de
  mouse ou viewport reduzido não deve ser apresentada como teste físico.

## Validação obrigatória

Antes de publicar, execute:

```text
node tests/carousel.cjs
node tests/plane-geometry.mjs
node --check dist/carousel.js
node --check dist/hero-motion.js
node --check dist/controller.js
node --check dist/models.js
node --check dist/viewer.js
```

Faça a matriz visual descrita em `QA.md` em 360 × 800, 390 × 844 e 430 × 932,
além de notebook e desktop amplo. Valide os três produtos, os três estados do
modal, imagem e 3D, todas as partes, cores, resumo, fechamento, rolagem interna,
carrossel nos dois sentidos e ausência de erros no console. Para mudanças no
banner, siga também a matriz de `HERO-BANNER-QA.md` (1920 a 360, gestos,
movimento reduzido e o fluxo “Escolha sua cor”). Para mudanças no Aviãoscopia,
confira visualmente os 16 furos, os 16 números e o rasgo retangular.

## Processo de colaboração e Git

1. Comece com `git fetch`/`git pull` e confirme que está na base mais recente de
   `main`. Se houver mudanças locais que você não criou, preserve-as e entenda a
   origem antes de editar.
2. Para trabalho paralelo, prefira uma branch própria, com nome claro. Não use
   `reset --hard`, não reescreva histórico e não force push.
3. Faça commits pequenos, descritivos e limitados ao pedido atual.
4. Antes de integrar, rode os testes e revise o diff inteiro.
5. Envie ao responsável o hash do commit, arquivos alterados, comportamento
   final, testes executados e qualquer limite que ainda exija aparelho físico.
6. A produção oficial é a Vercel conectada à branch `main`. Após integração,
   confirme que https://siteda-ju3-d.vercel.app/ recebeu exatamente o commit.
7. Apesar de existir `.openai/hosting.json`, não migre nem publique este projeto
   em outro serviço sem solicitação explícita. O fluxo oficial atual é
   GitHub `main` → Vercel.

Antes de qualquer alteração, explique em poucas linhas o que encontrou e o que
será preservado. Durante o trabalho, dê atualizações curtas. Ao finalizar, relate
o resultado, a validação e riscos reais. Não declare “sem bugs” nem invente teste
em dispositivo físico. Se uma decisão funcional estiver ambígua, avance no que
for seguro e peça apenas a informação que realmente mudar o resultado.
