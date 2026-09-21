# QA — idiomas, e-mail de verificação e telas de progresso

Base: `0fefa63` (`feat: add storefront translations and email verification link`).
Backup antes de publicar: tag `backup/antes-idioma-email-2026-09-21` (aponta para
a `main` anterior, `0fefa63`). Como reverter: `git revert` dos commits desta entrega; nunca `reset`
nem force push.

## O que mudou

1. **Conflito de merge em produção corrigido.** `dist/theme.css` foi publicado com
   `<<<<<<< HEAD` / `=======` / `>>>>>>>`. O navegador descartava a primeira regra
   de cada lado: o seletor de idioma ficou sem `position` (por isso “bugado”) e o
   rodapé perdeu `flex-wrap`. Os dois blocos foram mantidos e os marcadores saíram.
2. **Seletor de idioma redesenhado.** Botão + menu acessível (setas, Home/End, Esc,
   clique fora, foco devolvido). Desktop: ao lado do carrinho, só a sigla. Celular:
   ao lado do menu, globo + sigla (à direita não cabe sem encostar na logo
   centralizada). Na conta, no canto direito do cabeçalho.
3. **Tradução.** A lógica pura foi para `i18n-core.js` (testável em Node). Corrigido o
   plural (“Carrinho, 1 item” ficava em português porque a regra era `itens?`).
   Novas frases: rodapé, “Escolha sua cor” e seus rótulos, setas do banner, legendas
   de imagem, título “Seu pedido”, tela Comprar agora, tudo do novo fluxo. Removida
   uma duplicata conflitante. Sugestão de idioma na primeira visita (inglês/espanhol).
4. **E-mail (Resend).** `api/auth/send-code`, `verify-code`, `health`, `email-preview`.
   Desafio assinado sem banco. Template único (3 finalidades × 3 idiomas) com o logo
   transparente. Botão e link que abrem a verificação com o código preenchido.
5. **Telas de progresso** no login, cadastro, confirmação e recuperação (coração
   “impresso” em camadas + passos), com movimento reduzido respeitado.
6. Se o servidor não estiver configurado, a conta usa o código de teste na tela
   (comportamento anterior). Erros de rede não caem nesse modo.

## Verificação

- `node tests/i18n.mjs`, `tests/email-auth.mjs`, `tests/account-commerce.mjs`,
  `tests/commerce.mjs`, `tests/plane-geometry.mjs`, `tests/carousel.cjs`,
  `tests/catalog.cjs`: todos passam.
- Teste de mutação: 15 defeitos plantados (assinatura ignorada, prazo ignorado,
  escape removido, origem sem checagem, código na resposta, plural quebrado,
  marcador de conflito, seletor nativo, segredo derivado igual à chave…) e todos
  foram reprovados.
- Chrome real (headless) contra o servidor local: cabeçalho em 1440, 1024, 801, 800,
  430, 390, 375, 360 e 320 px nas 5 páginas com cabeçalho, sem sobreposição e sem
  rolagem horizontal (exceto 1 px entre logo e carrinho em 320 px, anterior a esta
  entrega); seletor por teclado e mouse, persistência, troca celular↔desktop;
  cadastro com e-mail simulado, código errado e certo, login, link do e-mail em
  outra carga de página, link inválido, e o modo sem servidor; sugestão de idioma
  para navegadores em pt, en, es e fr.
- Auditoria de tradução no navegador: em inglês só restam nomes de produto, preços,
  marca, “Pix”, “Subtotal”/“Total” e e-mails digitados.

## Limites (declarados)

- **Sem domínio verificado no Resend** só é possível enviar ao e-mail da própria
  conta, e a chave está só em Preview (ver `RESEND-SETUP.md`). Envio real conferido em
  21/09/2026 numa prévia da Vercel: cadastro, primeiro acesso e recuperação (em
  português) chegaram a `powershop.bras@gmail.com` com status *Delivered* no Resend, e
  o botão do e-mail abriu a prévia, preencheu o código e confirmou sozinho. Não foi
  conferido como cada cliente de e-mail (Gmail, Outlook, Apple Mail) desenha o
  layout, nem as versões em inglês e espanhol na caixa de entrada.
- Não sei se o projeto da Vercel usa a raiz do repositório ou `dist/` como
  “Root Directory”. Se `/api/health` responder 404 na primeira prévia, mover `api/`
  para `dist/api/`.
- Contas continuam em memória (sem banco). Contador de tentativas, uso único do
  código e limite de envio duráveis dependem de armazenamento (`EMAIL-TEMPLATE.md`).
- O logo transparente some em fundo escuro; o e-mail fixa um cartão claro.
- Não testei em aparelho físico, Safari/iOS, leitor de tela nem em clientes de
  e-mail reais (Gmail, Outlook, Apple Mail); a renderização do e-mail foi conferida
  no Chrome.
- O Google Tradutor do navegador é um recurso do próprio Chrome e não aceita
  arquivos do site. A solução adotada é a tradução revisada do site mais a sugestão
  de idioma na entrada.
