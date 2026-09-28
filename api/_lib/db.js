'use strict';
// MySQL connection for the Hostinger database. Settings come from environment variables (DB_HOST, DB_PORT, DB_NAME,
// DB_USER, DB_PASSWORD); the password never goes into the repository. One small pool per process.
let pool = null, poolKey = '';

function dbSettings(env = process.env) {
  const settings = {host: String(env.DB_HOST || '').trim(), port: Number(env.DB_PORT) || 3306, database: String(env.DB_NAME || '').trim(), user: String(env.DB_USER || '').trim(), password: String(env.DB_PASSWORD || '')};
  return {...settings, configured: Boolean(settings.host && settings.database && settings.user)};
}

function getPool(env = process.env) {
  const s = dbSettings(env);
  if (!s.configured) return null;
  const key = `${s.host}:${s.port}/${s.database}@${s.user}`;
  if (pool && poolKey === key) return pool;
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({host: s.host, port: s.port, database: s.database, user: s.user, password: s.password, connectionLimit: 5, waitForConnections: true, charset: 'utf8mb4', timezone: 'Z', dateStrings: false, multipleStatements: false, enableKeepAlive: true, connectTimeout: 10000});
  poolKey = key;
  return pool;
}

async function ping(env = process.env) {
  const p = getPool(env);
  if (!p) return 'off';
  try { await p.query('SELECT 1'); return 'ok'; } catch (error) { console.error('db: ping failed —', error.code || error.message); return 'error'; }
}

module.exports = {dbSettings, getPool, ping};
