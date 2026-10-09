// How much each installment really costs on the buyer's card. The Payment Brick tells the checkout the first digits of the
// card (onBinChange); Mercado Pago then answers, for that card and amount, every installment option with its value and total
// (mp.getInstallments, public key only). This file turns that answer into a short summary (the longest plan without interest,
// the longest with interest and its total) and, behind "Ver todas as parcelas", the table of every option: the installment,
// the total and the interest paid on top of the price (total − price), plus the effective yearly cost (CET) when Mercado Pago
// sends it.
import {money} from './commerce-config.js';

const cents = value => Math.round((Number(value) || 0) * 100);

// Mercado Pago's answer → [{installments, eachCents, totalCents, interestCents, cet}], in order. Debit cards and options
// without a sensible amount are left out; an answer that does not look right gives [].
export function installmentRows(answer, amountCents) {
  const options = Array.isArray(answer) ? answer : [];
  const credit = options.find(o => Array.isArray(o?.payer_costs) && o.payment_type_id !== 'debit_card');
  if (!credit) return [];
  const rows = credit.payer_costs
    .filter(c => Number.isInteger(c?.installments) && c.installments >= 1 && Number(c.total_amount) > 0 && Number(c.installment_amount) > 0)
    .map(c => {
      const totalCents = cents(c.total_amount);
      const cet = (Array.isArray(c.labels) ? c.labels : []).map(label => /CFT_([\d.,]+%)/.exec(String(label))?.[1]).find(Boolean) || null;
      return {installments: c.installments, eachCents: cents(c.installment_amount), totalCents, interestCents: Math.max(0, totalCents - amountCents), cet};
    });
  return rows.sort((a, b) => a.installments - b.installments).filter((row, i, all) => i === 0 || row.installments !== all[i - 1].installments);
}

// How many installments of this card come without interest, exactly as the table shows them: the rows from 1x on, until the
// first one with interest. The card option of the checkout promises "sem juros" only that far. null without rows.
export function interestFreeCount(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let n = 0;
  for (const row of rows) { if (row.interestCents) break; n = row.installments; }
  return n;
}

// How many installments the card option may promise "sem juros": the typed card's own count (interestFreeCount) first, before
// that the account's (/api/payments/config interestFree; unknown: none), never past what the site announces. 0 = no promise
// (the checkout then says "EM ATÉ 12X").
export function promisedInstallments(card, account, announced) {
  const given = card ?? account, n = Number.isInteger(given) ? Math.min(announced, given) : 0;
  return n >= 2 ? n : 0;
}

// The table of every option: the installment, the total and the interest on top of the price (with the CET when Mercado
// Pago sends it). Nothing when there is only one way to pay (no installments to compare).
const cetText = cet => `CET ${String(cet).replace(/[^\d.,%]/g, '')} ao ano`;   // a label from outside: digits and % only
export function installmentsTable(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return '';
  const body = rows.map(r => `<tr><th scope="row">${r.installments}x de ${money(r.eachCents)}</th><td>${money(r.totalCents)}</td><td>${r.interestCents ? `+ ${money(r.interestCents)}${r.cet ? `<small>${cetText(r.cet)}</small>` : ''}` : '<em>sem juros</em>'}</td></tr>`).join('');
  return `<table class="installments-table"><thead><tr><th scope="col">Parcelas</th><th scope="col">Total</th><th scope="col">Juros</th></tr></thead><tbody>${body}</tbody></table>`;
}

// What the box under the payment form shows at a glance (2026-10-08, the owner: "uma tabela gigantesca de parcelas"): the
// longest plan without interest, and the longest one with interest with its total, its interest and the CET; null without
// options to compare. The whole table stays one click away (installmentsInfo).
export function installmentsSummary(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  let free = null;
  for (const row of rows) { if (row.interestCents) break; free = row; }
  const longest = rows[rows.length - 1];
  return {free, interest: longest.interestCents ? longest : null, count: rows.length};
}
const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PERCENT = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 12 8-8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="4.6" cy="4.6" r="1.7" fill="currentColor"/><circle cx="11.4" cy="11.4" r="1.7" fill="currentColor"/></svg>';
// The box: the summary always visible, every option behind "Ver todas as parcelas" (a native disclosure, so the keyboard,
// the screen reader and the open/closed state come with it). `open` keeps it open when the box is drawn again for a new card.
export function installmentsInfo(rows, {open = false} = {}) {
  const summary = installmentsSummary(rows);
  if (!summary) return '';
  const {free, interest} = summary;
  const freeLine = free ? `<li class="is-free"><span class="installments-mark">${CHECK}</span><span><strong>${free.installments > 1 ? `Até ${free.installments}x de ${money(free.eachCents)}` : `${free.installments}x de ${money(free.eachCents)}`}</strong> <span>sem juros</span></span></li>` : '';
  const cet = interest?.cet ? ` · <span>${cetText(interest.cet)}</span>` : '';
  const interestLine = interest ? `<li class="has-interest"><span class="installments-mark">${PERCENT}</span><span><strong>Até ${interest.installments}x de ${money(interest.eachCents)}</strong> <span>com juros</span><small><span>Total</span> ${money(interest.totalCents)} · <span>Juros</span> ${money(interest.interestCents)}${cet}</small></span></li>` : '';
  return `<p class="installments-title">Parcelas neste cartão</p><ul role="list" class="installments-summary">${freeLine}${interestLine}</ul><details class="installments-more"${open ? ' open' : ''}><summary><span>Ver todas as parcelas</span></summary>${installmentsTable(rows)}<p class="small-note">Valores do Mercado Pago para este cartão. O que passa do preço à vista são os juros do parcelamento.</p></details>`;
}
