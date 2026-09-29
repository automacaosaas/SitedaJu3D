'use strict';
// Business data for the real shipping quote (Correios, shop's contract). Filled in from the shop's answers to
// FRETE-CORREIOS-passo-a-passo.md, part 2. Nothing is guessed: while any value below is still `null`, the real quote
// stays OFF (GET /api/health says "shipping":"pending") and the site keeps charging the fixed example fee.
//
//   services       the contract's service codes (Correios Empresas → Cartões de Postagem → "CONTRATO AG"), 5 digits exactly as
//                  listed there. A service with `code: null` is simply not offered.
//   production     business days the shop needs before posting; added to the carrier's delivery time in what the buyer sees
//   labelFeeCents  extra cost per label on top of the carrier's price (0 when a label costs only the freight)
//   freeShipping   null, or {fromCents, service}: orders whose subtotal reaches `fromCents` ship free on that service
//   boxes          per product: the packed size of ONE piece (`unit`), how many pieces fit in one box (`perBox`) and the packed
//                  size of that full box (`full`; not needed when perBox is 1). Sizes in cm, weights in grams, always the box as
//                  it goes to the Correios (packaging included). Different products never share a box: each product makes its
//                  own volumes, and the Correios API prices each volume.
//   Example of one entry: {unit: {length: 20, width: 15, height: 8, weightG: 320}, perBox: 2, full: {length: 24, width: 20, height: 10, weightG: 600}}
const PACKAGING = Object.freeze({length: 22, width: 20, height: 7, weightG: 257});

module.exports = Object.freeze({
  services: Object.freeze([
    Object.freeze({id: 'pac', label: 'PAC', code: null}),
    Object.freeze({id: 'sedex', label: 'SEDEX', code: null})
  ]),
  production: Object.freeze({minDays: null, maxDays: null}),
  labelFeeCents: 0,
  freeShipping: null,
  // The three pieces ship one per box, in the same packaging registered at the Correios Empresa (Pré-postagem Web →
  // Embalagens) as "BORBOLETA E DINO": 22 × 20 × 7 cm, 257 g. Still to confirm with the shop: that 257 g is the box WITH a piece
  // (the price changes by weight bracket), and whether two pieces ever go together in one box (then `perBox`/`full` change).
  boxes: Object.freeze({
    borboletoscopio: Object.freeze({unit: PACKAGING, perBox: 1, full: null}),
    dinossauroscopio: Object.freeze({unit: PACKAGING, perBox: 1, full: null}),
    aviaoscopia: Object.freeze({unit: PACKAGING, perBox: 1, full: null})
  })
});
