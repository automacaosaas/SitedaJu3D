#!/usr/bin/env node
'use strict';
// Applies pending database migrations (db/migrations) using DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD from the
// environment. The server also does this at start; this command is for running it by hand.
//   npm run migrate
const {getPool} = require('../api/_lib/db');
const {migrate} = require('../api/_lib/migrate');

const pool = getPool();
if (!pool) { console.error('Banco não configurado: defina DB_HOST, DB_NAME, DB_USER e DB_PASSWORD.'); process.exit(1); }
migrate(pool).then(applied => { console.log(applied.length ? `Aplicadas: ${applied.join(', ')}` : 'Nada pendente.'); return pool.end(); })
  .catch(error => { console.error('Falha na migração:', error.code || '', error.message); process.exit(1); });
