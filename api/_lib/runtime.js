'use strict';
// Where the functions run. Vercel sets VERCEL_ENV; the Node server used on the Hostinger (server.cjs) reads APP_ENV from
// the panel's environment variables. Either one set to "production" means the live shop, so test-only paths stay closed.
const isProduction = (env = process.env) => env.APP_ENV === 'production' || env.VERCEL_ENV === 'production';

module.exports = {isProduction};
