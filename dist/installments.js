// How much each installment really costs on the buyer's card. The Payment Brick tells the checkout the first digits of the
// card (onBinChange); Mercado Pago then answers, for that card and amount, every installment option with its value and total
// (mp.getInstallments, public key only). This file turns that answer into a small table: the installment, the total and the
// interest paid on top of the price (total − price), plus the effective yearly cost (CET) when Mercado Pago sends it.
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

// The table under the payment form. Nothing when there is only one way to pay (no installments to compare).
export function installmentsTable(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return '';
  const body = rows.map(r => `<tr><th scope="row">${r.installments}x de ${money(r.eachCents)}</th><td>${money(r.totalCents)}</td><td>${r.interestCents ? `+ ${money(r.interestCents)}${r.cet ? `<small>CET ${r.cet.replace(/[^\d.,%]/g, '')} ao ano</small>` : ''}` : '<em>sem juros</em>'}</td></tr>`).join('');
  return `<p class="installments-title">Parcelas neste cartão</p><table class="installments-table"><thead><tr><th scope="col">Parcelas</th><th scope="col">Total</th><th scope="col">Juros</th></tr></thead><tbody>${body}</tbody></table><p class="small-note">Valores do Mercado Pago para este cartão. O que passa do preço à vista são os juros do parcelamento.</p>`;
}
