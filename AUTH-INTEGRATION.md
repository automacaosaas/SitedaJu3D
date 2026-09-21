# Conta: prévia e integração futura

Esta entrega é uma **interface demonstrativa local**, conforme a orientação de
integrar o banco quando estiver pronto. Não é autenticação de produção.
Nenhum código é enviado por e-mail, nenhuma senha real deve ser usada e nenhuma
aprovação de pagamento local autoriza produção ou envio.

## Arquivos e contrato

- `conta.html`, `account.css`, `account.js`: apresentação, formulários e estados.
- `auth-service.js`: adaptador demonstrativo que deverá ser substituído.
- `site-shell.js`: perfil, entrada, pedidos e saída no cabeçalho.

Métodos assíncronos atualmente usados pela interface:

| Método | Entrada | Resultado esperado |
|---|---|---|
| begin | email | desafio de acesso (mesma resposta para conta nova ou existente) |
| completeRegistration | name, password, marketingOptIn | usuário público, após código confirmado |
| login | email, password | usuário público (name, email) |
| forgot | email | desafio de recuperação, mensagem não reveladora |
| resend | desafio atual | novo prazo de validade e reenvio |
| verify | code | usuário confirmado OU permissão temporária de cadastro/redefinição |
| reset | password | confirmação de alteração |
| signOut | sessão atual | sessão encerrada |
| cancel | desafio atual | descarta desafio e permissões temporárias |

O fluxo começa por e-mail e confirmação do código. Se a conta já existe, entra;
se é nova, pede somente nome e senha. A opção de usar senha permanece na etapa de
código. O consentimento promocional começa desmarcado. Não há cadastro de pessoa
jurídica. Nome/e-mail da sessão demonstrativa preenchem a entrega; localização,
endereço e telefone ainda não são persistidos. `register` existe apenas para
compatibilidade com testes do adaptador anterior.

O desafio da prévia inclui `email`, `purpose`, `expiresAt`, `resendAt` e
`demoCode`. **Nunca retornar um código real para o navegador.** Na integração,
remover a caixa de código demonstrativo e usar um identificador opaco do desafio,
validado no servidor. A concessão temporária de redefinição também deve pertencer
ao servidor, ser curta, de uso único e vinculada ao desafio verificado.

## O que está simulado

- Contas e hashes demonstrativos ficam apenas em memória na página: recarregar
  ou navegar para outro documento descarta as credenciais de teste.
- O hash simples do protótipo não é uma estratégia de armazenamento de senhas
  para produção.
- `ju.account.preview.v1` em sessionStorage é apenas nome/e-mail, preferência
  promocional e uma marca de
  interface. Não prova identidade, não autoriza acesso e pode ser alterado pelo
  próprio navegador.
- Códigos têm seis dígitos, validade de dez minutos, cinco tentativas e intervalo
  de trinta segundos para reenvio. Essas verificações locais são apenas de UX.
- `ju.orders.preview.v1` guarda no máximo vinte resumos de pedidos de teste nesta
  aba, sem endereço, telefone ou senha. Não é histórico protegido por usuário.
- `ju.direct.demo.v1` guarda a combinação temporária de Comprar agora, separada
  do carrinho existente.

## Antes de habilitar contas reais

1. Definir API/serviço de autenticação e serviço de entrega de e-mail.
2. Transferir credenciais, desafios, expiração, limites de tentativas/reenvio e
   autorização para o servidor; não confiar em sessionStorage/localStorage.
3. Implementar sessão segura e revogação no logout/redefinição. Não enviar
   segredos administrativos ou credenciais de e-mail no código publicado.
4. Vincular cada pedido ao usuário autenticado e autorizar sua leitura no
   servidor. Substituir `readDemoOrders` por consulta autenticada.
5. Recalcular preço, quantidade, frete e estoque no servidor; a interface não
   determina o valor confiável de um pedido.
6. Integrar provedor de pagamento e confirmação verificável; remover qualquer
   botão de aprovação local do fluxo real.
7. Atualizar textos da prévia e confirmar entrega real do e-mail, expiração,
   reenvio, proteção contra abuso e isolamento entre usuários.

Não basta mudar `AUTH_MODE` para transformar esta demonstração em autenticação.
Backend e e-mail não foram configurados ou acessados nesta tarefa.
