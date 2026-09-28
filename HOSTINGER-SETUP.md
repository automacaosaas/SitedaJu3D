# Hostinger: site de teste por upload de arquivo

O site roda na Hostinger como **aplicativo Node.js** (plano Unlimited). O servidor é `server.cjs`: ele serve `dist/` e as
funções de `api/` nos mesmos endereços da Vercel, com os cabeçalhos de `vercel.json`. Não há dependências para instalar.

Enquanto a loja não for validada, o site na Hostinger é só de **teste**, num domínio temporário. O GitHub **não** é
conectado à Hostinger: a integração publica a cada push, e a regra do projeto é não publicar nada antes da validação.

## 1. Gerar o arquivo

Na pasta do projeto, a partir de um commit (o arquivo sai com quebras de linha de Linux e sem o que não vai para o servidor):

```bash
git -c core.autocrlf=false archive --format=zip -o ../site-ju-teste.zip HEAD package.json server.cjs vercel.json api dist
```

O `.zip` leva só `package.json`, `server.cjs`, `vercel.json`, `api/` e `dist/`. Ficam de fora os testes, a documentação e
os originais em `design/`.

## 2. Enviar pelo painel

hPanel → **Sites** → **Adicionar site** → **Envie seu código, nós o hospedamos** → **Usar domínio temporário** →
**Faça upload dos arquivos** → escolha o `.zip`.

Configurações de build:

| Campo | Valor |
|---|---|
| Framework | Outro (Other). Não é Express, Next ou Vite. |
| Versão do Node.js | 24 (22 também funciona) |
| Comando de build | vazio: não há etapa de build |
| Diretório de saída | vazio: é um app de servidor, não um site estático |
| Arquivo de entrada | `server.cjs` |

## 3. Variáveis de ambiente

hPanel → o site → **Variáveis de ambiente**. Salvar republica o app.

| Nome | Valor no site de teste | Para quê |
|---|---|---|
| `APP_ENV` | `preview` | Modo de teste. Em `production`, os caminhos de teste fecham e o site volta a aparecer no Google. |
| `SITE_URL` | `https://<endereço temporário>` (sem barra no fim) | Links dos e-mails e a proteção de origem dos formulários. Sem ela, criar conta falha. |

Não coloque ainda chaves do Resend nem do Mercado Pago. Sem `RESEND_API_KEY`, a tela de conta mostra o código de teste na
própria página, como na prévia atual. `PORT` é definida pela Hostinger; sem ela, o servidor usa 3000.

## 4. Conferir

- `https://<endereço temporário>/api/health` responde `{"ok":true,...}`.
- A home abre, a prévia 3D dos três produtos carrega e o console do navegador fica sem erros.
- `curl -I https://<endereço temporário>/` mostra `content-security-policy`, `x-frame-options: SAMEORIGIN` e
  `x-robots-tag: noindex, nofollow`.

## 5. Atualizar

Gere um `.zip` novo (passo 1) e envie de novo pelo painel. Cada envio substitui o anterior.

## Depois da validação

- Domínio `juimprimepramim.com.br` (titular: CNPJ da empresa) apontado para o app de produção.
- `APP_ENV=production` e `SITE_URL=https://juimprimepramim.com.br` no app de produção.
- Só então conectar o GitHub, com autorização do dono do repositório, escolhendo a branch que publica.
- Banco MySQL da Hostinger: entra na fase de contas e pedidos.

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| Página de erro da Hostinger | Arquivo de entrada diferente de `server.cjs`, ou versão do Node abaixo de 18. Veja o log do deploy. |
| Site abre, mas criar conta dá erro | `SITE_URL` ausente ou diferente do endereço aberto (com ou sem `www`, `http` x `https`). |
| Prévia 3D não carrega | Veja o console: um bloqueio de CSP aparece como erro "Content Security Policy". |
| `/api/health` responde 404 | O `.zip` foi gerado sem a pasta `api/`. |
