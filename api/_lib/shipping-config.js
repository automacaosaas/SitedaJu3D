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
    // PAC CONTRATO AG and SEDEX CONTRATO AG (Correios Empresas → Consultar Contratos → Serviços do Contrato). The buyer chooses; the free
    // shipping below applies to PAC only, so SEDEX is the paid, faster option.
    Object.freeze({id: 'pac', label: 'PAC', code: '03298'}),
    Object.freeze({id: 'sedex', label: 'SEDEX', code: '03220'})
  ]),
  production: Object.freeze({minDays: 3, maxDays: 5}),
  labelFeeCents: 0,
  // Free shipping on PAC when the subtotal reaches R$ 500,00, all over Brazil; the shop still pays the label (the admin shows its cost).
  // SEDEX is never free: a buyer who wants it pays its full price.
  freeShipping: Object.freeze({fromCents: 50000, service: 'pac'}),
  // Everything of an order goes in the one box registered at the Correios Empresa (Pré-postagem Web → Embalagens) as "BORBOLETA E DINO":
  // 22 × 20 × 7 cm, and the three products fit in it together. A box weighs the sum of its pieces. The shop's measures, packed: butterfly +
  // dinosaur together 257 g (so about half each), the airplane about 250 g on top (all three about 507 g). APPROXIMATE: weigh the real packed
  // boxes and edit the three numbers below (nothing else changes). The three pieces together sit right at 500 g, so that one matters most.
  // The lamps (monkey, giraffe, unicorn; on sale since 07/10/2026): ESTIMATED at 110 g packed each (a printed tube with the head, lighter
  // than the airplane) and assumed to fit the same box — weigh one packed and edit the numbers.
  sharedBox: Object.freeze({length: 22, width: 20, height: 7, maxPieces: 3, pieceG: Object.freeze({borboletoscopio: 129, dinossauroscopio: 128, aviaoscopia: 250, macacoscopio: 110, girafoscopio: 110, unicornioscopio: 110})}),
  // Abroad (the panel's "Envio internacional", 05/10/2026): the Correios Exporta Fácil services, quoted with the same contract
  // and the same box. Only the services in the contract answer; one that is not comes back refused and the panel says so.
  // The codes are the ones in the Correios price API manual; confirm in Correios Empresas → Serviços do Contrato.
  international: Object.freeze({
    services: Object.freeze([
      Object.freeze({id: 'standard', label: 'Exporta Fácil Standard', code: '45128'}),
      Object.freeze({id: 'expresso', label: 'Exporta Fácil Expresso', code: '45110'}),
      Object.freeze({id: 'economico', label: 'Exporta Fácil Econômico', code: '45209'})
    ]),
    // Customs: HS code (the first 6 digits of NCM 3926.90.90) and what each piece really is, in English (a vague description is
    // the most common reason for a parcel to be held). Above US$ 1,000 a shipment needs a DU-E (Portal Único Siscomex).
    hsCode: '392690',
    descriptions: Object.freeze({
      borboletoscopio: '3D printed plastic cover for ophthalmic retinoscope',
      dinossauroscopio: '3D printed plastic cover for ophthalmic retinoscope',
      aviaoscopia: '3D printed plastic fixation target for skiascopy rack',
      macacoscopio: '3D printed plastic cover for portable slit lamp',
      girafoscopio: '3D printed plastic cover for portable slit lamp',
      unicornioscopio: '3D printed plastic cover for portable slit lamp'
    }),
    dueLimitUsd: 1000
  })
});
