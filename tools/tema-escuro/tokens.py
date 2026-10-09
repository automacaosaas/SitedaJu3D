#!/usr/bin/env python3
"""Tema escuro (09/10/2026): leva as cores fixas das folhas da loja para os tokens do tema, sem mudar o tema claro.

Cada cor escrita à mão numa folha (o branco de um cartão, o texto escuro, a borda clarinha) vira var(--token, <a mesma cor>): no tema
claro o token não existe e vale a cor de sempre (nada muda, pixel a pixel); no escuro, journey.css define o token e a peça inteira
troca junto. Os tokens:
  --surface      fundo branco de cartões, painéis e caixas
  --tint         fundo claro colorido (rosinha, verdinho) de selos, avisos e estados
  --glass-rgb    o branco translúcido dos vidros (rgb(var(--glass-rgb, 255 255 255) / alfa))
  --fg, --fg-2   texto escuro e texto cinza
  --border       bordas e linhas claras
  --lift         quanto as cores de destaque usadas como texto clareiam no escuro (color-mix com o branco)
  --accent-bg, --accent-fg   o destaque da peça como fundo (fica escuro) e como texto (clareia)
Gradientes, sombras, máscaras e o texto branco não mudam aqui (os que precisam têm a regra deles no tema escuro).
Rodar de novo não muda nada (só pega cor escrita à mão). Uso: python3 tools/tema-escuro/tokens.py [--check]
"""
import re, sys, colorsys, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2] / 'dist'
FILES = ['theme', 'journey', 'carousel', 'catalog', 'product-landing', 'product-page', 'hero-demo', 'cart-page', 'commerce', 'mini-cart', 'account',
         'contact', 'escolha', 'fenda', 'shopping', 'experience', 'consent', 'legal', 'not-found', 'identification', 'info', 'shipping-info', 'mobile-modal']
# seletores que ficam como estão: o QR do Pix precisa do branco para a câmera ler; a bolinha de cor branca é a cor
KEEP = re.compile(r'qr|pix-code-img|swatch|chip|kit-dots|order-swatches|product-swatches|nvb-badge|is-badge|badge::|badge-|\.ped-')
LIT = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)|\bwhite\b|\bblack\b')
DECL = re.compile(r'(?<![-\w])(background-color|background|color|fill|stroke|border|border-color|border-top|border-bottom|border-left|border-right|border-top-color|border-bottom-color|outline)(\s*:\s*)([^;{}]+)')

def parse(lit):
    t = lit.lower()
    if t == 'white': return (255, 255, 255, 1.0)
    if t == 'black': return (0, 0, 0, 1.0)
    if t.startswith('#'):
        h = t[1:]
        if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return (r, g, b, a)
    n = [float(x) for x in re.findall(r'[\d.]+', t)]
    return (int(n[0]), int(n[1]), int(n[2]), n[3] if len(n) > 3 else 1.0)

def lum(r, g, b):
    f = lambda c: (c / 255) / 12.92 if c / 255 <= .03928 else ((c / 255 + .055) / 1.055) ** 2.4
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b)

def sat(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    return 0 if mx == 0 else (mx - mn) / mx

def token(prop, lit, whole):
    r, g, b, a = parse(lit)
    Y, s = lum(r, g, b), sat(r, g, b)
    alpha = f'{a:.3f}'.rstrip('0').rstrip('.')
    if prop in ('background', 'background-color'):
        if not whole: return None
        if a >= .999 and Y > .86: return f'var(--surface, {lit})' if s < .05 else f'var(--tint, {lit})'
        if a < .999 and min(r, g, b) >= 240: return f'rgb(var(--glass-rgb, {r} {g} {b}) / {alpha})'
        return None
    if prop in ('color', 'fill', 'stroke'):
        if a < .999 or Y > .5: return None
        if Y < .06 and s < .55: return f'var(--fg, {lit})'
        if s < .22: return f'var(--fg-2, {lit})'
        return f'color-mix(in oklab, {lit}, #fff var(--lift, 0%))'
    if prop.startswith('border') or prop == 'outline':
        if a < .45 and Y < .25: return f'var(--border, {lit})'
        if a >= .999 and Y > .62 and s < .2: return f'var(--border, {lit})'
        return None
    return None

def keyframes(css):
    # os trechos dentro de @keyframes (as cores de uma animação ficam como estão)
    spans = []
    for k in re.finditer(r'@keyframes', css):
        i = css.index('{', k.end()); depth = 0
        for j in range(i, len(css)):
            depth += css[j] == '{'; depth -= css[j] == '}'
            if depth == 0: spans.append((k.start(), j)); break
    return spans

def transform(css):
    out, changes, pos = [], 0, 0
    frames = keyframes(css)
    # o seletor de cada bloco (para KEEP) e nada dentro de @keyframes
    for m in DECL.finditer(css):
        if any(a <= m.start() <= b for a, b in frames): continue
        prop, sep, value = m.group(1), m.group(2), m.group(3)
        if 'var(--surface' in value or 'var(--fg' in value or 'glass-rgb' in value or 'var(--border' in value or 'var(--tint' in value or '--lift' in value: continue
        if re.search(r'gradient|url\(|var\(', value) and prop in ('background', 'background-color'): continue
        start = css.rfind('}', 0, m.start()); block = css.rfind('{', 0, m.start())
        selector = css[start + 1:block] if block > start else ''
        if KEEP.search(selector): continue
        lits = LIT.findall(value)
        if not lits: continue
        whole = len(lits) == 1 and re.fullmatch(r'\s*' + re.escape(lits[0]) + r'\s*(!important)?\s*', value)
        new = value
        for lit in lits:
            t = token(prop, lit, bool(whole))
            if t: new = new.replace(lit, t, 1); changes += 1
        if new != value:
            out.append(css[pos:m.start(3)]); out.append(new); pos = m.end(3)
    out.append(css[pos:])
    return ''.join(out), changes

def accents(css):
    # o destaque da peça: como fundo fica escuro (o branco por cima continua legível), como texto clareia
    n = 0
    css, k = re.subn(r'(?<![-\w])(background(?:-color)?\s*:\s*)var\(--rose(\s*,\s*#[0-9a-fA-F]{6})?\)', lambda m: f'{m.group(1)}var(--accent-bg, var(--rose{m.group(2) or ""}))', css); n += k
    css, k = re.subn(r'(?<![-\w])(color\s*:\s*)var\(--theme-accent(\s*,\s*var\(--rose\))?\)', lambda m: f'{m.group(1)}var(--accent-fg, var(--theme-accent{m.group(2) or ""}))', css); n += k
    return css, n

# As cores de uma peça que a página escreve no próprio elemento (style="--pl-ink: …"): o estilo do elemento ganha de qualquer folha, então
# o escuro não as troca; quem usa é que pega o token quando ele existe. Texto: --fg (o escuro claro), cinza: --fg-2, destaque: clareia.
INLINE = r'(?:pl|pd|kit|auth|cat|nv|tier|fit|rec|theme|text|muted|accent|pick-accent)'
def palettes(css):
    n = 0
    def swap(m):
        nonlocal n
        prop, sep, value = m.group(1), m.group(2), m.group(3)
        v = value.strip(); imp = ''
        if v.endswith('!important'): imp = ' !important'; v = v[:-10].strip()
        mm = re.fullmatch(r'var\(--(' + INLINE + r')(-?)(ink|text|strong|muted|accent|)\b(?:\s*,[^()]*(?:\([^()]*\))?[^()]*)?\)', v)
        if not mm or 'var(--fg' in v: return m.group(0)
        name = mm.group(1) + mm.group(2) + mm.group(3)
        if name in ('accent', 'pick-accent') or mm.group(3) == 'accent': new = f'color-mix(in oklab, {v}, #fff var(--lift, 0%))'
        elif mm.group(3) == 'muted' or name == 'muted': new = f'var(--fg-2, {v})'
        elif mm.group(3) in ('ink', 'text', 'strong') or name == 'text': new = f'var(--fg, {v})'
        else: return m.group(0)
        n += 1
        return f'{prop}{sep}{new}{imp}'
    css = re.sub(r'(?<![-\w])(color|fill|stroke|-webkit-text-fill-color|caret-color)(\s*:\s*)([^;{}]+)', swap, css)
    # fundos: o tom da peça misturado ao branco (color-mix(…, #fff)) mistura com a superfície; o "ink" como fundo (os traços do +) clareia
    def back(m):
        nonlocal n
        prop, sep, value = m.group(1), m.group(2), m.group(3)
        if 'gradient' in value or 'url(' in value: return m.group(0)
        new = re.sub(r'(color-mix\(in (?:srgb|oklab)[^;{}]*?,\s*)(?<!--surface, )(#fff|#ffffff|white)(\s*\))', lambda k: f'{k.group(1)}var(--surface, {k.group(2)}){k.group(3)}', value)
        new = re.sub(r'^\s*var\(--(' + INLINE + r')-(ink|text)\)\s*$', lambda k: f' var(--fg, var(--{k.group(1)}-{k.group(2)}))', new)
        if new != value: n += 1
        return f'{prop}{sep}{new}'
    css = re.sub(r'(?<![-\w])(background-color|background)(\s*:\s*)([^;{}]+)', back, css)
    # degradês: as paradas quase brancas viram a superfície (o cabeçalho, o brilho do esqueleto) e o tom claro da peça (--theme-wash,
    # --theme-soft) vira o tom escuro dela
    def grad(m):
        nonlocal n
        prop, sep, value = m.group(1), m.group(2), m.group(3)
        if 'gradient' not in value: return m.group(0)
        def stop(k):
            lit = k.group(0); r, g, b, a = parse(lit)
            # já é a reserva de um token (var(--x, #fff)): fica como está, e a ferramenta continua idempotente
            if re.search(r'var\(--[\w-]+,\s*$', k.string[max(0, k.start() - 48):k.start()]): return lit
            if a < .999 or lum(r, g, b) <= .86: return lit
            return f'var(--surface-soft, {lit})' if lum(r, g, b) > .95 else f'var(--surface-2, {lit})'
        new = re.sub(r'(?<![\w(-])(?<!--surface-soft, )(?<!--surface-2, )' + LIT.pattern, stop, value)
        if new != value: n += 1
        return f'{prop}{sep}{new}'
    css = re.sub(r'(?<![-\w])(background-color|background|background-image)(\s*:\s*)([^;{}]+)', grad, css)
    css, k = re.subn(r'(?<!--wash, )var\(--theme-wash(\s*,\s*#[0-9a-fA-F]{6})?\)', lambda m: f'var(--wash, var(--theme-wash{m.group(1) or ""}))', css); n += k
    css, k = re.subn(r'(?<!--soft, )var\(--theme-soft(\s*,\s*#[0-9a-fA-F]{6})?\)', lambda m: f'var(--soft, var(--theme-soft{m.group(1) or ""}))', css); n += k
    return css, n

if __name__ == '__main__':
    check, total = '--check' in sys.argv, 0
    for name in FILES:
        path = ROOT / f'{name}.css'
        css = path.read_text()
        new, n = transform(css)
        new, k = accents(new)
        new, j = palettes(new)
        total += n + k + j
        if n + k + j: print(f'{name}.css: {n} cores, {k} destaques e {j} cores da peça')
        if not check and new != css: path.write_text(new)
    print(f'{total} trocas' + (' (só conferindo)' if check else ''))
    if check and total: sys.exit(1)
