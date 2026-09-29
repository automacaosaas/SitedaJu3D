'use strict';
// Simulated Bling (API v3) for tests and the local server (`node tools/dev-server.cjs --fake-bling`). It answers the
// OAuth calls (authorize → code, token with authorization_code and refresh_token, revoke) and the NF-e calls the site
// makes (POST/PUT/GET /nfe, POST /nfe/{id}/enviar, GET /naturezas-operacoes, GET /formas-pagamentos), with Bling's shapes
// and error format. Refresh tokens are single-use (the strictest reading of Bling's docs). A recipient named with
// "REJEITAR" is rejected when sent; one with "DEMORAR" waits for the protocol once. state.environment '1' answers as
// produção, '2' (default) as homologação. Nothing here talks to the real Bling.
const crypto = require('node:crypto');

const NATURES = [{id: 1, situacao: 1, padrao: 1, descricao: 'Venda de produção do estabelecimento'}, {id: 2, situacao: 1, padrao: 0, descricao: 'Remessa para conserto'}];
const PAYMENTS = [{id: 500, descricao: 'Dinheiro', tipoPagamento: 1, situacao: 1, padrao: 1}, {id: 501, descricao: 'Pix', tipoPagamento: 17, situacao: 1, padrao: 0},
  {id: 502, descricao: 'Cartão de crédito', tipoPagamento: 3, situacao: 1, padrao: 0}, {id: 503, descricao: 'Cartão de débito', tipoPagamento: 4, situacao: 1, padrao: 0}, {id: 504, descricao: 'Pix antigo', tipoPagamento: 17, situacao: 0, padrao: 1}];

function createFakeBling({clientId = 'fake-bling-client', clientSecret = 'fake-bling-secret', natures = NATURES, paymentMethods = PAYMENTS} = {}) {
  const codes = new Map(), access = new Map(), refresh = new Set(), notes = new Map(), calls = [];
  const state = {environment: '2', accessTtl: 21600, tooManyRequests: false};
  let serial = 0, lastNumber = 0;
  const random = () => crypto.randomBytes(24).toString('base64url');
  const reply = (status, body) => ({ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body)});
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
    if (!natures.some(n => n.id === body.naturezaOperacao?.id)) return 'Natureza de operação não encontrada';
    if (!c.nome || !/^(\d{11}|\w{12}\d{2})$/.test(String(c.numeroDocumento || ''))) return 'Documento do contato inválido';
    if (!['F', 'J'].includes(c.tipoPessoa) || ![1, 2, 9].includes(c.contribuinte) || (c.contribuinte === 1 && !c.ie)) return 'Tipo de pessoa, contribuinte ou inscrição estadual do contato';
    if (!/^\d{5}-\d{3}$/.test(String(a.cep || '')) || !a.uf || !a.municipio || !a.endereco || !a.bairro) return 'Endereço do contato incompleto';
    if (!Array.isArray(body.itens) || !body.itens.length || body.itens.some(i => !i.codigo || !i.classificacaoFiscal || !(i.valor > 0) || !(i.quantidade > 0))) return 'Itens incompletos (código, NCM, valor e quantidade)';
    const total = body.itens.reduce((sum, i) => sum + i.valor * i.quantidade, 0) + (body.transporte?.frete || 0);
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

  async function fetchImpl(url, init = {}) {
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
    expireAccessTokens() { for (const token of access.keys()) access.set(token, 0); },
    forgetRefreshTokens() { refresh.clear(); }
  };
}

module.exports = {createFakeBling};
