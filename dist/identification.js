// Buyer identification, shared by the checkout (before delivery) and by "Meus dados" in the account. Layout follows the
// FARM Rio reference approved by the team: e-mail from the account, name and surname, CPF and phone in pairs, company
// data (pessoa jurídica) behind a link, the promotional opt-in unchecked, one button to continue. The server checks
// everything again (api/_lib/accounts.js); these checks only give quick feedback.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const digits = value => String(value ?? '').replace(/\D/g, '');

export function validCpf(value) {
  const d = digits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(d[i]) * (length + 1 - i);
    if ((sum * 10) % 11 % 10 !== Number(d[length])) return false;
  }
  return true;
}
// Numeric or alphanumeric CNPJ (issued since July 2026): 12 characters + 2 check digits, each character worth its ASCII code − 48.
export function validCnpj(value) {
  const c = String(value ?? '').toUpperCase().replace(/[.\-/\s]/g, '');
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const check = (base, weights) => { const rest = [...base].reduce((sum, ch, i) => sum + (ch.charCodeAt(0) - 48) * weights[i], 0) % 11; return rest < 2 ? 0 : 11 - rest; };
  const first = check(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(`${first}${check(c.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])}`);
}
export const validPhone = value => /^[1-9]{2}(9\d{8}|[2-8]\d{7})$/.test(digits(value).replace(/^55(?=\d{10,11}$)/, ''));

export function maskCpf(value) {
  const d = digits(value).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
export function maskPhone(value) {
  const d = digits(value).slice(0, 11);
  if (d.length < 3) return d ? `(${d}` : '';
  if (d.length < 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return d.length < 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export function maskCnpj(value) {
  const c = String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
  return c.replace(/^(\w{2})(\w)/, '$1.$2').replace(/^(\w{2})\.(\w{3})(\w)/, '$1.$2.$3').replace(/^(\w{2})\.(\w{3})\.(\w{3})(\w)/, '$1.$2.$3/$4').replace(/(\/\w{4})(\d{1,2})$/, '$1-$2');
}

const field = (name, label, value, attrs) => `<label class="id-field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const cpfInput = () => field('cpf', 'CPF', '', 'inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14" required');

export function identificationForm({email = '', profile = null, submitLabel, formId = 'identification-form'}) {
  const p = profile || {}, company = p.company || {}, exempt = company.stateRegistration === 'ISENTO';
  return `<form id="${formId}" class="id-form" novalidate data-identification>
  <div class="id-grid">
    <label class="id-field id-wide"><span>E-mail</span><input name="email" type="email" value="${esc(email)}" readonly aria-readonly="true" autocomplete="email"></label>
    ${field('firstName', 'Nome', p.firstName, 'autocomplete="given-name" maxlength="60" required')}
    ${field('lastName', 'Sobrenome', p.lastName, 'autocomplete="family-name" maxlength="100" required')}
    ${p.cpf ? `<div class="id-field id-saved" data-cpf-slot><span>CPF</span><p><strong translate="no">${esc(p.cpf.masked)}</strong><button type="button" data-id-action="change-cpf">Alterar</button></p></div>` : cpfInput()}
    ${field('phone', 'Telefone', p.phone, 'type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 99999-9999" maxlength="16" required')}
  </div>
  <p class="id-note">CPF e telefone são usados na nota fiscal e na entrega.</p>
  <details class="id-company"${p.company ? ' open' : ''}>
    <summary>Incluir dados de pessoa jurídica</summary>
    <div class="id-grid">
      ${field('cnpj', 'CNPJ', p.company ? maskCnpj(company.cnpj) : '', 'autocomplete="off" autocapitalize="characters" placeholder="00.000.000/0000-00" maxlength="18"')}
      ${field('companyName', 'Razão social', company.name, 'autocomplete="organization" maxlength="150"')}
      ${field('stateRegistration', 'Inscrição estadual', exempt ? '' : company.stateRegistration, `autocomplete="off" maxlength="20"${exempt ? ' disabled' : ''}`)}
      <label class="id-check id-exempt"><input type="checkbox" name="stateRegistrationExempt"${exempt ? ' checked' : ''}><span>Isenta de inscrição estadual</span></label>
    </div>
    <p class="id-note">A nota fiscal sai no CNPJ. O CPF continua sendo o de quem compra.</p>
    <button type="button" class="id-remove-company" data-id-action="remove-company"${p.company ? '' : ' hidden'}>Remover dados de pessoa jurídica</button>
  </details>
  <p class="id-note id-company-removed" role="status" hidden>Dados de pessoa jurídica retirados. Ao confirmar, a nota fiscal passa a sair no seu CPF.</p>
  <label class="id-check"><input type="checkbox" name="marketingOptIn"${p.marketingOptIn ? ' checked' : ''}><span>Quero receber comunicações promocionais.</span></label>
  <p class="id-error" role="alert"></p>
  <button class="primary id-submit" type="submit">${submitLabel}<span aria-hidden="true">›</span></button>
</form>`;
}

// Pessoa jurídica: closing the section keeps what was typed, so "Remover dados de pessoa jurídica" empties it. With the
// three fields empty the form sends `company: null` and the server erases the saved company (api/_lib/accounts.js): the
// invoice goes back to the buyer's CPF. The button shows while the section holds anything.
const COMPANY_FIELDS = ['cnpj', 'companyName', 'stateRegistration'];
const companyTyped = form => COMPANY_FIELDS.some(name => form.querySelector(`[name="${name}"]`)?.value.trim()) || form.querySelector('[name="stateRegistrationExempt"]')?.checked === true;
function syncCompany(form) {
  const typed = companyTyped(form), remove = form.querySelector('[data-id-action="remove-company"]');
  if (remove) remove.hidden = !typed;
  if (typed) { const removed = form.querySelector('.id-company-removed'); if (removed) removed.hidden = true; }
}
function removeCompany(form) {
  for (const name of COMPANY_FIELDS) { const input = form.querySelector(`[name="${name}"]`); input.value = ''; input.removeAttribute('aria-invalid'); }
  form.querySelector('[name="stateRegistrationExempt"]').checked = false;
  form.querySelector('[name="stateRegistration"]').disabled = false;
  form.querySelector('.id-error').textContent = '';
  const section = form.querySelector('.id-company');
  section.open = false;
  form.querySelector('[data-id-action="remove-company"]').hidden = true;
  form.querySelector('.id-company-removed').hidden = false;
  section.querySelector('summary').focus();
}

// Masks while typing, the "isenta" switch, the "Alterar" button of a saved CPF and the removal of the company data.
export function wireIdentification(form) {
  form.addEventListener('input', event => {
    const input = event.target;
    input.removeAttribute('aria-invalid');
    form.querySelector('.id-error').textContent = '';
    if (input.name === 'cpf') input.value = maskCpf(input.value);
    if (input.name === 'phone') input.value = maskPhone(input.value);
    if (input.name === 'cnpj') input.value = maskCnpj(input.value);
    if (COMPANY_FIELDS.includes(input.name)) syncCompany(form);
  });
  form.addEventListener('change', event => {
    if (event.target.name !== 'stateRegistrationExempt') return;
    const ie = form.querySelector('[name="stateRegistration"]');
    ie.disabled = event.target.checked;
    if (event.target.checked) ie.value = '';
    syncCompany(form);
  });
  form.addEventListener('click', event => {
    if (event.target.closest('[data-id-action="remove-company"]')) { removeCompany(form); return; }
    if (!event.target.closest('[data-id-action="change-cpf"]')) return;
    const slot = form.querySelector('[data-cpf-slot]');
    slot.outerHTML = cpfInput();
    form.querySelector('[name="cpf"]').focus();
  });
}

const MESSAGES = {
  firstName: 'Informe seu nome.', lastName: 'Informe seu sobrenome.', cpf: 'Confira o CPF.', phone: 'Informe um telefone com DDD.',
  cnpj: 'Confira o CNPJ.', companyName: 'Informe a razão social.', stateRegistration: 'Informe a inscrição estadual ou marque que é isenta.'
};

// The values to send to PUT /api/account/profile, or the first problem found.
export function readIdentification(form) {
  const value = name => form.querySelector(`[name="${name}"]`)?.value.trim() ?? '';
  const exempt = form.querySelector('[name="stateRegistrationExempt"]')?.checked === true;
  const data = {firstName: value('firstName'), lastName: value('lastName'), phone: value('phone'), marketingOptIn: form.querySelector('[name="marketingOptIn"]').checked};
  const cpfField = form.querySelector('[name="cpf"]');
  if (cpfField) data.cpf = cpfField.value;
  const hasCompany = [value('cnpj'), value('companyName'), value('stateRegistration')].some(Boolean) || exempt;
  data.company = hasCompany ? {cnpj: value('cnpj'), name: value('companyName'), stateRegistration: value('stateRegistration'), stateRegistrationExempt: exempt} : null;
  const problem =
    data.firstName.length < 2 ? 'firstName' : data.lastName.length < 2 ? 'lastName' : cpfField && !validCpf(data.cpf) ? 'cpf' : !validPhone(data.phone) ? 'phone' :
    hasCompany && !validCnpj(data.company.cnpj) ? 'cnpj' : hasCompany && data.company.name.length < 2 ? 'companyName' : hasCompany && !exempt && !data.company.stateRegistration ? 'stateRegistration' : null;
  return problem ? {error: {field: problem, message: MESSAGES[problem]}} : {data};
}

// Points at the field the server (or the check above) refused: opens the company section when needed and focuses it.
export function showIdentificationError(form, {field = null, message}) {
  form.querySelector('.id-error').textContent = message;
  const input = field && form.querySelector(`[name="${field}"]`);
  if (!input) return;
  const section = input.closest('details');
  if (section) section.open = true;
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}
