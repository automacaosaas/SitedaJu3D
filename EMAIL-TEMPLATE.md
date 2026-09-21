# E-mail de verificação — Ju imprime pra mim

O e-mail é gerado pelo servidor (`api/_lib/email-template.js`) e enviado pelo
Resend. Há **um layout** com **três finalidades** e **três idiomas**:

| Finalidade | Quando | Rótulo no e-mail |
|---|---|---|
| `signup` | confirmar o cadastro | CADASTRO |
| `access` | primeiro acesso ao site | PRIMEIRO ACESSO |
| `reset` | recuperar/criar nova senha | RECUPERAÇÃO DE ACESSO |

O idioma segue o que a pessoa escolheu no site (`pt-BR`, `en`, `es`). Um idioma ou
finalidade desconhecido cai em português/cadastro.

Para ver o resultado sem enviar nada:

```text
node tools/dev-server.cjs
```

e abrir `http://localhost:8844/email-preview.html` (escolha tipo e idioma). O
servidor local escreve cada e-mail em uma pasta temporária em vez de enviá-lo.

## Visual

Cartão claro, na paleta do site (`#fff7f5`, `#fffcfb`, rosa `#b64c68`, rosa claro
`#fbedf1`), título em serifa com a segunda linha em itálico rosa, caixa do código,
botão principal, link para copiar e colar, validade, assinatura da marca e rodapé
com “© ano Ju, imprime pra mim?” e Instagram. Tabelas e estilos inline, sem
JavaScript nem CSS externo, porque é o que os leitores de e-mail suportam.

O logo é `dist/assets/logo-ju-email.png`: a arte oficial **com fundo transparente**
(360 px, ~57 KB), exibida a 172 px. Ele é gerado a partir de `assets/logo-ju.png`
por `node tools/make-email-logo.cjs`; não edite o PNG à mão. O e-mail fixa
`color-scheme: light only` e um cartão claro, porque o preto de “imprime” some em
fundo escuro. Alguns leitores (Gmail no modo escuro) podem inverter cores mesmo
assim; isso não é controlável pelo remetente.

Não há links para Política de Privacidade nem Termos de Uso porque essas páginas
ainda não existem. Quando existirem, acrescente-os ao rodapé do template.

## Como o fluxo funciona

1. A pessoa cria a conta (ou pede recuperação). O site chama
   `POST /api/auth/send-code` com e-mail, nome, finalidade e idioma.
2. O servidor gera o código de seis dígitos, monta um **desafio assinado** e envia
   o e-mail pelo Resend. Responde só com o desafio, nunca com o código.
3. A pessoa digita o código **ou** toca no botão do e-mail.
4. O site chama `POST /api/auth/verify-code` com o desafio e o código. O servidor
   confere assinatura, validade (10 minutos) e código.

### O botão e o link

O botão abre `https://…/conta.html#verificar?c=<desafio>&k=<código>`. O site lê
essa URL, **apaga os dados dela do endereço**, mostra a tela de verificação com o
código já preenchido e confirma sozinho. Os dados vão no fragmento (`#…`) porque o
navegador nunca o envia a servidores nem o repassa como `Referer`. O mesmo link
aparece por extenso abaixo do botão para copiar e colar.

O link funciona em outro navegador ou aparelho: o nome e o e-mail vêm dentro do
desafio assinado. Ele confirma o e-mail nessa aba; não há sincronização entre
aparelhos até existir banco de dados.

## Segurança e limites conhecidos

- O código só existe no e-mail. O desafio guarda apenas um hash com chave
  (HMAC-SHA256) do código, do e-mail, da finalidade, do prazo e de um sorteio; sem
  `AUTH_SECRET` ele não pode ser forjado nem revertido.
- Sem `AUTH_SECRET`, a chave que assina os desafios é derivada da chave do Resend
  (HMAC com um rótulo fixo; a chave em si não é exposta). Isso permite usar a
  integração oficial Resend↔Vercel, que só cria `RESEND_API_KEY`. A troca é que,
  se a chave do Resend vazar, dá para forjar desafios; ao trocar a chave, os
  códigos em andamento (até 10 min) deixam de valer. Antes de contas reais, defina
  um `AUTH_SECRET` próprio.
- A chave do Resend fica só em variável de ambiente do servidor. Nunca no
  repositório, no navegador ou em logs. Os testes conferem que ela não vaza.
- O envio só aceita requisições cujo `Origin` é o próprio site.
- Limites em memória: 1 envio por e-mail a cada 30 s, 4 por e-mail em 10 min e 15
  por IP por hora. Como as instâncias serverless são efêmeras, isso só barra
  laços ingênuos.
- **O que ainda falta e exige armazenamento (banco/KV):** contador de tentativas
  por desafio, uso único do código e limite de envio durável. Sem isso, quem
  possui um desafio pode tentar muitos códigos dentro dos 10 minutos. Hoje a
  verificação só prova a posse do e-mail e não protege nenhum recurso do servidor,
  então o risco é baixo; **antes de ligar contas reais isso é obrigatório**, ou
  alguém poderia “verificar” o e-mail de outra pessoa e assumir o cadastro. Para
  proteção contra abuso de envio em massa, considere Cloudflare Turnstile ou o
  Vercel Firewall.
- A criação de contas continua sendo a prévia em memória (`auth-service.js`); veja
  `AUTH-INTEGRATION.md`.

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `RESEND_API_KEY` | sim | chave do Resend (segredo) |
| `AUTH_SECRET` | não (recomendada antes de contas reais) | segredo com 32+ caracteres que assina os desafios. Sem ele, a assinatura é derivada de `RESEND_API_KEY` |
| `MAIL_FROM` | recomendada | remetente, ex.: `Ju imprime pra mim <acesso@seudominio.com.br>`. Sem ela, usa o remetente de teste do Resend |
| `MAIL_REPLY_TO` | não | para onde vão as respostas |
| `SITE_URL` | não | endereço público usado nos links. Padrão: `https://siteda-ju3-d.vercel.app` em produção; nas prévias, o próprio endereço da prévia |
| `MAIL_TRANSPORT=console` | só em testes | escreve em vez de enviar; ignorado em produção |

Se `RESEND_API_KEY` faltar, o site continua funcionando e mostra o código de teste
na tela, como antes. O passo a passo para ativar está em
`RESEND-SETUP.md`.

## Testes

`node tests/email-auth.mjs` cobre desafio (assinatura, prazo, adulteração), o
template (3 idiomas × 3 finalidades, escape de HTML), as funções com um Resend
falso (origem, validação, limites, 502/503, vazamento de chave), a prévia e o
adaptador do navegador, incluindo o link do e-mail.
