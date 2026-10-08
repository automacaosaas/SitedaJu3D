'use strict';
// CSS minification at serve time (2026-10-08, PageSpeed), with no dependency: the stylesheets in dist/ stay readable (comments,
// one rule per line) and the visitor gets them without the comments and the spaces that mean nothing. Deliberately small and
// safe, by the CSS tokenizer's rules (css-syntax-3):
// - strings, url(...) and escapes are copied untouched (a ";" or "/*" inside them is text);
// - a comment goes away; where it was the only thing between two tokens that would otherwise merge, a space stays;
// - a run of spaces and line breaks becomes one space, and none is kept next to { } ; , or at the ends.
// Nothing else changes: no shortened colours, no merged rules, no space removed around : > + ~ or ( (where it can matter:
// "a :hover", "and (", calc(1px + 2px)). tests/css-minify.mjs checks, file by file, that the token sequence is the same.
const SPACE = /[ \t\n\r\f]/;
const SILENT = new Set(['{', '}', ';', ',']);   // whitespace next to these is never significant

function minifyCss(css) {
  let out = '', i = 0, space = false, joined = false;
  const n = css.length;
  const emit = text => {
    if (space && out && !SILENT.has(out[out.length - 1]) && !SILENT.has(text[0])) out += ' ';
    else if (joined && out && /[\w\-.%#@\\\u0080-￿]$/.test(out) && /^[\w\-.%#@\\\u0080-￿]/.test(text)) out += ' ';
    space = false; joined = false;
    out += text;
  };
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      if (!space) joined = true;   // decided at the next token: a space only if the two sides would merge
      continue;
    }
    if (SPACE.test(c)) { while (i < n && SPACE.test(css[i])) i++; space = true; joined = false; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1;
      emit(css.slice(i, Math.min(n, j + 1)));
      i = j + 1;
      continue;
    }
    if (c === '\\') {
      // an escape: a hex one may end with one whitespace, which belongs to it
      let j = i + 1;
      if (/[0-9a-fA-F]/.test(css[j] || '')) { while (j < n && j < i + 7 && /[0-9a-fA-F]/.test(css[j])) j++; if (SPACE.test(css[j] || '')) j += css[j] === '\r' && css[j + 1] === '\n' ? 2 : 1; }
      else j++;
      emit(css.slice(i, j));
      i = j;
      continue;
    }
    // url( starts a token here: the loop below stops before every "(", so a name never runs into it
    if ((c === 'u' || c === 'U') && /^url\(/i.test(css.slice(i, i + 4))) {
      // url(...) whole, quoted or not
      let j = i + 4;
      while (j < n && css[j] !== ')') {
        if (css[j] === '"' || css[j] === "'") { const q = css[j]; j++; while (j < n && css[j] !== q) j += css[j] === '\\' ? 2 : 1; }
        else if (css[j] === '\\') j++;
        j++;
      }
      emit(css.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    // punctuation alone; anything else (names, numbers, selectors) up to the next space, quote, escape, slash or punctuation
    if ('{};,/('.includes(c)) { emit(c); i++; continue; }
    let j = i + 1;
    while (j < n && !SPACE.test(css[j]) && !'"\'\\/{};,('.includes(css[j])) j++;
    // "background:url(": the name url right before "(" is a url token of its own, handled above
    const url = css[j] === '(' && /(^|[^\w\-\u0080-￿])url$/i.exec(css.slice(i, j));
    if (url && j - 3 > i) { emit(css.slice(i, j - 3)); i = j - 3; continue; }
    emit(css.slice(i, j));
    i = j;
  }
  return out;
}

module.exports = {minifyCss};
