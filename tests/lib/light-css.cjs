// O CSS como o tema claro o lê (tema escuro, 09/10/2026). Os componentes usam var(--token, <cor do claro>) e os tokens só existem em
// :root[data-theme="dark"] (journey.css): no claro vale a reserva. Os testes de desenho do claro conferem este texto — as regras do
// escuro saem, cada token vira a própria reserva e o "clareia no escuro" (color-mix com #fff var(--lift, 0%)) vira a cor de antes.
// O que o tema claro mostra é o que já mostrava; o escuro tem o próprio teste (tests/tema-escuro.mjs).
const TOKENS = ['fg', 'fg-2', 'on-ink', 'surface', 'surface-2', 'surface-soft', 'tint', 'wash', 'soft', 'border', 'rim', 'accent-bg', 'accent-fg',
  'gallery-bg', 'thumb-bg', 'hero-base', 'stops-dark', 'scrim'];
const NAME = new RegExp(`var\\(--(?:${TOKENS.join('|')}),\\s*`, 'g');

// a regra inteira (com o bloco entre chaves), a partir do índice do seletor
function blockEnd(css, from) {
  let depth = 0;
  for (let i = css.indexOf('{', from); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return i + 1;
  }
  return css.length;
}
// a reserva de var(--x, reserva), com parênteses equilibrados
function fallback(css, from) {
  let depth = 1;
  for (let i = from; i < css.length; i++) {
    if (css[i] === '(') depth++;
    else if (css[i] === ')' && --depth === 0) return [css.slice(from, i), i + 1];
  }
  return [css.slice(from), css.length];
}

function lightCss(css) {
  // 1. as regras do escuro
  let out = '', pos = 0;
  for (const m of css.matchAll(/(^|[}\n])([^{}\n]*:root\[data-theme="dark"\][^{}]*)\{/g)) {
    const start = m.index + m[1].length;
    if (start < pos) continue;
    out += css.slice(pos, start);
    pos = blockEnd(css, start);
    if (css[pos] === '\n') pos++;
  }
  css = out + css.slice(pos);
  // 2. os tokens: de dentro para fora, cada var(--token, x) vira x
  for (let guard = 0; guard < 8; guard++) {
    let changed = false, text = '', at = 0;
    for (const m of css.matchAll(NAME)) {
      if (m.index < at) continue;
      const [inner, end] = fallback(css, m.index + m[0].length);
      text += css.slice(at, m.index) + inner; at = end; changed = true;
    }
    css = text + css.slice(at);
    if (!changed) break;
  }
  // 3. o "clareia no escuro" e a camada de véu, que no claro não existem
  return css.replace(/color-mix\(in oklab, ([^,()]+(?:\([^()]*(?:\([^()]*\))?[^()]*\))?), #fff var\(--lift, 0%\)\)/g, '$1')
    .replace(/(background(?:-image)?:\s*)none,\s*/g, '$1');
}

module.exports = {lightCss};
