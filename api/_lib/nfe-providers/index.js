'use strict';
// The NF-e service chosen with the accountant plugs in here: one adapter per provider, all with the contract of fake.js.
// Until the real one is written, only the simulator exists; any other NFE_PROVIDER value is reported as not supported.
const {createFakeProvider} = require('./fake');

let fake = null;
function providerFor(settings) {
  if (settings.mode === 'off') return null;
  if (settings.provider === 'fake') return (fake ??= createFakeProvider());
  throw Object.assign(new Error(`NF-e provider "${settings.provider}" is not supported yet`), {code: 'provider_not_supported'});
}

module.exports = {providerFor};
