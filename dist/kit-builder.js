// "Monte seu kit" (07/10/2026, pedido da dona): as peças de um kit (COMMERCE.kits; hoje as lâmpadas, R$ 90 cada, e misturando,
// 2 por R$ 160 e 3 por R$ 210) escolhidas de uma vez, com o total ao vivo. Fica na área branca da janela da peça (controller.js, logo
// depois de "Cores da peça") e na página de cada lâmpada (product-landing.js). Em cima, três atalhos ("1 por", "2 por", "3 por": só esta
// peça, esta e a seguinte, uma de cada); depois uma linha por peça do kit com − quantidade +; o total do kit com o preço cheio riscado,
// quanto economiza e o preço no Pix; e "Adicionar o kit ao carrinho", que põe tudo no carrinho numa vez só.
// As contas são as do carrinho (cart-store.js totals/pixDiscount): o total aqui é o que o carrinho e o servidor cobram.
// Atenção: os grupos do kit valem no carrinho TODO (cart-store.js priceSegments, api/_lib/catalog.js splitByKit). Se o carrinho já tem
// lâmpadas, o kit pode custar menos que o total dele sozinho; a linha "Com o que já está no carrinho: + R$ X" mostra o que muda de fato.
// Tudo montado com createElement/textContent (nada de dados em innerHTML); o i18n.js traduz os textos como em qualquer parte da página.
import {PRODUCTS} from './products.js';
import {COMMERCE, money, kitOf} from './commerce-config.js';
import {totals, pixDiscount, readCart as storedCart} from './cart-store.js';
import {icon} from './icons.js';

export const KIT_MAX = 9;
// as peças do kit de uma peça, na ordem do kit ([] se ela não tem kit)
export const kitItems = productId => { const kit = kitOf(productId); return kit ? COMMERCE.kits[kit].items.filter(id => Object.hasOwn(PRODUCTS, id)) : []; };
// as faixas de preço: 1 pelo preço da peça, depois cada grupo do kit. [{units, cents, each}]
export function kitTiers(productId) {
  const kit = kitOf(productId);
  if (!kit) return [];
  const groups = COMMERCE.kits[kit].groups;
  return [{units: 1, cents: COMMERCE.prices[productId]}, ...Object.keys(groups).map(Number).filter(n => n > 1).sort((a, b) => a - b).map(n => ({units: n, cents: groups[n]}))]
    .map(tier => ({...tier, each: Math.round(tier.cents / tier.units)}));
}
// os atalhos das faixas: 1 = só esta peça; 2 = esta e a seguinte do kit; 3 = uma de cada (e assim por diante, sempre na ordem do kit)
export function kitPreset(productId, units) {
  const items = kitItems(productId), start = Math.max(0, items.indexOf(productId)), counts = Object.fromEntries(items.map(id => [id, 0]));
  for (let k = 0; k < units && items.length; k++) counts[items[(start + k) % items.length]]++;
  return counts;
}
// {id: quantidade} → as linhas de carrinho que o kit vira (só peças à venda, de 1 a KIT_MAX unidades)
export function kitLines(counts) {
  return Object.entries(counts || {}).filter(([id, quantity]) => Object.hasOwn(PRODUCTS, id) && quantity >= 1)
    .map(([productId, quantity]) => ({productId, selection: {}, quantity: Math.min(KIT_MAX, Math.floor(quantity)), unitPrice: COMMERCE.prices[productId]}));
}
// O preço do kit: full (preço cheio), total (com os grupos do kit), saving, pix (o total no Pix) e added (o que o carrinho de agora sobe
// com o kit; difere de total quando o carrinho já tem peças do mesmo kit).
export function kitQuote(counts, cart = []) {
  const lines = kitLines(counts), units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const full = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), total = totals(lines, 0).subtotal;
  const before = totals(cart, 0).subtotal, added = totals([...cart, ...lines], 0).subtotal - before;
  return {lines, units, full, total, saving: full - total, pix: total - pixDiscount(lines), added};
}

const make = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };
const mounted = new WeakMap();

// Monta o kit dentro de host (um elemento vazio). Dois jeitos (08/10/2026, "uma compra só"):
// - com onAdd(lines) (a página de cada lâmpada): o bloco é a compra — o total e "Adicionar ao carrinho", que põe as linhas no carrinho
//   (pode ser assíncrono; um erro aparece na linha de aviso). Sem nenhuma peça, o botão continua no Tab (aria-disabled) e diz o porquê.
// - sem onAdd (a janela da peça): o bloco só escolhe; quem compra é a barra da janela, que segue onChange(quote) (o preço do kit, o Pix…).
// onChange(quote) vem a cada mudança (kitQuote). cart() lê o carrinho de agora (para a linha "Com o que já está no carrinho").
// Quem usa leitor de tela ouve, a cada toque, quantas de cada peça ficaram e o total (usabilidade 4). Devolve {set(counts), counts(), refresh()}.
export function mountKit(host, {current, onAdd = null, onChange = null, cart = () => storedCart()}) {
  mounted.get(host)?.abort();
  const items = kitItems(current), tiers = kitTiers(current);
  host.replaceChildren();
  if (!items.length) return null;
  const off = new AbortController();
  mounted.set(host, off);
  let counts = kitPreset(current, 1), busy = false;

  const root = make('div', 'kit');
  // os atalhos
  const tierBar = make('div', 'kit-tiers');
  tierBar.setAttribute('role', 'group'); tierBar.setAttribute('aria-label', 'Kits prontos');
  const tierButtons = tiers.map(tier => {
    const b = make('button', 'kit-tier'); b.type = 'button'; b.dataset.units = String(tier.units);
    b.append(make('span', 'kit-tier-n', `${tier.units} por`), make('span', 'kit-tier-price', money(tier.cents)));
    if (tier.units > 1) b.append(make('span', 'kit-tier-each', `${money(tier.each)} cada`));
    tierBar.append(b);
    return b;
  });
  // uma linha por peça do kit
  const list = make('ul', 'kit-rows');
  const rows = items.map(id => {
    const p = PRODUCTS[id], li = make('li', 'kit-row'); li.dataset.kitItem = id;
    const art = make('span', 'kit-art'); const img = make('img'); img.src = `assets/card-preview-${id}.webp`; img.alt = ''; img.width = img.height = 96; img.loading = 'lazy'; img.decoding = 'async'; art.append(img);
    const name = make('span', 'kit-name'); name.append(make('strong', null, p.title));
    const dots = make('span', 'kit-dots'); dots.setAttribute('aria-hidden', 'true');
    for (const c of p.colors || []) { const i = make('i'); i.style.background = c.hex; dots.append(i); }
    name.append(dots);
    const stepper = make('span', 'kit-stepper'); stepper.setAttribute('role', 'group'); stepper.setAttribute('aria-label', `Quantidade de ${p.title}`);
    const minus = make('button', 'kit-step is-minus'); minus.type = 'button'; minus.dataset.step = '-1'; minus.setAttribute('aria-label', `Diminuir quantidade de ${p.title}`);
    const plus = make('button', 'kit-step is-plus'); plus.type = 'button'; plus.dataset.step = '1'; plus.setAttribute('aria-label', `Aumentar quantidade de ${p.title}`);
    for (const b of [minus, plus]) b.append(make('span', 'kit-step-mark'));
    const out = make('output', 'kit-qty'); out.setAttribute('aria-live', 'off');
    stepper.append(minus, out, plus);
    li.append(art, name, stepper);
    list.append(li);
    return {id, li, minus, plus, out};
  });
  // o total (só quando o bloco é a compra: na janela, o total está na barra) e o desconto; o que se ouve vai pelo `said`
  const buying = typeof onAdd === 'function';
  const sum = make('div', 'kit-sum');
  const totalRow = make('p', 'kit-total'), totalLabel = make('span', 'kit-total-label'), totalValue = make('strong'), fullValue = make('s'), totalPrices = make('span', 'kit-total-prices');
  // o preço cheio riscado é só para os olhos: quem ouve recebe o total e quanto economiza
  fullValue.setAttribute('aria-hidden', 'true');
  totalPrices.append(fullValue, totalValue); totalRow.append(totalLabel, totalPrices);
  const dealRow = make('p', 'kit-deal'), count = make('span', 'kit-count'), saving = make('span', 'kit-saving'), pix = make('span', 'kit-pix');
  if (buying) dealRow.append(saving, pix); else dealRow.append(count, saving);
  const cartRow = make('p', 'kit-cart-note'), cartValue = make('strong');
  cartRow.append(make('span', null, 'Com o que já está no carrinho:'), ' ', cartValue);
  if (buying) sum.append(totalRow);
  sum.append(dealRow, cartRow);
  const said = make('p', 'sr-only'); said.setAttribute('role', 'status');
  // a compra (só na página da lâmpada)
  const add = make('button', 'kit-add'), addLabel = make('span'); add.type = 'button';
  add.insertAdjacentHTML('afterbegin', icon('cart'));   // o ícone é do próprio site (icons.js), não um dado
  add.append(addLabel);
  const status = make('p', 'kit-status'); status.setAttribute('role', 'status');
  root.classList.toggle('is-picker', !buying);
  root.append(tierBar, list, sum, ...(buying ? [add, status] : []), said);
  host.append(root);

  function paint() {
    const quote = kitQuote(counts, safeCart());
    for (const b of tierButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.units) === quote.units));
    for (const row of rows) {
      const n = counts[row.id] || 0;
      row.out.textContent = String(n);
      row.li.classList.toggle('is-on', n > 0);
      row.minus.setAttribute('aria-disabled', String(n <= 0));
      row.plus.setAttribute('aria-disabled', String(n >= KIT_MAX));
    }
    // uma peça só não é "kit": "Total" e "Adicionar ao carrinho"; de duas em diante, "Total do kit" e "Adicionar o kit ao carrinho"
    totalLabel.textContent = quote.units > 1 ? 'Total do kit' : 'Total';
    totalValue.textContent = money(quote.total);
    fullValue.textContent = money(quote.full); fullValue.hidden = !quote.saving;
    count.textContent = `${quote.units} ${quote.units === 1 ? 'peça' : 'peças'}`;
    saving.textContent = `economize ${money(quote.saving)}`; saving.hidden = !quote.saving;
    pix.textContent = `${money(quote.pix)} no Pix`; pix.hidden = !quote.units;
    dealRow.hidden = buying ? !quote.units : !quote.saving;
    cartValue.textContent = `+ ${money(quote.added)}`; cartRow.hidden = !quote.units || quote.added === quote.total;
    addLabel.textContent = quote.units > 1 ? 'Adicionar o kit ao carrinho' : 'Adicionar ao carrinho';
    add.disabled = busy; add.setAttribute('aria-disabled', String(!quote.units));
    root.classList.toggle('is-empty', !quote.units);
    sum.hidden = !buying && dealRow.hidden && cartRow.hidden;
    onChange?.(quote);
    return quote;
  }
  function safeCart() { try { return cart() || []; } catch { return []; } }
  function set(next) { counts = Object.fromEntries(items.map(id => [id, Math.max(0, Math.min(KIT_MAX, Math.floor(next?.[id] || 0)))])); status.textContent = ''; return paint(); }
  // o que mudou, para quem ouve: quantas de cada peça e o total (os nomes e os números não se traduzem; "Total do kit" sim)
  function tell(quote) {
    if (!quote.units) { said.textContent = 'Escolha pelo menos uma peça.'; return; }
    const names = rows.filter(row => counts[row.id]).map(row => `${PRODUCTS[row.id].title}: ${counts[row.id]}`).join(', ');
    said.replaceChildren(`${names}. `, make('span', null, quote.units > 1 ? 'Total do kit' : 'Total'), ` ${money(quote.total)}`);
  }

  tierBar.addEventListener('click', event => { const b = event.target.closest('[data-units]'); if (b) tell(set(kitPreset(current, Number(b.dataset.units)))); }, {signal: off.signal});
  list.addEventListener('click', event => {
    const b = event.target.closest('[data-step]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    const id = b.closest('[data-kit-item]').dataset.kitItem;
    tell(set({...counts, [id]: (counts[id] || 0) + Number(b.dataset.step)}));
  }, {signal: off.signal});
  add.addEventListener('click', async () => {
    const lines = kitLines(counts).map(({productId, selection, quantity}) => ({productId, selection, quantity}));
    if (busy) return;
    if (!lines.length) { status.textContent = 'Escolha pelo menos uma peça.'; return; }
    busy = true; paint();
    try { await onAdd(lines); status.textContent = ''; }
    catch (error) { status.textContent = error?.message || 'Não foi possível adicionar o kit. Tente novamente.'; }
    finally { busy = false; paint(); }
  }, {signal: off.signal});
  // o carrinho mudou (aqui ou em outra aba): a linha do que muda no carrinho se refaz
  for (const type of ['ju:cart', 'storage']) window.addEventListener(type, paint, {signal: off.signal});

  paint();
  return {set, counts: () => ({...counts}), refresh: paint};
}
