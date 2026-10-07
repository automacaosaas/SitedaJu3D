# Termos de Uso, Privacidade e Trocas

Três documentos, só em português (em inglês e espanhol aparece um aviso de que vale a versão em português):

| Página | O que cobre |
|---|---|
| `dist/termos.html` | Termos de Uso: conta, produtos sob encomenda, preços e pagamento, produção e entrega, propriedade intelectual, uso do site, foro |
| `dist/privacidade.html` | Política de Privacidade (LGPD): dados coletados, finalidades e bases legais, compartilhamento, dados fora do Brasil, prazos, direitos, segurança, cookies |
| `dist/trocas.html` | Trocas e Devoluções (CDC): desistência em 7 dias, cancelamento, defeito em 90 dias, reembolso |

Todas as páginas públicas têm no rodapé os links para os três documentos e a identificação da loja (razão social, CNPJ,
endereço e e-mail), como pede o Decreto nº 7.962/2013.

## Onde o cliente concorda

- **Cadastro:** a tela avisa que criar a conta é concordar com os Termos e ter lido a Política de Privacidade.
- **Checkout:** caixa obrigatória na etapa de entrega ("Li e concordo com os Termos de Uso e a Política de Trocas e
  Devoluções, e declaro ter lido a Política de Privacidade"). Sem ela o servidor recusa o pagamento.
- O servidor grava **qual versão** foi aceita e **quando**: na conta (`customers.terms_version`, `terms_accepted_at`) e
  em cada pedido (`orders.terms_version`, `terms_accepted_at`). Migração `db/migrations/004_termos.sql`.

## Preencher os dados da empresa

Tudo fica em **um arquivo**, `api/_lib/legal.js` (`COMPANY`). Troque cada `[PREENCHER: …]` pelo valor real e rode:

```bash
node tools/sync-legal.cjs
```

Ele copia os valores para os três documentos, para o rodapé de todas as páginas, para a página de Contato (e-mail e horário)
e para `dist/company.js`, de onde os scripts leem o e-mail e o WhatsApp (`WHATSAPP`, no mesmo arquivo, só números com 55 e DDD). `npm test` falha se alguma página
ficar desatualizada, e `/api/health` mostra `"legal":"pending"` enquanto sobrar algum `[PREENCHER]`.

## Quando mudar um texto

1. Edite o documento em `dist/`.
2. Em `api/_lib/legal.js`, mude `TERMS_VERSION` para a data do dia (`AAAA-MM-DD`).
3. Rode `node tools/sync-legal.cjs`, que atualiza a data "Última atualização" nas três páginas.

Pedidos antigos continuam registrados com a versão que o cliente aceitou na época.

## Cookies e ferramentas de análise

Hoje o site não usa nenhuma ferramenta de análise nem de anúncios, então não mostra aviso de cookies (a Política de
Privacidade diz isso). Para ligar o Google Analytics 4 ou o pixel da Meta:

1. Preencha o id em `dist/analytics-config.js` (`ga4: 'G-…'` ou `metaPixel: '123…'`).
2. Acrescente os endereços da ferramenta (`CSP_DOMAINS`, no mesmo arquivo) à Content-Security-Policy do `vercel.json` e rode
   `node tools/sync-csp.cjs`. O `npm test` falha enquanto faltar este passo.
3. Revise a seção "Cookies" da Política de Privacidade (dizer qual ferramenta é usada) e mude `TERMS_VERSION`.

Com um id preenchido, o aviso aparece na primeira visita (Aceitar todos, Recusar ou Personalizar) e a ferramenta só carrega
depois do aceite. A escolha muda a qualquer momento em "Preferências de cookies", no rodapé. Para ver o aviso antes de ligar
qualquer ferramenta, abra uma página com `?cookies=preview` (vale para a aba; nada é carregado).

## Revisar com advogado ou contador antes do lançamento

Os textos seguem a LGPD, o Código de Defesa do Consumidor, o Decreto nº 7.962/2013 e o Marco Civil da Internet, mas
não substituem uma revisão jurídica. Pontos que pedem decisão:

- **Desistência de peças personalizadas.** O texto aplica o direito de arrependimento de 7 dias (art. 49 do CDC) a todas
  as compras, sem exceção para peças feitas sob encomenda. Criar uma exceção é uma decisão jurídica.
- **Natureza das peças.** Os Termos não dizem se as peças são acessórios decorativos ou equipamentos; se houver
  exigência regulatória ou orientação de uso junto aos instrumentos, ela deve entrar em "Os produtos".
- **Registros de acesso por 6 meses** (Marco Civil, art. 15): a política promete; confirmar com a Hostinger o prazo dos
  registros do servidor e, se preciso, guardar os registros no banco por esse prazo.
- **Prazos de reembolso** citados para cartão (até duas faturas) e a forma de devolução do Pix, conforme o Mercado Pago.
- **Parceiros citados** (Mercado Pago, Correios/Melhor Envio, Resend, Hostinger, emissor de nota fiscal): manter a lista
  igual aos serviços realmente usados.
- **Canal de privacidade:** como microempresa, a loja está dispensada de nomear encarregado (Resolução CD/ANPD nº 2/2022),
  mas o e-mail indicado precisa ser lido e respondido em até 15 dias.

## Testes

`node tests/legal.mjs`: documentos com as referências legais, data igual a `TERMS_VERSION`, rodapé com links e dados da
loja em todas as páginas, aviso no cadastro, caixa obrigatória no checkout e gravação do aceite no servidor.
`tests/payments.mjs`, `tests/accounts.mjs` e `tests/store-contract.mjs` conferem o aceite na conta e no pedido.
