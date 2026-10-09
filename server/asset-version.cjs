'use strict';
// The ?v= of the site's own stylesheets and scripts (09/10/2026, returning visitors: no revalidation each): a fingerprint of
// the file's contents. tools/sync-versions.cjs writes it into every address the pages use (<link>, <script>, modulepreload
// and the import map, which carries it to every import without touching the code), and server/create-server.cjs gives a
// year in the cache, never asked for again, only to the address with the file's current fingerprint. One function for both,
// so they always agree.
// Line endings do not count: Git keeps LF and a Windows checkout has CRLF (core.autocrlf), and the fingerprint written on
// the PC must be the one the Linux server works out from the same commit.
const crypto = require('node:crypto');

// .css and .js under dist/ (the root and vendor/): the files whose ?v= is their fingerprint
const HASHED = /\.(?:css|js)$/i;
const LENGTH = 8;   // hex digits: 32 bits, for telling one version of a file from its previous ones

function assetVersion(contents) {
  const text = Buffer.isBuffer(contents) ? contents.toString('latin1') : Buffer.from(String(contents)).toString('latin1');
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'latin1').digest('hex').slice(0, LENGTH);
}

module.exports = {assetVersion, HASHED, LENGTH};
