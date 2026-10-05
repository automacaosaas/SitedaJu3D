'use strict';
// Simulated Bling (API v3) for tests and the local server (`node tools/dev-server.cjs --fake-bling`). It answers the
// OAuth calls (authorize → code, token with authorization_code and refresh_token, revoke) and the NF-e calls the site
// makes (POST/PUT/GET /nfe, POST /nfe/{id}/enviar, GET /naturezas-operacoes, GET /formas-pagamentos), with Bling's shapes
// and error format. Refresh tokens are single-use (the strictest reading of Bling's docs). A recipient named with
// "REJEITAR" is rejected when sent; correct(id) plays the person who fixes that note in Bling (locally:
// /__fake-bling/corrigir?id=…). One with "DEMORAR" waits for the protocol once. state.environment '1' answers as
// produção, '2' (default) as homologação. Nothing here talks to the real Bling.
//
// Failures, to see the site keep going without Bling (BLING-RESILIENCIA.md; locally: /__fake-bling/falha?modo=…):
// state.fault = 'rede' (the connection is refused), 'lento' (never answers: the site's timeout fires), 'erro' (503),
// 'limite' (429), 'queda' (does the work, then the connection drops before the answer), 'gateway' (does the work,
// then answers 502) or 'corpo' (does the work, sends the start of the answer and stalls); state.faultCount limits it to
// the next N calls, state.faultMatch to calls starting with, say,
// 'POST /nfe'. state.retryAfter adds a Retry-After header (seconds) to the 429.
const crypto = require('node:crypto');

const NATURES = [{id: 1, situacao: 1, padrao: 1, descricao: 'Venda de produção do estabelecimento'}, {id: 2, situacao: 1, padrao: 0, descricao: 'Remessa para conserto'}, {id: 3, situacao: 1, padrao: 0, descricao: 'Venda de produção do estabelecimento – contribuinte'}];
const PAYMENTS = [{id: 500, descricao: 'Dinheiro', tipoPagamento: 1, situacao: 1, padrao: 1}, {id: 501, descricao: 'Pix', tipoPagamento: 17, situacao: 1, padrao: 0},
  {id: 502, descricao: 'Cartão de crédito', tipoPagamento: 3, situacao: 1, padrao: 0}, {id: 503, descricao: 'Cartão de débito', tipoPagamento: 4, situacao: 1, padrao: 0}, {id: 504, descricao: 'Pix antigo', tipoPagamento: 17, situacao: 0, padrao: 1}];

function createFakeBling({clientId = 'fake-bling-client', clientSecret = 'fake-bling-secret', natures = NATURES, paymentMethods = PAYMENTS} = {}) {
  const codes = new Map(), access = new Map(), refresh = new Set(), notes = new Map(), calls = [];
  const state = {environment: '2', accessTtl: 21600, tooManyRequests: false, fault: null, faultCount: null, faultMatch: null, retryAfter: null};
  let serial = 0, lastNumber = 0;
  const random = () => crypto.randomBytes(24).toString('base64url');
  const reply = (status, body, headers = {}) => ({ok: status >= 200 && status < 300, status, headers: {get: name => headers[String(name).toLowerCase()] ?? null}, json: async () => body, text: async () => JSON.stringify(body)});
  const error = (status, type, description, fields) => reply(status, {error: {type, message: type === 'VALIDATION_ERROR' ? 'Não foi possível salvar' : type, description, ...(fields ? {fields} : {})}});

  function tokens() {
    const accessToken = 'eyJ.fake.' + random(), refreshToken = random();
    access.set(accessToken, Date.now() + state.accessTtl * 1000); refresh.add(refreshToken);
    return {access_token: accessToken, expires_in: state.accessTtl, token_type: 'Bearer', scope: '98309 5990556', refresh_token: refreshToken};
  }

  // What Bling does when the person allows the app: a one-minute code for the redirect. Null for a wrong client.
  function authorize(url) {
    const u = new URL(url);
    if (u.searchParams.get('client_id') !== clientId || u.searchParams.get('response_type') !== 'code') return null;
    const code = crypto.randomBytes(20).toString('hex');
    codes.set(code, Date.now() + 60000);
    return {code, state: u.searchParams.get('state')};
  }

  function validate(body) {
    const c = body?.contato || {}, a = c.endereco || {};
    if (body?.tipo !== 1) return 'Tipo da nota inválido';
    if (![body.dataEmissao, body.dataOperacao].every(d => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(d || '')))) return 'Data de operação inválida';   // as the real Bling (01/10/2026)
    if ((body.parcelas || []).some(p => !/^\d{4}-\d{2}-\d{2}$/.test(String(p.data || '')))) return 'Data da parcela inválida';
    if (!natures.some(n => n.id === body.naturezaOperacao?.id)) return 'Natureza de operação não encontrada';
    if (!c.nome || !/^(\d{11}|\w{12}\d{2})$/.test(String(c.numeroDocumento || ''))) return 'Documento do contato inválido';
    if (!['F', 'J'].includes(c.tipoPessoa) || ![1, 2, 9].includes(c.contribuinte) || (c.contribuinte === 1 && !c.ie)) return 'Tipo de pessoa, contribuinte ou inscrição estadual do contato';
    if (!/^\d{5}-\d{3}$/.test(String(a.cep || '')) || !a.uf || !a.municipio || !a.endereco || !a.bairro) return 'Endereço do contato incompleto';
    if (!Array.isArray(body.itens) || !body.itens.length || body.itens.some(i => !i.codigo || !i.classificacaoFiscal || !(i.valor > 0) || !(i.quantidade > 0))) return 'Itens incompletos (código, NCM, valor e quantidade)';
    const total = body.itens.reduce((sum, i) => sum + i.valor * i.quantidade, 0) + (body.transporte?.frete || 0) - (body.desconto || 0);
    if (Math.abs(total - (body.parcelas || []).reduce((sum, p) => sum + p.valor, 0)) > 0.001) return 'A soma das parcelas difere do total da nota';
    if ((body.parcelas || []).some(p => p.formaPagamento && !paymentMethods.some(f => f.id === p.formaPagamento.id))) return 'Forma de pagamento não encontrada';
    return null;
  }

  const view = note => ({
    id: note.id, tipo: 1, situacao: note.situacao, numero: note.numero || '', serie: 1, chaveAcesso: note.key || '',
    linkDanfe: note.numero ? `https://www.bling.com.br/doc.view.php?id=fake${note.id}` : '', linkPDF: note.numero ? `https://www.bling.com.br/doc.view.php?PDF=true&id=fake${note.id}` : '',
    xml: note.numero ? `https://www.bling.com.br/relatorios/nfe.xml.php?chaveAcesso=${note.key}` : '',
    contato: {nome: note.body.contato.nome, numeroDocumento: note.body.contato.numeroDocumento}, naturezaOperacao: note.body.naturezaOperacao
  });

  // The failure that applies to this call, if any (counting down state.faultCount).
  function activeFault(method, u) {
    if (!state.fault) return null;
    if (state.faultMatch && !`${method} ${u.pathname.replace('/Api/v3', '')}`.startsWith(state.faultMatch)) return null;
    if (state.faultCount !== null) { if (state.faultCount <= 0) { state.fault = null; state.faultCount = null; return null; } state.faultCount--; }
    return state.fault;
  }
  const connectionError = code => Object.assign(new TypeError('fetch failed'), {cause: Object.assign(new Error(code), {code})});
  // Never answers; gives up only when the caller aborts (its timeout).
  const hang = signal => new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('This operation was aborted'), {name: 'AbortError'}));
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
  });

  async function fetchImpl(url, init = {}) {
    const u = new URL(String(url)), method = String(init.method || 'GET').toUpperCase();
    const fault = activeFault(method, u);
    if (fault === 'rede') { calls.push({method, host: u.host, path: u.pathname.replace('/Api/v3', '') + u.search, body: null, fault}); throw connectionError('ECONNREFUSED'); }
    if (fault === 'lento') { calls.push({method, host: u.host, path: u.pathname.replace('/Api/v3', '') + u.search, body: null, fault}); return hang(init.signal); }
    if (fault === 'erro') { calls.push({method, host: u.host, path: u.pathname.replace('/Api/v3', '') + u.search, body: null, fault}); return error(503, 'SERVICE_UNAVAILABLE', 'Serviço temporariamente indisponível (simulado)'); }
    if (fault === 'limite') { calls.push({method, host: u.host, path: u.pathname.replace('/Api/v3', '') + u.search, body: null, fault}); return reply(429, {error: {type: 'TOO_MANY_REQUESTS', message: 'TOO_MANY_REQUESTS', description: 'Limite de requisições atingido'}}, state.retryAfter ? {'retry-after': String(state.retryAfter)} : {}); }
    const answer = await handle(url, init);
    if (fault === 'queda') throw connectionError('ECONNRESET');   // the work was done; the answer never arrives
    if (fault === 'gateway') return error(502, 'BAD_GATEWAY', 'Bad Gateway (simulado)');
    if (fault === 'corpo') return {...answer, json: () => hang(init.signal), text: () => hang(init.signal)};   // the work was done; the answer starts and stalls
    return answer;
  }

  async function handle(url, init = {}) {
    const u = new URL(String(url)), method = String(init.method || 'GET').toUpperCase(), headers = init.headers || {};
    calls.push({method, host: u.host, path: u.pathname.replace('/Api/v3', '') + u.search, body: String(init.body || '').startsWith('{') ? JSON.parse(init.body) : null});
    if (u.host === 'www.bling.com.br' && u.pathname.startsWith('/Api/v3/oauth/')) {
      if (headers.Authorization !== 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')) return error(401, 'invalid_client', 'Aplicativo não autorizado');
      const form = new URLSearchParams(String(init.body || ''));
      if (u.pathname.endsWith('/token') && form.get('grant_type') === 'authorization_code') {
        const expires = codes.get(form.get('code')); codes.delete(form.get('code'));
        return expires && expires > Date.now() ? reply(200, tokens()) : error(400, 'invalid_grant', 'Código de autorização inválido ou expirado');
      }
      if (u.pathname.endsWith('/token') && form.get('grant_type') === 'refresh_token') return refresh.delete(form.get('refresh_token')) ? reply(200, tokens()) : error(400, 'invalid_grant', 'Refresh token inválido');
      if (u.pathname.endsWith('/revoke')) { refresh.delete(form.get('token')); return reply(200, {}); }
      return error(400, 'unsupported_grant_type', 'Requisição OAuth inválida');
    }
    if (u.host !== 'api.bling.com.br' || !u.pathname.startsWith('/Api/v3/')) throw new Error(`fake-bling: unexpected ${method} ${url}`);
    if (headers['enable-jwt'] !== '1') return error(400, 'invalid_request', 'Envie o cabeçalho enable-jwt');
    const bearer = String(headers.Authorization || '').replace(/^Bearer /, '');
    if (!(access.get(bearer) > Date.now())) return error(401, 'invalid_token', 'invalid_token');
    if (state.tooManyRequests) return error(429, 'TOO_MANY_REQUESTS', 'Limite de requisições atingido');
    const path = u.pathname.slice('/Api/v3'.length), body = init.body ? JSON.parse(init.body) : null;

    if (method === 'GET' && path === '/naturezas-operacoes') return reply(200, {data: natures});
    // The list of notes, with the filters the site uses (tipo, situação, day of issue "AAAA-MM-DD"), as Bling lists them.
    if (method === 'GET' && path === '/nfe') {
      const q = u.searchParams, day = value => String(value || '').slice(0, 10);
      let list = [...notes.values()];
      if (q.get('situacao')) list = list.filter(n => n.situacao === Number(q.get('situacao')));
      if (q.get('dataEmissaoInicial')) list = list.filter(n => day(n.body.dataEmissao) >= day(q.get('dataEmissaoInicial')));
      if (q.get('dataEmissaoFinal')) list = list.filter(n => day(n.body.dataEmissao) <= day(q.get('dataEmissaoFinal')));
      const limit = Number(q.get('limite')) || 100, page = Number(q.get('pagina')) || 1;
      return reply(200, {data: list.slice((page - 1) * limit, page * limit).map(n => ({id: n.id, tipo: 1, situacao: n.situacao, numero: n.numero || '', dataEmissao: n.body.dataEmissao, dataOperacao: n.body.dataOperacao,
        contato: {nome: n.body.contato.nome, numeroDocumento: n.body.contato.numeroDocumento}, naturezaOperacao: n.body.naturezaOperacao}))});
    }
    if (method === 'GET' && path === '/formas-pagamentos') return reply(200, {data: paymentMethods});
    if (method === 'POST' && path === '/nfe') {
      const problem = validate(body);
      if (problem) return error(400, 'VALIDATION_ERROR', 'Não foi possível salvar a nota fiscal', [{code: 1, msg: problem, element: 'nfe', namespace: 'NFE', collection: []}]);
      const id = 12000000 + ++serial;
      notes.set(String(id), {id, situacao: 1, body, numero: null, key: null, checks: 0});
      return reply(201, {data: {id, numero: '', serie: '1', contato: {nome: body.contato.nome}}});
    }
    const match = /^\/nfe\/(\d+)(\/enviar)?$/.exec(path), note = match && notes.get(match[1]);
    if (match && !note) return error(404, 'RESOURCE_NOT_FOUND', 'Nota fiscal não encontrada');
    if (note && method === 'PUT' && !match[2]) {
      if (![1, 4].includes(note.situacao)) return error(400, 'VALIDATION_ERROR', 'A nota não pode ser alterada nesta situação');
      const problem = validate(body);
      if (problem) return error(400, 'VALIDATION_ERROR', 'Não foi possível salvar a nota fiscal', [{code: 1, msg: problem, element: 'nfe', namespace: 'NFE', collection: []}]);
      note.body = body;
      return reply(200, {data: {id: note.id}});
    }
    if (note && method === 'POST' && match[2]) {
      if (u.searchParams.get('enviarEmail') !== 'false') note.bling_emailed = true;
      if (![1, 4].includes(note.situacao)) return error(400, 'VALIDATION_ERROR', 'A nota já foi enviada');
      if (/REJEITAR/i.test(note.body.contato.nome)) { note.situacao = 4; return error(400, 'VALIDATION_ERROR', 'A nota fiscal não foi autorizada', [{code: 539, msg: 'Rejeição 539: Duplicidade de NF-e, com diferença na Chave de Acesso (simulada)', element: 'nfe', namespace: 'SEFAZ', collection: []}]); }
      note.numero = String(++lastNumber);
      note.key = ('31' + '2609' + '67771044000196' + '55' + '001' + note.numero.padStart(9, '0') + '1' + '12345678').padEnd(43, '0') + '7';
      note.situacao = /DEMORAR/i.test(note.body.contato.nome) ? 8 : 5;
      note.environment = state.environment;
      return reply(200, {data: {xml: `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"><NFe><infNFe Id="NFe${note.key}"><ide><cUF>31</cUF><nNF>${note.numero}</nNF><tpAmb>${state.environment}</tpAmb></ide></infNFe></NFe></nfeProc>`}});
    }
    if (note && method === 'GET') {
      if (note.situacao === 8 && note.checks++ >= 1) note.situacao = 5;   // the protocol arrives by the second look
      return reply(200, {data: view(note)});
    }
    return error(404, 'RESOURCE_NOT_FOUND', `${method} ${path} não existe`);
  }

  return {
    fetchImpl, authorize, notes, calls, state, clientId, clientSecret,
    // A failure for the next calls (see the top of this file); fail() with nothing puts Bling back to normal.
    fail(mode = null, {count = null, match = null, retryAfter = null} = {}) { Object.assign(state, {fault: mode, faultCount: count, faultMatch: match, retryAfter}); },
    correct(id) {   // the recipient fixed by hand on the note, as in Bling's screen; false when there is no such note
      const note = notes.get(String(id));
      if (!note) return false;
      note.body = {...note.body, contato: {...note.body.contato, nome: note.body.contato.nome.replace(/\s*REJEITAR\s*/gi, ' ').trim() || 'Corrigido no Bling'}};
      return true;
    },
    expireAccessTokens() { for (const token of access.keys()) access.set(token, 0); },
    forgetRefreshTokens() { refresh.clear(); }
  };
}

module.exports = {createFakeBling};
