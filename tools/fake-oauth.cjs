'use strict';
// Google and Apple sign-in simulator, for the local server (node tools/dev-server.cjs --fake-social) and the tests
// (tests/social-login.mjs). It plays both providers end to end with real cryptography: its own RSA key signs the ID
// tokens (published as JWKS), the Google token step checks the client secret and the PKCE verifier, and the Apple one
// checks the ES256 client secret against the public half of APPLE_PRIVATE_KEY. Nothing here is used in production
// (api/_lib/social.js only follows SOCIAL_FAKE_URL outside production).
//
// In the browser: /__fake-oauth/<google|apple>/authorize shows a small page to choose who signs in (e-mail, name,
// verified or not, Apple's "Ocultar meu e-mail") and goes back to the shop like the real providers do: Google with a
// redirect, Apple with a form POST (form_post).
const crypto = require('node:crypto');

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');

// Test credentials, generated per run: an EC P-256 key in the format of Apple's .p8 file.
function fakeCredentials(base) {
  const apple = crypto.generateKeyPairSync('ec', {namedCurve: 'P-256'});
  return {
    GOOGLE_CLIENT_ID: 'teste-local.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'segredo-google-de-teste',
    APPLE_CLIENT_ID: 'br.com.juimprimepramim.teste', APPLE_TEAM_ID: 'TIMETESTE1', APPLE_KEY_ID: 'CHAVETESTE',
    APPLE_PRIVATE_KEY: apple.privateKey.export({type: 'pkcs8', format: 'pem'}).replace(/\n/g, '\\n'),   // as pasted in a panel
    SOCIAL_FAKE_URL: base
  };
}

function createFakeOAuth({base, env, now = () => Date.now()}) {
  const {privateKey, publicKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  const kid = `chave-${crypto.randomBytes(4).toString('hex')}`;
  const jwk = {...publicKey.export({format: 'jwk'}), kid, alg: 'RS256', use: 'sig'};
  const codes = new Map(), log = [];
  const clientId = provider => provider === 'google' ? env.GOOGLE_CLIENT_ID : env.APPLE_CLIENT_ID;
  const subjectOf = (provider, email) => `${provider === 'google' ? '1' : '000123.'}${crypto.createHash('sha256').update(`${provider}|${email}`).digest('hex').slice(0, 20)}`;
  const relayOf = email => `${crypto.createHash('sha256').update(`relay|${email}`).digest('hex').slice(0, 10)}@privaterelay.appleid.com`;

  function sign(claims) {
    const signed = `${b64({alg: 'RS256', kid, typ: 'JWT'})}.${b64(claims)}`;
    return `${signed}.${crypto.sign('sha256', Buffer.from(signed), privateKey).toString('base64url')}`;
  }

  // The person approved: a single-use code bound to the client, the return address, the nonce and the PKCE challenge.
  function approve(provider, query, person = {}) {
    if (query.client_id !== clientId(provider)) throw new Error(`fake ${provider}: unknown client_id ${query.client_id}`);
    const email = String(person.email || 'pessoa@exemplo.test').trim().toLowerCase();
    const hidden = provider === 'apple' && person.hideEmail === true;
    const code = crypto.randomBytes(18).toString('base64url');
    const claims = {
      iss: `${base}/${provider}`, aud: clientId(provider), sub: person.subject || subjectOf(provider, email), nonce: query.nonce,
      email: hidden ? relayOf(email) : email, email_verified: provider === 'apple' ? 'true' : person.verified !== false
    };
    if (provider === 'google') Object.assign(claims, {name: [person.firstName, person.lastName].filter(Boolean).join(' '), given_name: person.firstName || undefined, family_name: person.lastName || undefined, picture: person.picture || undefined});
    if (provider === 'apple') claims.is_private_email = hidden ? 'true' : 'false';
    codes.set(code, {provider, redirectUri: query.redirect_uri, challenge: query.code_challenge || null, claims, used: false});
    const answer = {code, state: query.state};
    // Apple sends the name only on the first authorization, outside the token, in "user".
    if (provider === 'apple' && person.firstTime !== false) answer.user = JSON.stringify({name: {firstName: person.firstName || '', lastName: person.lastName || ''}, email: claims.email});
    return answer;
  }

  async function token(provider, form) {
    const entry = codes.get(form.code);
    const deny = (status, error) => ({status, body: {error}});
    if (!entry || entry.used || entry.provider !== provider) return deny(400, 'invalid_grant');
    if (form.redirect_uri !== entry.redirectUri || form.client_id !== clientId(provider)) return deny(400, 'invalid_grant');
    if (provider === 'google') {
      if (form.client_secret !== env.GOOGLE_CLIENT_SECRET) return deny(401, 'invalid_client');
      if (!entry.challenge || crypto.createHash('sha256').update(String(form.code_verifier || '')).digest('base64url') !== entry.challenge) return deny(400, 'invalid_grant');
    }
    if (provider === 'apple') {
      const [header, payload, signature] = String(form.client_secret || '').split('.');
      const publicHalf = crypto.createPublicKey(crypto.createPrivateKey(String(env.APPLE_PRIVATE_KEY).replace(/\\n/g, '\n')));
      const ok = header && payload && signature && crypto.verify('sha256', Buffer.from(`${header}.${payload}`), {key: publicHalf, dsaEncoding: 'ieee-p1363'}, Buffer.from(signature, 'base64url'));
      const h = ok ? JSON.parse(Buffer.from(header, 'base64url')) : {}, c = ok ? JSON.parse(Buffer.from(payload, 'base64url')) : {};
      if (!ok || h.alg !== 'ES256' || h.kid !== env.APPLE_KEY_ID || c.iss !== env.APPLE_TEAM_ID || c.sub !== env.APPLE_CLIENT_ID || c.aud !== 'https://appleid.apple.com' || c.exp * 1000 < now()) return deny(401, 'invalid_client');
    }
    entry.used = true;
    const iat = Math.floor(now() / 1000);
    log.push({provider, sub: entry.claims.sub, email: entry.claims.email});
    return {status: 200, body: {access_token: crypto.randomBytes(16).toString('hex'), token_type: 'Bearer', expires_in: 3600, id_token: sign({...entry.claims, iat, exp: iat + 600})}};
  }

  // Server-side calls (token and keys) without going through the network: used as fetchImpl.
  async function fetchImpl(url, init = {}) {
    const match = /\/(google|apple)\/(token|jwks)$/.exec(new URL(String(url)).pathname);
    if (!match || !String(url).startsWith(base)) return fetch(url, init);
    const reply = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
    if (match[2] === 'jwks') return reply(200, {keys: [jwk]});
    const {status, body} = await token(match[1], Object.fromEntries(new URLSearchParams(String(init.body || ''))));
    return reply(status, body);
  }

  const page = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f3f5;font:15px/1.5 system-ui,sans-serif;color:#1f1f1f}
main{width:min(420px,calc(100% - 32px));background:#fff;border-radius:16px;padding:28px;box-shadow:0 10px 40px #0002}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 18px;color:#555}label{display:block;margin:0 0 12px;font-size:13px;color:#444}
input[type=email],input[type=text]{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:10px 12px;border:1px solid #bbb;border-radius:8px;font:inherit}
.check{display:flex;gap:8px;align-items:center}.row{display:flex;gap:10px;margin-top:18px}button{flex:1;padding:11px;border-radius:8px;border:1px solid #1f1f1f;background:#1f1f1f;color:#fff;font:inherit;cursor:pointer}
button.ghost{background:#fff;color:#1f1f1f}.tag{display:inline-block;font-size:12px;background:#fff3cd;color:#7a5a00;border-radius:999px;padding:2px 10px;margin-bottom:12px}</style></head><body><main>${body}</main></body></html>`;

  // The browser side, served by the local server under /__fake-oauth/.
  async function handle(req, res, url) {
    const match = /^\/__fake-oauth\/(google|apple)\/(authorize|approve|token|jwks)$/.exec(url.pathname);
    if (!match) return false;
    const [, provider, step] = match, html = body => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(body); };
    if (step === 'jwks' || step === 'token') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const answer = await fetchImpl(`${base}/${provider}/${step}`, {method: req.method, body: Buffer.concat(chunks).toString('utf8')});
      res.statusCode = answer.status; res.setHeader('Content-Type', 'application/json'); res.end(await answer.text());
      return true;
    }
    const query = Object.fromEntries(url.searchParams);
    const name = provider === 'google' ? 'Google' : 'Apple';
    if (step === 'authorize') {
      const hidden = ['client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge', 'code_challenge_method', 'response_mode', 'scope', 'response_type'].filter(k => query[k]).map(k => `<input type="hidden" name="${k}" value="${esc(query[k])}">`).join('');
      html(page(`${name} (simulado)`, `<span class="tag">Simulador local · nada sai do computador</span><h1>Entrar com ${name}</h1><p>Escolha quem está entrando na loja.</p>
<form action="${esc(`${base}/${provider}/approve`)}" method="get">${hidden}
<label>E-mail<input type="email" name="email" value="pessoa.${provider}@exemplo.test" required></label>
<label>Nome<input type="text" name="firstName" value="Ana"></label><label>Sobrenome<input type="text" name="lastName" value="Souza"></label>
${provider === 'google' ? '<label class="check"><input type="checkbox" name="verified" checked> E-mail verificado pelo Google</label>' : '<label class="check"><input type="checkbox" name="hideEmail"> Ocultar meu e-mail (Apple)</label><label class="check"><input type="checkbox" name="firstTime" checked> Primeira autorização (envia o nome)</label>'}
<div class="row"><button type="submit" name="decision" value="cancel" class="ghost">Cancelar</button><button type="submit" name="decision" value="ok">Continuar</button></div></form>`));
      return true;
    }
    // approve: back to the shop
    const cancel = query.decision === 'cancel';
    let fields;
    if (cancel) fields = {error: provider === 'google' ? 'access_denied' : 'user_cancelled_authorize', state: query.state};
    else {
      try { fields = approve(provider, query, {email: query.email, firstName: query.firstName, lastName: query.lastName, verified: query.verified === 'on', hideEmail: query.hideEmail === 'on', firstTime: query.firstTime === 'on'}); }
      catch (error) { res.statusCode = 400; html(page('Erro', `<h1>Pedido inválido</h1><p>${esc(error.message)}</p>`)); return true; }
    }
    if (provider === 'google') {
      const back = new URL(query.redirect_uri);
      for (const [k, v] of Object.entries(fields)) if (v) back.searchParams.set(k, v);
      res.statusCode = 302; res.setHeader('Location', back.href); res.end();
      return true;
    }
    // Apple: response_mode=form_post. The real page posts it by itself; here one click (no script on the page).
    const inputs = Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
    html(page('Apple (simulado)', `<span class="tag">Simulador local</span><h1>${cancel ? 'Entrada cancelada' : 'Tudo certo'}</h1><p>A Apple devolve a resposta à loja com um formulário (form_post).</p><form method="post" action="${esc(query.redirect_uri)}">${inputs}<div class="row"><button type="submit">Voltar para a loja</button></div></form>`));
    return true;
  }

  return {handle, fetchImpl, approve, token, jwk, sign, subjectOf, relayOf, log};
}

module.exports = {createFakeOAuth, fakeCredentials};
