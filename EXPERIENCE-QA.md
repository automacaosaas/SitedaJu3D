# Fluidez, navegação e acesso por e-mail — 20/09/2026

Base: main ca1e706, incorporada antes das alterações locais. Este trabalho ficou
só no computador (a publicação foi interrompida) e foi integrado à `main` em
21/09/2026 junto com idiomas e e-mail; ver “Integração” no fim.

## Comportamento entregue

- Uma única abertura com logo aguarda a decodificação da primeira peça e a
  preparação da tipografia. Não há mais uma segunda logo sobre a pilastra.
  Saída de segurança evita bloquear a navegação se um recurso falhar.
- Entrada discreta de cabeçalho, vitrine e catálogo; respeita movimento reduzido.
- Nuvens originais do avião restauradas. Borboleta usa pétalas periféricas e
  dinossauro usa samambaias em gradiente transparente, sem filtros animados.
- Cabeçalho some ao descer e reaparece compacto ao subir. No topo retoma o tamanho
  normal, com logo ligeiramente menor. Um espaçador impede salto do conteúdo.
  Menu aberto e navegação por teclado continuam acessíveis.
- Adicionar ao carrinho atualiza a quantidade, revela o cabeçalho e mostra um
  aviso de 700 ms (250 ms com movimento reduzido) antes de abrir o carrinho.
- Seta móvel retorna à página de compra salva, com a posição de rolagem. Evita
  voltar a uma segunda cópia do carrinho após salvar uma edição.
- Personalização originada no carrinho mantém a ação única de salvar/voltar e
  preserva quantidade e cores. Fechar a edição continua voltando ao carrinho.
- Catálogo tem espaço reservado e carregamento de imagem com shimmer, estado de
  erro e observação quando se aproxima da área visível.
- Acesso começa por e-mail, código, e então nome/senha se a conta for nova. Conta
  existente também pode usar senha. Marketing é opcional e começa desmarcado.
  Loading com mensagens ligadas às etapas e confirmação visual de sucesso.

## Otimização das imagens

Logo e três recortes: 3.400.096 bytes PNG -> 2.230.688 bytes WebP sem perdas,
redução de 34,4%. Originais preservados. Comparação automatizada confirmou
mesmas dimensões, canal alfa e RGB em todos os pixels visíveis das quatro imagens.
As páginas e o catálogo usam as cópias WebP; não há novas dependências de produção.

## Validação executada

- Node: commerce, account-commerce, carousel, catalog, plane-geometry e experience.
- Fluxo de e-mail: cadastro bloqueado antes do código; código de uso único;
  consentimento explícito; senha após cadastro; concessão expirada/cancelada;
  intervalo de reenvio; erro, expiração e tentativas do adaptador demonstrativo.
- Imagens em cache, decodificadas, com erro e interrompidas por tempo limite.
  Destinos de retorno ao carrinho limitados a páginas internas.
- Navegador integrado: 390 × 844 e 1365 × 850. Entrada, temas de personagens,
  cabeçalho ao descer/subir, contador, aviso e navegação ao carrinho, retorno à
  posição anterior, salvar edição sem duplicar item, e-mail/código/cadastro,
  sair e entrar por senha. Sem erros de console nesses fluxos.
- Dados de teste fictícios; nenhuma mensagem enviada, nenhuma compra realizada.
  Carrinho foi mantido com as duas unidades que já existiam antes do teste.

## Limites

Autenticação continua demonstrativa: contas e hashes em memória e sessão pública
de interface na aba. O código é enviado por e-mail quando o servidor está
configurado (`RESEND-SETUP.md`); sem isso, é exibido na própria prévia. Não há
banco de dados, localização persistida nem histórico protegido por usuário.
Nome/e-mail da prévia preenchem o formulário de entrega; endereço permanece
apenas no formulário. Ver AUTH-INTEGRATION.md antes de habilitar contas reais.

Responsividade foi inspecionada no navegador integrado, não em Safari ou
aparelhos Android/iPhone físicos. Não foi feita medição de Core Web Vitals
em produção ou sob rede móvel real.

## Integração com idiomas e e-mail (21/09/2026)

O trabalho acima (commits `052319e`, `ff2571a`, `7b186f0`) foi mesclado à `main` `44c86c5`.
Só cinco arquivos tiveram conflito; o resto entrou sem alterações.

- **theme.css:** união do bloco do seletor de idioma e da faixa de sugestão com o CSS
  de fluidez do Codex. Cinco linhas antigas do seletor (`<select>` posicionado de
  forma absoluta) ficaram de fora porque quebrariam o cabeçalho.
- **account.css / conta.html:** redesenho do Codex mantido; voltou o contêiner
  `.account-tools` (onde mora o seletor de idioma) e o texto da caixa de prévia foi
  corrigido, já que o e-mail agora pode ser real.
- **account.js / auth-service.js:** fluxo “e-mail primeiro” do Codex com o envio real
  por baixo: `begin` envia o e-mail de primeiro acesso, o botão do e-mail (`#verificar?c=&k=`)
  preenche e confirma sozinho, e o serviço cai no código de teste quando não há servidor.
  A tela de progresso própria foi descartada em favor da janela de carregamento do Codex.
- **Correções feitas na integração:** a caixa “código de teste” e o texto da tela do
  código dependiam de `AUTH_MODE` (sempre “demo”); agora dependem de o código ter sido
  realmente enviado. O intervalo de 30 s por endereço só começa depois que o código foi
  emitido (um envio que falha não bloqueia a nova tentativa). A escolha de novidades por
  e-mail agora sobrevive à troca de página.
- **Traduções:** 74 frases novas (fluxo de conta, carregamento, avisos, imagem indisponível).
- **Verificação:** testes automatizados (`experience`, `header-scroll`, `account-commerce`,
  `email-auth`, `i18n` e os demais); no Chrome real: 14 páginas × largura, cabeçalho
  flutuante com o menu de idioma (320 a 430 px), animação do carrinho, fluxo de conta com
  e-mail (simulado localmente) e sem servidor, link do botão, e a gravação de todos os textos
  exibidos para conferir a tradução.
