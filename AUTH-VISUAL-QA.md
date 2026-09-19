# Reformulação visual da conta — prévia local

Base consultada no GitHub: `9c07e313e4ef2c8b27f13b5fa8e7f5cb0fdd53aa`.
Branch local: `auth-visual-refresh`. Sem commit, push ou publicação desta alteração.
Prévia: http://127.0.0.1:4173/conta.html (servidor local `node work/serve.cjs`, na pasta de trabalho superior).

## Escopo e implementação

- Alterados: `dist/conta.html`, `dist/account.css`, `dist/account.js`.
- Criados: `dist/assets/julia-auth.png` e este relatório.
- Preservados: adaptador `auth-service.js`, catálogo, vitrine, checkout, pagamentos, modelos e personalização.
- A composição das duas últimas referências fornecidas orienta entrar/cadastro: personagem central acima do cartão, fundo blush, folhas vetoriais, corações, frases manuscritas e títulos Playfair Display. DM Sans e Parisienne reaproveitadas do site.
- Estrutura principal em fluxo normal, sem altura fixa ou rolagem interna. Cartão limitado a 480px no desktop e 580px no tablet; margens e tipografia fluidas. Decoração separada, sem eventos de ponteiro e oculta para leitores de tela.
- No celular, personagem com aproximadamente 149–177px de altura nas larguras avaliadas; frases laterais ocultas, folhas discretas, campos de 16px e controles de pelo menos 44px. Safe areas consideradas. A página pode rolar verticalmente naturalmente.
- Em notebooks, personagem e espaçamentos reduzidos conforme a altura disponível. Após o ajuste compacto solicitado, em 1366×768 a personagem, os três campos de cadastro e o botão aparecem sem rolar; o botão termina aproximadamente em y=697. Campos mantêm altura mínima de 44px.
- Personagem, cartão e fundo persistem ao alternar o estado. O seletor também mantém seu nó; a seleção desliza em 240ms e o formulário aparece em 220ms. Ambos respeitam movimento reduzido.
- Labels explícitos, ícones decorativos, autocomplete, controles de visibilidade da senha, feedback associado aos campos, indicação de processamento e foco mantidos/aprimorados.

## Autenticação existente

O projeto usa `AUTH_MODE = 'demo'`: contas em memória, sessão visual nesta aba, códigos locais e nenhum e-mail real. A reformulação não transforma esse adaptador em autenticação de produção. Os avisos de prévia e senha fictícia continuam necessários; sua exibição no formulário foi vinculada ao modo demonstrativo. Consulte `AUTH-INTEGRATION.md` antes de implementar contas reais.

## Verificações

Passaram: `node tests/account-commerce.mjs`, `node tests/commerce.mjs`, `node tests/carousel.cjs`, `node tests/plane-geometry.mjs`, sintaxe de `dist/account.js` e `git diff --check`.

No Chromium embutido:

- Login/cadastro: larguras 360, 375, 390, 412 e 430px sem overflow horizontal; campos com labels e botões com altura mínima de toque preservados.
- Cadastro: 768×1024, 1024×768, 1366×768, 1440×900 e 1920×1080 sem overflow horizontal.
- Inspeção visual em celular, tablet e desktop; ajuste compacto final conferido em 1366×768 e 390×844, com medições adicionais em 1440×900, 1920×1080 e 1366×650. Sem overflow horizontal. Em altura de 650px, o cadastro ainda precisa de cerca de 33px de rolagem para mostrar o botão inteiro. Rodapé e informações secundárias podem exigir rolagem. As regras de celular foram preservadas.
- Alternância pelos seletores; botão de senha; cadastro fictício; código incorreto com mensagem de erro; código correto; perfil; saída; entrada com credenciais fictícias; recuperação até a tela de nova senha.
- Envio de cadastro vazio ficou no formulário e focou o nome obrigatório. Tab avançou do nome para e-mail com contorno de foco.
- Nenhum erro de aplicação registrado no console durante os percursos avaliados.

Limites: não houve dispositivo físico, Safari, leitor de tela ou teclado virtual real. O respeito a `prefers-reduced-motion` foi conferido no código, sem alterar preferências do sistema. A etapa final de alteração de senha não foi enviada no navegador. Os testes automatizados existentes cobrem o desafio de recuperação. A captura de tela do navegador embutido apresentou artefatos de escala em algumas dimensões grandes; medições DOM e novas capturas foram usadas em conjunto para conferir o layout.

## Ilustração modular

A arte original `julia-3d.png` foi mantida. A ferramenta integrada de imagens (habilidade imagegen) adaptou a personagem da referência aprovada, separando-a da interface e gerando `dist/assets/julia-auth.png`, PNG com transparência real. O formulário, textos, fundo e folhas são elementos HTML/CSS/SVG independentes. O asset é substituível sem alterar os formulários.

Prompt aplicado:

> Use case: background-extraction. Edit target: the supplied approved website mockup. Extract ONLY the illustrated woman with golden brown long wavy hair, white lab coat, purple top, smiling, holding the black instrument with purple/pink butterfly in one hand and resting her cheek in her other hand, with both elbows resting on an invisible horizontal ledge. Preserve exactly her identity, expression, pose, hairstyle, proportions, illustrated rendering and butterfly instrument from the source. Remove the entire UI card, all text, all background pink shapes, all decorative hearts and plants. Output a clean high quality true transparent PNG of just the existing upper-body illustration, tightly framed with a little clear padding around hair, butterfly and elbows. Wide landscape framing matches the upper-body cutout. No lower body, no ledge/table, no white rectangle, no added elements. Preserve all hair strands and the soft clean edges of her coat. This will be placed above a real HTML form, so it must contain no lettering or interface, and the bottom edge should be the elbows/hair ending naturally as in the source.
