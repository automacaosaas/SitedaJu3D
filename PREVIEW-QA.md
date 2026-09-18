# Prévia da conta, vitrine e compras

Vistoria local: 17–18/09/2026. Prévia apresentada antes de qualquer publicação.
Em 18/09/2026, o responsável autorizou o envio: “Pode subir no github”.

- Base: `af244d4536b8b58401a94b01496d4ea4c25c8857`.
- Branch local: `feat/ju-account-shopping-preview`.
- Última consulta ao GitHub em 18/09 confirmou main na mesma base.
- O baseline antigo do handoff foi atualizado antes de editar; o protótipo de
  carrinho do colaborador foi preservado.
- A produção permanece GitHub main → Vercel. Após o envio autorizado, conferir
  o status do commit e os arquivos servidos pela URL oficial.

## Resultado para revisar

- Conta em painel com logo centralizado e Julia com volume ilustrado.
- Animações leves em camadas no braço, borboleta e coração, pausa manual e
  respeito a movimento reduzido. Não é uma malha 3D articulada.
- Entrada, cadastro, código, recuperação, nova senha, perfil, pedidos e saída.
  Todos explicitamente demonstrativos; nenhum e-mail enviado.
- Preço fora dos botões; continuar personalizando no painel rolável; adicionar
  ao carrinho e comprar agora no rodapé fixo, em rosas de intensidades diferentes.
- Compra direta em página própria sem consumir ou modificar o carrinho comum.
- Carrinho com lixeiras, caixas de seleção fixas, seleção em lote e totais
  calculados apenas para as peças escolhidas.
- Cabeçalho com carrinho/quantidade e perfil; área de produtos; ícones Pix/cartão.
- Nome da peça acima da vitrine, sincronizado com o giro; setas móveis, rolagem
  de roda/trackpad e contagem sem a antiga frase de deslizar.

## Testes executados

```text
node tests/carousel.cjs
node tests/plane-geometry.mjs
node tests/commerce.mjs
node tests/account-commerce.mjs
node --check dist/carousel.js
node --check dist/controller.js
node --check dist/models.js
node --check dist/viewer.js
```

Todos passaram. A sintaxe de todos os demais módulos em dist também foi
verificada; `git diff --check` passou (somente avisos de conversão LF/CRLF).

Novas regressões: roda/trackpad, seleção parcial, preservação de itens e
quantidades não compradas, cores alteradas durante pagamento, total do histórico,
ausência de senha/endereço no armazenamento persistente demonstrativo, confirmação
obrigatória antes da entrada, código incorreto/expirado/reutilizado, reenvio e limite
de tentativas.

## Navegador

Chromium embutido, com dimensões controladas; não equivale a celular físico.

| Viewport | Vitrine e três produtos | Imagem, 3D e resumo | Conta: entrada/cadastro/recuperação |
|---|---|---|---|
| 360 × 800 | Conferidos | Conferidos | Conferidos |
| 390 × 844 | Conferidos | Conferidos | Conferidos |
| 430 × 932 | Conferidos | Conferidos | Conferidos |
| 1366 × 650 | Conferidos | Conferidos | Conferidos |
| 1920 × 1080 | Conferidos | Conferidos | Conferidos |

Em todos os produtos da matriz: peça e pilastra enquadradas; opções das partes,
troca de cores, resumo, edição, fechamento e botão principal acessíveis. Sem
overflow horizontal nas medidas verificadas. Giro, zoom, vista inicial e
alternância da visualização foram exercitados. As dez cores foram selecionadas
ao longo da vistoria.

Conferência adicional em 390 × 844: o painel de opções rolou 92 px mantendo
prévia (y=13 a 333,72) e rodapé (y=761 a 831) nas mesmas posições. Página de fundo
travada. Contorno de foco visível no controle da paleta.

- Dois ciclos completos pelas setas nos dois sentidos; nome superior e contagem
  acompanharam os produtos. Roda nos dois sentidos confirmada no navegador.
- Arraste/captura implícita/cancelamento/movimento reduzido cobertos pelos testes
  simulados existentes. O tratamento de lostpointercapture não foi alterado.
- Aviãoscopia: geometria não alterada. Vistoria visual da peça completa, duas
  colunas de oito lentes/aros, numeração e rasgo retangular; teste estrutural
  confirma a ordem dos dezesseis graus, contraste e canal atravessando a base.
- Cadastro de teste com código incorreto e correto, perfil e saída exercitados.
  Recuperação chegou à tela de nova senha após código conferido.
- Cartão: recusa e aprovação demonstrativas. Compra direta da borboleta preservou
  as duas unidades de Aviãoscopia já guardadas no carrinho.
- Pix de itens selecionados: só a borboleta entrou no pedido; dinossauro e avião
  permaneceram. Nenhum valor movimentado.
- Selecionar nenhum desabilitou finalizar; remoção em lote funcionou; edição de
  cores preservou a quantidade do item.
- Console da sessão de navegador: nenhum erro/aviso de aplicação registrado nos
  percursos inspecionados.

## Limites e revisão manual

- O preenchimento e envio final de uma nova senha no navegador ficaram para o
  responsável: a revisão automática de segurança exigiu transferência ao usuário
  nessa ação, mesmo na demonstração. Não declarar esse teste concluído.
- Não houve teste em iPhone/Safari, Android físico, leitor de tela, teclado
  virtual, modo offline ou dispositivo sem WebGL. O fallback WebGL existente foi
  preservado, não revalidado por desativação da GPU.
- Meus pedidos tem resumos locais de demonstração. Sua integração, isolamento por
  usuário e jornada autenticada persistente dependem do backend.
- Preço, frete e prazo continuam ilustrativos. Não foi inventada promoção ou
  preço riscado a partir das referências.
- O envio desta versão foi autorizado após apresentação da prévia. Mudanças
  posteriores também devem ser mostradas e aprovadas antes de subir ao GitHub.

## Arquivos

Alterados: dist/index.html, dist/carousel.js, dist/cart-bridge.js,
dist/cart-store.js, dist/checkout.html, dist/checkout.js e tests/carousel.cjs.

Novos: dist/conta.html, dist/account.css, dist/account.js, dist/auth-service.js,
dist/site-shell.js, dist/icons.js, dist/shopping.css, dist/catalog.js,
dist/comprar-agora.html, dist/assets/julia-3d.png, tests/account-commerce.mjs,
AUTH-INTEGRATION.md e este relatório.

Preservados: products.js, models.js, viewer.js, controller.js, vendor, paleta,
IDs salvos, imagens dos produtos e logo oficial.

## Arte da Julia

Ilustração criada com a habilidade imagegen a partir da imagem da personagem
fornecida pelo responsável. A direção aplicada foi dar acabamento tridimensional
delicado à mesma Julia, conservando sorriso, olhos, cabelo longo ondulado com
mechas, jaleco branco, roupa lilás e retinoscópio de borboleta; fundo transparente,
iluminação suave e identidade acolhedora. As referências de login orientaram
somente a composição, sem reutilizar seus personagens ou marcas.

O PNG tem aproximadamente 1,43 MB. Braço e corpo usam a mesma imagem em camadas
SVG com recortes; coração e borboleta decorativa são vetores animados por CSS.
Esta composição foi apresentada ao responsável antes da autorização de envio.
