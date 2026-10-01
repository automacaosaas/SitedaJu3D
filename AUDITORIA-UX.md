# Auditoria de experiência e conversão

Data: 01/10/2026. Base inspecionada: `4b71a54`. Versão completa, com capturas de tela,
wireframes e tabela de referências: https://claude.ai/artifact/9mnDhQRcLunZy8s8GGKfsR
(privada; o dono compartilha pelo menu Share da página).

## Veredito

O site tem identidade memorável e um configurador 3D de verdade. Falta a camada comercial
que os marketplaces aperfeiçoaram: preço e benefício aparecem tarde, faltam ficha técnica,
confiança, frete calculado e medição. São seis cliques do banner até o carrinho, e cada
adição tira a pessoa da loja. Quase tudo se resolve acrescentando, sem trocar o visual.

## Preservar

Banner temático com pilastra; demonstração do encaixe no retinoscópio; configurador por
partes; carrinho com miniatura e cores por item; tom de voz e tipografia; acessibilidade,
i18n e testes.

## Jornada

Hoje (6 cliques): Escolha sua cor → Personalize o seu (card) → PERSONALIZE O SEU! → cores →
Concluir personalização (só aqui aparece o preço) → Adicionar ao carrinho (redireciona).
Proposto (3 cliques): Personalizar agora (abre a página do produto no configurador, com
preço) → cores ou combinação pronta → Adicionar · R$ 129 (gaveta com “Ver carrinho” e
“Complete o kit”).

## Achados (severidade)

### A · Primeira dobra
- A1 Alto: banner sem preço nem benefício; a promessa da marca está só no `h1` oculto.
- A2 Alto: “Escolha sua cor” rola até o catálogo em vez de abrir o configurador.
- A3 Médio: a demonstração do encaixe só aparece ao tocar na peça, sem indicação.
- A4 Médio: nenhuma faixa de confiança (prazo, envio, Pix/cartão, compra segura).
- A5 Baixo: a tela de abertura adia o conteúdo.

### B · Catálogo
- B1 Alto: o Dinossauroscópio aparece em duas cores. O banner e `products.js` usam
  verde-musgo/amarelo-claro; `card-dinossauroscopio*.webp` é azul-céu; `produtos.html`
  pré-renderizado traz bolinhas azul-céu/verde-menta. Regenerar cards, corrigir o HTML e
  testar as bolinhas contra `defaults()`.
- B2 Médio: carrossel como única vitrine; usar grade na página Produtos.
- B3 Médio: texto de 9 px nos cards do celular; mínimo de 12 px.
- B4 Médio: “Sensoriais em breve” leva a uma categoria vazia; trocar por “avise-me”.
- B5 Baixo: cards sem prazo e sem prova social.
- B6 Baixo: o carrinho rápido não diz que entram as cores originais.

### C · Página de produto
- C1 Crítico: o produto vive num modal com rota `#produto/…`, sem página indexável nem
  prévia de link. Criar uma página por produto com o configurador embutido.
- C2 Crítico: falta ficha técnica (compatibilidade, medidas, material, higienização,
  força do ímã, garantia).
- C3 Alto: o preço só aparece no resumo; deixá-lo fixo em todos os estados.
- C4 Alto: sem fotos reais, em uso ou vídeo.
- C5 Médio: não há “Adicionar nas cores originais” no produto.
- C6 Médio: espaço vazio no modal, “Voltar à coleção” duplica o ×, CTA em caixa-alta.

### D · Personalização
- D1 Médio: “Concluir personalização” + resumo é um passo a mais; adicionar direto.
- D2 Médio: sem combinações prontas nem “Surpreenda-me”.
- D3 Baixo: “Copiar combinação” copia texto; gerar link que reabre a combinação.
- D4 Baixo: prévia 3D pequena no celular.

### E · Carrinho
- E1 Alto: adicionar redireciona para `checkout.html` após 0,7 s; trocar por gaveta lateral.
- E2 Médio: caixas “Selecionar todos / Remover selecionados” desnecessárias com 1–3 itens.
- E3 Médio: frete fixo, sem CEP e sem meta de frete grátis.
- E4 Baixo: botão de voltar flutua sobre o título no celular.

### F · Checkout
- F1 Alto: CEP não vem primeiro nem preenche o endereço.
- F2 Alto: falta CPF/CNPJ (nota fiscal, provedores de pagamento, clínicas).
- F3 Médio: sem opções de frete, parcelamento ou vantagem no Pix.
- F4 Baixo: campos rosados dentro do tema verde.

### G · Confiança
- G1 Crítico: Sobre e Contato estão no menu, mas mostram “Conteúdo em preparação”.
- G2 Crítico: rodapé sem razão social, CNPJ, endereço e políticas (Decreto 7.962/2013,
  CDC art. 49, LGPD).
- G3 Alto: nenhuma prova social.
- G4 Médio: sem WhatsApp (`COMMERCE.whatsapp` vazio).

### H · Navegação e marca
- H1 Médio: menu do celular com 4 links e meia tela vazia.
- H2 Médio: o prompt mestre diz que as outras páginas continuam rosa, mas `journey.js`
  leva o verde/azul do produto a Produtos, Sobre, carrinho, checkout e conta. Decidir e
  registrar a regra.
- H3 Baixo: sem busca nem submenu (desnecessário com 3 produtos).

### I · Performance
- I1 Alto: a home baixa cerca de 5 MB em 53 requisições. O recorte do banner tem 785 KB, o
  modal pré-carrega `borboletoscopio.png` (1,2 MB) fechado e `julia-auth.png` tem 2 MB.
- I2 Médio: modelos GLB somam 29 MB; comprimir (Draco/meshopt).

### J · SEO e compartilhamento
- J1 Crítico: nenhuma tag Open Graph; o link no WhatsApp não mostra prévia.
- J2 Alto: sem `robots.txt`, `sitemap.xml` ou `schema.org/Product`; `h1` da home oculto.
- J3 Baixo: Sobre/Contato com `noindex` (ok enquanto vazias).

### K · Medição
- K1 Crítico: nenhuma análise instalada. GA4 com eventos de e-commerce e próprios
  (`customize_start`, `color_change`, `customize_complete`, `demo_view`), Pixel da Meta,
  Microsoft Clarity e consentimento LGPD.

### L · Acessibilidade
- L1 Médio: cards laterais esmaecidos com contraste baixo.
- L2 Baixo: controles 3D com caracteres de texto (↶ ↷ + −).

## Plano em fases

- **Fase 0, até 1 semana:** medição (K1), Dinossauroscópio (B1), Open Graph (J1), CTA do
  banner e preço visível (A2, C3), texto mínimo e contraste (B3, L1), limpeza do carrinho
  (E2, E4), imagens (I1).
- **Fase 1, 2 a 4 semanas:** página por produto (C1–C6), adicionar direto e combinações
  (D1, D2), gaveta do carrinho (E1), barra fixa no celular, checkout com CEP primeiro e
  CPF/CNPJ (F1–F3), grade e “avise-me” (B2, B4).
- **Fase 2, depende da Ju:** Sobre, Contato, políticas e CNPJ (G1, G2), fotos e vídeo (C4),
  depoimentos (G3), WhatsApp (G4), sitemap e dados estruturados (J2).
- **Fase 3, depois do checkout real:** Kit Consulta Encantada, frete grátis progressivo,
  avaliações pós-compra, link de combinação e indicação, recuperação de carrinho pelo
  Resend, compra para clínica, modelos 3D comprimidos.

## O que só a Ju pode fornecer

Compatibilidade por modelo; material, medidas, peso, ímã e higienização; razão social, CNPJ,
endereço e contatos; políticas; fotos e vídeo reais; depoimentos autorizados; preços finais,
frete, Pix e parcelamento; a regra do tema (H2).

## Método e limites

Código no commit `4b71a54` e site local (`tools/dev-server.cjs`) em Chromium/Playwright a
1440 × 900 e 390 × 844 com toque emulado. As fontes da Google não carregaram no ambiente de
captura. Não houve teste em aparelho físico nem dados de tráfego; as notas são qualitativas.
Preços, descontos, prazos e avaliações dos wireframes são exemplos.
