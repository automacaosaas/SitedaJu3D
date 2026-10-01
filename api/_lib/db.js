'use strict';
// MySQL connection for the Hostinger database. Settings come from environment variables (DB_HOST, DB_PORT, DB_NAME,
// DB_USER, DB_PASSWORD); the password never goes into the repository. One small pool per process.
let pool = null, poolKey = '';

// Either separate variables or one DATABASE_URL (mysql://user:password@host:3306/database); separate ones win.
function fromUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!/^mysql2?:$/.test(url.protocol)) return {};
    return {host: url.hostname, port: url.port, database: decodeURIComponent(url.pathname.slice(1)), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password)};
  } catch { return {}; }
}
function dbSettings(env = process.env) {
  const url = fromUrl(env.DATABASE_URL);
  const pick = (name, key) => String(env[name] ?? url[key] ?? '').trim();
  const settings = {host: pick('DB_HOST', 'host'), port: Number(pick('DB_PORT', 'port')) || 3306, database: pick('DB_NAME', 'database'), user: pick('DB_USER', 'user'), password: String(env.DB_PASSWORD ?? url.password ?? '')};
  return {...settings, configured: Boolean(settings.host && settings.database && settings.user)};
}

function getPool(env = process.env) {
  const s = dbSettings(env);
  if (!s.configured) return null;
  const key = `${s.host}:${s.port}/${s.database}@${s.user}`;
  if (pool && poolKey === key) return pool;
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({host: s.host, port: s.port, database: s.database, user: s.user, password: s.password, connectionLimit: 5, waitForConnections: true, charset: 'utf8mb4', timezone: 'Z', dateStrings: false, multipleStatements: false, enableKeepAlive: true, connectTimeout: 10000});
  // Dates from the app go in as UTC (timezone 'Z'); the ones MySQL fills by itself (DEFAULT CURRENT_TIMESTAMP: created_at,
  // last_seen_at…) follow the session time zone, which on a shared host may be local time. Every connection uses UTC,
  // so both kinds line up. The command is queued before the connection's first query.
  pool.on('connection', connection => connection.query("SET time_zone = '+00:00'", error => { if (error) console.error('db: could not set the UTC time zone —', error.code || error.message); }));
  poolKey = key;
  return pool;
}

async function ping(env = process.env) {
  const p = getPool(env);
  if (!p) return 'off';
  try { await p.query('SELECT 1'); return 'ok'; } catch (error) { console.error('db: ping failed —', error.code || error.message); return 'error'; }
}

module.exports = {dbSettings, getPool, ping};
