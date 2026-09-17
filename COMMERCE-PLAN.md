# Compra online — proposta e protótipo local

Data: 17/09/2026. Base inspecionada: `d6e7c78`. Repositório: https://github.com/automacaosaas/SitedaJu3D.git. Produção: https://siteda-ju3-d.vercel.app/.

## Decisão recomendada

Manter a vitrine/configurador na Vercel, acrescentar checkout próprio e integrar Mercado Pago **após aprovação do protótipo**. O projeto atual é estático, sem servidor de pedidos ou pagamento. Nada nesta entrega cria cobranças, conta, assinatura ou infraestrutura externa.

| Aspecto | Nuvemshop como operação | Vercel + Mercado Pago |
|---|---|---|
| Experiência existente | Precisa de ligação entre configurador externo e loja; não é uma conexão pronta comprovada | Mantém a experiência e os dados do configurador |
| Personalização | Provar transferência de atributos por item até o pedido; não presumir que campos internos do catálogo sejam opções do comprador | Snapshot com produto, partes/cores, quantidade e versão do catálogo |
| Combinações | Evitar criar SKU para cada combinação; avaliar aplicativo/atributo por item documentado. Se não houver suporte adequado, descartar esta arquitetura | Um SKU por produto-base; escolhas de cor como especificação de fabricação |
| Gestão | Catálogo, pedidos e operação já disponíveis | Precisa desenvolver gestão de pedidos e integração de frete |
| Checkout | Interface e possibilidades dependem da plataforma/plano | Layout da Ju com campos seguros do provedor para cartão |
| Pix | Nuvem Pago possui código por pedido e expiração; documentação informa somente copia e cola no mobile | QR e copia e cola, estado persistido no servidor e atualização da tela |
| Esforço | Baixo para loja convencional; médio/alto e ainda não validado para nosso configurador externo | Médio/alto inicialmente, com controle direto da personalização |

A Nuvemshop não foi escolhida nem contratada. Antes de qualquer integração híbrida, fazer prova pequena: enviar um item com todas as cores, pagar em teste e verificar os mesmos dados no pedido administrativo. Confirmar app/API, OAuth, escopos, elegibilidade de plano e checkout suportado; nunca assumir que uma URL consegue transportar um carrinho arbitrário.

### Custos e planos

A página oficial consultada anuncia Começo gratuito, Essencial R$69/mês, Impulso R$164/mês, Escala R$449/mês e Next a partir de R$1.399/mês. São valores de referência na data da consulta, sujeitos a condições comerciais. Acesso ao código-fonte do tema aparece no Impulso; campos personalizados administrativos têm restrições de plano, e não demonstram por si só suporte a personalizações do comprador. **Nenhum desses planos foi confirmado como suficiente para uma loja com nosso frontend externo.** Considerar mensalidade + aplicativo eventualmente necessário + taxas de pagamento e frete.

Na alternativa Vercel, considerar hospedagem/funções, banco de dados, frete, e-mail e processamento do Mercado Pago. Taxas reais dependem da conta e condições comerciais; não inventar percentuais. Nuvem Pago é exclusivo da plataforma, não um processador para simplesmente instalar no site Vercel.

Fontes oficiais consultadas:
- https://www.nuvemshop.com.br/loja-virtual
- https://www.nuvemshop.com.br/planos-e-precos
- https://atendimento.nuvemshop.com.br/organizar-produtos/como-cadastrar-variacoes-em-meus-produtos
- https://atendimento.nuvemshop.com.br/pt_BR/configuracoes-gerais/como-usar-os-campos-personalizados-na-nuvemshop
- https://atendimento.nuvemshop.com.br/pt_BR/formas-de-pagamento-e-parcelamento/como-ativar-e-usar-o-pix-no-nuvem-pago
- https://atendimento.nuvemshop.com.br/pt_BR/ativacao-do-nuvem-pago/como-ativar-o-nuvem-pago-na-minha-loja
- https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/overview
- https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/payment-brick/payment-submission/introduction?scope=prod
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix?scope=prod
- https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/additional-content/your-integrations/notifications/webhooks

## O que o protótipo entrega

- Sacola no cabeçalho; adicionar depois de concluir personalização.
- Persistência local com validação dos produtos, cores e quantidades. Preço local sempre recalculado pelo catálogo demonstrativo.
- Miniatura PNG renderizada com câmera própria a partir do modelo 3D e suas cores. Se WebGL falhar, foto original identificada como tal + especificação completa das cores.
- Alteração de quantidade, remoção e edição através do configurador existente. Mesmas combinações se agrupam; cores diferentes continuam como itens independentes. Cliques repetidos durante inclusão são bloqueados.
- Checkout com dados de entrega e Pix/cartão. Dados pessoais permanecem apenas em memória; usar dados fictícios.
- Resumo com cores de cada parte; atalho para resumo e total no mobile.
- Pix ilustrativo não pagável, copia e cola marcado como demonstração, temporizador por timestamp, expiração natural ou via cenário de teste, renovação e aprovação simulada.
- Cartão sem campos de número/validade/CVV, com simulação de recusa e aprovação.
- Confirmação baseada em snapshot do pedido, progresso até pagamento confirmado. Preparação/envio permanecem como etapas futuras. Nenhuma produção automática fictícia.
- WhatsApp preparado para número da empresa; enquanto estiver vazio, botão desabilitado e alternativa para copiar o resumo. Não usar número inventado nem abrir compartilhamento para destinatário indefinido.

Preços: R$129/R$139/R$159, frete R$18, produção 5–7 dias úteis, **todos apenas exemplos visíveis**. Configuração central: `dist/commerce-config.js`.

### Limites deliberados da demonstração

O carrinho sobrevive ao reload. Formulário, pedido e status de pagamento ficam somente em memória e reiniciam ao recarregar/navegar; a confirmação limpa a sacola local. Não há banco, cotação por CEP, envio de e-mail, rastreamento, webhooks ou intermediador conectado. O código e a matriz de Pix NÃO têm valor bancário. Alterar `mode` não transforma esta demonstração em checkout real.

## Arquitetura para etapa real

1. Catálogo no servidor: produtos, preço em centavos, partes e cores permitidas, disponibilidade de filamento, prazo e versão. Cliente envia IDs/quantidades/escolhas; servidor recalcula tudo, inclusive frete. Nunca confiar em localStorage, total ou foto do comprador para autorizar pedido.
2. Banco de dados de pedidos: `orders`, `order_items`, `payment_attempts`, `webhook_events` e histórico de status. Item guarda snapshot imutável da configuração de fabricação. Campos pessoais acessíveis somente ao comprador autenticado por sessão/token apropriado e operadores autorizados.
3. Função Vercel para criar pedido com identificador de tentativa/idempotência, validação de entrada, limites e estado inicial. Sessão/cookie seguro; consulta de pedido exige autorização, não apenas número público.
4. Adaptador Mercado Pago: criar pagamento Pix com referência ao pedido, valor calculado no servidor, data de expiração e chave de idempotência estável por tentativa. Nova tentativa após expiração usa nova chave. Credenciais privadas só no servidor/variáveis de ambiente.
5. Cartão: componente oficial/SDK do provedor para tokenização ou checkout hospedado. Nenhum número de cartão ou CVV entra em logs, banco ou armazenamento local da loja.
6. Webhook HTTPS: verificar assinatura conforme documentação atual; buscar o pagamento pela API autenticada; conferir conta recebedora, moeda, valor e referência do pedido; deduplicar evento e atualizar transacionalmente. Lidar com eventos repetidos, atrasados e fora de ordem. Redirect ou botão “já paguei” não aprovam pedido.
7. Tela consulta apenas o servidor autorizado, com polling limitado/backoff ou mecanismo equivalente; “aguardando”, “processando”, “aprovado”, “expirado”, “recusado”, “cancelado” vêm do estado real. Não prometer aprovação instantânea nem confundir pagamento aprovado com início da produção.
8. Produção/frete: painel mínimo para a Ju ver as partes e cores, iniciar preparação e informar rastreio. E-mail/WhatsApp só por integrações autorizadas e eventos reais. Histórico cobre cancelamento, reembolso e contestação.
9. Testes de integração em ambiente de teste: valores adulterados, pedido de outro cliente, assinatura inválida, evento duplicado, expiração, aprovação tardia, falha de rede, pagamento rejeitado, timeout e reabertura do pedido.

## Pendências para ativação

- Aprovar a experiência e decidir o provedor.
- Fornecer preços finais, regras de personalização, prazo, frete/retirada e WhatsApp da empresa.
- Definir conta recebedora e seu titular. O Pix dinâmico recebe na conta vinculada ao provedor; não equivale a enviar diretamente para uma chave pessoal de banco arbitrário.
- Configurar credenciais de teste fora do repositório, banco e funções; validar requisitos de documento do provedor antes de pedir CPF.
- Definir política de entrega/troca, privacidade e operação de pedidos.
- Validar fluxo completo em teste e obter autorização específica antes de produção/cobranças reais.

## Publicação e colaboração

Esta entrega não faz commit/push/deploy. Após validação, comparar novamente com `origin/main` e alterações do colaborador, revisar o diff, integrar sem sobrescrever trabalho alheio e só então publicar com autorização. O workflow antigo que sugeria publicação automática fica subordinado a esta regra do usuário.

## Arquivos

Novos: `dist/commerce-config.js`, `dist/cart-store.js`, `dist/cart-bridge.js`, `dist/demo-payment.js`, `dist/checkout.html`, `dist/checkout.js`, `dist/commerce.css`, `tests/commerce.mjs`, este documento e `COMMERCE-QA.md`.

Alterados: `dist/index.html` (sacola/estilo), `dist/controller.js` (ponte para sacola/edição), `dist/viewer.js` (captura da miniatura sem mudar a geometria ou o controle do configurador). As fontes de imagens e os modelos dos produtos permanecem os existentes.

## Execução

Na pasta pai `work`, executar `node serve.cjs`. Abrir http://127.0.0.1:4173/ e seguir Personalize → Concluir → Adicionar ao carrinho. Na pasta do repositório, executar `node tests/commerce.mjs`, `node tests/carousel.cjs` e `node tests/plane-geometry.mjs`.
