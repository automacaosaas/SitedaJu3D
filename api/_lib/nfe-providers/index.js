'use strict';
// The NF-e service chosen with the accountant plugs in here: one adapter per provider, all with the contract of fake.js.
// Bling (NFE_PROVIDER=bling) is the accountant's choice; the simulator serves tests and the local server. Any other
// NFE_PROVIDER value is reported as not supported.
const {createFakeProvider} = require('./fake');
const {createBlingProvider} = require('./bling');

let fake = null;
function providerFor(settings, deps = {}) {
  if (settings.mode === 'off') return null;
  if (settings.provider === 'fake') return (fake ??= createFakeProvider());
  if (settings.provider === 'bling') return createBlingProvider(deps);
  throw Object.assign(new Error(`NF-e provider "${settings.provider}" is not supported yet`), {code: 'provider_not_supported'});
}

module.exports = {providerFor};
