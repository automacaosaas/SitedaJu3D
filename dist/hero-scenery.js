// Fundo desenhado da vitrine, em sombreado de nuvens: SVG em linha, sem filtros, sem scripts e sem animação própria.
// Cada camada de fundo recebe UM elemento raiz (a demonstração escurece e desloca esse elemento): as brumas brancas dos
// cantos e, atrás da peça, o desenho do produto (`motif`, vindo de SHOWCASE em products.js — aqui não há nome de produto).
// Cores: só as variáveis da camada (hero-motion.js › sceneryVars), todas opacas — --scn-tN (a cor da peça clareada até o
// tom do meio do degradê), --scn-hN (o lado da luz) e --scn-sN (o lado da sombra, no máximo 8% da cor do texto). Nada aqui
// fica mais escuro que um --scn-sN, então o desenho nunca tira contraste de um texto. As bordas se dissolvem por degradês
// e pela máscara do CSS (carousel.css › .scenery-back).
//
// Quadro do desenho (viewBox): 1 unidade = 1/200 da largura da pilastra; a origem é o alto do palco, no centro da peça.
// A peça ocupa y 0–172 (lâmpadas: corpo ±31, orelhas ±47; borboleta: asas ±65 com a abertura em x ±22, y 49–168;
// dinossauro: cabeça ±43 com a abertura em x ±18, y 60–171); a pilastra, x ±100 a partir de y 152.
const VIEW = '-180 -60 360 340';

// ── brumas dos cantos (quadro 360 × 440, ancoradas embaixo) ──
const petals = `<path d="M-75 380C-110 308-40 235 33 257C-49 180 11 82 91 136C55 32 155 9 185 100C212 22 301 74 259 154C351 133 370 230 290 267C380 299 337 395 263 371Z"/>`;
const fern = () => {
  let leaves = '<path d="M93 432Q105 208 225 13Q168 218 116 432Z" opacity=".35"/>';
  for (let i = 0; i < 9; i++) {
    const t = i / 8, y = 369 - t * 308, x = 112 + t * t * 101;
    const size = 111 * (1 - t * .73);
    leaves += `<path d="M${x} ${y}C${x-size*.42} ${y+12},${x-size-12} ${y-size*.16},${x-size} ${y-size*.62}C${x-size*.45} ${y-size*.62},${x-4} ${y-24},${x} ${y}Z"/>`;
    leaves += `<path d="M${x+4} ${y+8}C${x+size*.65} ${y+11},${x+size+16} ${y-size*.36},${x+size} ${y-size*.68}C${x+size*.36} ${y-size*.61},${x+9} ${y-20},${x+4} ${y+8}Z"/>`;
  }
  return leaves;
};
// capim da savana: folhas finas e curvas saindo do chão
const grass = () => [[34, 250, -34], [66, 330, -14], [98, 280, 12], [128, 370, -6], [160, 300, 24], [190, 236, 38], [216, 318, 10], [246, 256, 44], [274, 196, 34], [300, 160, 52], [112, 196, -44]]
  .map(([x, h, lean]) => `<path d="M${x - 10} 440C${x - 6} ${440 - h * .45} ${x + lean * .4} ${440 - h * .8} ${x + lean} ${440 - h}C${x + lean * .5 + 5} ${440 - h * .74} ${x + 9} ${440 - h * .44} ${x + 11} 440Z"/>`).join('');
// nuvens fofas
const puffs = '<path d="M0 440V362A70 70 0 0 1 104 300A95 95 0 0 1 270 292A66 66 0 0 1 350 370L360 440Z"/><path d="M200 250A40 40 0 0 1 262 222A50 50 0 0 1 340 236A34 34 0 0 1 336 290H206A26 26 0 0 1 200 250Z" opacity=".55"/>';
const SIDES = {petals: () => petals, ferns: fern, grass, puffs: () => puffs};

const mists = (side, uid) => `<div class="scenery-mist">${['left', 'right'].map(at => {
  const id = `scn-${uid}-mist-${at}`;
  return `<svg class="scenery-${at}" viewBox="0 0 360 440" focusable="false"><defs><radialGradient id="${id}" cx="32%" cy="25%" r="87%"><stop stop-color="#fff" stop-opacity=".9"/><stop offset=".4" stop-color="#fff" stop-opacity=".61"/><stop offset=".72" stop-color="#fff" stop-opacity=".24"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><g fill="url(#${id})">${(SIDES[side] || SIDES.petals)()}</g></svg>`;
}).join('')}</div>`;

// ── peças do desenho ──
const n = value => +value.toFixed(1);
// Degradês de cada cor (N = 1..4): `g` linear (luz no alto à esquerda, sombra embaixo à direita) e `r` radial (um ponto de luz);
// `d`, do tom à sombra (o que é mais escuro: tronco, garras); `c`, nuvem branca com a base no tom N; `mist`, um halo branco.
// As cores vêm das classes (carousel.css).
const defs = uid => {
  let out = `<radialGradient id="scn-${uid}-mist"><stop offset="0" stop-color="#fff" stop-opacity=".78"/><stop offset=".55" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
  for (let k = 1; k <= 4; k++) {
    out += `<linearGradient id="scn-${uid}-c${k}" class="m-k${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".94"/><stop offset="1" class="m-gt"/></linearGradient>`;
    out += `<linearGradient id="scn-${uid}-g${k}" class="m-k${k}" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" class="m-gh"/><stop offset=".48" class="m-gt"/><stop offset="1" class="m-gs"/></linearGradient>`;
    out += `<radialGradient id="scn-${uid}-r${k}" class="m-k${k}" cx=".38" cy=".32" r=".78"><stop offset="0" class="m-gh"/><stop offset=".55" class="m-gt"/><stop offset="1" class="m-gs"/></radialGradient>`;
    out += `<linearGradient id="scn-${uid}-d${k}" class="m-k${k}" x1=".1" y1="0" x2=".9" y2="1"><stop offset="0" class="m-gt"/><stop offset=".7" class="m-gs"/></linearGradient>`;
  }
  return `<defs>${out}</defs>`;
};
const fill = (uid, kind, k) => `fill="url(#scn-${uid}-${kind}${k})"`;
// caminho suave (Catmull-Rom → Bézier) por uma lista de pontos [[x, y], …]
const smooth = (pts, closed = true) => {
  const P = closed ? [pts.at(-1), ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts.at(-1)];
  let d = `M${n(P[1][0])} ${n(P[1][1])}`;
  for (let i = 1; i < P.length - 2; i++) {
    const [a, b, c, e] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    d += `C${n(b[0] + (c[0] - a[0]) / 6)} ${n(b[1] + (c[1] - a[1]) / 6)} ${n(c[0] - (e[0] - b[0]) / 6)} ${n(c[1] - (e[1] - b[1]) / 6)} ${n(c[0])} ${n(c[1])}`;
  }
  return d + (closed ? 'Z' : '');
};
const halo = (uid, cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#scn-${uid}-mist)"/>`;
// estrela de 5 pontas (r = raio externo), com o degradê `g` da cor k
const star = (uid, x, y, r, k, turn = 0) => {
  const pts = Array.from({length: 10}, (_, i) => { const a = (i * 36 - 90 + turn) * Math.PI / 180, d = i % 2 ? r * .46 : r; return `${n(x + d * Math.cos(a))} ${n(y + d * Math.sin(a))}`; });
  return `<path ${fill(uid, 'g', k)} stroke="url(#scn-${uid}-g${k})" stroke-width="2.4" stroke-linejoin="round" d="M${pts.join('L')}Z"/>`;
};
const sparkle = (x, y, s) => `<path class="m-white" d="M${x} ${n(y - 9 * s)}C${n(x + s)} ${n(y - 2 * s)} ${n(x + 2 * s)} ${n(y - s)} ${n(x + 9 * s)} ${y}C${n(x + 2 * s)} ${n(y + s)} ${n(x + s)} ${n(y + 2 * s)} ${x} ${n(y + 9 * s)}C${n(x - s)} ${n(y + 2 * s)} ${n(x - 2 * s)} ${n(y + s)} ${n(x - 9 * s)} ${y}C${n(x - 2 * s)} ${n(y - s)} ${n(x - s)} ${n(y - 2 * s)} ${x} ${n(y - 9 * s)}Z"/>`;

// ── bananas: um cacho grande pendurado à direita da peça e um menor à esquerda ──
// uma banana deitada para a direita, a partir do cabinho (na origem), curvando para cima; ~100 unidades, com as quinas da casca
const banana = uid => `<path ${fill(uid, 'g', 1)} d="M2 -8C26 0 58 0 84 -26C88 -30 92 -33 96 -34L97 -27C95 -24 93 -21 90 -18C66 14 30 24 2 9Z"/>`
  + '<path class="m-k1 m-lh" d="M10 -2C34 6 60 4 80 -16"/>'
  + '<path class="m-k1 m-ls" d="M16 13C42 17 66 6 86 -14"/>'
  + '<path class="m-k3 m-fs" d="M88 -28C91 -31 93 -33 96 -34L97 -27C95 -25 94 -23 92 -21C91 -24 90 -26 88 -28Z"/>'
  + `<path ${fill(uid, 'd', 2)} d="M4 -7L-10 -5C-13 -2 -13 2 -10 5L4 8Z"/>`;
// o cacho: as bananas em leque a partir da coroa, cada uma por cima da anterior, e a coroa no tom bege da peça
const bunch = (uid, x, y, scale, angles, mirror = false) => `<g transform="translate(${x} ${y}) scale(${mirror ? -scale : scale} ${scale})">`
  + angles.map(a => `<g transform="rotate(${a})">${banana(uid)}</g>`).join('')
  + `<path ${fill(uid, 'd', 2)} d="M-20 -4C-22 -12 -14 -17 -6 -14C2 -16 8 -10 6 -2C8 6 0 11 -8 9C-16 11 -22 5 -20 -4Z"/><path class="m-k2 m-lh" d="M-15 -9C-11 -12 -6 -12 -2 -10"/></g>`;
// uma nuvenzinha de apoio (branca, com a base no tom k da peça)
const cloud = (uid, x, y, s, k = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path ${fill(uid, 'c', k)} d="M-40 12C-50 12 -52 -2 -42 -6C-44 -19 -29 -25 -20 -18C-16 -33 6 -35 12 -22C21 -31 36 -24 33 -11C44 -11 48 5 38 12C24 15 -24 15 -40 12Z"/><path class="m-white m-lh" d="M-34 -8C-32 -15 -26 -17 -21 -15M-11 -24C-5 -29 3 -29 8 -24"/></g>`;
const bananas = uid => halo(uid, 118, 60, 84, 80) + halo(uid, -118, 96, 66, 60)
  + cloud(uid, 132, 104, 1.25, 2) + cloud(uid, -118, 116, .82, 2)
  + bunch(uid, 84, 22, .9, [4, 22, 40, 58])
  + bunch(uid, -80, 70, .64, [14, 36, 58], true)
  + sparkle(160, 6, .9) + sparkle(-150, 38, .7) + sparkle(58, 132, .5) + sparkle(-58, 128, .45);

// ── arco-íris: faixas arredondadas como as da peça (cada uma com luz por fora e sombra por dentro), nuvenzinhas nos pés ──
const RAINBOW = {cy: 146, r: [150, 139, 128, 117, 106], order: [4, 1, 2, 3]};   // de fora para dentro: rosa, roxo, lavanda, dourado
const rainbow = uid => {
  const {cy, r, order} = RAINBOW, R = r[0];
  // um degradê radial no centro do arco pinta as quatro faixas (cada uma com luz por fora e sombra por dentro)
  const stops = order.map((k, i) => {
    const outer = r[i] / R, inner = r[i + 1] / R, span = outer - inner;
    return `<stop offset="${n(inner * 1000) / 1000}" style="stop-color:var(--scn-s${k})"/><stop offset="${n((inner + span * .45) * 1000) / 1000}" style="stop-color:var(--scn-t${k})"/><stop offset="${n((outer - .004) * 1000) / 1000}" style="stop-color:var(--scn-h${k})"/>`;
  }).reverse().join('');
  return halo(uid, 0, 118, 178, 150)
    + `<defs><radialGradient id="scn-${uid}-bands" gradientUnits="userSpaceOnUse" cx="0" cy="${cy}" r="${R}">${stops}</radialGradient></defs>`
    + `<path fill="url(#scn-${uid}-bands)" d="M${-R} ${cy}A${R} ${R} 0 0 1 ${R} ${cy}L${r[4]} ${cy}A${r[4]} ${r[4]} 0 0 0 ${-r[4]} ${cy}Z"/>`
    + `<path class="m-white m-lh" d="M${-R + 6} ${cy - 30}A${R - 2} ${R - 2} 0 0 1 ${-60} ${n(cy - Math.sqrt((R - 2) ** 2 - 3600))}" opacity=".7"/>`
    + cloud(uid, -128, cy + 2, 1.05) + cloud(uid, 132, cy - 2, .95) + cloud(uid, -96, cy + 14, .62) + cloud(uid, 160, cy + 14, .5)
    + star(uid, -150, 40, 8, 1, 8) + star(uid, 150, 52, 6.5, 1, -10) + star(uid, -96, 4, 5, 3) + star(uid, 164, 110, 5, 2, 14) + star(uid, -162, 108, 4.5, 2)
    + sparkle(124, 6, .7) + sparkle(-62, 96, .55) + sparkle(70, 102, .45);
};

// ── acácia: a árvore de copa achatada da savana à direita, a copa em camadas de nuvem por trás da cabeça, o sol e o capim ──
const tuft = (uid, x, y, s, k, flip = 1) => `<g transform="translate(${x} ${y}) scale(${flip * s} ${s})">${[[-12, 34, -16], [-5, 48, -6], [2, 40, 8], [8, 52, 14], [15, 30, 22]]
  .map(([bx, h, lean]) => `<path ${fill(uid, 'g', k)} d="M${bx - 3} 0C${bx - 2} ${-h * .5} ${bx + lean * .4} ${-h * .82} ${bx + lean} ${-h}C${bx + lean * .5 + 1.5} ${-h * .7} ${bx + 2.5} ${-h * .42} ${bx + 4} 0Z"/>`).join('')}</g>`;
// um galho afinando de (x1, y1) a (x2, y2), com larguras w1 → w2 e uma curva (bend, para o lado)
const limb = (x1, y1, x2, y2, w1, w2, bend = 0) => {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), cx = (x1 + x2) / 2 - dy / len * bend, cy = (y1 + y2) / 2 + dx / len * bend, left = [], right = [];
  for (const t of [0, .25, .5, .75, 1]) {
    const u = 1 - t, x = u * u * x1 + 2 * u * t * cx + t * t * x2, y = u * u * y1 + 2 * u * t * cy + t * t * y2;
    const tx = 2 * u * (cx - x1) + 2 * t * (x2 - cx), ty = 2 * u * (cy - y1) + 2 * t * (y2 - cy), tl = Math.hypot(tx, ty), w = (w1 + (w2 - w1) * t) / 2;
    left.push([x - ty / tl * w, y + tx / tl * w]); right.push([x + ty / tl * w, y - tx / tl * w]);
  }
  return smooth([...left, ...right.reverse()]);
};
const bird = (x, y, s) => `<path class="m-k2 m-ls" d="M${n(x - 7 * s)} ${n(y - 2 * s)}C${n(x - 4 * s)} ${n(y - 5 * s)} ${n(x - 1 * s)} ${n(y - 3 * s)} ${x} ${y}C${n(x + 1 * s)} ${n(y - 3 * s)} ${n(x + 4 * s)} ${n(y - 5 * s)} ${n(x + 7 * s)} ${n(y - 2 * s)}"/>`;
const acacia = uid => halo(uid, -112, 30, 58, 58) + '<circle class="m-white" cx="-112" cy="30" r="19" opacity=".72"/>'
  + bird(-74, 14, 1) + bird(-58, 26, .7) + bird(-88, 30, .55)
  // as nuvens da savana (07/10/2026: "cada objeto e suas respectivas nuvens"): uma passando pelo sol, outra no alto, à direita
  + cloud(uid, -64, 50, .78, 1) + cloud(uid, 154, -8, .5, 1)
  + halo(uid, 62, 44, 150, 76)
  // a pequena, ao longe, à esquerda
  + `<path class="m-k3 m-ls" d="M-138 132C-138 124 -139 116 -142 108M-138 120C-134 114 -130 110 -126 106"/>`
  + `<path ${fill(uid, 'g', 1)} d="${smooth([[-166, 106], [-162, 100], [-152, 98], [-142, 96], [-130, 96], [-120, 98], [-112, 103], [-118, 108], [-140, 109], [-158, 109]])}"/>`
  // tronco e galhos que abrem em leque até a copa
  + `<g ${fill(uid, 'd', 3)}><path d="${limb(130, 272, 125, 174, 16, 11, -5)}"/><path d="${limb(124, 184, 40, 64, 10, 4, 16)}"/><path d="${limb(125, 182, 102, 60, 8.5, 4, -6)}"/><path d="${limb(127, 188, 164, 62, 9, 4, -12)}"/><path d="${limb(78, 116, 62, 62, 4.5, 2.5, 5)}"/><path d="${limb(146, 124, 136, 64, 4, 2.5, -4)}"/></g>`
  + '<path class="m-k3 m-lh" d="M124 262C123 232 122 206 122 184M116 172C96 140 74 108 50 74"/>'
  // a copa: camadas achatadas de nuvem, luz em cima e a sombra densa embaixo
  + `<path class="m-k1 m-fs" d="${smooth([[-66, 62], [-30, 65], [20, 67], [80, 67], [140, 64], [174, 54], [168, 67], [130, 73], [80, 74], [20, 74], [-30, 72], [-62, 68]])}"/>`
  + `<path ${fill(uid, 'g', 1)} d="${smooth([[-70, 62], [-75, 52], [-62, 44], [-42, 42], [-28, 34], [-4, 33], [18, 27], [46, 27], [70, 21], [98, 23], [122, 18], [148, 25], [168, 31], [181, 42], [176, 56], [158, 63], [128, 65], [96, 67], [56, 67], [16, 67], [-22, 66], [-50, 65]])}"/>`
  + `<path ${fill(uid, 'g', 1)} d="${smooth([[34, 33], [40, 22], [60, 16], [82, 10], [106, 10], [128, 13], [148, 21], [152, 31], [130, 35], [92, 36], [58, 37]])}"/>`
  + '<path class="m-k1 m-lh" d="M-66 46C-58 40 -48 40 -40 44M-24 36C-14 30 -2 30 6 34M40 24C48 18 60 16 68 20M86 13C96 9 110 9 118 14M130 18C140 18 150 24 154 30M150 30C160 30 170 36 174 44"/>'
  + '<path class="m-k1 m-ls" d="M-40 58C-20 61 0 61 18 60M60 60C80 61 104 60 122 58M140 56C150 54 160 51 168 46"/>'
  + tuft(uid, 112, 262, 1.1, 1) + tuft(uid, 154, 264, .9, 3, -1) + tuft(uid, 178, 258, .7, 1) + tuft(uid, -122, 262, 1, 1, -1) + tuft(uid, -156, 260, .8, 3) + tuft(uid, -150, 132, .36, 3) + tuft(uid, -128, 133, .3, 1, -1)
  + sparkle(-150, -2, .6) + sparkle(162, 124, .5);

// ── flores: um jardim dos dois lados da borboleta (a abertura do meio fica limpa) ──
const petal = (len, wide) => `M0 0C${-wide} ${n(-len * .28)} ${n(-wide * .82)} ${-len} 0 ${-len}C${n(wide * .82)} ${-len} ${wide} ${n(-len * .28)} 0 0Z`;
const flower = (uid, x, y, s, {petals = 5, len = 30, wide = 17, k = 1, center = 2, turn = 0} = {}) => {
  let out = '';
  for (let i = 0; i < petals; i++) out += `<g transform="rotate(${n(turn + i * 360 / petals)})"><path ${fill(uid, 'g', k)} d="${petal(len, wide)}"/><path class="m-k${k} m-lh" d="M0 -7C-1 ${n(-len * .45)} -1 ${n(-len * .7)} 0 ${n(-len * .86)}"/></g>`;
  const c = len * .3;
  out += `<circle ${fill(uid, 'r', center)} r="${n(c)}"/>`;
  for (let i = 0; i < 7; i++) { const a = (i * 51 + 20) * Math.PI / 180; out += `<circle class="m-k${center} m-fs" cx="${n(Math.cos(a) * c * .56)}" cy="${n(Math.sin(a) * c * .56)}" r="${n(c * .11)}"/>`; }
  out += `<circle class="m-white" cx="${n(-c * .32)}" cy="${n(-c * .36)}" r="${n(c * .22)}" opacity=".8"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">${out}</g>`;
};
const leaf = (uid, x, y, s, angle) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${s})"><path ${fill(uid, 'g', 4)} d="M0 0C10 -15 34 -19 54 -10C38 1 16 6 0 0Z"/><path class="m-k4 m-lh" d="M5 -2C20 -8 36 -11 50 -10"/></g>`;
const bud = (uid, x, y, s, k, angle = 0) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${s})"><path ${fill(uid, 'g', k)} d="M0 0C-11 -8 -12 -28 0 -38C12 -28 11 -8 0 0Z"/><path ${fill(uid, 'g', 4)} d="M-9 -4C-6 6 6 6 9 -4C4 0 -4 0 -9 -4Z"/></g>`;
// À esquerda o jardim fica no alto (embaixo, nas telas médias, ficam os botões): as hastes de lá se dissolvem antes deles.
const flowers = uid => halo(uid, -118, 66, 70, 84) + halo(uid, 120, 84, 70, 112)
  + `<defs><linearGradient id="scn-${uid}-stem" class="m-k4" gradientUnits="userSpaceOnUse" x1="0" y1="70" x2="0" y2="132"><stop offset="0" class="m-gs"/><stop offset="1" class="m-gs" stop-opacity="0"/></linearGradient></defs>`
  // hastes (no verde-menta, do lado da sombra) e folhas
  + `<path class="m-line m-stem" stroke="url(#scn-${uid}-stem)" d="M-112 44C-116 80 -120 106 -124 132M-148 104C-146 114 -146 122 -148 132M-74 92C-78 106 -80 118 -84 132"/>`
  + '<path class="m-k4 m-ls m-stem" d="M120 30C126 100 132 170 128 262M150 128C154 180 152 220 158 262M122 206C120 226 118 244 116 262"/>'
  + leaf(uid, -117, 96, .86, 200) + leaf(uid, -121, 112, .7, -26) + leaf(uid, 127, 104, .85, -18) + leaf(uid, 131, 176, .9, 196) + leaf(uid, 155, 214, .6, -40) + leaf(uid, 119, 236, .5, 200)
  + flower(uid, -112, 40, 1, {k: 1, len: 32, wide: 18, turn: -8})
  + flower(uid, 120, 26, .92, {petals: 10, len: 30, wide: 9, k: 3, turn: 6})
  + flower(uid, 150, 124, .62, {k: 1, len: 30, wide: 18, turn: 20})
  + flower(uid, -148, 100, .5, {petals: 8, len: 30, wide: 11, k: 3, turn: 12})
  + flower(uid, 122, 204, .44, {petals: 8, len: 30, wide: 11, k: 3, turn: -8})
  + bud(uid, -74, 92, .7, 3, -18) + bud(uid, 82, 82, .62, 1, 24)
  // as flores nascem de nuvens (a base das hastes some nelas)
  + cloud(uid, -116, 136, 1, 4) + cloud(uid, 138, 266, .9, 4)
  + sparkle(-62, 14, .6) + sparkle(160, -8, .7) + sparkle(-160, 62, .5) + sparkle(84, 152, .45) + sparkle(166, 186, .4);

// ── pata de T-rex: a mão de pele escamada saindo do canto à direita, três dedos curtos e fortes em leque e garras curvas ──
// um dedo (base em y=0, ponta em y=-len, levemente curvo para a esquerda): grosso, com duas juntas salientes e placas de
// escama atravessadas (como nos dedos das aves) e, na ponta, a garra — grossa na base, curva para a esquerda (para a peça), lustrosa
const finger = (uid, len, w) => {
  const bend = t => -len * .1 * t * t, at = [[0, 1.05], [.14, .94], [.3, 1.04], [.46, .84], [.62, .9], [.78, .7], [.92, .56]];
  const right = at.map(([t, k]) => [bend(t) + w * k, -len * t]), left = at.map(([t, k]) => [bend(t) - w * k, -len * t]).reverse();
  const tipX = bend(1);
  let out = `<path ${fill(uid, 'g', 1)} d="${smooth([...right, [tipX + w * .48, -len - 2], [tipX - w * .48, -len - 2], ...left])}"/>`;
  // placas de escama: arcos de lado a lado, cada vez mais juntos para a ponta
  for (let y = -8, i = 0; y > -len * .88; i++, y -= 8.5 - i * .25) {
    const t = -y / len, half = at.reduce((a, [tt, kk]) => tt <= t ? kk : a, 1) * w * .78, x0 = bend(t);
    out += `<path class="m-k2 m-ls m-scale" d="M${n(x0 - half)} ${n(y + 1.5)}C${n(x0 - half * .5)} ${n(y - 3.4)} ${n(x0 + half * .5)} ${n(y - 3.4)} ${n(x0 + half)} ${n(y + 1.5)}"/>`;
  }
  // as juntas: dobras fundas da pele
  for (const t of [.3, .62]) { const x0 = bend(t), y = -len * t; out += `<path class="m-k1 m-ls m-crease" d="M${n(x0 - w * .95)} ${n(y + 3)}C${n(x0 - w * .4)} ${n(y + 7)} ${n(x0 + w * .4)} ${n(y + 7)} ${n(x0 + w * .95)} ${n(y + 3)}"/>`; }
  out += `<path class="m-k1 m-lh m-gloss" d="M${n(-w * .55)} -6C${n(-w * .66)} ${n(-len * .3)} ${n(bend(.6) - w * .62)} ${n(-len * .6)} ${n(bend(.84) - w * .38)} ${n(-len * .84)}" opacity=".8"/>`;
  // a garra: grossa na base, curva e afiada, no tom mais escuro do desenho, com dois riscos de brilho
  const g = w * .9, x = tipX, y = -len + 3, h = 1;
  out += `<path class="m-k2 m-fs" d="M${n(x + g)} ${y}C${n(x + g * 1.45)} ${n(y - 20 * h)} ${n(x + g * 1.05)} ${n(y - 40 * h)} ${n(x - g * .3)} ${n(y - 51 * h)}C${n(x - g * .9)} ${n(y - 55 * h)} ${n(x - g * 1.7)} ${n(y - 56 * h)} ${n(x - g * 2.3)} ${n(y - 53 * h)}C${n(x - g * 1.5)} ${n(y - 47 * h)} ${n(x - g * .95)} ${n(y - 39 * h)} ${n(x - g * .72)} ${n(y - 28 * h)}C${n(x - g * .55)} ${n(y - 18 * h)} ${n(x - g * .8)} ${n(y - 8 * h)} ${n(x - g)} ${y}Z"/>`;
  out += `<path class="m-white m-lh m-gloss" d="M${n(x + g * .55)} ${n(y - 8 * h)}C${n(x + g * .8)} ${n(y - 24 * h)} ${n(x + g * .4)} ${n(y - 40 * h)} ${n(x - g * .7)} ${n(y - 49 * h)}"/><path class="m-white m-lh" d="M${n(x - g * .25)} ${n(y - 30 * h)}C${n(x - g * .4)} ${n(y - 38 * h)} ${n(x - g * .9)} ${n(y - 45 * h)} ${n(x - g * 1.5)} ${n(y - 49 * h)}" opacity=".55"/>`;
  out += `<path class="m-k1 m-ls" d="M${n(x - g * .95)} ${n(y - 1)}C${n(x - g * .3)} ${n(y + 2)} ${n(x + g * .4)} ${n(y + 2)} ${n(x + g)} ${n(y - 1)}"/>`;
  return out;
};
// uma folha de samambaia pré-histórica: a haste curva e os folíolos alternados, do tamanho que diminui até a ponta
const frond = (uid, x, y, s, angle, k) => {
  let out = `<path class="m-k${k} m-ls m-stem" d="M0 0C-2 -30 -8 -62 -22 -92"/>`;
  for (let i = 0; i < 8; i++) {
    const t = i / 8, py = -10 - t * 76, px = -t * t * 20, size = 22 * (1 - t * .7);
    out += `<path ${fill(uid, 'g', k)} d="M${n(px)} ${n(py)}C${n(px - size * .5)} ${n(py - 2)} ${n(px - size)} ${n(py - size * .3)} ${n(px - size * 1.05)} ${n(py - size * .62)}C${n(px - size * .55)} ${n(py - size * .6)} ${n(px - 3)} ${n(py - size * .3)} ${n(px)} ${n(py)}Z"/>`;
    out += `<path ${fill(uid, 'g', k)} d="M${n(px + 1)} ${n(py - 3)}C${n(px + size * .5)} ${n(py - 4)} ${n(px + size)} ${n(py - size * .4)} ${n(px + size * .95)} ${n(py - size * .72)}C${n(px + size * .45)} ${n(py - size * .66)} ${n(px + 3)} ${n(py - size * .34)} ${n(px + 1)} ${n(py - 3)}Z"/>`;
  }
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${s})">${out}</g>`;
};
// escamas redondas, miúdas, em fileiras desencontradas dentro de uma área (a mão e o braço)
const scales = (x0, y0, cols, rows, step, r) => {
  let d = '';
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = x0 + i * step + (j % 2 ? step / 2 : 0), y = y0 + j * step * .82; d += `M${n(x - r)} ${n(y)}C${n(x - r * .6)} ${n(y - r * 1.1)} ${n(x + r * .6)} ${n(y - r * 1.1)} ${n(x + r)} ${n(y)}`; }
  return `<path class="m-k2 m-ls m-scale" d="${d}"/>`;
};
const claw = uid => halo(uid, 110, 128, 84, 150)
  // o braço vindo de fora, embaixo à direita, e a mão (ao lado da pilastra); os três dedos em leque, as garras para a peça
  + `<g transform="translate(-18 6)"><path ${fill(uid, 'g', 1)} d="${smooth([[150, 300], [146, 262], [124, 224], [110, 196], [116, 170], [140, 158], [166, 164], [184, 188], [196, 232], [210, 300]])}"/>`
  + scales(126, 186, 4, 6, 13, 4.6)
  + `<g transform="translate(124 172) rotate(-30)">${finger(uid, 80, 12)}</g>`
  + `<g transform="translate(172 176) rotate(8)">${finger(uid, 82, 12)}</g>`
  + `<g transform="translate(148 164) rotate(-12)">${finger(uid, 100, 13.5)}</g>`
  + '<path class="m-k3 m-lh" d="M114 192C118 172 134 162 152 160M190 196C196 214 200 236 204 262"/></g>'
  // do outro lado, samambaias pré-históricas no verde-musgo da peça
  + halo(uid, -116, 76, 60, 72) + frond(uid, -98, 128, 1.05, -14, 2) + frond(uid, -134, 130, .82, -38, 2) + frond(uid, -74, 130, .6, 12, 2)
  // e as nuvens dele: na base das samambaias e uma no alto
  + cloud(uid, -104, 138, .95, 3) + cloud(uid, -150, 8, .55, 3)
  + sparkle(62, 22, .7) + sparkle(176, 0, .55) + sparkle(-160, 70, .6);

const MOTIFS = {bananas, rainbow, acacia, flowers, claw};

// O fundo de uma camada: `look` = {side, motif} (SHOWCASE › scenery); `uid` torna únicos os ids dos degradês da camada.
export function scenery({side = 'petals', motif = null} = {}, uid = 0) {
  if (side === 'clouds' && !motif) return `<div class="clouds" aria-hidden="true">${[1, 2, 3, 4, 5, 6].map(i => `<i class="cloud c${i}"></i>`).join('')}</div>`;
  const draw = MOTIFS[motif];
  const back = draw ? `<div class="scenery-back"><svg class="scenery-motif" viewBox="${VIEW}" focusable="false">${defs(uid)}${draw(uid)}</svg></div>` : '';
  return `<div class="hero-scenery scenery-${side}" data-motif="${draw ? motif : ''}" aria-hidden="true">${mists(side, uid)}${back}</div>`;
}
export const MOTIF_NAMES = Object.freeze(Object.keys(MOTIFS));
