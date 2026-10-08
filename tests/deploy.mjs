// Servidor próprio (deploy/, SERVIDOR-SETUP.md): the files the server runs are checked here, since they only run there.
// LF line endings (bash refuses CRLF), every setting the code reads listed in the .env the setup writes, the app on
// 127.0.0.1 behind nginx, an X-Forwarded-For nobody can forge, and the deploy: tests before the switch, a copy of the
// database before new migrations, a health check that proves the new commit and the database, the rollback that the
// timer respects, the e-mail when it fails.
// Run: node tests/deploy.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const raw = file => fs.readFileSync(path.join(root, file), 'utf8');
const files = fs.readdirSync(path.join(root, 'deploy'));
assert.deepEqual(files.sort(), ['backup-config.sh', 'backup-nuvem.sh', 'config-pagamentos.sh', 'deploy.sh', 'firewall.sh', 'juimprime-backup.service', 'juimprime-backup.timer', 'juimprime-deploy-alert.service', 'juimprime-deploy.service', 'juimprime-deploy.timer', 'juimprime-rollback.service', 'juimprime.service', 'nginx-juimprime.conf', 'setup-servidor.sh']);
for (const file of files) assert(!raw(`deploy/${file}`).includes('\r'), `deploy/${file}: LF only (the Linux server runs it)`);
assert.match(raw('.gitattributes'), /^deploy\/\*\* text eol=lf$/m, 'and Git keeps them LF, also on Windows');

const setup = raw('deploy/setup-servidor.sh'), deploy = raw('deploy/deploy.sh');
const firewall = raw('deploy/firewall.sh');
const cloud = raw('deploy/backup-nuvem.sh'), cloudSetup = raw('deploy/backup-config.sh'), payments = raw('deploy/config-pagamentos.sh');
for (const [name, script] of [['setup-servidor.sh', setup], ['deploy.sh', deploy], ['firewall.sh', firewall], ['backup-nuvem.sh', cloud], ['backup-config.sh', cloudSetup], ['config-pagamentos.sh', payments]]) {
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
// (the shop uses Bling), the single-URL database form (the setup writes the separate fields), the default port and the
// local simulator of the Google/Apple sign-in.
const elsewhere = /^(VERCEL_|NFE_EXAMPLE_DATA$|NFE_TOKEN$|MAIL_TRANSPORT$|BLING_AUTHORIZE_URL$|BLING_TIMEOUT_MS$|BLING_REQUESTS_PER_SECOND$|DATABASE_URL$|DB_PORT$|SOCIAL_FAKE_URL$)/;
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
assert.match(deploy, /point "\$CURRENT"\n    restart\n/, 'a release that does not answer is rolled back');
assert.match(deploy, /restart\(\) \{ sudo -n \/usr\/bin\/systemctl restart juimprime\.service; \}/);
assert.match(deploy, /echo "\$NEW" > "\$FAILED"/, 'and not tried again every minute');
assert(deploy.includes('sudo -n /usr/bin/systemctl restart juimprime.service') && setup.includes('$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart juimprime.service'), 'the restart the deploy runs is the one sudoers allows');
// Production is main; a commit that is not the whole site, or that would listen on every address, never goes live.
assert.match(setup, /^BRANCH_DEFAULT=main\b/m, 'the server publishes main unless deploy.conf says otherwise');
assert(deploy.includes('if [ ! -f "$BUILD/server.cjs" ] || [ ! -f "$BUILD/package.json" ]; then refuse guarda') && deploy.includes(`if ! grep -q 'env\\.HOST' "$BUILD/server/create-server.cjs"`), 'the safety guard: server.cjs, package.json and HOST');
assert.match(deploy, /npm ci --omit=dev --ignore-scripts /, 'no package runs code while installing');
assert.match(deploy, /echo "\$NEW" > "\$BUILD\/REVISION"/, 'each release knows its commit');
// The tests run inside the new release, without the server's variables and at low priority, before anything is switched.
const at = text => { const i = deploy.indexOf(text); assert(i > 0, `deploy.sh has: ${text}`); return i; };
assert.match(deploy, /env -i PATH="\$PATH" HOME="\$HOME" LANG=C\.UTF-8 TEST_SKIP="\$TEST_SKIP" nice -n 10 node tools\/run-tests\.mjs/, 'tests with no secret in their environment');
assert.match(deploy, /if \[ "\$TESTS" != off \]; then/, 'TESTS=off in deploy.conf skips them');
assert.match(deploy, /^TEST_SKIP=\$\{TEST_SKIP-model-details\}/m, 'the slow 3D-model suite is skipped by default (GitHub runs it)');
assert(at('tools/run-tests.mjs') < at('point "$RELEASE"') && at('backup "antes-${NEW:0:7}"') < at('point "$RELEASE"'), 'tests and the database copy come before the switch');
// The health check proves the database and the commit, not just a running process.
assert(deploy.includes(`grep -q '"ok":true' <<<"$body" && grep -q '"db":"ok"' <<<"$body"`) && deploy.includes('grep -q "\\"release\\":\\"${want:0:12}\\"" <<<"$body"'), 'healthy = ok, database ok and the expected release');
assert.match(deploy, /if healthy "\$\(reports "\$RELEASE"\)"; then/);
// The database copy: only before a release with new migrations, the password never on a command line.
assert.match(deploy, /new_migrations\(\) \{ comm -13 /);
assert.match(deploy, /mariadb-dump --defaults-extra-file="\$CNF" --single-transaction --quick --no-tablespaces "\$name"/, 'mariadb-dump reads the password from a private file');
assert.doesNotMatch(deploy, /mariadb-dump[^\n]*(-p\S|--password)/, 'never --password or -p on the command line');
assert.match(deploy, /CNF=\$\(mktemp "\$APP_DIR\/\.dump-XXXXXX"\)/); assert.match(deploy, /trap 'rm -f "\$CNF"' EXIT/, 'and the file goes away');
assert.match(deploy, /tail -n \+\$\(\(KEEP_BACKUPS \+ 1\)\)/, 'the newest KEEP_BACKUPS copies stay');
// --force never deletes the live release; --rollback holds the timer until a new commit arrives.
assert.match(deploy, /\[ "\$RELEASE" = "\$CURRENT" \] && RELEASE="\$RELEASE-\$\(date \+%Y%m%d%H%M%S\)"/, '--force on the live commit builds beside it');
assert(at('[ "$RELEASE" != "$CURRENT" ] || {') < at('rm -rf "$RELEASE"'), 'and the live folder is never removed');
assert.match(deploy, /echo "\$tip" > "\$HOLD"/, 'a rollback records the branch tip it stepped back from');
assert.match(deploy, /\[ -f "\$HOLD" \] && \[ "\$\(cat "\$HOLD"\)" = "\$NEW" \] && exit 0/, 'the timer leaves that tip alone');
assert.match(deploy, /rm -f "\$HOLD"   # um commit novo/, 'and a new commit (or --force) resumes publishing');
assert(at('if [ "$MODE" = --rollback ]; then') < at('git -C "$REPO_DIR" fetch'), 'the rollback works without GitHub');
const rollbackUnit = raw('deploy/juimprime-rollback.service'), deployUnit = raw('deploy/juimprime-deploy.service'), alertUnit = raw('deploy/juimprime-deploy-alert.service');
assert(rollbackUnit.includes('\nExecStart=/usr/local/lib/juimprime/deploy.sh --rollback\n') && rollbackUnit.includes('\nUser=juimprime\n'));
assert(setup.includes('/usr/bin/systemctl start juimprime-rollback.service') && !/rollback@|\*/.test(setup.match(/^\s*echo "\$OPERATOR ALL=.*$/m)[0]), 'the operator may start the rollback (no wildcards in the rule)');
for (const unit of ['juimprime-rollback.service', 'juimprime-deploy-alert.service']) assert(setup.includes(`"$HERE/${unit}"`), `the setup installs ${unit}`);
// A failure e-mails the shop; a kit that changed in Git is pointed out after a deploy (the setup itself runs as root, by hand).
assert(deployUnit.includes('\nOnFailure=juimprime-deploy-alert.service\n') && rollbackUnit.includes('\nOnFailure=juimprime-deploy-alert.service\n'), 'OnFailure on deploy and rollback');
assert(alertUnit.includes('\nExecStart=/usr/local/bin/node tools/deploy-alert.cjs\n') && alertUnit.includes('\nEnvironmentFile=/srv/juimprime/shared/.env\n') && alertUnit.includes('\nConditionPathExists=/srv/juimprime/current/tools/deploy-alert.cjs\n'));
assert.match(deploy, /cmp -s "\$RELEASE\/deploy\/deploy\.sh" "\$LIB\/deploy\.sh" \|\| stale\+=\(deploy\.sh\)/, 'the installed kit is compared with the release');
assert(setup.includes('if [ ! -f /etc/nginx/sites-available/juimprime ]; then'), 'running the setup again keeps the domain and HTTPS that certbot added');
assert.match(deployUnit, /^TimeoutStartSec=25min$/m, 'room for the tests');
assert.match(setup, /visudo -cqf "\$rules" \|\|/, 'the sudo rule is checked before it is installed');
assert.match(setup, /GITHUB_FP='SHA256:\+DiY3wvvV6TuJJhbpZisF\/zLDA0zPMSvHdkr4UvCOqU'/, "github.com's published key fingerprint");
assert.match(setup, /sha256sum -c --quiet -/, 'Node is checked against the official SHA-256 list');

// The daily copy of the database off the server (08/10/2026: "um dump do banco… numa nuvem"): the same mariadb-dump as
// the deploy, checked, locked with a PUBLIC age key (the private one stays off the server) and sent to Backblaze B2 with a
// write-only key; a failure e-mails the shop; the B2 key is typed once, never on a command line.
{
  const unit = raw('deploy/juimprime-backup.service'), timer = raw('deploy/juimprime-backup.timer');
  assert(cloud.includes('/usr/local/lib/juimprime/deploy.sh --backup diario') && deploy.includes('label=${2:-manual}; [[ "$label" =~ ^[a-z0-9-]{1,20}$ ]]'), 'the copy is the deploy\'s own mariadb-dump, named "diario"');
  assert(cloud.includes('gzip -t "$FILE"') && cloud.includes("tail -n 1 | grep -q 'Dump completed'"), 'checked before it leaves the server');
  assert(cloud.includes('age -R "$RECIPIENTS" -o "$OUT" "$FILE"') && cloudSetup.includes('^age1[a-z0-9]{50,70}$'), 'locked with public age keys only');
  assert(cloud.includes('copyto "$OUT" "$DEST" --no-check-dest') && !/rclone[^\n]*\b(delete|purge|sync|lsf?|cat)\b/.test(cloud), 'sent without reading, listing or deleting anything in the bucket (write-only key)');
  assert(cloud.includes("printf 'nuvem \\n' > \"$STATUS\"") && unit.includes('\nOnFailure=juimprime-deploy-alert.service\n') && unit.includes('\nUser=juimprime\n') && unit.includes('\nProtectSystem=strict\n'), 'a failure e-mails the shop (reason "nuvem")');
  assert(cloud.includes('Cópia na nuvem ainda não configurada') && cloud.includes('exit 0'), 'before backup-config.sh, it only says so in the journal');
  assert(timer.includes('OnCalendar=*-*-* 03:30') && timer.includes('Persistent=true'), 'every night, and after a night the server was off');
  assert(setup.includes('mariadb-client age rclone') && setup.includes('"$HERE/backup-nuvem.sh"') && setup.includes('"$HERE/juimprime-backup.service" "$HERE/juimprime-backup.timer"') && setup.includes('systemctl enable --now juimprime-backup.timer'), 'the setup installs and turns it on');
  assert(setup.includes('/usr/bin/systemctl start juimprime-backup.service'), 'the operator may run it now');
  assert(cloudSetup.includes("read -r -s -p \"applicationKey") && cloudSetup.includes("printf '[b2]\\ntype = b2\\naccount = %s\\nkey = %s") && cloudSetup.includes('umask 077') && cloudSetup.includes('chmod 600 "$SHARED/rclone.conf"'), 'the B2 key: typed without echo, written by a shell builtin into a private file');
  const {REASONS} = require('../tools/deploy-alert.cjs');
  assert(REASONS.nuvem && raw('tools/deploy-alert.cjs').includes("read(dir, cloud ? '.backup-last.log' : '.deploy-last.log', 3000)"), 'the e-mail says it was the cloud copy, with its own log');
}

// config-pagamentos.sh (08/10/2026): the owner pastes the Mercado Pago and Resend keys into prompts (secret ones without
// echo), only those lines of the .env change (first occurrence, by bash builtins: no value on a command line), a copy of
// the old .env stays beside it, and a test key can never stay in live mode.
{
  assert(payments.includes('read -r -s -p "$label: " value') && payments.includes('ask MP_ACCESS_TOKEN') && payments.includes('ask RESEND_API_KEY') && /ask MP_ACCESS_TOKEN "[^"]*" 1 /.test(payments) && /ask MP_WEBHOOK_SECRET "[^"]*" 1 /.test(payments), 'secret keys are read without echo');
  assert(payments.includes("1) mode=test; prefix='TEST-'") && payments.includes("2) mode=live; prefix='APP_USR-'") && payments.includes('[[ -n "$had" && "$had" =~ $re ]] || had='), 'each mode takes its own keys (Enter keeps a key only when it fits)');
  assert(payments.includes("printf '%s=%s\\n' \"$key\" \"${NEW[$key]}\"") && payments.includes('cp -p "$ENV_FILE" "$backup"') && payments.includes('chmod 600 "$tmp"') && payments.includes('mv -f "$tmp" "$ENV_FILE"'), 'rewritten by builtins, old copy kept, private, swapped at once');
  assert(payments.includes('NEW[APP_ENV]=production') && payments.includes('NEW[SITE_URL]=$DOMAIN') && payments.includes('systemctl restart juimprime.service'), 'production on the shop domain, then the restart');
}

// The firewall: only the site from everywhere, SSH from the internal networks only, IPv6 included, and back by itself
// without a confirmation.
assert(firewall.includes('policy drop;') && firewall.includes('tcp dport { 80, 443 } accept'), 'only the site from everywhere');
assert(firewall.includes('ip saddr { $ssh_v4 } tcp dport 22 accept') && firewall.includes('ip6 saddr { fe80::/10, fc00::/7 } tcp dport 22 accept'), 'SSH only from the internal networks');
assert(firewall.includes('meta l4proto ipv6-icmp accept'), 'IPv6 needs ICMPv6');
assert(firewall.includes('read -r -t 120 answer || true\nif [ "$answer" != "OK" ]; then\n  nft flush ruleset\n'), 'without OK in 2 minutes, the old rules come back');
assert(firewall.includes('nft -c -f "$new" ||'), 'the new rules are checked before they are applied');

// /api/health names the published commit only where the deploy wrote REVISION (dev checkouts and Hostinger: no field).
{
  const health = require('../api/health');
  const body = async release => { let out = ''; await health.create({env: {}, release})({}, {statusCode: 200, setHeader() {}, end(data) { out = data; }}); return JSON.parse(out); };
  assert.equal((await body('0123456789ab')).release, '0123456789ab');
  assert(!('release' in await body(null)), 'no REVISION, no field');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ju-revision-'));
  try {
    fs.writeFileSync(path.join(dir, 'REVISION'), '0123456789abcdef0123456789abcdef01234567\n');
    assert.equal(health.readRelease(path.join(dir, 'REVISION')), '0123456789ab', 'the first 12 characters of the commit');
    fs.writeFileSync(path.join(dir, 'REVISION'), '<script>\n');
    assert.equal(health.readRelease(path.join(dir, 'REVISION')), null, 'anything but a commit is ignored');
    assert.equal(health.readRelease(path.join(dir, 'missing')), null);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

// TEST_SKIP leaves suites out of tools/run-tests.mjs (the server skips the slow 3D-model one).
{
  const result = spawnSync(process.execPath, [path.join(root, 'tools/run-tests.mjs'), 'deploy'], {encoding: 'utf8', env: {...process.env, TEST_SKIP: 'deploy'}});
  assert.equal(result.status, 1); assert.match(result.stderr, /fora as puladas \(TEST_SKIP: deploy\.mjs\)/, 'a skipped suite is not run');
}

// The failure e-mail (tools/deploy-alert.cjs): what deploy.sh left behind, once per commit, to ORDER_NOTIFY_EMAIL.
{
  const {run} = require('../tools/deploy-alert.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ju-deploy-'));
  const sent = [], fetchImpl = async (url, init) => { sent.push({url, headers: init.headers, ...JSON.parse(init.body)}); return {ok: true, status: 200, json: async () => ({id: 'em_1'})}; };
  const quiet = {log() {}, error() {}};
  const env = {RESEND_API_KEY: 're_test_key_123', ORDER_NOTIFY_EMAIL: 'Ju@Site.Test', MAIL_FROM: 'Ju <pedidos@site.test>', SITE_URL: 'https://site.test'};
  try {
    fs.writeFileSync(path.join(dir, '.deploy-status'), 'testes 0123456789abcdef0123456789abcdef01234567\n');
    fs.writeFileSync(path.join(dir, '.deploy-last.log'), 'Publicando main em 0123456\nTestes em 0123456...\n');
    fs.writeFileSync(path.join(dir, '.deploy-tests.log'), 'FALHA payments.mjs (3.1s)\nAssertionError: <b>x</b>\n\n46/47 suítes passaram.\n');
    const first = await run({env, dir, fetchImpl, log: quiet});
    assert.equal(first.sent, true); assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://api.resend.com/emails'); assert.deepEqual(sent[0].to, ['ju@site.test']);
    assert.equal(sent[0].subject, 'Publicação do site falhou (0123456)');
    assert(sent[0].html.includes('os testes falharam') && sent[0].html.includes('46/47 suítes passaram') && sent[0].html.includes('&lt;b&gt;x&lt;/b&gt;') && !sent[0].html.includes('<b>x</b>'), 'the reason and the end of the tests, escaped');
    assert(sent[0].text.includes('Publicando main em 0123456'));
    assert(!JSON.stringify(sent[0]).includes('re_test_key_123') || sent[0].headers.Authorization === 'Bearer re_test_key_123', 'the key only in the Authorization header');
    assert(!sent[0].html.includes('re_test_key_123') && !sent[0].text.includes('re_test_key_123'));
    assert.equal((await run({env, dir, fetchImpl, log: quiet})).reason, 'repeated'); assert.equal(sent.length, 1, 'once per commit, though the timer fails every minute');
    fs.writeFileSync(path.join(dir, '.deploy-status'), 'github \n');
    const day = Date.parse('2026-10-07T12:00:00Z');
    assert.equal((await run({env, dir, fetchImpl, log: quiet, now: () => day})).sent, true); assert.match(sent[1].html, /baixar o código do GitHub/);
    assert.equal((await run({env, dir, fetchImpl, log: quiet, now: () => day + 3600000})).reason, 'repeated', 'GitHub down: one e-mail a day');
    assert.equal((await run({env: {...env, ORDER_NOTIFY_EMAIL: ''}, dir, fetchImpl, log: quiet, now: () => day + 86400000})).reason, 'mail_off');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
console.log('PASS: servidor próprio — LF scripts that stop at the first error, every setting in the .env, the app on 127.0.0.1 behind nginx, X-Forwarded-For from nginx, main by default with a safety guard, tests and a database copy before the switch, a health check that proves the commit and the database, a rollback the timer respects, the failure e-mail, and only the sudo it needs.');
