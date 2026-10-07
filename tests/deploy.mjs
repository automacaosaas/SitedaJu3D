// Servidor próprio (deploy/, SERVIDOR-SETUP.md): the files the server runs are checked here, since they only run there.
// LF line endings (bash refuses CRLF), every setting the code reads listed in the .env the setup writes, the app on
// 127.0.0.1 behind nginx, an X-Forwarded-For nobody can forge, and the deploy that rolls back.
// Run: node tests/deploy.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = file => fs.readFileSync(path.join(root, file), 'utf8');
const files = fs.readdirSync(path.join(root, 'deploy'));
assert.deepEqual(files.sort(), ['deploy.sh', 'firewall.sh', 'juimprime-deploy.service', 'juimprime-deploy.timer', 'juimprime.service', 'nginx-juimprime.conf', 'setup-servidor.sh']);
for (const file of files) assert(!raw(`deploy/${file}`).includes('\r'), `deploy/${file}: LF only (the Linux server runs it)`);
assert.match(raw('.gitattributes'), /^deploy\/\*\* text eol=lf$/m, 'and Git keeps them LF, also on Windows');

const setup = raw('deploy/setup-servidor.sh'), deploy = raw('deploy/deploy.sh');
const firewall = raw('deploy/firewall.sh');
for (const [name, script] of [['setup-servidor.sh', setup], ['deploy.sh', deploy], ['firewall.sh', firewall]]) {
  assert(script.startsWith('#!/usr/bin/env bash\n'), `${name}: bash`);
  assert.match(script, /^set -euo pipefail$/m, `${name}: stops at the first error`);
}

// Every setting the code reads has its line in the .env the setup writes (filled there or left for the owner).
const template = setup.slice(setup.indexOf('cat > "$ENV_FILE" <<EOF'), setup.indexOf('\nEOF\n', setup.indexOf('cat > "$ENV_FILE" <<EOF')));
const listed = new Set([...template.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(m => m[1]));
const sources = [];
const walk = dir => { for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) { const rel = `${dir}/${entry.name}`; if (entry.isDirectory()) walk(rel); else if (/\.(c?js)$/.test(entry.name)) sources.push(raw(rel)); } };
walk('api'); walk('server'); sources.push(raw('server.cjs'));
const read = new Set(sources.flatMap(code => [...code.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})\b/g), ...code.matchAll(/pick\('([A-Z][A-Z0-9_]+)'/g)].map(m => m[1])));
// Not for this server: Vercel's own, test and simulator switches, tuning with safe defaults, the generic NF-e service
// (the shop uses Bling), the single-URL database form (the setup writes the separate fields) and the default port.
const elsewhere = /^(VERCEL_|NFE_EXAMPLE_DATA$|NFE_TOKEN$|MAIL_TRANSPORT$|BLING_AUTHORIZE_URL$|BLING_TIMEOUT_MS$|BLING_REQUESTS_PER_SECOND$|DATABASE_URL$|DB_PORT$)/;
const missing = [...read].filter(name => !elsewhere.test(name) && !listed.has(name));
assert.deepEqual(missing, [], 'the .env the setup writes lists every setting the code reads');
assert(read.size > 25 && listed.has('DATA_KEY') && listed.has('MP_MODE'), 'found the settings');
for (const name of ['DATA_KEY', 'INDEX_KEY', 'AUTH_SECRET']) assert.match(template, new RegExp(`^${name}=\\$\\(openssl rand -base64 32\\)$`, 'm'), `${name}: 32 random bytes in base64, as the code wants`);
assert.match(setup, /if \[ ! -f "\$ENV_FILE" \]; then/, 'an existing .env (and its keys) is never overwritten');

// The app only on 127.0.0.1:3000, nginx in front, and the client address written by nginx alone.
assert.match(template, /^HOST=127\.0\.0\.1$/m); assert.match(template, /^PORT=3000$/m);
assert.match(raw('server/create-server.cjs'), /const host = typeof port === 'number' && env\.HOST \? String\(env\.HOST\) : undefined;/, 'the server honours HOST');
const nginx = raw('deploy/nginx-juimprime.conf');
assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3000;/);
assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/, 'nginx overwrites X-Forwarded-For (api/_lib/http.js trusts its first value)');
const service = raw('deploy/juimprime.service');
for (const line of ['User=juimprime', 'EnvironmentFile=/srv/juimprime/shared/.env', 'WorkingDirectory=/srv/juimprime/current', 'ExecStart=/usr/local/bin/node server.cjs', 'Restart=always', 'ProtectSystem=strict']) assert(service.includes(`\n${line}\n`), `juimprime.service: ${line}`);

// The deploy: one at a time, health checked, rolled back, and the one sudo rule it needs is the one the setup writes.
assert.match(deploy, /flock -n 9 \|\| exit 0/);
assert.match(deploy, /point "\$CURRENT"\n    sudo -n \/usr\/bin\/systemctl restart juimprime\.service/, 'a release that does not answer is rolled back');
assert.match(deploy, /echo "\$NEW" > "\$FAILED"/, 'and not tried again every minute');
assert(deploy.includes('sudo -n /usr/bin/systemctl restart juimprime.service') && setup.includes('$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart juimprime.service'), 'the restart the deploy runs is the one sudoers allows');
assert.match(setup, /visudo -cqf "\$rules" \|\|/, 'the sudo rule is checked before it is installed');
assert.match(setup, /GITHUB_FP='SHA256:\+DiY3wvvV6TuJJhbpZisF\/zLDA0zPMSvHdkr4UvCOqU'/, "github.com's published key fingerprint");
assert.match(setup, /sha256sum -c --quiet -/, 'Node is checked against the official SHA-256 list');

// The firewall: only the site from everywhere, SSH from the internal networks only, IPv6 included, and back by itself
// without a confirmation.
assert(firewall.includes('policy drop;') && firewall.includes('tcp dport { 80, 443 } accept'), 'only the site from everywhere');
assert(firewall.includes('ip saddr { $ssh_v4 } tcp dport 22 accept') && firewall.includes('ip6 saddr { fe80::/10, fc00::/7 } tcp dport 22 accept'), 'SSH only from the internal networks');
assert(firewall.includes('meta l4proto ipv6-icmp accept'), 'IPv6 needs ICMPv6');
assert(firewall.includes('read -r -t 120 answer || true\nif [ "$answer" != "OK" ]; then\n  nft flush ruleset\n'), 'without OK in 2 minutes, the old rules come back');
assert(firewall.includes('nft -c -f "$new" ||'), 'the new rules are checked before they are applied');
console.log('PASS: servidor próprio — LF scripts that stop at the first error, every setting in the .env, the app on 127.0.0.1 behind nginx, X-Forwarded-For from nginx, a health-checked deploy that rolls back, and only the sudo it needs.');
