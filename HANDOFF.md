# Passagem de contexto para uma sessão nova (01/10/2026)

Para quem for continuar o trabalho sem lembrar das conversas anteriores (por exemplo, uma sessão na nuvem).
Quem guia: Pedro (colaborador). Dono do repositório e das contas: `automacaosaas` (powershop.bras@gmail.com), que
também mexe nas mesmas branches via Claude. **Este arquivo não tem segredos e não deve ganhar nenhum.**

Loja "Ju, imprime pra mim?" (JU IMPRIME PARA MIM LTDA, CNPJ 67.771.044/0001-96, Ouro Preto/MG): capas para
retinoscópio e avião para régua de grau, impressas em 3D e personalizáveis (Borboletoscópio, Dinossauroscópio, Aviãoscopia).

## Estado atual

- **Branch de partida: `juncao/pr2-auditoria`.** É a mesma versão que está no site de teste
  (https://wheat-llama-936569.hostingersite.com, na Hostinger) no commit `ae011d4`. Este arquivo foi acrescentado depois.
- A Hostinger **não** está ligada ao GitHub: o Pedro sobe um `.zip` na mão. No lançamento, o site de produção nasce ligado ao GitHub.
- A `main` (`4edf5bc`) está atrasada de propósito. O dono abre um PR para trazer tudo para ela.
- A branch junta: o PR #2 do dono (`claude/nice-feynman-38ipn1`: Mercado Pago, Pix 5%, barra rotativa, banner e
  página de produto compactos, modelos 3D comprimidos), a nota fiscal com o Bling e a "Auditoria da Vitrine Ju"
  (`AUDITORIA-UX.md`, achados A1 a L2): mini-carrinho, página por produto, sitemap e robots, grade em Produtos, link das
  cores, 3D maior no celular, menu do celular, prévia de link, texto com no mínimo 12 px.
- `npm test`: 34 suítes passam.
- `/api/health` no site de teste: banco ok, pagamentos em `test`, frete `correios`, Bling `connected`.
  `legal` e `fiscal` aparecem `pending` (ver pendências).

## Regras de trabalho (obrigatórias)

1. Trabalhe numa branch **nova** a partir de `juncao/pr2-auditoria`. Não faça merge, não mexa na `main` nem em outras
   branches, não faça deploy. Só envie a branch nova ao GitHub quando o Pedro mandar.
2. **Segredos nunca no chat nem em arquivos** (chaves do Mercado Pago, Resend, Bling, `DATA_KEY`, `INDEX_KEY`, `AUTH_SECRET`
   etc.). Nunca peça nem repita valores: o Pedro cola direto na Hostinger. Se aparecerem num print, avise para cobrir.
3. Dados de teste (cartão, conta) só em `localhost`. Não crie contas nem digite credenciais em sites reais.
4. Antes de cada etapa, `git fetch` e conte o que mudou no GitHub. Relate todo commit seu (hash e mensagem).
5. Rode `npm test` antes de cada commit. Se mexer em páginas, Termos/legal, política de segurança (CSP) ou produtos, rode
   também `node tools/sync-legal.cjs`, `node tools/sync-meta.cjs`, `node tools/sync-csp.cjs` e
   `node tools/build-product-pages.cjs` (os testes falham se estiverem desatualizados).
6. Estilo: o repositório usa CRLF no disco (não normalize), com diff mínimo. Texto da loja em português, com tradução EN/ES em
   `dist/translations.js` (linhas `PT|EN|ES`) e regras dinâmicas em `dist/i18n-core.js`. Texto visível com no mínimo 12 px.
   Sem dependências novas. Sem scripts inline (CSP): só o import map (com hash) e blocos JSON-LD.
7. Ver o site local: `npm install` e `node tools/dev-server.cjs --fake-mp --fake-correios --fake-cep --fake-bling`
   (porta 8844; o servidor mostra o acesso do painel de teste ao iniciar). Os "fakes" ficam em `tools/`.
8. Zip para a Hostinger **só quando o Pedro pedir**, depois de varrer segredos:
   `git -c core.autocrlf=false archive --format=zip -o ../site-ju-teste-<hash>.zip HEAD package.json package-lock.json server.cjs server vercel.json api db dist`.
   Quem sobe na Hostinger é o Pedro.
9. Antes do lançamento, reconfirmar com a equipe os dados da empresa (regime ME/Simples, IE, CNAE e dados fiscais).

## Mapa do código

- `dist/`: site estático (HTML, módulos JS, CSS). `api/`: funções servidas por `server/create-server.cjs`. `db/migrations/`: MySQL
  (aplicadas ao iniciar). `tools/`: servidor local, "fakes" e geradores. `tests/`: suítes (`npm test`, ou `node tests/x.mjs`).
- **Preço e Pix:** `dist/commerce-config.js` (loja) e `api/_lib/catalog.js` (servidor) precisam dar o mesmo resultado
  (`tests/pix.mjs` e `tests/payments.mjs` conferem). O servidor decide o desconto pela forma de pagamento realmente usada.
- **Pagamento:** `api/payments/`, `api/_lib/mercadopago.js`, `dist/checkout.js`, `dist/live-payment.js` (`MERCADOPAGO-SETUP.md`).
- **Frete:** `api/shipping/`, `api/_lib/shipping*.js` (`FRETE-SETUP.md`).
- **Nota fiscal:** `api/_lib/fiscal.js` (dados fiscais), `nfe.js`, `invoicing.js`, `bling.js`, `nfe-providers/bling.js`,
  `api/admin/bling.js`, painel em `dist/admin.js` (`NFE-SETUP.md`).
- **Empresa e Termos:** `api/_lib/legal.js` → `node tools/sync-legal.cjs`; mude `TERMS_VERSION` quando o texto legal mudar.
- **Páginas geradas:** `borboletoscopio.html`, `dinossauroscopio.html`, `aviaoscopia.html`, a grade de `produtos.html`,
  `sitemap.xml` e `robots.txt` (`tools/build-product-pages.cjs`); prévia de link e dados para buscadores (`tools/sync-meta.cjs`).
- Outros documentos úteis: `HOSTINGER-SETUP.md`, `ADMIN-SETUP.md`, `LEGAL-SETUP.md`, `RESEND-SETUP.md`, `COLLABORATOR_PROMPT.md`.

## Decisões já tomadas

- **Pix:** 5% de desconto só nas peças, nunca no frete.
- **Prazo de produção:** 3 a 5 dias úteis.
- **Cartão:** texto "3x sem juros"; a loja configura isso no Mercado Pago depois (hoje a tabela de parcelas ainda mostra juros em 2x e 3x).
- **Frete:** Correios com contrato próprio, PAC marcado por padrão (SEDEX também); PAC grátis a partir de R$ 500.
- **Preços** R$ 129 / 139 / 159: ainda "ilustrativos" (aguardando confirmação).
- **Nota fiscal:** Bling, em toda venda (pessoa física e jurídica), emitida quando a Ju marca "concluído" no painel. Empresa ME no
  Simples Nacional, MG. A conta do Bling deve estar em homologação no primeiro teste (o site pausa se detectar produção).
- Sem faixa de cookies e sem analytics por enquanto (analytics conflita com a Política de Privacidade atual).
- **Lançamento:** banco novo e limpo, domínio `juimprimepramim.com.br`, site de produção ligado ao GitHub.

## Tarefas (o Pedro diz qual fazer; uma por vez)

- **A. Correções de layout.** O Pedro vai mandar o relatório. Mostre o plano antes de mexer e confira em 375 px e em computador.
- **B. Nota fiscal.** Feito no site em 01/10: duas naturezas no Bling (cliente sem IE `15111617940`, com IE
  `15111617959`; ver `NFE-SETUP.md`), escolhidas pelo tipo de cliente; texto da contadora; empresa sem IE como não
  contribuinte. Falta no Bling: formas de pagamento (17/03/04) e conta em homologação. Depois, zip e teste real em
  homologação: próximo número (11, série 1), CFOP de cada caso, e se o Bling duplica o texto do Simples ou a linha do DIFAL.
- **C. Atendimento.** Quando o Pedro passar e-mail e WhatsApp: `api/_lib/legal.js` (e-mail e telefone) e `dist/commerce-config.js`
  (`whatsapp`), depois `node tools/sync-legal.cjs`. Com o número, o "Fale com a Ju" aparece sozinho no menu do celular.
- **D. Preços.** Quando forem confirmados, tirar "Preço ilustrativo" e "valores ilustrativos nesta prévia".

## Pendências por responsável

- **Equipe (Pedro e Ju):** teste de pedido de ponta a ponta no site de teste (cartão de teste APRO e Pix de teste, e-mails, painel);
  configurar os 3x sem juros no Mercado Pago e conferir se o webhook aponta para a Hostinger; confirmar preços; passar e-mail e WhatsApp;
  passar o id da natureza do Bling.
- **Macacoscópio à venda (02/10/2026):** faltam preço, peso embalado, NCM e as lâmpadas compatíveis; o arquivo 3D real entra pelo
  colaborador (passo a passo e o que muda em `VITRINE-AVIAO-MACACO-QA.md`). Hoje é novidade com "Ver em 3D" (modelo provisório).
- **Depende de conteúdo ou decisão (auditoria):** ficha técnica (C2), fotos reais e vídeo (C4), Sobre e Contato (G1; depois remover o
  `noindex` dessas páginas), depoimentos (G3), "Avise-me" nos Sensoriais (B4), regra de cor do tema (F4 e H2; sugestão: tema do
  produto na vitrine e no produto, rosa Ju no fluxo de compra e no institucional), analytics com aviso de consentimento (K1).
- **Dono:** levar o PR #2 e a `juncao/pr2-auditoria` para a `main`; confirmar se rotacionou a chave do Resend que vazou em print (28/09).
- **Antes do lançamento:** domínio na Hostinger (atualizar `SITE_URL`, o endereço de retorno do app do Bling e o webhook do Mercado
  Pago); verificar o domínio no Resend (hoje os e-mails só chegam ao e-mail de teste); Mercado Pago em `live` na conta do CNPJ;
  Bling em produção (certificado A1, plano); revisão jurídica (`LEGAL-SETUP.md`); bloquear a indexação do site de teste.

## Como entregar

Ao terminar cada tarefa: nome da branch, commits (hash e mensagem), arquivos alterados, resultado do `npm test` e o que conferir no
navegador. O Pedro leva isso a uma sessão local, que baixa a branch, testa, compara com o que o dono publicou, gera o zip e orienta o envio.
