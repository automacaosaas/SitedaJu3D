'use strict';
// Applies db/migrations/*.sql in order, once each, recorded in schema_migrations. A MySQL named lock keeps two starting
// processes from migrating at the same time. Run at server start (server/create-server.cjs) and by `npm run migrate`.
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', '..', 'db', 'migrations');

// Our migration files hold plain DDL: statements end with ";" at the end of a line, and "--" starts a comment line.
function statements(sql) {
  return sql.split(/\r?\n/).filter(line => !/^\s*--/.test(line)).join('\n').split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
}

async function migrate(pool, {dir = DIR, log = console} = {}) {
  const files = fs.readdirSync(dir).filter(f => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
  const connection = await pool.getConnection();
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('ju_migrations', 30) AS got");
    if (lock.got !== 1) throw new Error('could not get the migration lock');
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) NOT NULL PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    const [rows] = await connection.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map(r => r.version));
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      for (const statement of statements(fs.readFileSync(path.join(dir, file), 'utf8'))) await connection.query(statement);
      await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
      applied.push(file);
      log.log(`db: migração aplicada — ${file}`);
    }
    return applied;
  } finally {
    await connection.query("SELECT RELEASE_LOCK('ju_migrations')").catch(() => {});
    connection.release();
  }
}

module.exports = {migrate, statements, DIR};
