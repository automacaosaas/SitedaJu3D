// "Envio internacional" in Ju's panel (05/10/2026): an order from abroad, asked by WhatsApp or e-mail. Ju picks the country
// and the pieces; the freight and the time come from the shop's Correios contract (Exporta Fácil, /api/admin/international-
// quote), with the total to charge, the customs data to copy into Minhas Exportações and the steps up to the tracking code.
// A service the contract or the country does not take shows the Correios' own words. admin.js shows this part and hands
// the clicks and the typing over, like the Fluxo de caixa.
import {internationalQuote} from './admin-auth.js';
import {PRODUCTS} from './products.js';
import {COMMERCE, money} from './commerce-config.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
// Every country (ISO 3166 alpha-2) but Brazil, named by the browser in Portuguese; the usual ones first.
const FIRST = ['MX', 'US', 'PT', 'AR', 'CL', 'CO', 'PE', 'UY', 'PY', 'ES', 'FR', 'IT', 'DE', 'GB', 'CA', 'JP'];
const ALL = 'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW'.split(' ');
let names = null;
const nameOf = code => { try { names ??= new Intl.DisplayNames(['pt-BR'], {type: 'region'}); return names.of(code) || code; } catch { return code; } };
const sorted = () => ALL.filter(c => !FIRST.includes(c)).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'pt-BR'));
const FOR_SALE = Object.keys(PRODUCTS);

// admin.js passes run (busy dialog + re-render), announce, signedOut and render.
let deps = null;
export function initIntl(options) { deps = options; }

const form = {country: 'MX', quantities: Object.fromEntries(FOR_SALE.map(id => [id, 0]))};
let quote = null, error = '';
export function resetIntl() { quote = null; error = ''; form.country = 'MX'; for (const id of FOR_SALE) form.quantities[id] = 0; }

const ERRORS = {
  shipping_off: 'O frete dos Correios não está ligado neste site (faltam as credenciais do contrato).',
  invalid_country: 'Escolha um país de destino (o Brasil usa o frete normal do site).',
  invalid_request: 'Escolha de 1 a 10 peças.',
  shipping_unavailable: 'Os Correios não responderam agora. Tente de novo em alguns minutos.'
};
// The Correios give a range ("9 a 12 dias úteis"); a single time when that is all they give.
const daysText = o => !o.deliveryDays ? 'os Correios não informaram' : o.deliveryDaysMin && o.deliveryDaysMin < o.deliveryDays ? `${o.deliveryDaysMin} a ${o.deliveryDays} dias úteis` : `${o.deliveryDays} dias úteis`;

function formView() {
  const option = code => `<option value="${code}"${form.country === code ? ' selected' : ''}>${esc(nameOf(code))}</option>`;
  const pieces = FOR_SALE.map(id => `<label class="intl-piece"><span><strong>${esc(PRODUCTS[id].title)}</strong><small>${esc(money(COMMERCE.prices[id]))}</small></span>
      <input type="number" min="0" max="10" step="1" inputmode="numeric" value="${form.quantities[id]}" data-intl-qty="${id}" aria-label="Quantidade de ${esc(PRODUCTS[id].title)}"></label>`).join('');
  return `<section class="intl-card" aria-labelledby="intl-form-title">
    <h2 id="intl-form-title">Pedido</h2>
    <label class="admin-field intl-country"><span>País de destino</span><select id="intl-country">
      <optgroup label="Mais comuns">${FIRST.map(option).join('')}</optgroup><optgroup label="Todos os países">${sorted().map(option).join('')}</optgroup></select></label>
    <fieldset class="intl-pieces"><legend>Peças (nas cores que o cliente escolher)</legend>${pieces}</fieldset>
    ${error ? `<p class="admin-error" role="alert">${esc(error)}</p>` : ''}
    <button type="button" class="btn-ink intl-go" data-intl="quote">Calcular frete pelos Correios</button>
  </section>`;
}

function resultView() {
  if (!quote) return '';
  const box = quote.volumes.map(v => `${v.count > 1 ? `${v.count} caixas de ` : ''}${v.length} × ${v.width} × ${v.height} cm, ${v.weightG} g`).join(' + ');
  const rows = quote.options.map(o => `<tr><th scope="row">${esc(o.label)}<small>código ${esc(o.code)}</small></th><td>${esc(money(o.priceCents))}</td><td>${esc(daysText(o))}</td>
      <td><strong>${esc(money(quote.piecesCents + o.priceCents))}</strong> <button type="button" class="intl-copy" data-intl-copy="${esc(((quote.piecesCents + o.priceCents) / 100).toFixed(2).replace('.', ','))}" aria-label="Copiar o total com ${esc(o.label)}">Copiar</button></td></tr>`).join('');
  const refused = quote.refused.length ? `<div class="intl-refused"><h3>Não cotado</h3><ul>${quote.refused.map(r => `<li><strong>${esc(r.label)}</strong> (código ${esc(r.code)}): ${esc(r.reason === 'rejected' ? (r.messages.join(' · ') || 'recusado pelos Correios') : 'os Correios não responderam agora')}</li>`).join('')}</ul>
      <p>Recusado pelos Correios quer dizer que este serviço não está no contrato ou não atende esse país. Para incluir um serviço, fale com o gerente do contrato nos Correios.</p></div>` : '';
  const customs = quote.customs, declared = customs.items.reduce((sum, i) => sum + i.unitCents * i.quantity, 0);
  const customsRows = customs.items.map(i => `<tr><td>${esc(i.description)} <button type="button" class="intl-copy" data-intl-copy="${esc(i.description)}" aria-label="Copiar a descrição em inglês de ${esc(i.title)}">Copiar</button><small>${esc(i.title)}</small></td><td>${i.quantity}</td><td>${esc(money(i.unitCents))}</td></tr>`).join('');
  const country = nameOf(quote.country);
  return `<section class="intl-card" aria-labelledby="intl-result-title">
    <h2 id="intl-result-title">Frete para ${esc(country)}</h2>
    <p class="intl-meta">Peças: <strong>${esc(money(quote.piecesCents))}</strong> · Embalagem: ${esc(box)}</p>
    ${quote.options.length ? `<div class="intl-table-wrap"><table class="intl-table"><thead><tr><th scope="col">Serviço</th><th scope="col">Frete</th><th scope="col">Prazo dos Correios</th><th scope="col">Total a cobrar</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="intl-note">Antes de postar, some a produção: ${esc(COMMERCE.productionLabel)}. Impostos e taxas de importação são cobrados de quem recebe, no país de destino: avise o cliente antes de cobrar.</p>` : `<p class="admin-empty">Nenhum serviço do contrato atende ${esc(country)} com essas peças.</p>`}
    ${refused}
  </section>
  <section class="intl-card" aria-labelledby="intl-customs-title">
    <h2 id="intl-customs-title">Dados de alfândega</h2>
    <p class="intl-meta">Para a pré-postagem no Minhas Exportações. Código HS (SH): <strong>${esc(customs.hsCode)}</strong> <button type="button" class="intl-copy" data-intl-copy="${esc(customs.hsCode)}" aria-label="Copiar o código HS">Copiar</button></p>
    <div class="intl-table-wrap"><table class="intl-table"><thead><tr><th scope="col">Descrição (inglês)</th><th scope="col">Qtd.</th><th scope="col">Valor unitário</th></tr></thead><tbody>${customsRows}</tbody></table></div>
    <p class="intl-note">Valor das peças: ${esc(money(declared))}. Acima de US$ ${esc(String(customs.dueLimitUsd || 1000))} por remessa é preciso registrar a DU-E no Portal Único Siscomex.</p>
  </section>
  <section class="intl-card" aria-labelledby="intl-steps-title">
    <h2 id="intl-steps-title">Passo a passo</h2>
    <ol class="intl-steps">
      <li><strong>Cobrar.</strong> No Mercado Pago (app ou site), em Cobrar → Link de pagamento, crie um link com o total escolhido e mande ao cliente. Quem está fora paga com cartão de crédito; o Pix não serve.</li>
      <li><strong>Nota fiscal de exportação.</strong> No Bling, com a natureza "Exportação de mercadoria" (CFOP 7101, CSOSN 300); o cliente vai como estrangeiro (UF EX, sem CPF), com a UF e o local de embarque, o frete por conta do remetente, em cada item a unidade tributável que a tabela de exportação da NF-e pede para o NCM (se for KG, o peso das peças) e, nas informações complementares, o local de embarque (nome, endereço e CNPJ). Passo a passo no NFE-SETUP.md, "Venda para o exterior".</li>
      <li><strong>Pré-postagem.</strong> No <a href="https://www.correios.com.br/enviar/encomendas/internacional" target="_blank" rel="noopener">Minhas Exportações</a>, com o serviço escolhido, os dados de alfândega acima, o peso e as medidas; imprima a etiqueta e a declaração.</li>
      <li><strong>Postar e avisar.</strong> Poste na agência e mande o código de rastreio ao cliente.</li>
    </ol>
  </section>`;
}

export function intlView() {
  return `<div class="admin-dash-head"><div><h1 id="admin-title" tabindex="-1">Envio internacional</h1><p>Pedido de fora do Brasil (WhatsApp ou e-mail): frete e prazo pelo contrato dos Correios, no Exporta Fácil.</p></div></div>
    <div class="intl-grid">${formView()}<div class="intl-results">${resultView()}</div></div>`;
}

// ── events handed over by admin.js ──────────────────────────────────────
export function handleIntlClick(event) {
  const target = event.target;
  const copy = target.closest('[data-intl-copy]');
  if (copy) {
    const text = copy.dataset.intlCopy;
    navigator.clipboard?.writeText(text).then(() => deps.announce('Copiado.'), () => deps.announce(`Não deu para copiar: ${text}`));
    copy.textContent = 'Copiado'; setTimeout(() => { copy.textContent = 'Copiar'; }, 1500);
    return true;
  }
  if (!target.closest('[data-intl="quote"]')) return false;
  const items = FOR_SALE.filter(id => form.quantities[id] > 0).map(id => ({productId: id, quantity: form.quantities[id]}));
  if (!items.length) { error = ERRORS.invalid_request; quote = null; deps.render(false); return true; }
  error = '';
  deps.run('Consultando os Correios…', async () => {
    try { quote = await internationalQuote(form.country, items); deps.announce(`Frete para ${nameOf(form.country)} calculado.`); }
    catch (failure) {
      if (failure.code === 'unauthorized') { deps.signedOut(); return; }
      quote = null; error = ERRORS[failure.code] || 'Não foi possível calcular agora.';
    }
  });
  return true;
}
export function handleIntlInput(event) {
  const qty = event.target.closest?.('[data-intl-qty]');
  if (qty) { form.quantities[qty.dataset.intlQty] = Math.max(0, Math.min(10, Math.floor(Number(qty.value) || 0))); return; }
  if (event.target.id === 'intl-country') form.country = event.target.value;
}
