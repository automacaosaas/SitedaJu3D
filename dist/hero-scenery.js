// Fundo da vitrine em silhuetas brancas de nuvem (08/10/2026, pedido do dono: "sombreamento com referências de luz, usando as nuvens
// BRANCAS… só silhuetas de características que lembram [cada peça], limpas e otimizadas, integradas com a dinâmica da página").
// SVG em linha, sem filtros e sem scripts. Cada camada de fundo recebe UM elemento raiz (a demonstração esmaece e recua esse elemento):
//  · as silhuetas dos cantos (`side`: capim, palmeira, nuvens, margaridas, samambaias…), presas embaixo, nas bordas da vitrine;
//  · em volta da peça, o desenho dela (`motif`, de SHOWCASE em products.js — aqui não há nome de produto), dentro de .scenery-back;
//  · e as nuvenzinhas que flutuam e as estrelinhas que cintilam, cada uma num <svg> pequeno e próprio: o CSS só as desliza ou
//    acende (transform e opacity), nada é redesenhado. O que se mexe é sempre um <span> em volta do <svg> (também nas silhuetas dos
//    cantos): no Chrome, uma animação no próprio <svg> não vai para o compositor e recalculava o estilo a cada quadro, sem parar.
// Cores: branco translúcido. Só o lado da sombra, bem de leve, no tom claro da peça (--scn-tN, nunca mais escuro que o meio do
// degradê: hero-motion.js › sceneryVars), então o desenho só clareia o fundo e nunca tira contraste de um texto. As bordas se
// dissolvem por degradês e pela máscara do CSS (carousel.css › .scenery-back).
//
// Quadro do desenho (viewBox): 1 unidade = 1/200 da largura da pilastra; a origem é o alto do palco, no centro da peça.
// A peça ocupa y 0–172 (lâmpadas: corpo ±31, orelhas ±47; borboleta: asas ±65; dinossauro: cabeça ±43); a pilastra, x ±100 a partir
// de y 152. No computador o texto fica à esquerda de x −205 (dos 901 aos 1100 px os botões chegam a x −143, de y 140 a 176) e o
// header acima de y −30. No celular e no tablet estreito (até 760 px) o preço fica logo acima de y 0 e as setas em x ±114…170,
// y 100…154: para essas telas os grupos (.scn-l, .scn-r…) de cada desenho mudam de lugar no CSS; as nuvenzinhas e estrelinhas têm
// posição própria (--cx/--cy) em toda tela com o texto acima do palco (até 900 px), longe do preço.
const VIEW = '-180 -60 360 340';
const n = value => +value.toFixed(1);
const rad = deg => deg * Math.PI / 180;

// ── formas ──
// contorno de bolhas: de um ponto ao seguinte, cada corda vira um semicírculo para fora (no sentido horário); a base volta reta
const scallop = pts => pts.slice(1).reduce((d, [x, y], i) => { const r = n(Math.hypot(x - pts[i][0], y - pts[i][1]) / 2); return `${d}A${r} ${r} 0 0 1 ${n(x)} ${n(y)}`; }, `M${n(pts[0][0])} ${n(pts[0][1])}`) + 'Z';
// cúmulo: as bolhas pelo alto de uma meia-elipse (x, y = o meio da base; largura w, altura h), nos ângulos dados (180° → 360°)
const PUFF = [180, 206, 242, 286, 324, 352, 360];
const cumulus = (x, y, w, h, angles = PUFF) => scallop(angles.map(a => [x + Math.cos(rad(a)) * w / 2, y + Math.sin(rad(a)) * h]));
// círculo como trecho de caminho, no sentido horário (vários num caminho só se somam, sem sobreposição mais clara)
const dot = (x, y, r) => `M${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 1 1 ${n(x + r)} ${n(y)}A${n(r)} ${n(r)} 0 1 1 ${n(x - r)} ${n(y)}Z`;
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
// um galho afinando de (x1, y1) a (x2, y2), larguras w1 → w2, com uma curva (bend, para o lado); anti-horário (cw: horário)
const limb = (x1, y1, x2, y2, w1, w2, bend = 0, cw = false) => {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), cx = (x1 + x2) / 2 - dy / len * bend, cy = (y1 + y2) / 2 + dx / len * bend, left = [], right = [];
  for (const t of [0, .25, .5, .75, 1]) {
    const u = 1 - t, x = u * u * x1 + 2 * u * t * cx + t * t * x2, y = u * u * y1 + 2 * u * t * cy + t * t * y2;
    const tx = 2 * u * (cx - x1) + 2 * t * (x2 - cx), ty = 2 * u * (cy - y1) + 2 * t * (y2 - cy), tl = Math.hypot(tx, ty), w = (w1 + (w2 - w1) * t) / 2;
    left.push([x - ty / tl * w, y + tx / tl * w]); right.push([x + ty / tl * w, y - tx / tl * w]);
  }
  return smooth(cw ? [...right, ...left.reverse()] : [...left, ...right.reverse()]);
};
// folha estreita (lente) da base ao ponto (ex, ey), meia largura w, curvada para baixo (droop)
const blade = (x, y, ex, ey, w, droop = 0) => {
  const dx = ex - x, dy = ey - y, len = Math.hypot(dx, dy), nx = -dy / len * w, ny = dx / len * w, mx = (x + ex) / 2, my = (y + ey) / 2 + droop;
  return `M${n(x)} ${n(y)}Q${n(mx + nx)} ${n(my + ny)} ${n(ex)} ${n(ey)}Q${n(mx - nx)} ${n(my - ny)} ${n(x)} ${n(y)}Z`;
};
// ponto numa curva quadrática A → C → B e o ângulo dela ali
const along = ([ax, ay], [cx, cy], [bx, by], t) => {
  const u = 1 - t;
  return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by, Math.atan2(2 * u * (cy - ay) + 2 * t * (by - cy), 2 * u * (cx - ax) + 2 * t * (bx - cx))];
};
// folíolos de uma folha de palmeira pendendo da nervura (A → C → B): longos e estreitos, do maior ao menor, para o lado `side`
const leaflets = (A, C, B, {count = 11, len = 70, w = 7, side = 1, spread = 52, from = .08} = {}) => {
  let d = '';
  for (let i = 0; i < count; i++) {
    const t = from + (1 - from) * i / count, [x, y, a] = along(A, C, B, t), l = len * (1 - t * .6), dir = a + side * rad(spread + t * 24);
    d += blade(x, y, x + Math.cos(dir) * l, y + Math.sin(dir) * l, w * (1 - t * .45), l * .16);
  }
  return d;
};
// samambaia: a haste curva e os folíolos alternados, que diminuem até a ponta (base na origem, apontando para cima); tudo no sentido
// horário, para os folíolos se somarem à haste sem abrir buracos
const fernPath = (len = 92, size = 22, count = 8) => {
  let d = limb(0, 4, -len * .24, -len, 3.4, 1.2, 5, true);
  for (let i = 0; i < count; i++) {
    const t = i / count, py = -10 - t * (len - 16), px = -t * t * len * .22, s = size * (1 - t * .7);
    d += `M${n(px)} ${n(py)}C${n(px - s * .5)} ${n(py - 2)} ${n(px - s)} ${n(py - s * .3)} ${n(px - s * 1.05)} ${n(py - s * .62)}C${n(px - s * .55)} ${n(py - s * .6)} ${n(px - 3)} ${n(py - s * .3)} ${n(px)} ${n(py)}Z`;
    d += `M${n(px + 1)} ${n(py - 3)}C${n(px + 3)} ${n(py - s * .34)} ${n(px + s * .45)} ${n(py - s * .66)} ${n(px + s * .95)} ${n(py - s * .72)}C${n(px + s)} ${n(py - s * .4)} ${n(px + s * .5)} ${n(py - 4)} ${n(px + 1)} ${n(py - 3)}Z`;
  }
  return d;
};
// margarida: pétalas soltas em volta do miolo (sem encostar nele nem umas nas outras, então o miolo aparece pelo vão)
const petals = (x, y, r, count, turn = 0, wide = .34) => {
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = rad(turn + i * 360 / count), c = Math.cos(a), s = Math.sin(a), r0 = r * .34, w = r * wide * Math.PI / count * 2.1;
    d += blade(x + c * r0, y + s * r0, x + c * r, y + s * r, w);
  }
  return d;
};
// estrelinha de brilho (quatro pontas), branca
const sparkle = (x, y, s, o = .9) => `<path fill="#fff" opacity="${o}" d="M${x} ${n(y - 9 * s)}C${n(x + s)} ${n(y - 2 * s)} ${n(x + 2 * s)} ${n(y - s)} ${n(x + 9 * s)} ${y}C${n(x + 2 * s)} ${n(y + s)} ${n(x + s)} ${n(y + 2 * s)} ${x} ${n(y + 9 * s)}C${n(x - s)} ${n(y + 2 * s)} ${n(x - 2 * s)} ${n(y + s)} ${n(x - 9 * s)} ${y}C${n(x - 2 * s)} ${n(y - s)} ${n(x - s)} ${n(y - 2 * s)} ${x} ${n(y - 9 * s)}Z"/>`;

// ── cores: degradês da camada (ids únicos por camada: `uid`) ──
// c = nuvem (branca no alto; a base se dissolve com um toque do tom da peça) · f = haste, tronco e capim (branco que some para
// baixo) · s = folha, pétala, pegada (luz no alto à esquerda, a sombra no tom da peça) · g = halo, uma luz macia
const defs = uid => '<defs>'
  + `<linearGradient id="scn-${uid}-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".94"/><stop offset=".55" stop-color="#fff" stop-opacity=".8"/><stop offset=".84" class="m-t1" stop-opacity=".5"/><stop offset="1" class="m-t1" stop-opacity="0"/></linearGradient>`
  + `<linearGradient id="scn-${uid}-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".86"/><stop offset=".62" stop-color="#fff" stop-opacity=".46"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
  + `<radialGradient id="scn-${uid}-s" cx=".34" cy=".28" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".58" stop-color="#fff" stop-opacity=".74"/><stop offset="1" class="m-t1" stop-opacity=".5"/></radialGradient>`
  + `<radialGradient id="scn-${uid}-g"><stop offset="0" stop-color="#fff" stop-opacity=".72"/><stop offset=".5" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
  + '</defs>';
const F = (uid, kind) => `fill="url(#scn-${uid}-${kind})"`;
const glow = (uid, x, y, rx, ry = rx) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${F(uid, 'g')}/>`;
// nuvenzinha que flutua: um <svg> pequeno e próprio, no quadro do desenho (x, y = o meio da base; w × h; c = [x, y] no celular), que
// o CSS desliza devagar (--d: a duração da ida; --dl: o atraso, para cada uma andar no seu tempo)
const drift = (uid, x, y, w, h, {c, d = 18, dl = 0, o = 1, angles} = {}) => {
  const box = ([bx, by]) => [n(bx - w * .6), n(by - h - w * .24)], [vx, vy] = box([x, y]), vw = n(w * 1.2), vh = n(h + w * .24 + 1);
  const compact = c ? `;--cx:${box(c)[0]};--cy:${box(c)[1]}` : '';
  return `<span class="scenery-drift" style="--x:${vx};--y:${vy};--w:${vw};--h:${vh}${compact};--d:${d}s;--dl:${-dl}s${o < 1 ? `;opacity:${o}` : ''}"><svg viewBox="${vx} ${vy} ${vw} ${vh}" focusable="false"><path ${F(uid, 'c')} d="${cumulus(x, y, w, h, angles)}"/></svg></span>`;
};

// brilho que cintila: a estrelinha num <svg> próprio (o CSS só muda opacity e scale, devagar); c = [x, y] no celular
const spark = (x, y, s, {c, d = 5, dl = 0} = {}) => {
  const r = n(9 * s + 1), at = ([px, py]) => [n(px - r), n(py - r)], [vx, vy] = at([x, y]), compact = c ? `;--cx:${at(c)[0]};--cy:${at(c)[1]}` : '';
  return `<span class="scenery-spark" style="--x:${vx};--y:${vy};--w:${n(2 * r)};--h:${n(2 * r)}${compact};--d:${d}s;--dl:${-dl}s"><svg viewBox="${vx} ${vy} ${n(2 * r)} ${n(2 * r)}" focusable="false">${sparkle(x, y, s, 1)}</svg></span>`;
};

// ── silhuetas dos cantos (quadro 360 × 440, presas embaixo; a da direita é espelhada no CSS) ──
// capim da savana: folhas finas e curvas saindo do chão (o dono gostou: "o capim alto naquela seção")
const grass = () => `<path d="${[[34, 250, -34], [66, 330, -14], [98, 280, 12], [128, 370, -6], [160, 300, 24], [190, 236, 38], [216, 318, 10], [246, 256, 44], [274, 196, 34], [300, 160, 52], [112, 196, -44]]
  .map(([x, h, lean]) => `M${x - 10} 440C${x - 6} ${440 - h * .45} ${x + lean * .4} ${440 - h * .8} ${x + lean} ${440 - h}C${x + lean * .5 + 5} ${440 - h * .74} ${x + 9} ${440 - h * .44} ${x + 11} 440Z`).join('')}"/>`;
// samambaias pré-históricas
const ferns = () => `<g transform="translate(116 452) rotate(14) scale(3.1)"><path d="${fernPath()}"/></g><g transform="translate(236 456) rotate(32) scale(2)"><path d="${fernPath()}" opacity=".7"/></g>`;
// folhas de palmeira da selva: duas, arqueando do chão para dentro da vitrine
const palms = () => `<path d="${leaflets([10, 460], [40, 150], [300, 96], {count: 12, len: 150, w: 13, spread: 50})}"/><path d="M10 460Q40 150 300 96" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>`
  + `<path d="${leaflets([150, 470], [210, 290], [350, 250], {count: 9, len: 96, w: 10, spread: 48})}" opacity=".62"/>`;
// nuvens fofas, baixas
const puffs = () => `<path d="${cumulus(150, 452, 330, 130, [180, 198, 222, 252, 282, 310, 336, 354, 360])}"/><path d="${cumulus(276, 330, 128, 34)}" opacity=".5"/>`;
// cúmulos altos, em camadas
const towers = () => `<path d="${cumulus(120, 452, 290, 190, [180, 200, 226, 258, 290, 318, 342, 360])}"/><path d="${cumulus(292, 456, 200, 120)}" opacity=".62"/><path d="${cumulus(88, 214, 104, 30)}" opacity=".5"/>`;
// margaridas de pétalas brancas e as hastes
const daisies = () => `<path d="M118 440C122 380 120 330 116 276M246 440C250 400 254 372 252 346M52 440C54 380 60 330 66 300" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".7"/>`
  + `<path d="${petals(116, 226, 74, 11, 8)}${petals(252, 312, 46, 10, -6)}${petals(66, 270, 36, 9, 20)}"/><path d="${dot(116, 226, 19)}${dot(252, 312, 12)}${dot(66, 270, 9)}" opacity=".66"/>`;
// pétalas (o padrão de quem não tem fundo próprio)
const blossom = () => '<path d="M-75 380C-110 308-40 235 33 257C-49 180 11 82 91 136C55 32 155 9 185 100C212 22 301 74 259 154C351 133 370 230 290 267C380 299 337 395 263 371Z"/>';
const SIDES = {petals: blossom, grass, ferns, palms, puffs, towers, daisies};

const mists = (side, uid) => `<div class="scenery-mist">${['left', 'right'].map(at => {
  const id = `scn-${uid}-mist-${at}`;
  return `<span class="scenery-${at}"><svg viewBox="0 0 360 440" focusable="false"><defs><radialGradient id="${id}" cx="32%" cy="25%" r="87%"><stop stop-color="#fff" stop-opacity=".9"/><stop offset=".4" stop-color="#fff" stop-opacity=".61"/><stop offset=".72" stop-color="#fff" stop-opacity=".24"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><g fill="url(#${id})">${(SIDES[side] || SIDES.petals)()}</g></svg></span>`;
}).join('')}</div>`;

// ── desenhos em volta da peça: [o desenho, as nuvenzinhas] ──
// Savana: o sol, a acácia de copa achatada à direita (a copa em camadas de nuvem), uma acácia pequena ao longe e o capim no pé da pilastra.
const tuft = (x, y, s, flip = 1) => [[-12, 34, -16], [-5, 48, -6], [2, 40, 8], [8, 52, 14], [15, 30, 22]]
  .map(([bx, h, lean]) => `M${n(x + flip * s * (bx - 3))} ${y}C${n(x + flip * s * (bx - 2))} ${n(y - s * h * .5)} ${n(x + flip * s * (bx + lean * .4))} ${n(y - s * h * .82)} ${n(x + flip * s * (bx + lean))} ${n(y - s * h)}C${n(x + flip * s * (bx + lean * .5 + 1.5))} ${n(y - s * h * .7)} ${n(x + flip * s * (bx + 2.5))} ${n(y - s * h * .42)} ${n(x + flip * s * (bx + 4))} ${y}Z`).join('');
const acacia = uid => [glow(uid, -110, 28, 62) + '<circle cx="-110" cy="28" r="17" fill="#fff" opacity=".78"/>'
  + `<g class="scn-l"><path ${F(uid, 'f')} d="${limb(-139, 134, -141, 103, 3.4, 2, 1)}${limb(-141, 108, -154, 101, 2, 1.2, -2)}${limb(-140, 110, -128, 101, 2, 1.2, 2)}"/><path ${F(uid, 'c')} d="${cumulus(-140, 104, 62, 8, [180, 212, 252, 296, 334, 360])}"/></g>`
  + `<g class="scn-r"><defs><linearGradient id="scn-${uid}-trunk" gradientUnits="userSpaceOnUse" x1="0" y1="56" x2="0" y2="276"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset=".55" stop-color="#fff" stop-opacity=".48"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`
  + `<path fill="url(#scn-${uid}-trunk)" d="${limb(130, 276, 125, 176, 15, 10, -5)}${limb(124, 186, 38, 62, 9, 4, 16)}${limb(125, 184, 100, 58, 8, 4, -6)}${limb(127, 190, 166, 60, 8.5, 4, -12)}${limb(78, 118, 62, 62, 4.5, 2.5, 5)}${limb(146, 126, 138, 62, 4, 2.5, -4)}"/>`
  + `<path ${F(uid, 'c')} d="${cumulus(54, 70, 256, 36, [180, 192, 207, 224, 244, 266, 290, 312, 332, 348, 360])}"/>`
  + `<path ${F(uid, 'c')} d="${cumulus(100, 46, 140, 22, [180, 204, 236, 274, 312, 344, 360])}" opacity=".9"/></g>`
  + `<path ${F(uid, 'f')} d="${tuft(112, 264, 1.1)}${tuft(152, 266, .9, -1)}${tuft(176, 260, .7)}${tuft(-122, 264, 1, -1)}${tuft(-156, 262, .8)}"/>`
,
  drift(uid, 142, -6, 52, 12, {c: [128, 0], d: 21, dl: 4}) + drift(uid, -66, 52, 64, 14, {c: [-90, 50], d: 26, dl: 11, o: .9})
  + spark(-152, -4, .6, {d: 5.5}) + spark(166, 84, .5, {d: 7, dl: 2.5})];

// Selva (as folhas de palmeira estão nos cantos): o cacho de bananas deitado numa nuvem, à direita, e uma banana noutra, à esquerda.
// banana deitada para a direita a partir do cabinho (na origem), a ponta curvando para cima (~88 unidades): o corpo, o risco de sombra
// embaixo e, no tom da peça, o cabinho e a pontinha
const BANANA = 'M2 -6C28 0 58 -2 80 -24L86 -31L88 -26C76 -2 46 18 6 10C0 9 -1 -3 2 -6Z';
const banana = (uid, y, a) => `<g transform="translate(0 ${y}) rotate(${a})"><path ${F(uid, 's')} d="${BANANA}"/><path class="m-shade" d="M9 10C44 13 70 0 85 -24"/><path class="m-nub" d="M80 -24L86 -31L88 -26L84 -21Z"/></g>`;
// o cacho: bananas abertas em leque a partir do mesmo cabinho, como uma mão de bananas (paralelas, liam-se como penas de uma asa)
const bunch = (uid, x, y, s, count = 3, flip = 1) => { const t = (count - 1) * 9 + 10; return `<g transform="translate(${x} ${y}) scale(${flip * s} ${s})">${Array.from({length: count}, (_, i) => banana(uid, -i * 9, 6 - i * 14)).reverse().join('')}<path ${F(uid, 's')} d="M-5 6C-8 -4 -7 -${t - 4} -2 -${t}L3 -${t - 2}C5 -${t - 8} 5 -4 3 6Z"/><path class="m-nub" d="M-3 -${t + 1}L-4 -${t + 7}L1 -${t + 7}L3 -${t - 1}Z"/></g>`; };
const bananas = uid => [glow(uid, 108, 84, 80, 70)
  + `<g class="scn-r"><path ${F(uid, 'c')} d="${cumulus(100, 128, 124, 28)}"/>${bunch(uid, 60, 104, .9)}</g>`
  + `<g class="scn-l"><path ${F(uid, 'c')} d="${cumulus(-112, 72, 84, 18)}"/>${bunch(uid, -80, 60, .52, 2, -1)}</g>`
  + sparkle(-146, 30, .45, .7),
  drift(uid, -128, 14, 52, 12, {c: [-104, 12], d: 22, dl: 6}) + drift(uid, 132, -10, 44, 10, {c: [70, 4], d: 19, dl: 13, o: .85})
  + spark(140, 46, .7, {c: [146, 12], d: 6}) + spark(-66, 6, .55, {d: 5, dl: 2})];

// Arco-íris: faixas de nuvem brancas com o tom de cada cor da peça bem de leve, nuvens fofas nos pés e brilhos.
const RAINBOW = {cy: 150, r: [150, 139, 128, 117, 106], order: [4, 1, 2, 3]};   // de fora para dentro: rosa, roxo, lavanda, dourado
const rainbow = uid => {
  const {cy, r, order} = RAINBOW, R = r[0];
  // um degradê radial no centro do arco pinta as quatro faixas: branco nas emendas, o tom claro da cor no meio de cada uma
  const stops = order.map((k, i) => {
    const outer = r[i] / R, inner = r[i + 1] / R, mid = (outer + inner) / 2;
    return `<stop offset="${n(inner * 1000) / 1000}" stop-color="#fff" stop-opacity=".62"/><stop offset="${n(mid * 1000) / 1000}" class="m-t${k}" stop-opacity=".62"/><stop offset="${n((outer - .006) * 1000) / 1000}" stop-color="#fff" stop-opacity=".84"/>`;
  }).join('');
  return [glow(uid, 0, 120, 178, 150)
    + `<defs><radialGradient id="scn-${uid}-bands" gradientUnits="userSpaceOnUse" cx="0" cy="${cy}" r="${R}">${stops}<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`
    + `<path fill="url(#scn-${uid}-bands)" d="M${-R} ${cy}A${R} ${R} 0 0 1 ${R} ${cy}L${r[4]} ${cy}A${r[4]} ${r[4]} 0 0 0 ${-r[4]} ${cy}Z"/>`
    + `<g class="scn-l"><path ${F(uid, 'c')} d="${cumulus(-128, 160, 96, 24)}"/><path ${F(uid, 'c')} d="${cumulus(-90, 168, 56, 13)}" opacity=".9"/></g>`
    + `<g class="scn-r"><path ${F(uid, 'c')} d="${cumulus(130, 156, 90, 22)}"/><path ${F(uid, 'c')} d="${cumulus(166, 168, 44, 10)}" opacity=".85"/></g>`
    + sparkle(-96, 4, .6) + sparkle(166, 108, .6, .8) + sparkle(-164, 106, .55, .8) + sparkle(76, 100, .45, .7),
    drift(uid, -142, -6, 48, 11, {c: [-100, 2], d: 20, dl: 3}) + drift(uid, 150, -2, 40, 9, {c: [104, 4], d: 24, dl: 12, o: .9})
    + spark(-150, 40, 1, {d: 6}) + spark(152, 50, .8, {d: 5, dl: 2.5})];
};

// Jardim: margaridas de pétalas brancas dos dois lados da borboleta, as hastes nascendo de nuvens.
const daisy = (uid, x, y, r, count, turn = 0, wide) => `<path ${F(uid, 's')} d="${petals(x, y, r, count, turn, wide)}"/><circle cx="${x}" cy="${y}" r="${n(r * .26)}" fill="url(#scn-${uid}-eye)"/>`;
const flowers = uid => [glow(uid, -118, 66, 70, 84) + glow(uid, 122, 84, 70, 112)
  + `<defs><radialGradient id="scn-${uid}-eye" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" class="m-t2" stop-opacity=".9"/></radialGradient>`
  + `<linearGradient id="scn-${uid}-stem" gradientUnits="userSpaceOnUse" x1="0" y1="30" x2="0" y2="270"><stop offset="0" stop-color="#fff" stop-opacity=".82"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient></defs>`
  + `<g class="scn-l"><path d="M-112 52C-116 84 -120 110 -122 140M-148 108C-147 118 -147 128 -149 140M-76 98C-79 112 -81 126 -84 140" fill="none" stroke="url(#scn-${uid}-stem)" stroke-width="2.6" stroke-linecap="round"/>`
  + `<path ${F(uid, 's')} d="${blade(-118, 116, -146, 92, 7, -4)}${blade(-120, 124, -94, 104, 6, -3)}"/>`
  + daisy(uid, -112, 40, 32, 10, -8) + daisy(uid, -148, 100, 16, 9, 12) + `<path ${F(uid, 's')} d="M-76 98C-87 90 -88 70 -76 60C-64 70 -65 90 -76 98Z"/>`
  + `<path ${F(uid, 'c')} d="${cumulus(-116, 148, 92, 22)}"/></g>`
  // à direita, três margaridas numa haste alta: a do meio e a haste comprida (.scn-rm) saem no celular, onde ficam as setas
  + `<g class="scn-rm"><path d="M120 40C126 104 132 172 128 266M150 138C154 186 152 224 158 266" fill="none" stroke="url(#scn-${uid}-stem)" stroke-width="2.6" stroke-linecap="round"/>`
  + `<path ${F(uid, 's')} d="${blade(131, 180, 100, 160, 8, -4)}${blade(153, 216, 176, 196, 6, -3)}"/>${daisy(uid, 150, 126, 19, 10, 20)}</g>`
  + `<g class="scn-r"><path d="M120 40C121 56 122 70 123 86" fill="none" stroke="url(#scn-${uid}-stem)" stroke-width="2.6" stroke-linecap="round"/><path ${F(uid, 's')} d="${blade(122, 74, 152, 58, 7, -4)}"/>${daisy(uid, 120, 28, 30, 13, 6, .26)}</g>`
  + `<g class="scn-rb"><path d="M122 214C120 232 118 248 116 266" fill="none" stroke="url(#scn-${uid}-stem)" stroke-width="2.6" stroke-linecap="round"/>${daisy(uid, 122, 206, 14, 9, -8)}`
  + `<path ${F(uid, 'c')} d="${cumulus(138, 272, 100, 26)}"/></g>`
  + sparkle(-162, 60, .5, .8) + sparkle(84, 150, .45, .7),
  drift(uid, -60, -16, 46, 10, {c: [-112, 2], d: 20, dl: 5}) + drift(uid, 62, 4, 38, 9, {c: [86, 6], d: 23, dl: 14, o: .85})
  + spark(-60, 14, .6, {c: [-60, 26], d: 5.5}) + spark(162, -8, .7, {c: [150, 70], d: 6.5, dl: 3})];

// Pré-história: a pegada de três dedos do T-rex, macia como nuvem (contorno arredondado, as almofadas dos dedos em bolhas mais claras e
// as garras em ponta), outra menor mais adiante (o rastro), e samambaias à esquerda.
// o contorno (calcanhar embaixo, na origem; dedos para cima, ~130 unidades de altura): calcanhar, dedo de fora, do meio e o outro
// (08/10/2026: a de antes, com os dedos finos e muito abertos, lia como pegada de pássaro): dedos grossos e mais juntos, que afinam
// até a garra em ponta, e a sola larga do pé de um terópode
const PRINT = [[0, 53], [-18, 49], [-33, 38], [-40, 20], [-42, 4], [-50, -18], [-56, -40], [-61, -60], [-63, -74], [-52, -58], [-44, -40], [-36, -24],
  [-28, -14], [-19, -14], [-16, -36], [-14, -60], [-9, -80], [0, -98], [9, -80], [14, -60], [16, -36], [19, -14], [28, -14], [36, -24], [44, -40], [52, -58],
  [63, -74], [61, -60], [56, -40], [50, -18], [42, 4], [40, 20], [33, 38], [18, 49]];
const PADS = [[0, 20, 15], [0, -34, 9], [0, -62, 7], [-40, -14, 8], [-50, -40, 6.5], [40, -14, 8], [50, -40, 6.5]];
const footprint = (uid, x, y, s, turn, kind) => `<g class="${kind}" transform="translate(${x} ${y}) rotate(${turn}) scale(${s})"><path ${F(uid, 's')} d="${smooth(PRINT)}"/><path fill="#fff" opacity=".42" d="${PADS.map(([px, py, r]) => dot(px, py, r)).join('')}"/></g>`;
const tracks = uid => [glow(uid, 116, 100, 76, 100)
  + `<g class="scn-r">${footprint(uid, 110, 126, .64, 16, 'scn-big')}${footprint(uid, 136, 18, .4, 8, 'scn-small')}</g>`
  + `<g class="scn-l">${glow(uid, -116, 80, 60, 72)}<g ${F(uid, 'f')}><path transform="translate(-98 132) rotate(-14) scale(1.06)" d="${fernPath()}"/><path transform="translate(-134 134) rotate(-38) scale(.84)" d="${fernPath()}"/><path transform="translate(-74 134) rotate(12) scale(.62)" d="${fernPath()}"/></g>`
  + `<path ${F(uid, 'c')} d="${cumulus(-104, 148, 98, 24)}"/></g>`
  + sparkle(-160, 70, .6, .8),
  drift(uid, -148, 6, 52, 12, {c: [-100, 4], d: 21, dl: 7}) + drift(uid, 78, -16, 40, 9, {c: [92, 2], d: 25, dl: 15, o: .85})
  + spark(62, 20, .7, {d: 5.5}) + spark(166, -4, .55, {c: [150, 74], d: 7, dl: 2})];

// Céu: cúmulos em camadas e o rastro pontilhado de um voo que dá uma volta no alto, à direita.
const sky = uid => [glow(uid, 120, 40, 90, 70)
  + `<defs><linearGradient id="scn-${uid}-trail" gradientUnits="userSpaceOnUse" x1="-170" y1="0" x2="176" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".95"/></linearGradient></defs>`
  + `<path class="m-trail" stroke="url(#scn-${uid}-trail)" d="M-172 92C-120 40 -40 6 40 -4C96 -12 146 6 144 34C142 60 104 52 110 26C116 2 150 -8 182 -10"/>`
  + `<g class="scn-l"><path ${F(uid, 'c')} d="${cumulus(-120, 244, 150, 62, [180, 202, 232, 268, 302, 334, 356, 360])}"/><path ${F(uid, 'c')} d="${cumulus(-158, 252, 80, 30)}" opacity=".85"/><path class="scn-a" ${F(uid, 'c')} d="${cumulus(-128, 120, 62, 14)}" opacity=".8"/></g>`
  + `<g class="scn-r"><path ${F(uid, 'c')} d="${cumulus(136, 170, 120, 40, [180, 204, 238, 276, 312, 342, 360])}"/><path ${F(uid, 'c')} d="${cumulus(168, 178, 64, 18)}" opacity=".85"/><path ${F(uid, 'c')} d="${cumulus(118, 262, 110, 34)}" opacity=".9"/></g>`
,
  drift(uid, -140, 14, 58, 13, {c: [-104, 8], d: 22, dl: 4}) + drift(uid, -40, -18, 40, 9, {c: [-80, 64], d: 27, dl: 13, o: .8}) + drift(uid, 150, 118, 44, 10, {c: [70, 96], d: 19, dl: 9, o: .9})
  + spark(-62, 30, .6, {d: 5.5}) + spark(84, 70, .55, {d: 6.5, dl: 2.5})];

const MOTIFS = {bananas, rainbow, acacia, flowers, tracks, sky};

// O fundo de uma camada: `look` = {side, motif} (SHOWCASE › scenery); `uid` torna únicos os ids dos degradês da camada.
export function scenery({side = 'petals', motif = null} = {}, uid = 0) {
  const draw = MOTIFS[motif], [art, drifts] = draw ? draw(uid) : ['', ''];
  const back = draw ? `<div class="scenery-back"><svg class="scenery-motif" viewBox="${VIEW}" focusable="false">${defs(uid)}${art}</svg>${drifts}</div>` : '';
  return `<div class="hero-scenery scenery-${SIDES[side] ? side : 'petals'}" data-motif="${draw ? motif : ''}" aria-hidden="true">${mists(side, uid)}${back}</div>`;
}
export const MOTIF_NAMES = Object.freeze(Object.keys(MOTIFS));
export const SIDE_NAMES = Object.freeze(Object.keys(SIDES));
