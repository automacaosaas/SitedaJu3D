/* Stand-in for https://sdk.mercadopago.com/js/v2, used only by "node tools/dev-server.cjs --fake-mp".
   It renders a small imitation of the Payment Brick and calls onSubmit({selectedPaymentMethod, formData}) the way the
   real one does, so the checkout can be tried end to end without credentials. */
(function () {
  function MercadoPago(publicKey, options) { this.publicKey = publicKey; this.options = options || {}; }
  // Stand-in for the device id that https://www.mercadopago.com/v2/security.js sets on the real checkout (the site then
  // does not load that script here, and the simulated Mercado Pago sees it as X-meli-session-id).
  window.MP_DEVICE_SESSION_ID = window.MP_DEVICE_SESSION_ID || 'fake-device-' + Math.random().toString(36).slice(2, 12);
  // Like mp.getInstallments: the simulated account's plans for this amount (tools/fake-mercadopago.cjs, through the local
  // server): 1x without interest, 2x to 12x at 2.99% a month with a CET label, except the first ones with --sem-juros=N.
  MercadoPago.prototype.getInstallments = function (params) {
    return fetch('/__fake-mp/installments?amount=' + encodeURIComponent((params && params.amount) || '') + '&bin=' + encodeURIComponent((params && params.bin) || ''))
      .then(function (response) { if (!response.ok) throw new Error('installments ' + response.status); return response.json(); });
  };
  MercadoPago.prototype.bricks = function () {
    return {
      create: function (name, containerId, settings) {
        var box = document.getElementById(containerId);
        var amount = settings.initialization.amount;
        // Like the real Brick, offer only the methods asked for in customization.paymentMethods.
        var methods = (settings.customization && settings.customization.paymentMethods) || {};
        var hasCard = Boolean(methods.creditCard || methods.debitCard), hasPix = Boolean(methods.bankTransfer);
        if (!hasCard && !hasPix) hasCard = hasPix = true;
        var startPix = !hasCard;
        box.innerHTML = '<form data-fake-brick style="display:grid;gap:12px;padding:16px;border:1px dashed #b64c68;border-radius:14px;background:#fffcfb">' +
          '<strong style="font-size:13px;color:#b64c68">SIMULAÇÃO DO PAGAMENTO · não é o Mercado Pago</strong>' +
          (hasCard ? '<label><input type="radio" name="fake-method" value="credit_card"' + (startPix ? '' : ' checked') + '> Cartão de crédito</label>' : '') +
          (hasPix ? '<label><input type="radio" name="fake-method" value="bank_transfer"' + (startPix ? ' checked' : '') + '> Pix</label>' : '') +
          '<label data-card>Nome do titular <input name="holder" value="APRO" autocomplete="off" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:8px"><small style="display:block;color:#7b7076">APRO aprova · CONT deixa em análise · OTHE, FUND, SECU, CALL… recusam</small></label>' +
          '<label data-card>Parcelas <select name="installments" style="padding:6px"><option value="1">1x</option><option value="3">3x</option><option value="6">6x</option><option value="12">12x</option></select></label>' +
          '<button type="submit" style="padding:12px;border:0;border-radius:999px;background:#b64c68;color:#fff;font-weight:700;cursor:pointer">Pagar R$ ' + Number(amount).toFixed(2).replace('.', ',') + '</button></form>';
        var form = box.querySelector('form'), busy = false;
        var bin = function (value) { if (settings.callbacks.onBinChange) settings.callbacks.onBinChange(value); };
        var sync = function () { var pix = form.elements['fake-method'].value === 'bank_transfer'; form.querySelectorAll('[data-card]').forEach(function (el) { el.style.display = pix ? 'none' : ''; }); bin(pix ? undefined : '54808328'); };
        form.addEventListener('change', sync);
        setTimeout(sync, 80);
        form.addEventListener('submit', function (event) {
          event.preventDefault(); if (busy) return; busy = true;
          var pix = form.elements['fake-method'].value === 'bank_transfer', email = settings.initialization.payer && settings.initialization.payer.email;
          var holder = String(form.elements.holder.value || 'APRO').toUpperCase().replace(/[^A-Z0-9]/g, '');
          var token = (holder + 'x'.repeat(32)).slice(0, 32);
          var formData = pix ? {payment_method_id: 'pix', transaction_amount: amount, payer: {email: email}}
            : {token: token, issuer_id: '24', payment_method_id: 'master', transaction_amount: amount, payment_method_option_id: null, processing_mode: null, installments: Number(form.elements.installments.value), payer: {email: email, identification: {type: 'CPF', number: '12345678909'}}};
          form.querySelector('button').disabled = true;
          Promise.resolve(settings.callbacks.onSubmit({selectedPaymentMethod: pix ? 'bank_transfer' : 'credit_card', formData: formData}))
            .catch(function () {}).then(function () { busy = false; var button = form.querySelector('button'); if (button) button.disabled = false; });
        });
        setTimeout(function () { settings.callbacks.onReady && settings.callbacks.onReady(); }, 50);
        return Promise.resolve({unmount: function () { box.innerHTML = ''; }});
      }
    };
  };
  window.MercadoPago = MercadoPago;
})();
