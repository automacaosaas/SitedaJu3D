'use strict';
// Simulated NF-e service for tests and the local server (NFE_PROVIDER=fake, never in production). Same contract as a
// real adapter: emit(invoice) and check(reference) answer {status: 'autorizada' | 'processando' | 'erro', number, series,
// accessKey, pdfUrl, xmlUrl, message}. Idempotent by reference, like the real services: sending the same order twice
// returns the same note. A recipient named with "REJEITAR" is refused; one with "DEMORAR" stays processing once.
function createFakeProvider() {
  const notes = new Map();
  let serial = 0;
  const key = number => ('3126' + String(Date.now()).slice(-8) + '0'.repeat(20) + String(number).padStart(9, '0') + '1').slice(0, 44).padEnd(44, '0');

  return {
    name: 'fake',
    async emit(invoice) {
      const existing = notes.get(invoice.reference);
      if (existing && existing.status !== 'erro') return {...existing};
      if (/REJEITAR/i.test(invoice.recipient.name)) {
        const refused = {status: 'erro', message: 'Rejeição 539 (simulada): duplicidade de NF-e com diferença na chave de acesso'};
        notes.set(invoice.reference, refused); return {...refused};
      }
      const number = String(++serial);
      const note = {status: /DEMORAR/i.test(invoice.recipient.name) ? 'processando' : 'autorizada', number, series: invoice.series, accessKey: key(number), pdfUrl: `https://nfe.exemplo.test/danfe/${invoice.reference}.pdf`, xmlUrl: `https://nfe.exemplo.test/xml/${invoice.reference}.xml`, message: null, invoice};
      notes.set(invoice.reference, note);
      return {...note};
    },
    async check(reference) {
      const note = notes.get(reference);
      if (!note) return {status: 'erro', message: 'Nota não encontrada no emissor'};
      if (note.status === 'processando') note.status = 'autorizada';
      return {...note};
    },
    notes
  };
}

module.exports = {createFakeProvider};
