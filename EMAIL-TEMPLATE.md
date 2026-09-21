# E-mail de código — Ju imprime pra mim

O template em dist/email/verification-code.html é uma base responsiva e segura
para e-mails de confirmação de cadastro e recuperação de senha. Ele usa o
logotipo oficial e a paleta da Ju.

## Campos para o servidor preencher

- {{PREHEADER}}: resumo curto visível na caixa de entrada.
- {{FIRST_NAME}}: primeiro nome do cliente, já escapado para HTML.
- {{MESSAGE}}: mensagem de confirmação de e-mail ou redefinição de senha,
  também escapada para HTML.
- {{CODE}}: código numérico de uso único.
- {{EXPIRY_MINUTES}}: prazo real configurado pelo servidor.
- {{VERIFY_URL}}: URL HTTPS absoluta da página de verificação da conta, no domínio da loja. Escapar para atributo HTML e validar a origem no servidor. Nunca incluir senha ou o código numérico na URL. No fluxo atual, usar https://siteda-ju3-d.vercel.app/conta.html#verificar. A prévia usa a conta no mesmo ambiente.

O botão “Verificar conta”, abaixo da validade, volta ao site para digitar o código;
o clique sozinho não valida a conta. Na integração futura, essa rota deve recuperar
o desafio de verificação de forma segura, inclusive quando aberta em outro dispositivo.

O código não deve ser criado, guardado ou validado no navegador. Na integração
real, o servidor envia a versão já preenchida, define expiração, limite de
tentativas e reenvio, e registra somente o necessário para validar o desafio.

Para o fluxo atual de demonstração, o prazo visual é de 10 minutos. O template
não envia e-mail por conta própria; ele fica pronto para o serviço de
autenticação/e-mail que será conectado ao banco.
