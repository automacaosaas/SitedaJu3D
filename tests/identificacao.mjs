// Identification form (dist/identification.js), shared by the checkout and "Meus dados": the company data (pessoa jurídica)
// can be taken out again. A small stand-in for the form runs the real handlers. Run: node tests/identificacao.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const {identificationForm, wireIdentification, readIdentification} = await import(new URL('../dist/identification.js', import.meta.url).href);
const CNPJ = '11.222.333/0001-81', profile = {firstName: 'Marina', lastName: 'Teste', phone: '(11) 98765-4321', cpf: {masked: '***.651.374-**'}, company: {cnpj: '11222333000181', name: 'Clínica Teste', stateRegistration: '0010000010000'}};

// ── the markup: the button only when there is company data; the note hidden until it is used ──
let html = identificationForm({email: 'marina@exemplo.test', profile, submitLabel: 'Salvar'});
assert.match(html, /<details class="id-company" open>/);
assert.match(html, /<button type="button" class="id-remove-company" data-id-action="remove-company">Remover dados de pessoa jurídica<\/button>\s*<\/details>/);
assert.match(html, /<p class="id-note id-company-removed" role="status" hidden>Dados de pessoa jurídica retirados\. Ao confirmar, a nota fiscal passa a sair no seu CPF\.<\/p>/);
html = identificationForm({email: 'marina@exemplo.test', profile: {...profile, company: null}, submitLabel: 'Salvar'});
assert.match(html, /data-id-action="remove-company" hidden>/, 'no company yet: no button');

// ── a stand-in form with the fields, the section, the button and the note ──
function fakeForm({company = true, exempt = false} = {}) {
  const handlers = {}, element = props => ({hidden: false, disabled: false, attrs: {}, textContent: '', ...props, removeAttribute(name) { delete this.attrs[name]; }, setAttribute(name, value) { this.attrs[name] = value; }, focus() { form.focused = this; }, closest() { return null; }});
  const input = (name, value = '') => element({name, value});
  const fields = {firstName: input('firstName', 'Marina'), lastName: input('lastName', 'Teste'), phone: input('phone', '(11) 98765-4321'), marketingOptIn: element({name: 'marketingOptIn', checked: false}),
    cnpj: input('cnpj', company ? CNPJ : ''), companyName: input('companyName', company ? 'Clínica Teste' : ''), stateRegistration: input('stateRegistration', company && !exempt ? '0010000010000' : ''),
    stateRegistrationExempt: element({name: 'stateRegistrationExempt', checked: exempt})};
  fields.stateRegistration.disabled = exempt;
  const summary = element({tag: 'summary'}), section = element({open: company, querySelector: selector => selector === 'summary' ? summary : null});
  const remove = element({hidden: !company}), note = element({hidden: true}), error = element({});
  remove.closest = selector => selector === '[data-id-action="remove-company"]' ? remove : null;
  const form = {
    focused: null,
    addEventListener(type, fn) { handlers[type] = fn; },
    emit(type, target) { handlers[type]({target}); },
    querySelector(selector) {
      const name = /^\[name="(\w+)"\]$/.exec(selector)?.[1];
      if (name) return fields[name] || null;
      return {'.id-company': section, '[data-id-action="remove-company"]': remove, '.id-company-removed': note, '.id-error': error}[selector] || null;
    }
  };
  return {form, fields, section, summary, remove, note, error};
}

// ── "Remover dados de pessoa jurídica": the three fields empty, the section closed, the note says what happens ──
let t = fakeForm();
wireIdentification(t.form);
t.fields.cnpj.attrs['aria-invalid'] = 'true'; t.error.textContent = 'Confira o CNPJ.';
assert.deepEqual(readIdentification(t.form).data.company, {cnpj: CNPJ, name: 'Clínica Teste', stateRegistration: '0010000010000', stateRegistrationExempt: false}, 'before: the company goes with the form');
t.form.emit('click', t.remove);
assert.deepEqual([t.fields.cnpj.value, t.fields.companyName.value, t.fields.stateRegistration.value], ['', '', '']);
assert.equal(t.fields.cnpj.attrs['aria-invalid'], undefined, 'a field marked wrong is cleared too');
assert.equal(t.error.textContent, '');
assert.equal(t.section.open, false, 'the section closes');
assert.equal(t.remove.hidden, true);
assert.equal(t.note.hidden, false, 'the note says the invoice goes back to the CPF');
assert.equal(t.form.focused, t.summary, 'focus stays at the section');
const sent = readIdentification(t.form);
assert(sent.data && !sent.error, 'the rest of the form is still valid');
assert.equal(sent.data.company, null, 'the form sends company: null, which erases it on the server');

// "isenta de inscrição estadual" is company data too: removed as well, and the IE field usable again
t = fakeForm({exempt: true});
wireIdentification(t.form);
t.form.emit('click', t.remove);
assert.equal(t.fields.stateRegistrationExempt.checked, false);
assert.equal(t.fields.stateRegistration.disabled, false);
assert.equal(readIdentification(t.form).data.company, null);

// ── typing company data again: the button comes back and the note goes ──
t = fakeForm({company: false});
wireIdentification(t.form);
t.note.hidden = false;
t.fields.companyName.value = 'Clínica Nova';
t.form.emit('input', t.fields.companyName);
assert.equal(t.remove.hidden, false, 'something typed: the button shows');
assert.equal(t.note.hidden, true, 'and the old note goes');
t.fields.companyName.value = '';
t.form.emit('input', t.fields.companyName);
assert.equal(t.remove.hidden, true, 'emptied by hand: nothing to remove');
t.fields.stateRegistrationExempt.checked = true;
t.form.emit('change', t.fields.stateRegistrationExempt);
assert.equal(t.remove.hidden, false, '"isenta" checked counts as company data');

// ── the server erases the company when the form sends null (api/_lib/accounts.js) ──
const accounts = fs.readFileSync(new URL('../api/_lib/accounts.js', import.meta.url), 'utf8');
assert(accounts.includes("} else if (company === null) Object.assign(patch, {companyCnpj: null, companyName: null, companyIe: null});"));

// ── English and Spanish ──
const dictionary = fs.readFileSync(new URL('../dist/translations.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const rows = new Map(dictionary.slice(dictionary.indexOf('`') + 1, dictionary.lastIndexOf('`.trim()')).trim().split('\n').map(line => line.split('|')).map(([pt, en, es]) => [pt, {en, es}]));
for (const text of ['Remover dados de pessoa jurídica', 'Dados de pessoa jurídica retirados. Ao confirmar, a nota fiscal passa a sair no seu CPF.'])
  for (const lang of ['en', 'es']) assert(rows.get(text)?.[lang]?.trim(), `${lang}: ${text}`);

console.log('PASS: identificação — "Remover dados de pessoa jurídica" empties CNPJ, razão social and IE (and "isenta"), closes the section, says the invoice goes back to the CPF and sends company: null; the button follows what is typed; EN/ES.');
