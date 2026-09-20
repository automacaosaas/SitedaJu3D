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

O código não deve ser criado, guardado ou validado no navegador. Na integração
real, o servidor envia a versão já preenchida, define expiração, limite de
tentativas e reenvio, e registra somente o necessário para validar o desafio.

Para o fluxo atual de demonstração, o prazo visual é de 10 minutos. O template
não envia e-mail por conta própria; ele fica pronto para o serviço de
autenticação/e-mail que será conectado ao banco.
