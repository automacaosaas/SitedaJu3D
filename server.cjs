'use strict';
// Entry file for the Hostinger Node.js app and for `npm start`. Hosting runners load it with require() instead of running
// it, so it starts the server unconditionally; the server itself is in server/create-server.cjs. See HOSTINGER-SETUP.md.
require('./server/create-server.cjs').start();
