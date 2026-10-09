// Servidor próprio (deploy/, SERVIDOR-SETUP.md): the files the server runs are checked here, since they only run there.
// LF line endings (bash refuses CRLF), every setting the code reads listed in the .env the setup writes, the app on
// 127.0.0.1 behind nginx, an X-Forwarded-For nobody can forge, and the deploy: tests before the switch, a copy of the
// database before new migrations, a health check that proves the new commit and the database, the rollback that the
// timer respects, the e-mail when it fails, and the scripts the owner runs with sudo (limpar-caixa.sh among them).
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
assert.deepEqual(files.sort(), ['backup-config.sh', 'backup-nuvem.sh', 'config-loja.sh', 'config-nginx.sh', 'config-pagamentos.sh', 'deploy.sh', 'firewall.sh', 'juimprime-backup.service', 'juimprime-backup.timer', 'juimprime-deploy-alert.service', 'juimprime-deploy.service', 'juimprime-deploy.timer', 'juimprime-rollback.service', 'juimprime.service', 'limpar-caixa.sh', 'manutencao.html', 'nginx-juimprime.conf', 'setup-servidor.sh']);
for (const file of files) assert(!raw(`deploy/${file}`).includes('\r'), `deploy/${file}: LF only (the Linux server runs it)`);
assert.match(raw('.gitattributes'), /^deploy\/\*\* text eol=lf$/m, 'and Git keeps them LF, also on Windows');

const setup = raw('deploy/setup-servidor.sh'), deploy = raw('deploy/deploy.sh');
const firewall = raw('deploy/firewall.sh');
const cloud = raw('deploy/backup-nuvem.sh'), cloudSetup = raw('deploy/backup-config.sh'), payments = raw('deploy/config-pagamentos.sh');
const shop = raw('deploy/config-loja.sh');
const nginxSetup = raw('deploy/config-nginx.sh');
const cashReset = raw('deploy/limpar-caixa.sh');
for (const [name, script] of [['setup-servidor.sh', setup], ['deploy.sh', deploy], ['firewall.sh', firewall], ['backup-nuvem.sh', cloud], ['backup-config.sh', cloudSetup], ['config-pagamentos.sh', payments], ['config-loja.sh', shop], ['config-nginx.sh', nginxSetup], ['limpar-caixa.sh', cashReset]]) {
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
// echo), only those lines of the .env change (by bash builtins: no value on a command line), a copy of the old .env stays
// beside it. The prefix does not tell a test key from a live one (Mercado Pago's test keys may start with APP_USR- too), so
// what keeps one mode's credentials out of the other is the mode switch itself (09/10/2026, the readiness audit: choosing
// production and pressing Enter kept the TEST credentials with MP_MODE=live, and running it only for the Resend key went
// back to test with the production credentials): a first menu (1 = Mercado Pago, 2 = only the e-mail, Mercado Pago
// untouched), the current MP_MODE as the default, and, when the mode changes, the three credentials pasted again (the same
// Public Key or Access Token as before is the other mode's and refused; the webhook signature may be one per application,
// so the same one only after a yes). Before production, what the local /api/health shows and a "vendas de verdade" yes.
// (09/10/2026, review) Also when the mode does not change: a TEST- key already saved in live mode (what the old Enter left)
// is not kept by Enter; the other mode's Public Key or Access Token is refused in either field; APP_ENV, which is what makes
// the site follow MP_MODE (outside production payments are always "test"), only with the Mercado Pago (option 1).
{
  const at = text => { const i = payments.indexOf(text); assert(i > 0, `config-pagamentos.sh has: ${text}`); return i; };
  assert(payments.includes('read -r -s -p "$label: " value') && payments.includes('ask MP_ACCESS_TOKEN') && payments.includes('ask RESEND_API_KEY') && /ask MP_ACCESS_TOKEN "[^"]*" 1 /.test(payments) && /ask MP_WEBHOOK_SECRET "[^"]*" 1 /.test(payments), 'secret keys are read without echo');
  assert(payments.includes("prefix='(TEST-|APP_USR-)'") && payments.includes('[[ "${sure,,}" == s* ]] || { echo "Nada foi alterado."; exit 1; }') && payments.includes('[[ -n "$had" && "$had" =~ $re ]] || had='), 'the prefix does not tell test from live: MP_MODE does, after a confirmation');
  assert(payments.includes('case "${part:-1}" in 1|2) ;; *) echo "Responda 1 ou 2."; exit 1 ;; esac') && at('if [ "${part:-1}" = 1 ]; then') < at('NEW[MP_MODE]=$mode') && at('NEW[MP_MODE]=$mode') < at('\nfi\n\necho "== E-mail da loja (Resend)"'), 'option 2 never reaches the Mercado Pago lines');
  assert(payments.includes('was=$(current MP_MODE); case "$was" in test|live) ;; *) was=\'\' ;; esac') && payments.includes('default=1; [ "$was" != live ] || default=2') && payments.includes('case "${choice:-$default}" in') && payments.includes('[ "$mode" = "$was" ] || changed=1'), 'Enter on the mode keeps the current one');
  assert(/ask MP_PUBLIC_KEY "[^"]*" 0 "[^"]*" recusa\n/.test(payments) && /ask MP_ACCESS_TOKEN "[^"]*" 1 "[^"]*" recusa\n/.test(payments) && /ask MP_WEBHOOK_SECRET "[^"]*" 1 '[^']*' confere\n/.test(payments), 'the three credentials follow the mode');
  assert(payments.includes(`if [ -n "$cred" ] && [ -n "$changed" ]; then had='';`) && payments.includes('if [ "$cred" = recusa ] && [ -n "$was" ]; then') && payments.includes('Essa é a credencial do outro modo') && payments.includes(`[ "$mode" = live ] && [[ "$value" == TEST-* ]]`), 'a changed mode: no Enter, the other mode\'s key refused, TEST- never live');
  assert(payments.includes(`if [ -n "$cred" ] && [ "$mode" = live ] && [[ "$had" == TEST-* ]]; then had='';`) && payments.includes(`if [ "$cred" = recusa ] && { [ "$value" = "$(current MP_PUBLIC_KEY)" ] || [ "$value" = "$(current MP_ACCESS_TOKEN)" ]; }; then old=$value; fi`), 'a saved TEST- key is not kept in live mode; the old keys count in either field');
  assert(at('NEW[MP_MODE]=$mode') < at('NEW[APP_ENV]=production') && at('NEW[APP_ENV]=production') < at('\nfi\n\necho "== E-mail da loja (Resend)"') && payments.split('NEW[APP_ENV]=').length === 2, 'APP_ENV only in option 1: the e-mail alone never changes what MP_MODE does');
  assert(payments.includes('[ "$(current APP_ENV)" = production ] || [ -z "$was" ] || was=test'), 'the current mode is the one the site follows: test while APP_ENV is not production');
  assert(payments.includes('HEALTH=http://127.0.0.1:3000/api/health') && payments.includes('else curl -fsS -m 10 "$HEALTH"') && !/curl[^\n]*\s-H\s/.test(payments) && payments.includes('cat -- "${JU_HEALTH_FILE:-/dev/null}"') && payments.includes('health() { if [ -n "$TESTING" ]; then'), 'the local health (no Host header); a file only in the test');
  for (const name of ['shipping', 'mail', 'sender', 'nfe', 'admin', 'interestFree']) assert(payments.includes(`$(field ${name})`), `the summary shows ${name}`);
  assert(payments.includes('[ "$shipping" = correios ] || echo "  ATENÇÃO: o frete não está nos Correios'), 'a warning when the shipping is not the Correios');
  assert(at('if [ "$mode" = live ]; then') < at('body=$(health)') && at('body=$(health)') < at('VENDAS DE VERDADE') && at('VENDAS DE VERDADE') < at('ask MP_PUBLIC_KEY') && at('ask MP_PUBLIC_KEY') < at('\nload\n[ -n "$TESTING" ] || install'), 'the summary and the yes before anything is asked or written');
  assert(payments.includes('NEW[APP_ENV]=production') && payments.includes('NEW[SITE_URL]=$DOMAIN') && payments.includes('systemctl restart juimprime.service'), 'production on the shop domain, then the restart');
}

// Both scripts write the .env the same way (08/10/2026, review). Root runs them, but the .env lives in juimprime's folder:
// root reads and writes there only as juimprime (runuser), so a symbolic link left in that folder never leads root to a
// system file; the copy of before goes to a root-only folder outside /srv/juimprime (newest 10 kept). A repeated name, or
// one with spaces around it, keeps only the new value (systemd's EnvironmentFile uses the last line) and current() reads
// the last line, as systemd does. Values only through bash builtins and stdin, never on a command line.
for (const [name, script] of [['config-pagamentos.sh', payments], ['config-loja.sh', shop]]) {
  assert(script.includes('as_app() { if [ -n "$TESTING" ]; then "$@"; else runuser -u "$APP_USER" -- "$@"; fi; }') && script.includes('ENV_TEXT=$(as_app cat -- "$ENV_FILE")'), `${name}: reads the .env as juimprime`);
  assert(script.includes(`printf '%s' "$out" | as_app sh -c 'umask 077; t=$(mktemp "$1.XXXXXX") || exit 1; trap "rm -f -- \\"$t\\"" EXIT HUP INT TERM; cat > "$t" && mv -f -- "$t" "$1"' sh "$ENV_FILE"`), `${name}: written as juimprime, a new private file swapped at once, the temporary removed if interrupted`);
  assert(!/^[^#\n]*\b(cp|chmod|chown|mv|ln)\b[^\n]*\$(ENV_FILE|tmp)\b/m.test(script.replace(/as_app sh -c '[^\n]*/, '')), `${name}: root never copies, moves or changes a path in juimprime's folder`);
  assert(script.includes('BACKUP_DIR=/var/backups/juimprime; [ -z "$TESTING" ] || BACKUP_DIR=$(dirname -- "$ENV_FILE")') && script.includes('[ -n "$TESTING" ] || install -d -o root -g root -m 700 "$BACKUP_DIR"') && script.includes('backup=$(mktemp "$BACKUP_DIR/env.antes-$(date +%Y%m%d-%H%M%S)-XXXXXX")') && script.includes('for ((i = 0; i < ${#olds[@]} - 10; i++)); do rm -f -- "${olds[i]}"; done'), `${name}: the copy of before only for root, the newest 10`);
  assert(script.includes(`re="^[[:space:]]*$1[[:space:]]*=[[:space:]]*(.*)$"`) && script.includes("ASSIGN='^[[:space:]]*([A-Z][A-Z0-9_]*)[[:space:]]*='") && script.includes('if [ -z "${DONE[$key]+x}" ]; then out+="$key=${NEW[$key]}"$\'\\n\'; DONE[$key]=1; fi'), `${name}: the last line counts, repeated lines go`);
  assert(script.includes(String.raw`'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'`) && script.includes('read -r -e -p "$label: " value'), `${name}: e-mails in visible ASCII (an arrow key typed without readline would leave ESC [ D in it)`);
}

// config-loja.sh (08/10/2026): the panel's first access (ADMIN_EMAIL/ADMIN_PASSWORD) and the Correios contract, typed into
// prompts the same way. The password goes without echo, twice, and never with spaces, quotes or a backslash (systemd's
// EnvironmentFile reads \ and leading quotes as syntax: the saved password would differ from the typed one); numbers keep
// only their digits, as api/_lib/correios.js reads them; the panel's state is read first, since those two variables only
// create the first admin.
{
  assert(shop.includes('read -r -s -p "$label: " value; echo; value=${value//$\'\\r\'/}') && shop.includes('read -r -s -p "Digite a mesma senha de novo') && shop.includes('if [[ "$value" != "$again" ]]; then') && shop.includes('NEW[ADMIN_PASSWORD]=$value'), 'the password: no echo, typed twice, both the same');
  assert(shop.includes('[ ${#p} -lt 12 ] || [ ${#p} -gt 128 ]') && shop.includes(String.raw`[[ "$p" == *[\'\"\\]* ]]`) && shop.includes('[[ "$p" == *[[:space:]]* ]]') && shop.includes('password_problem() (\n  LC_ALL=C\n'), '12 to 128 characters, counted the same on any server; no spaces, quotes or backslash');
  assert(shop.includes('[ -n "$(password_problem "$(current ADMIN_PASSWORD)")" ] || { had=1;'), 'Enter keeps the current password only when it passes the same rules');
  assert(/ask CORREIOS_CODE "[^"]*" 1 /.test(shop) && shop.includes('if [ "$secret" = 1 ]; then read -r -s -p "$label: " value; echo;') && /ask ADMIN_EMAIL "[^"]*" 0 /.test(shop), 'the Correios access code without echo; the e-mail visible');
  assert(shop.includes(`ask SHIP_FROM_CEP "CEP de onde a Júlia despacha (12345-678)" 0 '^(0[1-9]|[1-9][0-9])[0-9]{6}$' numeros`) && shop.includes(`'^[0-9]{10}$' numeros`) && shop.includes("SEPARATED='^[0-9./ -]+$'") && shop.includes('d=${value//[!0-9]/}'), 'the CEP as 12345-678 or 12345678, saved as 8 digits and never 00000-000 (contract, card and DR likewise; the card has 10, so a CNPJ is no card)');
  assert(shop.includes(String.raw`fits() { [[ -n "$1" && "$1" =~ $2 && "$1" != *[\'\"\\]* ]]; }`), 'no value with quotes or a backslash reaches the .env');
  assert(shop.includes('HEALTH=http://127.0.0.1:3000/api/health') && shop.includes('curl -fsS -m 5 "$HEALTH"') && !/curl[^\n]*\s-H\s/.test(shop) && shop.includes(`grep -q '"admin":"ready"' <<<"$body"`) && shop.includes('if [ -n "$panel" ] && [ -z "$TESTING" ]; then'), 'an admin that already exists is pointed out before anything is asked (the local health, no Host header)');
  assert(shop.includes('unset NEW out ENV_TEXT') && shop.includes('[ "$fixed" = "$had" ] || NEW[$var]=$fixed; return 0;'), 'the values leave memory once written; Enter keeps the cleaned form of the current value');
  assert(shop.includes('[ -z "$TESTING" ] || exit 0\n\necho "== Reiniciando o site"\nsystemctl restart juimprime.service') && shop.includes(`[ -z "$panel" ] || grep -o '"admin":"[a-z]*"' <<<"$body" || true\n[ -z "$ship" ] || grep -o '"shipping":"[a-z]*"' <<<"$body" || true`) && shop.includes('[ -n "$TESTING" ] || [ "$(id -u)" -eq 0 ]'), 'root, then the restart and what /api/health says about the part that was set up');
  assert(shop.includes('mas os Correios só conferem na primeira cotação') && !shop.includes('Frete real ligado'), '"correios" only means the data is complete: the owner is told to quote once, and what a refusal does to the checkout');
  const names = [...shop.matchAll(/^\s*ask ([A-Z][A-Z0-9_]+) /gm)].map(m => m[1]).concat('ADMIN_PASSWORD', 'NFE_PROVIDER', 'NFE_ENVIRONMENT').sort();
  assert.deepEqual(names, ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'BLING_CLIENT_ID', 'BLING_CLIENT_SECRET', 'CORREIOS_CARD', 'CORREIOS_CODE', 'CORREIOS_CONTRACT', 'CORREIOS_DR', 'CORREIOS_USER', 'NFE_ENVIRONMENT', 'NFE_PROVIDER', 'SHIP_FROM_CEP']);
  for (const name of names) assert(listed.has(name) && read.has(name), `${name}: in the .env the setup writes and read by the code`);
  // The Bling part (09/10/2026, "validar na bling, para colocar o url certo no aplicativo"): 3 in the menu, everything
  // moved to 4 and stays the default (Enter used to mean both parts). The app's Client ID visible and its Client Secret
  // without echo, both opaque (letters and digits, no fixed length); NFE_PROVIDER=bling; the environment empty
  // (homologação) or "producao", the exact word api/_lib/fiscal.js reads, only after a yes about the accountant; SITE_URL
  // the shop's domain, since the link the site hands to Bling is SITE_URL/admin.html. At the end: nfe, bling and queue
  // from the health and the steps to connect.
  assert(shop.includes('3 = Nota fiscal (Bling), 4 = tudo [4]: " choice') && shop.includes('case "${choice:-4}" in') && shop.includes('4) panel=1; ship=1; nfe=1 ;;') && shop.includes('*) echo "Responda 1, 2, 3 ou 4."; exit 1 ;;'), 'the menu: 3 = Bling, 4 (Enter) = everything');
  assert(shop.includes('if [ -n "$nfe" ] && [ "${choice:-4}" = 4 ] && { [ -z "$(current BLING_CLIENT_ID)" ] || [ -z "$(current BLING_CLIENT_SECRET)" ]; }; then') && shop.includes(`[[ "\${sure,,}" == s* ]] || { nfe='';`), 'in 4, a Bling app not set up yet can be left for option 3 (the Client ID prompt has no Enter to skip it)');
  assert(/ask BLING_CLIENT_ID "[^"]*" 0 '\^\[A-Za-z0-9\._-\]\{16,128\}\$' texto/.test(shop) && /ask BLING_CLIENT_SECRET "[^"]*" 1 '\^\[A-Za-z0-9\._-\]\{16,200\}\$' texto/.test(shop), 'the Client ID visible, the Client Secret without echo (bash allows no bound above 255 in a regex)');
  assert(shop.includes('[ "$(current NFE_PROVIDER)" = bling ] || NEW[NFE_PROVIDER]=bling') && shop.includes('target=producao') && shop.includes("target=''") && shop.includes('[ "$target" = "$was_env" ] || NEW[NFE_ENVIRONMENT]=$target') && shop.includes('A contadora está de acordo e o Bling já está em produção? (s/N)'), 'homologação (empty) or producao, production only after a yes');
  assert(shop.includes('if [ "${site%/}" != "$DOMAIN" ]; then NEW[SITE_URL]=$DOMAIN;') && shop.includes('exatamente $DOMAIN/admin.html') && shop.includes('\\"Nota fiscal · Bling\\" → Conectar ao Bling') && shop.includes("DOMAIN=https://juimprimepramim.com.br\n"), 'the redirect link the owner types in Bling, and the path in the panel');
  assert(shop.includes(`[ -z "$nfe" ] || grep -o '"nfe":"[a-z]*"\\|"fiscal":"[a-z]*"\\|"bling":"[a-z_]*"\\|"queue":{[^}]*}' <<<"$body" || true`) && shop.includes('state() { grep -o "\\"$1\\":\\"[a-z_]*\\""'), 'nfe, fiscal, bling and queue from the health (not_configured has a _)');
  assert(shop.includes('disconnected) echo "Aplicativo do Bling gravado; falta conectar a conta."; bling_steps ;;') && shop.includes(`[ "$(state nfe)" = off ] || grep -q '"worker":true' <<<"$body" ||`), 'disconnected: the steps; the queue checked');
  const {blingSettings} = require('../api/_lib/bling.js'), {nfeSettings} = require('../api/_lib/fiscal.js');
  assert.equal(blingSettings({APP_ENV: 'production', SITE_URL: 'https://juimprimepramim.com.br'}).redirectUri, 'https://juimprimepramim.com.br/admin.html', 'the link the site hands to Bling is the one the script tells the owner to type');
  assert.equal(nfeSettings({APP_ENV: 'production', NFE_PROVIDER: 'bling', NFE_ENVIRONMENT: 'producao'}).mode, 'live'); assert.equal(nfeSettings({APP_ENV: 'production', NFE_PROVIDER: 'bling', NFE_ENVIRONMENT: ''}).mode, 'test');
  assert(raw('dist/admin.js').includes('id="admin-bling-title" tabindex="-1">Nota fiscal · Bling</h2>') && raw('dist/admin.js').includes('data-action="bling-connect">Conectar ao Bling</button>'), 'the card and the button the steps name');
}

// …and run for real (JU_TEST=1: no root, no runuser, no restart) on a temporary .env, with the answers on stdin. Only where a
// bash 4+ that can open this folder exists: the server's tests run with a bare environment, and on Windows the bash found
// may be WSL's, which cannot see C:/… — then one line says so and the static checks above stand alone.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ju-loja-'));
  const slash = file => file.split(path.sep).join('/');
  const script = slash(path.join(root, 'deploy/config-loja.sh')), envFile = slash(path.join(dir, '.env'));
  const env = {...process.env, JU_TEST: '1', JU_ENV_FILE: envFile};
  const run = lines => spawnSync('bash', [script], {input: lines.map(line => `${line}\n`).join(''), encoding: 'utf8', env, timeout: 30000});
  const text = () => fs.readFileSync(envFile, 'utf8');
  const values = () => Object.fromEntries(text().split('\n').filter(line => /^[A-Z][A-Z0-9_]*=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  const copies = () => fs.readdirSync(dir).filter(name => name.startsWith('env.antes-')).map(name => fs.readFileSync(path.join(dir, name), 'utf8'));
  // what systemd's EnvironmentFile hands to the site: spaces around the name are fine, and the last line of a name counts
  const effective = () => { const out = {}; for (const line of text().split('\n')) { const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line); if (m) out[m[1]] = m[2]; } return out; };
  const leftovers = () => fs.readdirSync(dir).filter(name => name !== '.env' && !name.startsWith('env.antes-'));
  try {
    const before = '# comentário\nAPP_ENV=preview\nSITE_URL=https://juimprimepramim.com.br\nDB_PASSWORD=nao-mexer\nADMIN_EMAIL=\nADMIN_PASSWORD=curta\nCORREIOS_USER=\nCORREIOS_CODE=\nCORREIOS_CONTRACT=\nCORREIOS_CARD=\nSHIP_FROM_CEP=\nNFE_PROVIDER=\nBLING_CLIENT_ID=\nBLING_CLIENT_SECRET=\nNFE_ENVIRONMENT=\nMP_MODE=test\n';
    fs.writeFileSync(envFile, before);
    const probe = spawnSync('bash', ['-c', '[ "${BASH_VERSINFO[0]}" -ge 4 ] && [ -r "$1" ] && [ -w "$2" ]', 'probe', script, envFile], {encoding: 'utf8', env, timeout: 10000});
    if (probe.error || probe.status !== 0) console.log('config-loja.sh: sem um bash 4 que abra esta pasta aqui; o teste de comportamento ficou de fora (os estáticos valem).');
    else {
      const password = 'Senha-Boa-2026!', code = 'CWS-codigo_teste.0123456789abcdef';
      const blingId = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b', blingSecret = 'f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9';
      // every part (4): a bad e-mail and one with the arrow keys in it, then a short password, quotes, a backslash, a space and
      // a different confirmation before the right one; a CPF with dots missing a digit, a short access code, a CNPJ as the
      // card, a DR in letters, a 7-digit CEP and 00000-000 before the right ones; "yes, I have the Bling app" (asked only in 4
      // while it is not set up), a short Client ID and a Client Secret with a space before the right ones, and Enter on the
      // environment (homologação, as it was)
      const first = run(['4', 'ju sem arroba', 'julia@gmial\x1b[D\x1b[Dail.com', 'julia@example.com', 'curta123', "abc'defghijklmn", 'abc"defghijklmn', 'abcdefghijkl\\mn', 'tem espaco no meio', password, 'Outra-Senha-2026', password, password,
        '123.456.789-0', '123.456.789-01', 'curto', code, '99.1234.5678', '67.771.044/0001-96', '0074512345', 'SE/SPM', '72', '1310-100', '00000-000', '01310-100',
        's', 'a1b2c3d4', blingId, `${blingSecret.slice(0, 20)} ${blingSecret.slice(20)}`, blingSecret, '']);
      const out = first.stdout + first.stderr;
      assert.equal(first.status, 0, out);
      for (const message of ['E-mail com formato inesperado', 'A senha precisa ter de 12 a 128 caracteres.', "Sem aspas (' ou \") e sem barra invertida (\\)", 'A senha não pode ter espaços.', 'As duas senhas não são iguais', 'CPF tem 11 números e CNPJ 14', 'Código com formato inesperado', 'O cartão de postagem tem 10 números', 'A DR é só o número', 'O CEP tem 8 números', 'O Client ID tem letras e números', 'O Client Secret tem letras e números']) assert(out.includes(message), `says: ${message}`);
      assert.equal(out.split('E-mail com formato inesperado').length, 3, 'the e-mail with ESC [ D in it is refused too');
      assert.equal(out.split('O CEP tem 8 números').length, 3, '00000-000 is no CEP');
      assert(!out.includes(password) && !out.includes(code) && !out.includes('Outra-Senha') && !out.includes(blingSecret.slice(20)), 'never prints the password, the access code or the Client Secret');
      const after = values();
      assert.deepEqual(after, {APP_ENV: 'preview', SITE_URL: 'https://juimprimepramim.com.br', DB_PASSWORD: 'nao-mexer', ADMIN_EMAIL: 'julia@example.com', ADMIN_PASSWORD: password, CORREIOS_USER: '12345678901', CORREIOS_CODE: code, CORREIOS_CONTRACT: '9912345678', CORREIOS_CARD: '0074512345', SHIP_FROM_CEP: '01310100',
        NFE_PROVIDER: 'bling', BLING_CLIENT_ID: blingId, BLING_CLIENT_SECRET: blingSecret, NFE_ENVIRONMENT: '', MP_MODE: 'test', CORREIOS_DR: '72'});
      assert(text().startsWith('# comentário\nAPP_ENV=preview\n') && text().endsWith('\nMP_MODE=test\nCORREIOS_DR=72\n'), 'the other lines stay where they were; a missing name goes at the end');
      assert.deepEqual(copies(), [before], 'the copy of before');
      assert.deepEqual(leftovers(), [], 'no temporary file left beside the .env');
      if (process.platform !== 'win32') assert.equal(fs.statSync(envFile).mode & 0o777, 0o600, 'only the owner reads it');
      assert(require('../api/_lib/admin-auth.js').settings(after).bootstrap && require('../api/_lib/correios.js').settings(after).ready, 'what the code reads: the first admin can be created, the Correios are ready');
      assert(require('../api/_lib/bling.js').blingSettings(after).configured && require('../api/_lib/fiscal.js').nfeSettings(after).provider === 'bling', '…and the Bling app is set up');
      // Enter on every question keeps everything (twelve answers: the menu, the kept password asks for no confirmation, six for
      // the Correios, three for Bling) and writes nothing; it still shows how to connect Bling
      const kept = run(Array(12).fill(''));
      assert.equal(kept.status, 0, kept.stdout + kept.stderr); assert.match(kept.stdout, /Nada foi alterado/);
      assert(kept.stdout.includes('exatamente https://juimprimepramim.com.br/admin.html') && kept.stdout.includes('"Nota fiscal · Bling" → Conectar ao Bling'), 'the steps to connect Bling');
      assert.deepEqual(values(), after); assert.equal(copies().length, 1);
      // only the shipping part: the CEP changes, the rest is kept
      const cep = run(['2', '', '', '', '', '', '04538-133']);
      assert.equal(cep.status, 0, cep.stdout + cep.stderr);
      assert.deepEqual(values(), {...after, SHIP_FROM_CEP: '04538133'});
      // Enter (4) with the Bling app not set up yet and no Client ID at hand: "no" leaves the invoice part for option 3, and
      // what was answered above (the CEP) is still written; nothing of Bling is asked or touched
      fs.writeFileSync(envFile, text().replace(`BLING_CLIENT_SECRET=${blingSecret}`, 'BLING_CLIENT_SECRET='));
      const later = run(['', '', '', '', '', '', '', '', '01310-100', 'n']);
      assert.equal(later.status, 0, later.stdout + later.stderr); assert(later.stdout.includes('A nota fiscal fica para depois') && !later.stdout.includes('== Nota fiscal (Bling)'), later.stdout);
      assert.deepEqual(values(), {...after, BLING_CLIENT_SECRET: ''});
      // a current password the rules refuse is not kept by Enter (the answers end: nothing is written)
      fs.writeFileSync(envFile, text().replace(`ADMIN_PASSWORD=${password}`, "ADMIN_PASSWORD=abc'defghijklm"));
      const saved = text(), refused = run(['1', '', '']);
      assert.notEqual(refused.status, 0); assert.match(refused.stdout, /A senha precisa ter de 12 a 128 caracteres\./); assert.equal(text(), saved);
      const wrong = run(['9']);
      assert.equal(wrong.status, 1); assert.match(wrong.stdout, /Responda 1, 2, 3 ou 4\./);
      // a name repeated by hand at the end (with spaces around it): Enter offers the value the site uses (the last one), a
      // new value replaces every line of that name, and Enter keeps a user saved with dots in its clean form
      const messy = `ADMIN_EMAIL=\nADMIN_PASSWORD=\nCORREIOS_USER=67.771.044/0001-96\nCORREIOS_CODE=${code}\nCORREIOS_CONTRACT=9912345678\nCORREIOS_CARD=0074512345\nCORREIOS_DR=72\nSHIP_FROM_CEP=01310100\n  ADMIN_EMAIL = velho@x.com\nADMIN_PASSWORD=Senha-Velha-2025!\n`;
      fs.writeFileSync(envFile, messy);
      const panelOnly = run(['1', '', 'Senha-Nova-2026!', 'Senha-Nova-2026!']), shipOnly = run(['2', '', '', '', '', '', '']);
      assert.equal(panelOnly.status, 0, panelOnly.stdout + panelOnly.stderr); assert.equal(shipOnly.status, 0, shipOnly.stdout + shipOnly.stderr);
      assert.equal(text(), `ADMIN_EMAIL=\nADMIN_PASSWORD=Senha-Nova-2026!\nCORREIOS_USER=67771044000196\nCORREIOS_CODE=${code}\nCORREIOS_CONTRACT=9912345678\nCORREIOS_CARD=0074512345\nCORREIOS_DR=72\nSHIP_FROM_CEP=01310100\n  ADMIN_EMAIL = velho@x.com\n`);
      assert.equal(effective().ADMIN_EMAIL, 'velho@x.com'); assert.equal(effective().ADMIN_PASSWORD, 'Senha-Nova-2026!', 'the new password is the one in effect');
      const email = run(['1', 'julia@example.com', '']);
      assert.equal(email.status, 0, email.stdout + email.stderr);
      assert(text().startsWith('ADMIN_EMAIL=julia@example.com\nADMIN_PASSWORD=Senha-Nova-2026!\n') && !text().includes('velho'), 'the repeated line goes');
      assert.equal(effective().ADMIN_EMAIL, 'julia@example.com');
      assert.deepEqual(leftovers(), []);
      // Bling alone: an ID with a space and a secret with a quote refused, a SITE_URL with www replaced by the domain (the link
      // the site hands to Bling), production declined (homologação stays), then accepted; Enter keeps it, 1 goes back
      const {blingSettings} = require('../api/_lib/bling.js'), {nfeSettings} = require('../api/_lib/fiscal.js');
      fs.writeFileSync(envFile, 'APP_ENV=production\nSITE_URL=https://www.juimprimepramim.com.br\nNFE_PROVIDER=\nBLING_CLIENT_ID=\nBLING_CLIENT_SECRET=\nNFE_ENVIRONMENT=\n');
      const app = run(['3', 'a1b2 c3d4e5f6a7b8c9d0', blingId, `${blingSecret}'`, blingSecret, '7', '2', 'n']);
      assert.equal(app.status, 0, app.stdout + app.stderr);
      for (const message of ['O Client ID tem letras e números', 'O Client Secret tem letras e números', 'Responda 1 ou 2.', 'SITE_URL estava "https://www.juimprimepramim.com.br"', 'Só vale com a contadora de acordo', 'O ambiente das notas fica como estava (homologação).']) assert(app.stdout.includes(message), `Bling: says ${message}`);
      assert(!app.stdout.includes(blingSecret) && !app.stderr.includes(blingSecret), 'never prints the Client Secret');
      assert.deepEqual(values(), {APP_ENV: 'production', SITE_URL: 'https://juimprimepramim.com.br', NFE_PROVIDER: 'bling', BLING_CLIENT_ID: blingId, BLING_CLIENT_SECRET: blingSecret, NFE_ENVIRONMENT: ''});
      assert.equal(blingSettings(values()).redirectUri, 'https://juimprimepramim.com.br/admin.html'); assert.equal(nfeSettings(values()).mode, 'test', 'homologação');
      const live = run(['3', '', '', '2', 's']);
      assert.equal(live.status, 0, live.stdout + live.stderr); assert.equal(values().NFE_ENVIRONMENT, 'producao'); assert.equal(nfeSettings(values()).mode, 'live', 'real notes');
      const stay = run(['3', '', '', '']);
      assert.equal(stay.status, 0, stay.stdout + stay.stderr); assert.match(stay.stdout, /Nada foi alterado/); assert.equal(values().NFE_ENVIRONMENT, 'producao', 'Enter keeps the current environment');
      const back = run(['3', '', '', '1']);
      assert.equal(back.status, 0, back.stdout + back.stderr); assert.match(back.stdout, /As notas voltam para homologação/); assert.equal(values().NFE_ENVIRONMENT, '');
      // written by hand with quotes, NFE_ENVIRONMENT="producao" is producao for systemd: Enter keeps it (no silent way back)
      fs.writeFileSync(envFile, text().replace('NFE_ENVIRONMENT=', 'NFE_ENVIRONMENT="producao"'));
      const quotedEnv = text(), quotedStay = run(['3', '', '', '']);
      assert.equal(quotedStay.status, 0, quotedStay.stdout + quotedStay.stderr); assert.match(quotedStay.stdout, /Nada foi alterado/); assert.equal(text(), quotedEnv);
      assert.deepEqual(leftovers(), []);

      // config-pagamentos.sh writes the same way: a mode left at the end by hand ("live") never outlives the one chosen
      const payScript = slash(path.join(root, 'deploy/config-pagamentos.sh')), healthFile = slash(path.join(os.tmpdir(), `ju-health-${process.pid}.json`));
      const pay = (lines, health = null) => {
        if (health) fs.writeFileSync(healthFile, JSON.stringify(health));
        try { const r = spawnSync('bash', [payScript], {input: lines.map(line => `${line}\n`).join(''), encoding: 'utf8', env: {...env, JU_HEALTH_FILE: health ? healthFile : ''}, timeout: 30000}); return {...r, out: r.stdout + r.stderr}; }
        finally { fs.rmSync(healthFile, {force: true}); }
      };
      fs.writeFileSync(envFile, 'APP_ENV=preview\nMP_PUBLIC_KEY=\nMP_ACCESS_TOKEN=\nMP_WEBHOOK_SECRET=\nMP_MODE=\nORDER_NOTIFY_EMAIL=\nRESEND_API_KEY=\nMP_MODE = live\n');
      const fromHand = pay(['1', '1', 's', 'APP_USR-12345678-1234-1234-1234-123456789012', 'APP_USR-1234567890123456-100000-abcdefabcdefabcdefabcdef-123456789', 'abcdef0123456789abcdef0123456789', 'ju@example.com', 're_abcdefghijklmnop', 'n']);
      assert.equal(fromHand.status, 0, fromHand.out);
      assert.equal(effective().MP_MODE, 'test'); assert(!text().includes('live'), 'config-pagamentos.sh: the repeated line goes');
      assert.equal(effective().ORDER_NOTIFY_EMAIL, 'ju@example.com'); assert.deepEqual(leftovers(), []);

      // The switch to production (09/10/2026). From test, with the health showing the shipping still "pending": the summary
      // and its warnings come first, and a "no" writes nothing.
      const mp = require('../api/_lib/mercadopago.js');
      const TEST = {pk: 'APP_USR-11111111-1111-1111-1111-111111111111', token: 'APP_USR-1111111111111111-100000-aaaaaaaaaaaaaaaaaaaaaaaa-111111111', hook: 'abcdef0123456789abcdef0123456789'};
      const LIVE = {pk: 'APP_USR-22222222-2222-2222-2222-222222222222', token: 'APP_USR-2222222222222222-100000-bbbbbbbbbbbbbbbbbbbbbbbb-222222222'};
      const testEnv = `APP_ENV=production\nSITE_URL=https://juimprimepramim.com.br\nMP_MODE=test\nMP_PUBLIC_KEY=${TEST.pk}\nMP_ACCESS_TOKEN=${TEST.token}\nMP_WEBHOOK_SECRET=${TEST.hook}\nORDER_NOTIFY_EMAIL=ju@example.com\nRESEND_API_KEY=re_abcdefghijklmnop\nMAIL_FROM=Ju imprime pra mim <pedidos@juimprimepramim.com.br>\n`;
      const health = {ok: true, mail: 'resend', secret: true, key: true, sender: 'custom', payments: 'test', paymentsBlocked: false, interestFree: 3, mp: {token: true, publicKey: true, webhookSecret: true}, orderMail: true, admin: 'ready', shipping: 'pending', nfe: 'test', bling: 'connected'};
      fs.writeFileSync(envFile, testEnv);
      const copiesBefore = copies().length, saidNo = pay(['1', '2', 'n'], health);
      assert.equal(saidNo.status, 1, saidNo.out); assert.match(saidNo.out, /Nada foi alterado/); assert.equal(text(), testEnv); assert.equal(copies().length, copiesBefore);
      for (const message of ['Frete: pending · E-mail: resend (remetente custom) · Nota fiscal: test · Painel: ready', 'Parcelas sem juros que o Mercado Pago dá hoje (com as credenciais de agora): 3', 'ATENÇÃO: o frete não está nos Correios ("shipping":"pending")', 'Nota fiscal em homologação']) assert(saidNo.out.includes(message), `before production, says: ${message}`);
      assert(!saidNo.out.includes('o e-mail da loja não está pronto') && !saidNo.out.includes('Painel da Júlia ainda não tem'), 'no warning about what is ready');
      const noHealth = pay(['1', '2', 'n']);
      assert.equal(noHealth.status, 1); assert.match(noHealth.out, /Não consegui ler o \/api\/health agora/);
      // coming from test, the installments are the test account's (normally 0): said, but no ATENÇÃO that would stop the switch
      const testZero = pay(['1', '2', 'n'], {...health, interestFree: 0});
      assert(testZero.out.includes('Com as credenciais de teste esse número costuma ser 0') && !testZero.out.includes('ATENÇÃO: o Mercado Pago dá'), testZero.out);
      // "yes": Enter on the menu (1), then Enter keeps no credential, the test ones (the same as saved) are refused, a TEST-
      // key is never production; the webhook signature may be the same one (one per application): only after a yes
      const toLive = pay(['', '2', 's', '', TEST.pk, 'TEST-12345678-1234-1234-1234-123456789012', LIVE.pk, TEST.token, LIVE.token, TEST.hook, 'n', TEST.hook, 's', '', '', 's'], health);
      assert.equal(toLive.status, 0, toLive.out);
      assert(toLive.out.includes('Cole o valor (aqui o Enter não mantém nada).') && toLive.out.includes('Credencial que começa com TEST- é sempre de teste') && toLive.out.includes('Então cole a do modo de produção.'), toLive.out);
      assert.equal(toLive.out.split('Essa é a credencial do outro modo (a de teste, que já estava gravada)').length, 3, 'the test Public Key and Access Token refused');
      assert(![TEST.token, LIVE.token, TEST.hook].some(secret => toLive.out.includes(secret)), 'never prints a secret');
      const liveValues = {...Object.fromEntries(testEnv.trim().split('\n').map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])), MP_MODE: 'live', MP_PUBLIC_KEY: LIVE.pk, MP_ACCESS_TOKEN: LIVE.token};
      assert.deepEqual(values(), liveValues);
      assert.equal(mp.settings(values()).mode, 'live', 'what the code reads: live payments');
      // in production, Enter on the menu and on the mode keeps production (the default is the current mode), and Enter keeps
      // every credential (the mode did not change)
      const stays = pay(['', '', 's', '', '', '', '', '', 'n'], {...health, payments: 'live', shipping: 'correios', interestFree: 0});
      assert.equal(stays.status, 0, stays.out); assert.deepEqual(values(), liveValues);
      assert(!stays.out.includes('ATENÇÃO: o frete'), 'no shipping warning with the Correios on');
      assert(stays.out.includes('ATENÇÃO: o Mercado Pago dá 0 parcela(s) sem juros') && !saidNo.out.includes('parcela(s) sem juros:'), '"3x sem juros" needs the account to give 3');
      // only the e-mail: the Mercado Pago lines are never asked nor changed
      const mailOnly = pay(['2', '', 're_novachave0123456789', 'n']);
      assert.equal(mailOnly.status, 0, mailOnly.out); assert(!mailOnly.out.includes('== Mercado Pago'));
      assert.deepEqual(values(), {...liveValues, RESEND_API_KEY: 're_novachave0123456789'});
      // back to test: the production keys refused, the signature again only after a yes
      const toTest = pay(['1', '1', 's', LIVE.pk, TEST.pk, LIVE.token, TEST.token, TEST.hook, 's', '', '', 'n']);
      assert.equal(toTest.status, 0, toTest.out);
      assert(toTest.out.includes('A loja volta ao modo de TESTE') && toTest.out.split('Essa é a credencial do outro modo (a de produção, que já estava gravada)').length === 3, toTest.out);
      assert.deepEqual(values(), {...liveValues, MP_MODE: 'test', MP_PUBLIC_KEY: TEST.pk, MP_ACCESS_TOKEN: TEST.token, RESEND_API_KEY: 're_novachave0123456789'});
      // a mode never chosen (MP_MODE empty): the saved keys are not kept by Enter, and the same ones only after a yes
      fs.writeFileSync(envFile, testEnv.replace('MP_MODE=test', 'MP_MODE='));
      const unknown = pay(['1', '1', 's', '', TEST.pk, 's', TEST.token, 's', TEST.hook, 's', '', '', 'n']);
      assert.equal(unknown.status, 0, unknown.out); assert(!unknown.out.includes('Essa é a credencial do outro modo'));
      assert.equal(values().MP_MODE, 'test'); assert.equal(values().MP_ACCESS_TOKEN, TEST.token);
      // (09/10/2026, review) already live with TEST- keys saved (what the old script's Enter left): Enter keeps neither, and the
      // webhook signature (the mode did not change) stays
      const OLD = {pk: 'TEST-12345678-1234-1234-1234-123456789012', token: 'TEST-1234567890123456-100000-abcdefabcdefabcdefabcdef-123456789'};
      fs.writeFileSync(envFile, testEnv.replace('MP_MODE=test', 'MP_MODE=live').replace(TEST.pk, OLD.pk).replace(TEST.token, OLD.token));
      const stale = pay(['1', '', 's', '', LIVE.pk, '', LIVE.token, '', '', '', 'n']);
      assert.equal(stale.status, 0, stale.out); assert.equal(stale.out.split('Cole o valor (aqui o Enter não mantém nada).').length, 3, stale.out);
      assert.deepEqual([values().MP_MODE, values().MP_PUBLIC_KEY, values().MP_ACCESS_TOKEN, values().MP_WEBHOOK_SECRET], ['live', LIVE.pk, LIVE.token, TEST.hook]);
      // test → production: the test Access Token pasted as the Public Key and the test Public Key as the Access Token, refused
      fs.writeFileSync(envFile, testEnv);
      const crossed = pay(['1', '2', 's', TEST.token, LIVE.pk, TEST.pk, LIVE.token, TEST.hook, 's', '', '', 'n']);
      assert.equal(crossed.status, 0, crossed.out); assert.equal(crossed.out.split('Essa é a credencial do outro modo (a de teste').length, 3, crossed.out);
      assert.deepEqual([values().MP_MODE, values().MP_PUBLIC_KEY, values().MP_ACCESS_TOKEN], ['live', LIVE.pk, LIVE.token]);
      // MP_MODE="live" written by hand with quotes (live for systemd): Enter on the mode keeps production and the keys
      fs.writeFileSync(envFile, testEnv.replace('MP_MODE=test', 'MP_MODE="live"').replace(TEST.pk, LIVE.pk).replace(TEST.token, LIVE.token));
      const quoted = pay(['1', '', 's', '', '', '', '', '', 'n']);
      assert.equal(quoted.status, 0, quoted.out); assert(!quoted.out.includes('o modo mudou'), quoted.out);
      assert.deepEqual([values().MP_MODE, values().MP_PUBLIC_KEY, values().MP_ACCESS_TOKEN], ['live', LIVE.pk, LIVE.token]);
      // only the e-mail on a server still in preview: APP_ENV stays (with it, MP_MODE=live would start to count)
      fs.writeFileSync(envFile, testEnv.replace('APP_ENV=production', 'APP_ENV=preview').replace('MP_MODE=test', 'MP_MODE=live'));
      const previewMail = pay(['2', '', '', 'n']);
      assert.equal(previewMail.status, 0, previewMail.out); assert.equal(values().APP_ENV, 'preview'); assert.equal(mp.settings(values()).mode, 'test', 'the payments mode did not change');
      // …and on that same .env (MP_MODE=live, but the site in test: without APP_ENV=production it ignores MP_MODE), choosing
      // production is a change of mode: the saved keys, which were the test ones in use, are not kept
      const fromPreview = pay(['1', '2', 's', '', TEST.pk, LIVE.pk, LIVE.token, TEST.hook, 's', '', '', 'n']);
      assert.equal(fromPreview.status, 0, fromPreview.out); assert(fromPreview.out.includes('Essa é a credencial do outro modo (a de teste'), fromPreview.out);
      assert.deepEqual([values().APP_ENV, values().MP_MODE, values().MP_PUBLIC_KEY, values().MP_ACCESS_TOKEN], ['production', 'live', LIVE.pk, LIVE.token]);
      assert.deepEqual(leftovers(), []);
    }
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

// limpar-caixa.sh (09/10/2026, "Reinicia o fluxo de caixa da Júlia. Deixa limpo, com tudo validado."): root only; only the
// DB_NAME line of the .env (as deploy.sh's envget), MariaDB as root through the socket, no password anywhere; the copy of
// the database before anything (deploy.sh's own, as juimprime), checked and kept outside the rotation; LIMPAR in capitals;
// one transaction, by id (only what was shown); every table that hangs on an order cleaned with it; real orders (source
// 'live') never, nor a test order whose NF-e is a real one; a line in the panel's audit log.
const migrationTables = () => {   // the tables as the migrations leave them: columns and foreign keys
  const tables = new Map();
  for (const file of fs.readdirSync(path.join(root, 'db/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const text = raw(`db/migrations/${file}`).replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '');
    for (const [, name, body] of text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+) \(\n([\s\S]*?)\n\)/g)) {
      const table = {columns: [], primary: [], fks: []};
      for (const line of body.split('\n').map(l => l.trim().replace(/,$/, '')).filter(Boolean)) {
        const fk = /FOREIGN KEY \((\w+)\) REFERENCES (\w+) \((\w+)\)(?: ON DELETE (CASCADE|SET NULL))?/.exec(line);
        if (fk) table.fks.push({column: fk[1], table: fk[2], ref: fk[3], onDelete: fk[4] || null});
        else if (!/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT)\b/.test(line)) {
          table.columns.push(line.split(/\s/)[0]);
          if (/\bPRIMARY KEY\b/.test(line)) table.primary.push(line.split(/\s/)[0]);
        }
      }
      tables.set(name, table);
    }
    for (const [, name, body] of text.matchAll(/ALTER TABLE (\w+)\s([\s\S]*?);/g)) for (const [, column] of body.matchAll(/ADD COLUMN (\w+)/g)) tables.get(name).columns.push(column);
  }
  return tables;
};
{
  const at = text => { const i = cashReset.indexOf(text); assert(i > 0, `limpar-caixa.sh has: ${text}`); return i; };
  assert(cashReset.includes('[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0"; exit 1; }') && cashReset.includes('[ "$(id -u)" -ne 0 ] || { echo "JU_TEST é só para o teste no computador'), 'only root (and the test switch never as root)');
  // only the DB_NAME and DB_HOST lines of the .env, read as juimprime: the database deploy.sh copies (its envget, the first
  // line) is the one root cleans through the socket and the one the site uses (systemd takes the last): one DB_NAME line, a
  // local DB_HOST. The .env of the test switch only with it (on the server, always the one deploy.sh reads).
  assert(cashReset.includes('setting() { as_app grep -E "^[[:space:]]*$1[[:space:]]*=" -- "$ENV_FILE" 2>/dev/null || true; }') && cashReset.includes('if [[ "$(setting DB_NAME)" =~ ^DB_NAME=([A-Za-z0-9_]{1,64})$ ]]; then DB=${BASH_REMATCH[1]}; fi'), 'only the DB_NAME line of the .env, one and plain, read as juimprime');
  assert(cashReset.includes(`case "$(setting DB_HOST)" in\n  ''|DB_HOST=|DB_HOST=127.0.0.1|DB_HOST=localhost|DB_HOST=::1) ;;`) && at('case "$(setting DB_HOST)"') < at('--backup limpeza 2>&1'), 'the MariaDB of this machine, checked before the copy');
  assert(cashReset.includes('ENV_FILE=$APP_DIR/shared/.env ') && deploy.includes('ENV_FILE="$APP_DIR/shared/.env"') && cashReset.includes('ENV_FILE=${JU_ENV_FILE:?}; DEPLOY=${JU_DEPLOY:?}') && cashReset.split('JU_ENV_FILE').length === 3, 'the .env deploy.sh reads; another one only in the test');
  // --skip-force: the client stops at the first error even if a MariaDB option file says "force" (it would go on to the
  // COMMIT and save half of the transaction)
  assert(cashReset.includes('db() { mariadb "$@"; }') && cashReset.includes('q() { db --batch --skip-force --skip-column-names --default-character-set=utf8mb4 "$DB"; }') && cashReset.split('db --batch').length === 2, 'MariaDB as root through the socket, every query through q (the SQL on stdin), stopping at the first error');
  assert(!/DB_PASSWORD|DB_USER|DB_PORT|DATABASE_URL|--password|--user|MYSQL_PWD|defaults-extra-file/.test(cashReset), 'no password nor user anywhere');
  // the copy before anything, with the deploy.sh the setup installs, as juimprime; checked; a copy outside the rotation
  assert(cashReset.includes('DEPLOY=/usr/local/lib/juimprime/deploy.sh') && setup.includes('install -m 755 "$HERE/deploy.sh" /usr/local/lib/juimprime/deploy.sh') && deploy.includes('label=${2:-manual}; [[ "$label" =~ ^[a-z0-9-]{1,20}$ ]]'), 'deploy.sh --backup, where the setup installs it');
  assert(cashReset.includes('as_app() { runuser -u "$APP_USER" -- "$@"; }') && cashReset.includes('if ! out=$(as_app "$DEPLOY" --backup limpeza 2>&1); then'), 'the copy as juimprime');
  assert(at('--backup limpeza 2>&1') < at('q <<<') && at('--backup limpeza 2>&1') < at('| q'), 'the copy before the first query');
  assert(cashReset.includes('gzip -t "$1" && gzip -dc "$1" | tail -n 1 | grep -q "Dump completed"') && at('Dump completed') < at('q <<<'), 'checked before anything is read');
  assert(cashReset.includes('KEEP_DIR=/var/backups/juimprime') && cashReset.includes('install -d -o root -g root -m 700 "$KEEP_DIR"') && cashReset.includes('(umask 077; as_app cat -- "$copy" > "$kept")'), 'and kept outside the rotation of shared/backups, root only, read as juimprime');
  // LIMPAR, then one transaction; every DELETE inside it; nothing else changes the data
  assert(cashReset.includes('[ "$answer" = LIMPAR ] || { echo "Nada foi apagado."; exit 1; }') && at('[ "$answer" = LIMPAR ]') < at('sql+="START TRANSACTION;"'), 'LIMPAR in capitals before the SQL that deletes');
  const sqlLines = cashReset.split('\n').filter(line => line.includes('sql+="')).map(line => line.slice(line.indexOf('sql+="') + 6));
  const line = start => { const i = sqlLines.findIndex(l => l.startsWith(start)); assert(i >= 0, `limpar-caixa.sh builds: ${start}`); return i; };
  const deletes = sqlLines.filter(l => l.startsWith('DELETE FROM'));
  assert.equal(cashReset.split('DELETE FROM').length - 1, deletes.length, 'every DELETE is in the SQL of the transaction');
  assert(deletes.every(l => sqlLines.indexOf(l) > line('START TRANSACTION;')) && line('COMMIT;') === sqlLines.length - 1, 'all between START TRANSACTION and COMMIT');
  assert(line('INSERT INTO admin_audit (admin_id, action, detail, ip) VALUES (NULL, \'cash_reset\', \'$detail\', NULL);') > line('START TRANSACTION;') && cashReset.includes('detail="caixa zerado pelo servidor (limpar-caixa.sh'), 'the audit line in the same transaction');
  assert(!/\b(UPDATE \w+ SET|TRUNCATE|DROP TABLE|ALTER TABLE|REPLACE INTO)\b/i.test(cashReset), 'nothing is updated, truncated or dropped');
  assert(deletes.includes("DELETE FROM cash_entries WHERE id IN ($(in_list \"${entry_ids[@]}\"));\"$'\\n'; fi") && deletes.includes("DELETE FROM bills WHERE id IN ($(in_list \"${bill_ids[@]}\"));\"$'\\n'; fi"), 'the cash flow by the ids that were shown');
  // real orders never: the test orders are source <> 'live', checked again when the ids go in, and the order itself last
  assert(cashReset.includes(`TEST_ORDERS="source <> 'live' AND NOT $REAL_NOTE"`) && cashReset.includes(`REAL_NOTE="EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = orders.id AND i.environment = 'producao' AND (i.status <> 'erro' OR i.access_key IS NOT NULL OR i.provider_id IS NOT NULL OR i.attempts > 0))"`), 'test orders only, never one whose production NF-e went near Bling or that the site tried to send (only the one refused before it is cleaned)');
  assert(raw('api/_lib/invoicing.js').includes("return record(invoice, {status: 'erro', message: 'Pedido de teste (pago no modo de teste do Mercado Pago): não emitimos nota fiscal real para ele.', nextAttemptAt: null, retries: 0}"), 'that refusal is an "erro" before anything goes to Bling');
  // …and before the attempt is counted: a production note with attempts > 0 went past that refusal (to the CEP lookup or to
  // Bling), and the errors that leave no Bling id ("o Bling não confirmou se criou a nota") may have left a note there
  { const invoicing = raw('api/_lib/invoicing.js'), refusal = invoicing.indexOf("message: 'Pedido de teste (pago no modo de teste do Mercado Pago)"), counted = invoicing.indexOf('attempts: (invoice.attempts || 0) + 1');
    assert(refusal > 0 && counted > refusal && invoicing.split('attempts: (invoice.attempts || 0) + 1').length === 2, 'the refusal of a test order never counts an attempt'); }
  // a test order newer than the first real one (the site back in Mercado Pago's test mode after the launch) is pointed out
  // before LIMPAR, and a failed check stops
  assert(cashReset.includes(`AND created_at > (SELECT MIN(created_at) FROM orders WHERE source = 'live');") || newer=''`) && cashReset.includes('numbers "${newer:-x}" || { echo "Erro ao ler o banco: nada foi apagado."; exit 1; }') && at('ATENÇÃO: pedido(s) de teste desta lista') < at('Para apagar, digite LIMPAR'), 'the warning before LIMPAR');
  assert(sqlLines[line('INSERT INTO limpeza_pedidos')].includes('FROM orders WHERE $TEST_ORDERS AND id IN (') && line('CREATE TEMPORARY TABLE limpeza_pedidos AS SELECT id, reference FROM orders WHERE 1 = 0;') < line('START TRANSACTION;') && line('INSERT INTO limpeza_pedidos') > line('START TRANSACTION;'), 'the ids filtered again by the database, inside the transaction (the temporary table, with the columns of orders, made before it)');
  assert.equal(deletes.filter(l => l.startsWith('DELETE FROM orders')).join(), `DELETE FROM orders WHERE source <> 'live' AND id IN (SELECT id FROM limpeza_pedidos);"$'\\n'`, 'and the DELETE of the orders says source <> \'live\' itself');
  assert(!/source = 'live'[^\n]*\b(DELETE|INSERT INTO limpeza)/.test(cashReset) && !/(DELETE|INSERT INTO limpeza)[^\n]*source = 'live'/.test(cashReset), 'source = \'live\' only in counts');
  // every table that hangs on an order (a foreign key to orders in the migrations) goes with it, and the Bling log by reference
  const tables = migrationTables();
  assert(tables.get('orders').columns.includes('source') && tables.get('orders').columns.includes('tracking_last') && tables.get('invoices').columns.includes('next_attempt_at') && tables.get('cash_entries').columns.includes('category'), 'the migrations read');
  const hanging = [...tables].flatMap(([name, table]) => table.fks.filter(fk => fk.table === 'orders').map(fk => [name, fk.column]));
  assert.deepEqual(hanging.map(([name]) => name).sort(), ['invoices', 'order_events', 'order_items'], 'the tables that hang on an order (a new one must be cleaned by limpar-caixa.sh too)');
  for (const [name, column] of hanging) assert(line(`DELETE FROM ${name} WHERE ${column} IN (SELECT id FROM limpeza_pedidos);`) < line('DELETE FROM orders'), `${name} before the orders`);
  assert(tables.get('integration_log').columns.includes('reference') && line('DELETE FROM integration_log WHERE reference IN (SELECT reference FROM limpeza_pedidos);') > 0, 'the Bling log lines of those orders');
  const {PAID} = require('../api/_lib/orders.js');
  assert(cashReset.includes(`PAID="${PAID.map(s => `'${s}'`).join(', ')}"`), 'the paid statuses of api/_lib/orders.js');
  assert(cashReset.includes('Informar o saldo de hoje') && raw('dist/admin-cash.js').includes("'Informar o saldo de hoje'"), 'it names the button of the panel');
  // the copy in /var/backups/juimprime is root's only (700): undoing and removing it go through root's own shell, never the
  // operator's (a "gunzip -c … | sudo mariadb" or a "sudo rm …/limpeza-*" of the operator cannot open that folder)
  const resetDoc = raw('SERVIDOR-SETUP.md').split('## Zerar o fluxo de caixa')[1].split('\n## ')[0];
  assert(cashReset.includes(`echo "  sudo sh -c 'gunzip -c $kept | mariadb $DB'"`) && resetDoc.includes("sudo sh -c 'gunzip -c /var/backups/juimprime/limpeza-<data>.sql.gz | mariadb juimprime'") && resetDoc.includes("sudo sh -c 'rm -f /var/backups/juimprime/limpeza-*'"), 'undo and remove as root');
  assert(!/(^|[\s`])(gunzip -c [^\n]*\| sudo mariadb|sudo rm [^\n]*limpeza-\*)/.test(cashReset + resetDoc), 'never through the operator');
  assert(at('sudo systemctl stop juimprime.service') < at("sudo sh -c 'gunzip -c") && resetDoc.indexOf('sudo systemctl stop juimprime.service') < resetDoc.indexOf("sudo sh -c 'gunzip -c"), 'with the site stopped');
}

// …and run for real (JU_TEST=1) against a database of lies: SQLite (node:sqlite) with the tables of the migrations, the same
// SQL on stdin. Only where a bash 4 can open this folder and node:sqlite exists, and never as root.
{
  let DatabaseSync = null;
  try { ({DatabaseSync} = require('node:sqlite')); } catch {}
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ju-caixa-'));
  const slash = file => file.split(path.sep).join('/');
  const p = name => slash(path.join(dir, name));
  const script = slash(path.join(root, 'deploy/limpar-caixa.sh'));
  const env = {...process.env, JU_TEST: '1', JU_ENV_FILE: p('.env'), JU_DEPLOY: p('deploy.sh'), JU_MARIADB: p('mariadb'), JU_NODE: slash(process.execPath), JU_FAKE_JS: p('fake-mariadb.cjs'), JU_FAKE_DB: p('caixa.db'), JU_FAKE_LOG: p('calls.log'), JU_FAKE_DIR: slash(dir), JU_FAKE_BACKUP: '', JU_FAKE_FAIL: '', JU_FAKE_LATE: ''};
  try {
    fs.writeFileSync(p('.env'), 'APP_ENV=production\nDB_HOST=127.0.0.1\nDB_NAME=juimprime\nDB_USER=juimprime\nDB_PASSWORD=senha-do-banco-nunca-aparece\n');
    const probe = spawnSync('bash', ['-c', '[ "${BASH_VERSINFO[0]}" -ge 4 ] && [ -r "$1" ] && [ -r "$2" ]', 'probe', script, p('.env')], {encoding: 'utf8', env, timeout: 10000});
    if (!DatabaseSync || process.getuid?.() === 0 || probe.error || probe.status !== 0) console.log('limpar-caixa.sh: sem bash 4 que abra esta pasta, sem node:sqlite ou como root; o teste de comportamento ficou de fora (os estáticos valem).');
    else {
      // the copy: deploy.sh --backup's line, a gzip with or without the "Dump completed" mariadb-dump writes at the end
      fs.writeFileSync(p('deploy.sh'), `#!/bin/sh
echo "{\\"backup\\":\\"$*\\"}" >> "$JU_FAKE_LOG"
if [ "$JU_FAKE_BACKUP" = fail ]; then echo "Cópia do banco falhou (mariadb-dump)." >&2; exit 1; fi
mkdir -p "$JU_FAKE_DIR/backups"; f="$JU_FAKE_DIR/backups/limpeza-20261009-120000.sql.gz"
if [ "$JU_FAKE_BACKUP" = cut ]; then printf '%s\\n' '-- MariaDB dump' | gzip > "$f"; else printf '%s\\n' '-- MariaDB dump' '-- Dump completed on 2026-10-09 12:00:00' | gzip > "$f"; fi
echo "Cópia do banco: $f (4,0K)"
`);
      fs.writeFileSync(p('mariadb'), '#!/bin/sh\nexec "$JU_NODE" --no-warnings "$JU_FAKE_JS" "$@"\n');
      fs.chmodSync(p('deploy.sh'), 0o755); fs.chmodSync(p('mariadb'), 0o755);
      // the mariadb of lies: statements split on ; outside quotes, START TRANSACTION as BEGIN, rows with tabs and NULL like
      // mariadb --batch; stops at the first error (the open transaction rolled back), like the real client. JU_FAKE_FAIL fails
      // the statement that starts with it; JU_FAKE_LATE is something Ju adds while the owner reads the screen.
      fs.writeFileSync(p('fake-mariadb.cjs'), String.raw`'use strict';
const fs = require('node:fs');
const {DatabaseSync} = require('node:sqlite');
const sql = fs.readFileSync(0, 'utf8');
fs.appendFileSync(process.env.JU_FAKE_LOG, JSON.stringify({argv: process.argv.slice(2), sql}) + '\n');
const statements = [];
let current = '', quoted = false;
for (const ch of sql) {
  if (ch === "'") quoted = !quoted;
  if (ch === ';' && !quoted) { if (current.trim()) statements.push(current.trim()); current = ''; } else current += ch;
}
if (current.trim()) statements.push(current.trim());
const db = new DatabaseSync(process.env.JU_FAKE_DB);
db.exec('PRAGMA foreign_keys = ON');
try {
  for (const text of statements) {
    if (process.env.JU_FAKE_FAIL && text.startsWith(process.env.JU_FAKE_FAIL)) throw new Error('falha de mentira');
    if (/^START TRANSACTION$/.test(text) && process.env.JU_FAKE_LATE) db.exec(process.env.JU_FAKE_LATE);
    const statement = db.prepare(/^START TRANSACTION$/.test(text) ? 'BEGIN' : text);
    if (/^SELECT\b/.test(text)) for (const row of statement.all()) process.stdout.write(Object.values(row).map(v => v === null ? 'NULL' : String(v)).join('\t') + '\n');
    else statement.run();
  }
} catch (error) {
  try { db.exec('ROLLBACK'); } catch {}
  process.stderr.write('ERROR: ' + error.message + '\n');
  process.exit(1);
}
`);
      const tables = migrationTables(), id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      const L1 = id(1), L2 = id(2), T1 = id(11), T2 = id(12), T3 = id(13), T4 = id(14), T5 = id(15), T6 = id(16);
      const open = () => new DatabaseSync(p('caixa.db'));
      const seed = () => {
        fs.rmSync(p('caixa.db'), {force: true});
        const db = open();
        try {
        // the columns of the migrations, without types (SQLite takes any value); the keys a foreign key needs, and the keys
        for (const [name, table] of tables) db.exec(`CREATE TABLE ${name} (${[...table.columns.map(c => table.primary.includes(c) ? `${c} PRIMARY KEY` : c), ...table.fks.map(fk => `FOREIGN KEY (${fk.column}) REFERENCES ${fk.table} (${fk.ref})${fk.onDelete ? ` ON DELETE ${fk.onDelete}` : ''}`)].join(', ')})`);
        const add = (table, row) => db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row));
        add('cash_entries', {id: id(101), kind: 'entrada', category: 'outros', description: 'Venda na feira', amount_cents: 10000, occurred_on: '2026-10-01', created_at: '2026-10-01 12:00:00.000'});
        add('cash_entries', {id: id(102), kind: 'saida', category: 'materiais', description: 'Filamento PLA', amount_cents: 4590, occurred_on: '2026-10-02', created_at: '2026-10-02 12:00:00.000'});
        add('cash_entries', {id: id(103), kind: 'entrada', category: 'ajuste', description: 'Ajuste de saldo', amount_cents: 25000, occurred_on: '2026-10-03', created_at: '2026-10-03 12:00:00.000'});
        add('bills', {id: id(201), description: 'Aluguel', amount_cents: 120000, due_on: '2026-10-10', paid_on: null, locked_at: null, created_at: '2026-10-01 12:00:00.000'});
        add('bills', {id: id(202), description: 'Internet', amount_cents: 9990, due_on: '2026-10-05', paid_on: '2026-10-05', locked_at: '2026-10-05 10:00:00.000', created_at: '2026-10-01 12:00:00.000'});
        // the test orders from before the launch (3 to 8/10), the real ones from it (9/10, 10h and 11h)
        const order = (oid, reference, source, status, paid, at) => add('orders', {id: oid, reference, source, status, total_cents: 15990, paid_at: paid ? '2026-10-09 13:00:00.000' : null, refund_state: null, created_at: `${at}:00:00.000`});
        order(L1, 'JU-LIVE00001', 'live', 'pendente', true, '2026-10-09 10'); order(L2, 'JU-LIVE00002', 'live', 'aguardando_pagamento', false, '2026-10-09 11');
        order(T1, 'JU-TESTE0001', 'test', 'concluido', true, '2026-10-04 12'); order(T2, 'JU-TESTE0002', 'test', 'cancelado', false, '2026-10-05 12');
        order(T3, 'JU-TESTE0003', 'test', 'confirmado', true, '2026-10-06 12'); order(T4, 'JU-TESTE0004', 'test', 'pendente', true, '2026-10-07 12'); order(T5, 'JU-TESTE0005', 'test', 'confirmado', true, '2026-10-08 12'); order(T6, 'JU-TESTE0006', 'test', 'confirmado', true, '2026-10-03 12');
        for (const [n, oid] of [[1, L1], [2, T1], [3, T2], [4, T3], [5, T4]]) add('order_items', {id: n, order_id: oid, position: 0, product_id: 'dino', title: 'Dino', quantity: 1, unit_price_cents: 15990, selection: '{}'});
        for (const [n, oid] of [[1, L1], [2, T1], [3, T1], [4, T3]]) add('order_events', {id: n, order_id: oid, kind: 'pago', detail: null, actor: null, created_at: '2026-10-08 13:00:00.000'});
        // L1 with a real NF-e; T1 homologação; T3 a REAL NF-e on a test order (stays); T4 refused as a test order before it
        // went to Bling (goes: no attempt counted); T5 a production note created in Bling and refused there (stays: the note
        // exists in Bling); T6 a production note the site tried to send whose creation Bling never confirmed (an "erro" with no
        // Bling id, "o Bling não confirmou se criou a nota"): it may exist in Bling, so it stays
        for (const [oid, ref, environment, status, key, providerId, attempts] of [[L1, 'JU-LIVE00001', 'producao', 'autorizada', '3'.repeat(44), '901', 1], [T1, 'JU-TESTE0001', 'homologacao', 'autorizada', '1'.repeat(44), '902', 1], [T3, 'JU-TESTE0003', 'producao', 'autorizada', '2'.repeat(44), '903', 1], [T4, 'JU-TESTE0004', 'producao', 'erro', null, null, 0], [T5, 'JU-TESTE0005', 'producao', 'erro', null, '905', 2], [T6, 'JU-TESTE0006', 'producao', 'erro', null, null, 1]]) {
          add('invoices', {id: `${oid.slice(0, -4)}9${oid.slice(-3)}`, order_id: oid, provider: 'bling', provider_id: providerId, environment, reference: ref, status, access_key: key, attempts});
        }
        for (const [n, ref] of [[1, 'JU-LIVE00001'], [2, 'JU-TESTE0001'], [3, null]]) add('integration_log', {id: n, name: 'bling', kind: 'falha', reference: ref, message: 'x', created_at: '2026-10-08 13:00:00.000'});
        add('admin_audit', {id: 1, admin_id: null, action: 'login', detail: null, ip: null});
        } finally { db.close(); }
      };
      const query = sql => { const db = open(); try { return db.prepare(sql).all().map(row => ({...row})); } finally { db.close(); } };
      const NAMES = ['cash_entries', 'bills', 'orders', 'order_items', 'order_events', 'invoices', 'integration_log', 'admin_audit'];
      const counts = () => Object.fromEntries(NAMES.map(name => [name, query(`SELECT COUNT(*) AS n FROM ${name}`)[0].n]));
      const live = () => ['orders WHERE id', 'order_items WHERE order_id', 'order_events WHERE order_id', 'invoices WHERE order_id'].map(t => query(`SELECT * FROM ${t} IN ('${L1}', '${L2}') ORDER BY 1`)).concat([query("SELECT * FROM integration_log WHERE reference = 'JU-LIVE00001'")]);
      const calls = () => fs.existsSync(p('calls.log')) ? fs.readFileSync(p('calls.log'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
      const run = (lines, extra = {}) => {
        fs.rmSync(p('calls.log'), {force: true});
        const r = spawnSync('bash', [script], {input: lines.map(l => `${l}\n`).join(''), encoding: 'utf8', env: {...env, ...extra}, timeout: 120000});
        return {...r, out: r.stdout + r.stderr};
      };
      const sqlOf = list => list.filter(c => c.sql).map(c => c.sql).join('\n');
      seed();
      const full = counts(), liveRows = live();
      assert.deepEqual(full, {cash_entries: 3, bills: 2, orders: 8, order_items: 5, order_events: 4, invoices: 6, integration_log: 3, admin_audit: 1});

      // a .env where the database copied (the first DB_NAME line, DB_HOST) may not be the one cleaned through the socket nor
      // the one the site uses (the last line): no copy, not one query
      for (const [name, text] of [['repetido', 'DB_HOST=127.0.0.1\nDB_NAME=juimprime\nDB_NAME=juimprime_novo\n'], ['aspas', 'DB_NAME="juimprime"\n'], ['longe', 'DB_HOST=10.0.0.9\nDB_NAME=juimprime\n'], ['dois-hosts', 'DB_HOST=127.0.0.1\nDB_HOST=10.0.0.9\nDB_NAME=juimprime\n'], ['sem', 'DB_USER=juimprime\n']]) {
        fs.writeFileSync(p(`${name}.env`), `APP_ENV=production\n${text}DB_USER=juimprime\nDB_PASSWORD=senha-do-banco-nunca-aparece\n`);
        const r = run(['2', 'LIMPAR'], {JU_ENV_FILE: p(`${name}.env`)});
        assert.equal(r.status, 1, r.out); assert(/Nada foi feito\.\n$/.test(r.stdout), `${name}: ${r.out}`);
        assert.deepEqual(calls(), [], `${name}: no copy, no query`);
        assert(!r.out.includes('senha-do-banco'));
      }
      assert.deepEqual(counts(), full);
      // the copy fails, or comes without "Dump completed": not one query, nothing deleted
      for (const [mode, message] of [['fail', 'A cópia do banco falhou: nada foi apagado.'], ['cut', 'Não consegui conferir a cópia do banco: nada foi apagado.']]) {
        const r = run(['2', 'LIMPAR'], {JU_FAKE_BACKUP: mode});
        assert.equal(r.status, 1, r.out); assert(r.out.includes(message), r.out);
        assert.deepEqual(calls(), [{backup: '--backup limpeza'}], 'the copy, and no query at all');
        assert.deepEqual(counts(), full);
      }
      // what exists, what would go, and anything but LIMPAR: nothing deleted, no transaction opened
      const shown = run(['2', 'limpar']);
      assert.equal(shown.status, 1, shown.out); assert.match(shown.stdout, /Nada foi apagado\.\n$/);
      assert.deepEqual(calls()[0], {backup: '--backup limpeza'}, 'the copy first');
      assert(calls().slice(1).every(c => c.sql && !/DELETE|START TRANSACTION|INSERT/.test(c.sql)), 'only reads before LIMPAR');
      for (const text of ['Lançamentos à mão (entradas e despesas): 3, dos quais 1 são "Ajuste de saldo"', 'Contas a pagar: 2 (1 trancadas)', 'Pedidos de TESTE do Mercado Pago: 6', '    cancelado: 1', '    confirmado: 3', '    pendente: 1', 'Pedidos REAIS: 2 (1 pagos', '3 lançamento(s) à mão:', '2026-10-02  saída · materiais  R$ 45,90  Filamento PLA',
        '2 conta(s) a pagar:', 'vence 2026-10-05  R$ 99,90  paga em 2026-10-05 · trancada  Internet', 'vence 2026-10-10  R$ 1200,00  pendente  Aluguel', '3 pedido(s) de teste:', 'JU-TESTE0001  concluido  R$ 159,90', 'JU-TESTE0004', 'junto com eles: 3 peça(s), 2 linha(s) de histórico, 2 nota(s) fiscal(is)',
        'e 1 registro(s) do Bling', 'FICA: JU-TESTE0003 (confirmado; pedido de teste com nota fiscal de PRODUÇÃO', 'FICA: JU-TESTE0005 (confirmado;', 'FICA: JU-TESTE0006 (confirmado;', 'Os 2 pedidos REAIS não são tocados.']) assert(shown.out.includes(text), `shows: ${text}\n${shown.out}`);
      assert(!shown.out.includes('JU-LIVE') && !shown.out.includes('senha-do-banco'), 'no real order listed, no password');
      assert(!shown.out.includes('ATENÇÃO'), 'all the test orders are older than the first real one: no warning');
      assert.deepEqual(counts(), full);
      // a test order made after the first real one (the site back in test mode after the launch: with the production
      // credential, MP_MODE=test charges for real and marks the order as a test): the owner is told to check before LIMPAR
      { const db = open(); db.exec(`UPDATE orders SET created_at = '2026-10-09 10:30:00.000' WHERE id = '${T1}'`); db.close(); }
      const newer = run(['2', '']);
      assert.equal(newer.status, 1, newer.out); assert.match(newer.stdout, /Nada foi apagado\.\n$/);
      assert(newer.out.includes('ATENÇÃO: pedido(s) de teste desta lista feito(s) depois do primeiro pedido real: 1.') && newer.out.indexOf('ATENÇÃO') < newer.out.indexOf('Os 2 pedidos REAIS não são tocados.'), newer.out);
      { const db = open(); db.exec(`UPDATE orders SET created_at = '2026-10-04 12:00:00.000' WHERE id = '${T1}'`); db.close(); }
      assert.deepEqual(counts(), full);
      const kept = p('limpeza-20261009-120000.sql.gz');
      assert(fs.existsSync(kept) && fs.readFileSync(kept).equals(fs.readFileSync(p('backups/limpeza-20261009-120000.sql.gz'))), 'the copy kept outside the rotation');
      const wrong = run(['3']);
      assert.equal(wrong.status, 1); assert(wrong.out.includes('Responda 1 ou 2. Nada foi apagado.')); assert.deepEqual(counts(), full);
      // an error in the middle of the transaction: everything before it is undone
      const broken = run(['2', 'LIMPAR'], {JU_FAKE_FAIL: 'DELETE FROM orders'});
      assert.equal(broken.status, 1, broken.out); assert(broken.out.includes('A limpeza parou com erro'), broken.out);
      assert(sqlOf(calls()).includes('DELETE FROM cash_entries'), 'it got that far'); assert.deepEqual(counts(), full, 'and nothing was deleted');

      // 1 = only the cash flow (the locked bill too); orders untouched; the audit line; "caixa zerado" and the next step
      const cash = run(['1', 'LIMPAR']);
      assert.equal(cash.status, 0, cash.out);
      assert.deepEqual(counts(), {...full, cash_entries: 0, bills: 0, admin_audit: 2});
      assert.deepEqual(query("SELECT action, detail FROM admin_audit WHERE action = 'cash_reset'"), [{action: 'cash_reset', detail: 'caixa zerado pelo servidor (limpar-caixa.sh, opção 1): 3 lançamento(s) à mão, 2 conta(s) a pagar'}]);
      // undoing it: the copy is root's only, so root opens it (not "gunzip -c … | sudo mariadb"), with the site stopped
      for (const text of ['== Caixa zerado.', 'Informar o saldo de hoje', `A cópia de antes da limpeza: ${kept}`, '  sudo systemctl stop juimprime.service\n', `  sudo sh -c 'gunzip -c ${kept} | mariadb juimprime'\n`, '  sudo systemctl start juimprime.service\n']) assert(cash.out.includes(text), `says: ${text}\n${cash.out}`);
      assert(!sqlOf(calls()).includes('limpeza_pedidos') && !/DELETE FROM (orders|order_|invoices|integration_log)/.test(sqlOf(calls())), 'option 1 never touches an order');
      const cashAgain = run(['1']);
      assert.equal(cashAgain.status, 0, cashAgain.out); assert(cashAgain.out.includes('Nada: o caixa já está limpo (3 pedido(s) de teste saem na opção 2).'), cashAgain.out);
      assert.deepEqual(counts(), {...full, cash_entries: 0, bills: 0, admin_audit: 2}, 'nothing to delete: no LIMPAR asked, no audit line');

      // 2 = the cash flow and the test orders with everything that hangs on them; the real orders exactly as they were, the
      // test order with a real NF-e kept; something Ju adds while the screen is read stays (only the ids shown go)
      seed();
      const late = `INSERT INTO cash_entries (id, kind, category, description, amount_cents, occurred_on) VALUES ('${id(150)}', 'saida', 'frete', 'Correios', 2500, '2026-10-09')`;
      const all = run(['2', 'LIMPAR'], {JU_FAKE_LATE: late});
      assert.equal(all.status, 0, all.out);
      assert.deepEqual(query('SELECT id FROM orders ORDER BY id').map(r => r.id), [L1, L2, T3, T5, T6]);
      assert.deepEqual(counts(), {cash_entries: 1, bills: 0, orders: 5, order_items: 2, order_events: 2, invoices: 4, integration_log: 2, admin_audit: 2});
      assert.deepEqual(live(), liveRows, 'the real orders, their pieces, history, NF-e and Bling log exactly as they were');
      assert.deepEqual(query('SELECT id FROM cash_entries').map(r => r.id), [id(150)], 'what came in during the reading stays');
      assert(all.out.includes('Ficaram 1 lançamento(s) e 0 conta(s) feitos durante a limpeza'), all.out);
      assert.equal(query("SELECT detail FROM admin_audit WHERE action = 'cash_reset'")[0].detail, 'caixa zerado pelo servidor (limpar-caixa.sh, opção 2): 3 lançamento(s) à mão, 2 conta(s) a pagar, 3 pedido(s) de teste');
      const statements = calls().find(c => c.sql?.includes('START TRANSACTION')).sql.trim().split(/;\n/).map(s => s.split(' (')[0].split(' WHERE')[0]);
      assert.deepEqual(statements, ['CREATE TEMPORARY TABLE limpeza_pedidos AS SELECT id, reference FROM orders', 'START TRANSACTION', 'DELETE FROM cash_entries', 'DELETE FROM bills', 'INSERT INTO limpeza_pedidos', 'DELETE FROM integration_log', 'DELETE FROM invoices', 'DELETE FROM order_events', 'DELETE FROM order_items', 'DELETE FROM orders', 'INSERT INTO admin_audit', 'COMMIT;'], 'one transaction, the order last');
      // every call: the database name and nothing else (no user, no password)
      assert(calls().filter(c => c.argv).every(c => JSON.stringify(c.argv) === JSON.stringify(['--batch', '--skip-force', '--skip-column-names', '--default-character-set=utf8mb4', 'juimprime'])), 'mariadb --batch --skip-force --skip-column-names <database>, never a password');
      assert(!all.out.includes('senha-do-banco'));
      // again, without the late entry: nothing left to delete (the test order with a real NF-e stays), no question, no
      // transaction
      { const db = open(); db.exec('DELETE FROM cash_entries'); db.close(); }
      const again = run(['2']);
      assert.equal(again.status, 0, again.out);
      assert(again.out.includes('Nada: o caixa já está limpo.') && again.out.includes('FICA: JU-TESTE0003') && again.out.includes('FICA: JU-TESTE0006') && again.out.includes('Informar o saldo de hoje'), again.out);
      assert(!sqlOf(calls()).includes('START TRANSACTION'));
      const onlyCash = run(['1']);
      assert.equal(onlyCash.status, 0, onlyCash.out); assert(onlyCash.out.includes('Nada: o caixa já está limpo.'), onlyCash.out);
    }
  } finally {
    // a failed assertion may leave the SQLite file open on Windows: the cleanup never hides that failure
    try { fs.rmSync(dir, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}); } catch (error) { console.error(`limpar-caixa.sh: não apaguei ${dir} (${error.code})`); }
  }
}

// The "voltamos já" page (08/10/2026: "uma página de voltamos já bonita e profissional"): when Node is down or too slow,
// nginx answers with deploy/manutencao.html and a 503 instead of its 502. Nothing of the site is up then, so the page asks
// for nothing: no script, no stylesheet, font or image from anywhere (the logo is a small data URI); only the contact
// links lead out, and they are the ones of api/_lib/legal.js.
{
  const page = raw('deploy/manutencao.html');
  assert(Buffer.byteLength(page) < 40 * 1024, 'manutencao.html: under 40 KB');
  assert.doesNotMatch(page, /<script\b/i, 'no JavaScript');
  assert.doesNotMatch(page, /@import|@font-face|<link[^>]+rel="?stylesheet/i, 'no stylesheet or font to download');
  const refs = [...page.matchAll(/\b(?:src|href|srcset|action|poster)\s*=\s*["']([^"']*)["']/gi)].map(m => m[1]);
  const inside = /^(|#[\w-]+|data:[^"']*|mailto:[\w.+-]+@[\w.-]+|https:\/\/wa\.me\/\d+|https:\/\/www\.instagram\.com\/[\w.]+\/?)$/;
  assert(refs.length >= 8); assert.deepEqual(refs.filter(ref => !inside.test(ref)), [], 'the page asks for nothing outside itself');
  assert.doesNotMatch(page, /url\(\s*['"]?(?!data:|#)/i, 'and no url() leading out');
  const logo = page.match(/<img class="logo" src="(data:image\/webp;base64,[A-Za-z0-9+/=]+)"/);
  assert(logo && logo[1] === `data:image/webp;base64,${fs.readFileSync(path.join(root, 'dist/assets/logo-ju.webp')).toString('base64')}`, "the logo inside the page is the shop's own (336 px: sharp at 112 px on a 3x phone)");
  for (const piece of ['<html lang="pt-BR">', '<meta name="viewport" content="width=device-width,initial-scale=1">', '<meta name="robots" content="noindex">', '<meta http-equiv="refresh" content="60">', '<title>Voltamos já', 'html{background:#fbf1f2}']) assert(page.includes(piece), `manutencao.html: ${piece}`);
  assert(page.includes('tenta de novo sozinha a cada minuto') && page.includes('Nenhum pedido ou pagamento se perde'), 'it says it tries again by itself, and that nothing is lost');
  const {COMPANY, WHATSAPP} = require('../api/_lib/legal.js');
  assert(page.includes(`href="https://wa.me/${WHATSAPP}"`) && page.includes(COMPANY.phone) && page.includes('só mensagens') && page.includes(`href="mailto:${COMPANY.email}"`) && page.includes('href="https://www.instagram.com/juimprimepramim/"'), 'the contacts of api/_lib/legal.js');
  assert([...page.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].every(m => +m[1] >= 12), 'no text under 12 px');
  assert.match(page, /@media \(prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{animation:none!important/, 'still for whoever asks for less motion');
}

// config-nginx.sh: the page and the snippet installed, the include once in each server block that leads to the site
// (the one on 80 and the one certbot copied for 443), nginx -t before the reload with the copy back when it fails, and the
// access logs kept 190 days (the privacy policy promises 6 months: Marco Civil, art. 15). HTTPS, http2, HSTS and the
// server_name are other requests: untouched here.
{
  const pos = text => { const i = nginxSetup.indexOf(text); assert(i > 0, `config-nginx.sh has: ${text}`); return i; };
  const heredoc = start => nginxSetup.slice(pos(start), nginxSetup.indexOf('\nEOF\n', pos(start)));
  const snippet = heredoc(`cat > "$work/snippet" <<'EOF'`), code = nginxSetup.replace(/^\s*#.*$/gm, '');
  assert.match(snippet, /^error_page 502 503 504 =503 \/manutencao\.html;$/m, 'what nginx itself fails on (Node down: 502; too slow: 504) becomes the page, with a 503');
  assert(!/proxy_intercept_errors/.test(code) && !/proxy_intercept_errors/.test(nginx), "no proxy_intercept_errors: the site's own 503 (shipping_unavailable) pass as they are");
  assert.match(snippet, /^location = \/manutencao\.html \{\n    root \/var\/www\/juimprime-manutencao;\n    internal;\n/m, 'the page only as nginx\'s own answer (internal)');
  assert(snippet.includes('add_header Retry-After 120 always;') && snippet.includes('add_header Cache-Control "no-store" always;'), 'Retry-After and no-store, also on the 503 (always)');
  assert.match(snippet, /^location = \/manutencao-previa \{\n    allow 127\.0\.0\.1;\n    allow ::1;\n    deny all;\n/m, 'a preview only from the server itself');
  assert(nginxSetup.includes('install -m 644 "$HERE/manutencao.html" "$PAGE_DIR/manutencao.html"') && nginxSetup.includes('PAGE_DIR=/var/www/juimprime-manutencao') && nginxSetup.includes('install -m 644 "$work/snippet" "$SNIPPET"'), 'the page (root, readable by nginx) and the snippet installed');
  assert(nginxSetup.includes(String.raw`if (c ~ /proxy_pass[ \t]+http:\/\/127\.0\.0\.1:3000[;\/]/) site = 1`) && nginxSetup.includes(String.raw`if (!at && lvl[i] == 1 && c ~ /^[ \t]*server_tokens[ \t]+off[ \t]*;/) at = i`), 'the include in every server block that leads to the site, after its server_tokens off;');
  assert(nginxSetup.includes(String.raw`if (c ~ /^[ \t]*include[ \t]+snippets\/juimprime-manutencao\.conf[ \t]*;/) has = 1`) && nginxSetup.includes('add = site && !has'), 'and only where it is not yet (running again adds nothing)');
  assert(nginxSetup.includes('if [ "$sites" -eq 0 ]; then'), 'no server block leading to the site: nothing changes');
  assert(pos('cp -p "$SITE" "$site_copy"') < pos('cat "$work/site" > "$SITE"') && pos('cat "$work/site" > "$SITE"') < pos('if ! nginx -t 2> "$work/nginx-t"; then') && pos('if ! nginx -t 2> "$work/nginx-t"; then') < pos('systemctl reload nginx'), 'a copy first, nginx -t before the reload');
  assert(nginxSetup.includes('if ! nginx -t 2> "$work/nginx-t"; then\n  cat "$work/nginx-t"\n  restore\n') && nginxSetup.includes('[ -z "$site_copy" ] || cat "$site_copy" > "$SITE"'), 'nginx -t fails: the copy goes back, nothing is reloaded');
  const rotate = heredoc(`cat > "$work/logrotate" <<'EOF'`);
  assert(rotate.includes('\n/var/log/nginx/*.log {\n') && /^\tdaily$/m.test(rotate) && /^\trotate 190$/m.test(rotate) && /^\tcompress$/m.test(rotate) && rotate.includes('invoke-rc.d nginx rotate'), 'access logs: 190 daily rotations, compressed, the nginx of the Debian package told to reopen them');
  assert.match(raw('dist/privacidade.html'), /Registros de acesso:<\/strong> por 6 meses/, 'what the privacy policy promises');
  assert(nginxSetup.includes(`grep -q '^[^#]*/var/log/nginx/' "$LOGROTATE_PKG"`) && nginxSetup.includes('cp -p "$LOGROTATE_PKG" "$pkg_copy"') && nginxSetup.includes('LOGROTATE_OWN=/etc/logrotate.d/juimprime-nginx'), "the package's /etc/logrotate.d/nginx set aside, its original kept (one log in two blocks is an error)");
  assert(nginxSetup.includes('check=$(logrotate -d /etc/logrotate.conf 2>&1 || true)') && nginxSetup.includes("if grep -q 'duplicate log entry' <<<\"$check\"; then"), 'and checked with logrotate -d');
  for (const other of [/http2/, /ssl_/, /Strict-Transport-Security/, /server_name/]) assert.doesNotMatch(code, other, `config-nginx.sh leaves ${other.source} alone`);
  assert(pos('code http://127.0.0.1:3000/api/health') && pos('code -k "$web/manutencao-previa"'), 'at the end it checks the site is still there');
  assert(nginxSetup.includes('web=https://127.0.0.1 k=k tunnel=8443:127.0.0.1:443'), 'with HTTPS, the checks and the hints go by 443 (after certbot the block on 80 may only redirect)');
  assert(setup.includes('bash "$HERE/config-nginx.sh"') && setup.indexOf('bash "$HERE/config-nginx.sh"') > setup.indexOf('ln -sfn /etc/nginx/sites-available/juimprime'), 'a new server gets the same from the setup');
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
console.log('PASS: servidor próprio — LF scripts that stop at the first error, every setting in the .env, the app on 127.0.0.1 behind nginx, X-Forwarded-For from nginx, main by default with a safety guard, tests and a database copy before the switch, a health check that proves the commit and the database, a rollback the timer respects, the failure e-mail, the "voltamos já" page with 190 days of access logs, the cash flow reset (a copy first, LIMPAR, one transaction, real orders never), and only the sudo it needs.');
