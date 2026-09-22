# Painel da Ju

Um painel interno para a Ju acompanhar os pedidos, sem precisar mexer em código. Protótipo de layout: por enquanto
não existe um banco de dados — os pedidos ficam guardados no navegador que fez a compra (ver "Limitação" abaixo).

## O que ele faz

- **Login** com e-mail e senha (conferidos no servidor; a senha nunca aparece no código do site).
- **Pedidos pendentes** (tela inicial): toda compra aprovada — de teste ou real — entra aqui automaticamente.
- Em cada pedido: peças, cores escolhidas, cliente, WhatsApp, endereço de entrega e observações.
- **Marcar como concluído** ou **Recusar pedido** (com motivo opcional, visível só para a Ju). Pedidos concluídos e
  recusados ficam em abas separadas, com um botão para reabrir se for engano.
- **Gráfico** do faturamento dos últimos 14 dias.
- **Calendário**: clique num dia para ver os pedidos e o total daquele dia.
- Cada pedido mostra uma etiqueta de origem — **Demonstração**, **Teste Mercado Pago** ou **Pedido real** — para
  nunca confundir um teste com uma venda de verdade.

## Como entrar

**Local:** `node tools/dev-server.cjs` (com ou sem `--fake-mp`) já libera `http://localhost:8844/admin.html` com um
acesso fixo: e-mail `ju@exemplo.test`, senha `12345678` (aparece no terminal ao iniciar). Para usar outro e-mail/senha
localmente, defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` antes de rodar.

**Nas prévias e no site publicado:** crie duas variáveis de ambiente na Vercel (mesmo caminho das outras: projeto
`siteda-ju3-d` → Settings → Environment Variables), marcando **Preview** (e Production só quando quiser):

| Nome | Valor | Sensível? |
|---|---|---|
| `ADMIN_EMAIL` | o e-mail que a Ju vai usar para entrar | não |
| `ADMIN_PASSWORD` | a senha dela | **sim** |

Nenhuma outra configuração é necessária — o painel reaproveita a mesma chave de assinatura já usada para os códigos
de verificação por e-mail (`AUTH_SECRET` ou, na falta dela, a derivada de `RESEND_API_KEY`).

## Como a segurança funciona (sem banco de dados)

- O e-mail e a senha ficam só nas variáveis de ambiente do servidor — nunca no código, nunca no GitHub.
- Ao entrar, o servidor devolve um token assinado (do mesmo jeito que os códigos de verificação por e-mail), válido
  por 12 horas. O navegador guarda só esse token; a senha nunca volta a aparecer.
- Todo login errado é limitado (tentativas por IP e por e-mail), para dificultar tentativas repetidas.

## Limitação combinada com a proposta ("layout antes do banco de dados")

Os pedidos ficam no armazenamento do navegador (`localStorage`), exatamente como o carrinho de demonstração. Isso
quer dizer:

- Um pedido só aparece no painel se for aberto **no mesmo navegador/computador** onde a compra foi feita.
- Limpar os dados do navegador apaga o histórico de pedidos do painel.
- Pedidos de demonstração, de teste e reais convivem no mesmo painel (por isso a etiqueta de origem em cada um).

Quando um banco de dados de verdade for conectado, só o arquivo `dist/admin-store.js` muda — o resto do painel
(tela, gráfico, calendário, ações) continua igual.

## Testes

`node tests/admin.mjs` cobre o login/sessão no servidor (senha, limites, token assinado) e a "loja" de pedidos no
navegador (gravação sem duplicar, mudança de status, totais por dia). O fluxo completo (entrar, receber um pedido de
teste, concluir, recusar, ver o gráfico e o calendário) foi conferido no navegador; veja `MERCADOPAGO-SETUP.md` para
como simular uma compra localmente.
