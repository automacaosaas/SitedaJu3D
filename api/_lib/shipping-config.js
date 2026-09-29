'use strict';
// Business data for the real shipping quote (Correios, shop's contract). Filled in from the shop's answers to
// FRETE-CORREIOS-passo-a-passo.md, part 2. Nothing is guessed: while any value below is still `null`, the real quote
// stays OFF (GET /api/health says "shipping":"pending") and the site keeps charging the fixed example fee.
//
//   services       the contract's service codes (Correios Empresas → Consultar Contratos → Serviços do Contrato), 5 digits exactly as
//                  listed there. A service with `code: null` is simply not offered.
//   production     business days the shop needs before posting; added to the carrier's delivery time in what the buyer sees
//   labelFeeCents  extra cost per label on top of the carrier's price (0 when a label costs only the freight)
//   freeShipping   null, or {fromCents, service}: orders whose subtotal reaches `fromCents` ship free on that service
//   sharedBox      ONE box for any mix of products: its size in cm, `maxPieces` (how many pieces fit) and `pieceG`, the packed weight in
//                  grams of one piece of each product. A box weighs the sum of its pieces; an order with more pieces than fit makes
//                  more boxes, and the Correios API prices each volume.
//   boxes          alternative to sharedBox (used only when there is no sharedBox): per product, the packed size of ONE piece (`unit`),
//                  how many fit in one box (`perBox`) and the size of that full box (`full`; not needed when perBox is 1). Different
//                  products then never share a box.
//   Example of one boxes entry: {unit: {length: 20, width: 15, height: 8, weightG: 320}, perBox: 2, full: {length: 24, width: 20, height: 10, weightG: 600}}
module.exports = Object.freeze({
  services: Object.freeze([
    // The shop ships with PAC CONTRATO AG only. SEDEX CONTRATO AG is 03220: put it here as `code` to offer it too.
    Object.freeze({id: 'pac', label: 'PAC', code: '03298'}),
    Object.freeze({id: 'sedex', label: 'SEDEX', code: null})
  ]),
  production: Object.freeze({minDays: 3, maxDays: 5}),
  labelFeeCents: 0,
  // Free shipping (PAC) when the subtotal reaches R$ 500,00, all over Brazil; the shop still pays the label (the admin shows its cost).
  freeShipping: Object.freeze({fromCents: 50000, service: 'pac'}),
  // Everything of an order goes in the one box registered at the Correios Empresa (Pré-postagem Web → Embalagens) as "BORBOLETA E DINO":
  // 22 × 20 × 7 cm, and the three products fit in it together. A box weighs the sum of its pieces: butterfly and dinosaur 257 g each,
  // airplane 257 + 220 = 477 g (the shop's numbers). If the 257 g already include the box, the sum counts it once per piece: the first
  // real quote, compared with the Correios Empresa for the same box, shows whether that matters.
  sharedBox: Object.freeze({length: 22, width: 20, height: 7, maxPieces: 3, pieceG: Object.freeze({borboletoscopio: 257, dinossauroscopio: 257, aviaoscopia: 477})})
});
