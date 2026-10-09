# Google Search Console: colocar a loja no Google (09/10/2026)

Guia para a loja aparecer nas buscas do Google. O site já entrega o que o Google precisa:

| O quê | Onde |
|---|---|
| Endereços limpos (`/produtos`, `/borboletoscopio`…) | Servidor, com 301 de cada endereço antigo `.html` para o limpo |
| Um canônico por página | Cabeçalho de cada página |
| Lista das páginas públicas | `sitemap.xml` |
| Áreas privadas fora da busca (`/conta`, `/checkout`, `/admin`, `/api/`) | `robots.txt` |
| Prévia de link | Cabeçalho de cada página |
| Dados de produto (preço, Pix, disponibilidade) e da empresa (`Product`, `Organization`) | JSON-LD nas páginas |

Falta só apresentar a loja ao Google.

## 0. Antes: o domínio está liberado para busca

O servidor só deixa o Google indexar o domínio oficial. O endereço de teste leva `X-Robots-Tag: noindex`. Confira no servidor:

```
curl -sI https://juimprimepramim.com.br/ | grep -i x-robots-tag      # não deve mostrar nada
curl -s  https://juimprimepramim.com.br/api/health                   # deve mostrar "indexable":true
curl -sI https://juimprimepramim.com.br/contato.html | grep -i location   # deve mostrar: location: /contato
```

Se aparecer `noindex`, falta `SITE_URL=https://juimprimepramim.com.br` (veja `SERVIDOR-SETUP.md`).

## 1. Criar a propriedade (uma vez)

1. Entre em <https://search.google.com/search-console> com a conta Google da loja.
2. **Adicionar propriedade → Domínio** e digite `juimprimepramim.com.br`, sem `https://` e sem `www`. Uma propriedade de domínio cobre de uma vez `https`, `http`, `www` e qualquer subdomínio.
3. O Google mostra um registro **TXT** (`google-site-verification=…`). Copie.
4. No **Registro.br**, abra o domínio e cadastre o TXT:
   - Caminho: **DNS → Editar zona → Nova entrada**.
   - Tipo: TXT.
   - Nome: em branco (o próprio domínio).
   - Valor: o texto copiado.
   - Salve.
5. Volte ao Search Console e clique em **Verificar**. O DNS pode levar de alguns minutos a algumas horas. Se não passar na hora, tente de novo mais tarde.

> **Alternativa sem DNS: o arquivo HTML.** Ponha o arquivo `google<código>.html` que o Google fornece em `dist/` e publique. O servidor
> deixa esse arquivo fora do redirecionamento dos endereços limpos, porque o Google o lê exatamente nesse endereço. Prefira o DNS:
> ele não depende do site e vale para o domínio inteiro.

## 2. Enviar o sitemap

1. No menu, abra **Sitemaps**.
2. Em "Adicionar um novo sitemap", digite `sitemap.xml` e envie.
3. Em um ou dois dias, o status deve aparecer como **Sucesso**, com as páginas descobertas:
   - home, Produtos, Escolha o seu e Lâmpada de fenda;
   - as seis peças;
   - Contato, Envio, Termos, Privacidade e Trocas.

O sitemap é gerado por `node tools/build-product-pages.cjs` e já sai com os endereços limpos. Peça nova entra nele sozinha.

## 3. Pedir a indexação das páginas principais

Em **Inspeção de URL** (a barra no alto), cole cada endereço, espere o teste e clique em **Solicitar indexação**:

```
https://juimprimepramim.com.br/
https://juimprimepramim.com.br/produtos
https://juimprimepramim.com.br/fenda
https://juimprimepramim.com.br/borboletoscopio
https://juimprimepramim.com.br/dinossauroscopio
https://juimprimepramim.com.br/aviaoscopia
https://juimprimepramim.com.br/macacoscopio
https://juimprimepramim.com.br/girafoscopio
https://juimprimepramim.com.br/unicornioscopio
https://juimprimepramim.com.br/contato
```

Há um limite diário de pedidos. O sitemap traz o resto. Depois de uma mudança grande numa página (preço, fotos, texto), vale pedir de novo.

## 4. Acompanhar (semanal, 5 minutos)

- **Páginas:** quantas estão indexadas. São normais, e não são erro:
  - "Página com redirecionamento", nos endereços antigos `.html`;
  - "Excluída pela tag noindex" ou "Bloqueada pelo robots.txt", em conta e checkout.
- **Desempenho:** buscas, cliques e posição média. Use para saber como as pessoas procuram as peças (por exemplo, "capa retinoscópio").
- **Melhorias:**
  - **Produtos / Listagens do comerciante:** as peças com preço e disponibilidade (o JSON-LD `Product` das páginas). Para conferir uma página: <https://search.google.com/test/rich-results>.
  - **Core Web Vitals:** velocidade real das visitas. O site foi otimizado para o PageSpeed (`PERFORMANCE-QA.md`).

## 5. Extras que valem a pena

- **Bing Webmaster Tools** (<https://www.bing.com/webmasters>): **Importar do Google Search Console**, em um clique. Cobre Bing, DuckDuckGo e o Copilot.
- **Perfil da Empresa no Google** (<https://business.google.com>): a loja no Maps e na busca local, com WhatsApp, horário e fotos das peças.
- **Google Merchant Center** (mais tarde): as peças na aba Shopping, de graça. Usa os mesmos dados de produto das páginas.

## Endereços limpos: o que mudou no site

- **Endereços:** as páginas respondem sem `.html` (`/contato`, `/produtos`, `/borboletoscopio`; a home em `/`).
- **Redirecionamento:** o endereço antigo vai para o limpo com **301** (links salvos, e-mails já enviados, o próprio Google). A busca (`?encaixe=…`) vai junto, e o fragmento (`#pedidos`) o navegador mantém sozinho. Também `/contato/`, `/index` e `/index.html`.
- **O que fica com `.html`:**
  - o painel da Ju, `/admin.html` (o Bling devolve o login nesse endereço, que está registrado lá);
  - a prévia de e-mails;
  - a página de erro;
  - o arquivo de verificação do Google.
- **O que já usa o endereço limpo:**
  - os links do site;
  - o canônico, o `og:url` e o sitemap;
  - os links dos e-mails (pedido, verificação, conta).
- **`robots.txt`:** a conta está bloqueada como `/conta$`, `/conta?` e `/conta.html`. Um `/conta` sozinho bloquearia também `/contato`, porque a regra vale pelo começo do endereço.
- **Onde está:** `server/create-server.cjs › cleanPath` (o mesmo em `tools/dev-server.cjs`); testes em `tests/server.mjs`.
