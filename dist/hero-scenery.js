// Fundo da vitrine em silhuetas brancas de nuvem, nas BORDAS (08/10/2026, pedidos do dono: "sombreamento com referências de luz,
// usando as nuvens BRANCAS… só silhuetas de características que lembram [cada peça]" e, depois, "deixar as coisas mais na borda,
// para se conectar com a página… algo mais fluido, que conecte com o rolar da página… que não ocupe além [do espaço da vitrine]").
// SVG em linha, sem filtros e sem scripts. Cada camada de fundo recebe UM elemento raiz (a demonstração esmaece e recua esse elemento):
//  · as silhuetas dos cantos (`side`: capim, palmeiras, nuvens, margaridas, samambaias…), presas embaixo, nos cantos da vitrine;
//  · nas bordas esquerda e direita, as silhuetas de cada peça (`motif`, de SHOWCASE em products.js — aqui não há nome de produto):
//    a acácia, os cachos de banana em nuvem, o arco-íris saindo das nuvens, as margaridas, as pegadas, o rastro do voo;
//  · e as nuvenzinhas que flutuam e as estrelinhas que cintilam.
// Cada silhueta da borda é um <svg> pequeno e próprio dentro de um <span>, e o que se mexe é sempre o <span> (no Chrome, uma animação
// no próprio <svg> não vai para o compositor): o CSS só desliza, acende ou gira (transform e opacity), nada é redesenhado. Com a
// rolagem da página, cada uma anda na sua profundidade (carousel.css › scn-scroll; .scn-far, .scn-mid) e os cantos afundam e esmaecem.
// Cores: branco translúcido. Só o lado da sombra, bem de leve, no tom claro da peça (--scn-tN, nunca mais escuro que o meio do
// degradê: hero-motion.js › sceneryVars), então o desenho só clareia o fundo e nunca tira contraste de um texto.
//
// Onde cada coisa fica, em unidades da pilastra (1 = 1/200 da largura dela): x = a distância da borda da vitrine para dentro (nas
// telas mais largas que 1560 px, a borda do contêiner), y = a partir do alto do palco, onde a peça começa. Medido de 360 a 2560 px:
//  · computador (901 px ou mais): o header acima de y −34; à esquerda, o texto e os botões a partir de x 65 (y 37 a 176) e a seta em
//    x 12…43, y 118…152; à direita, a seta em x 13…43, y 118…152, a pilastra a partir de x 130 (152 a partir de 1280 px) e a peça
//    a partir de x 165. Livres: a faixa de cada borda (x até 60), o alto à esquerda acima do texto (y −30…30), o canto de baixo à
//    esquerda (y 180 em diante, x até 330) e, à direita, x até 150;
//  · celular e tablet (até 900 px): o preço em y −30…−12 (a partir de x 76), a peça em y 0…172 (a partir de x 102 na borboleta e
//    120 nas orelhas das lâmpadas), as setas em x 19…57, y 105…143, a pilastra em y 152…260 a partir de x 67 e os botões, de borda
//    a borda, a partir de y 280. Livres: um bolso no alto de cada borda (y −10…100, x até ~95), um embaixo (y 148…270, x até 62) e,
//    na altura das setas, só o fio da borda (x até 15).
// tests/carousel.cjs refaz essas contas com o contorno de cada desenho, nas duas arrumações.
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
// banana em nuvem (o pedido do dono: "nuvens em formato de banana"): o contorno de uma banana deitada, com o cabinho na origem, à
// esquerda, e a ponta subindo à direita (160 × 70 unidades, vezes k), e a barriga em bolhas, como a base de uma nuvem; o resto, liso
const BANANA_BELLY = [[10, 6], [36, 17], [64, 22], [94, 18], [122, 8], [144, -8], [157, -26]];
// o cabinho e a pontinha, no tom quente da sombra da peça (carousel.css › .m-nub): é o que faz a nuvem ler como banana
const BANANA_NUBS = 'M-7.6 -17.2L-5.6 -25.2L0.4 -23.2L-1.6 -15.6ZM159.6 -46.6L167.8 -46.8L165.4 -40.4L160.6 -41.6Z';
const BANANA_REST = [[157, -26], [164, -38], [167, -46], [160, -46], [152, -38], [138, -27], [114, -13], [86, -6], [56, -5], [28, -9], [12, -13], [6, -16], [1, -22], [-5, -24], [-7, -17], [-1, -8], [4, 0], [10, 6]];
const bananaPuff = (k = 1) => {
  const P = ([x, y]) => [x * k, y * k], b = BANANA_BELLY.map(P);
  const belly = b.slice(1).reduce((d, [x, y], i) => { const r = n(Math.hypot(x - b[i][0], y - b[i][1]) * .8); return `${d}A${r} ${r} 0 0 0 ${n(x)} ${n(y)}`; }, `M${n(b[0][0])} ${n(b[0][1])}`);
  return belly + smooth(BANANA_REST.map(P), false).replace(/^M[^C]*/, '') + 'Z';
};
// estrelinha de brilho (quatro pontas), branca
const sparkle = (x, y, s, o = .9) => `<path fill="#fff" opacity="${o}" d="M${x} ${n(y - 9 * s)}C${n(x + s)} ${n(y - 2 * s)} ${n(x + 2 * s)} ${n(y - s)} ${n(x + 9 * s)} ${y}C${n(x + 2 * s)} ${n(y + s)} ${n(x + s)} ${n(y + 2 * s)} ${x} ${n(y + 9 * s)}C${n(x - s)} ${n(y + 2 * s)} ${n(x - 2 * s)} ${n(y + s)} ${n(x - 9 * s)} ${y}C${n(x - 2 * s)} ${n(y - s)} ${n(x - s)} ${n(y - 2 * s)} ${x} ${n(y - 9 * s)}Z"/>`;

// ── cores: degradês da camada (ids únicos por camada: `uid`), num <svg> só de definições que todas as silhuetas da camada usam ──
// c = nuvem (branca no alto; a base se dissolve com um toque do tom da peça) · f = haste, tronco e capim (branco que some para
// baixo) · s = folha, pétala (luz no alto, do lado de fora, a sombra no tom da peça) · g = halo, uma luz macia · e = miolo da
// margarida (só branco: "não quero coisa colorida") · p = pegada (clara do lado de dentro, sombreada para a borda da página) ·
// b = banana em nuvem (branca no alto, a barriga no tom da peça, sem sumir: o contorno da banana tem de ficar)
const defs = uid => '<defs>'
  + `<linearGradient id="scn-${uid}-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".94"/><stop offset=".55" stop-color="#fff" stop-opacity=".8"/><stop offset=".84" class="m-t1" stop-opacity=".5"/><stop offset="1" class="m-t1" stop-opacity="0"/></linearGradient>`
  + `<linearGradient id="scn-${uid}-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".86"/><stop offset=".62" stop-color="#fff" stop-opacity=".46"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
  + `<radialGradient id="scn-${uid}-s" cx=".34" cy=".28" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".58" stop-color="#fff" stop-opacity=".74"/><stop offset="1" class="m-t1" stop-opacity=".5"/></radialGradient>`
  + `<radialGradient id="scn-${uid}-g"><stop offset="0" stop-color="#fff" stop-opacity=".72"/><stop offset=".5" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
  + `<radialGradient id="scn-${uid}-e" cx=".4" cy=".36" r=".72"><stop offset="0" stop-color="#fff" stop-opacity=".98"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></radialGradient>`
  + `<linearGradient id="scn-${uid}-p" x1="1" y1=".1" x2="0" y2=".5"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff" stop-opacity=".74"/><stop offset="1" class="m-t1" stop-opacity=".34"/></linearGradient>`
  + `<linearGradient id="scn-${uid}-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff" stop-opacity=".84"/><stop offset="1" class="m-t1" stop-opacity=".6"/></linearGradient>`
  + '</defs>';
const F = (uid, kind) => `fill="url(#scn-${uid}-${kind})"`;
const glow = (uid, x, y, rx, ry = rx) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${F(uid, 'g')}/>`;

// ── onde: cada <span> da borda leva o lado (scn-l, scn-r), a profundidade na rolagem (scn-far: fica mais para trás; scn-mid) e o lugar,
// em unidades da pilastra (veja o alto do arquivo): at = [x, y, s] no computador — a distância do quadro à borda, o alto dele a
// partir do alto do palco e a escala do desenho — e c = [x, y, s] no celular e no tablet (até 900 px) ──
const place = ([x, y, s = 1], [cx, cy, cs = s]) => `--x:${x};--y:${y};--s:${s};--cx:${cx};--cy:${cy};--cs:${cs}`;
// uma silhueta da borda: o desenho no quadro w × h, com x = 0 na borda da vitrine e crescendo para dentro (na direita, espelhado);
// fade: se dissolve antes da borda (carousel.css › .scn-fade; o que passa do quadro some)
const edge = (side, depth, at, c, w, h, art, more = '', fade = false) => `<span class="scenery-edge scn-${side} scn-${depth}${fade ? ' scn-fade' : ''}" style="${place(at, c)};--w:${w};--h:${h}"><svg viewBox="0 0 ${w} ${h}" focusable="false">${side === 'r' ? `<g transform="matrix(-1 0 0 1 ${w} 0)">${art}</g>` : art}</svg>${more}</span>`;
// nuvenzinha que flutua (w × h a nuvem; o quadro tem folga para as bolhas): o CSS a desliza devagar (--d: a duração da ida; --dl: o
// atraso, para cada uma andar no seu tempo). shape 'banana': uma bananinha em nuvem
const drift = (uid, side, at, c, w, h, {d = 18, dl = 0, o = 1, shape = 'cloud'} = {}) => {
  const bw = n(w * 1.2), bh = n(h + w * .24 + 1);
  const art = shape === 'banana' ? `<path ${F(uid, 'b')} transform="translate(${n(w * .14)} ${n(bh * .78)}) rotate(-6)" d="${bananaPuff(+(w / 160).toFixed(3))}"/>` : `<path ${F(uid, 'c')} d="${cumulus(w * .6, bh - 1, w, h)}"/>`;
  return `<span class="scenery-drift scn-${side} scn-far" style="${place(at, c)};--w:${bw};--h:${bh};--d:${d}s;--dl:${-dl}s"><svg viewBox="0 0 ${bw} ${bh}" focusable="false"><g${o < 1 ? ` opacity="${o}"` : ''}>${art}</g></svg></span>`;
};
// brilho que cintila: a estrelinha (s = o tamanho) num <svg> próprio; o CSS só muda opacity e scale, devagar
const spark = (side, at, c, s, {d = 5, dl = 0} = {}) => {
  const r = n(9 * s + 1);
  return `<span class="scenery-spark scn-${side} scn-far" style="${place(at, c)};--w:${n(2 * r)};--h:${n(2 * r)};--d:${d}s;--dl:${-dl}s"><svg viewBox="0 0 ${n(2 * r)} ${n(2 * r)}" focusable="false">${sparkle(r, r, s, 1)}</svg></span>`;
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

// ── as silhuetas das bordas de cada peça ──
// Savana: à direita, a acácia na beira da vitrine (o tronco no fio da borda, por fora da seta; a copa achatada, em camadas de nuvem,
// no alto, longe da peça: "no celular a árvore está sendo ofuscada pela girafa"); à esquerda, o sol baixo no alto, acima do texto, e
// uma acácia pequena ao longe, embaixo.
const acacia = uid => edge('r', 'mid', [-9, -34], [-4, -6, .55], 196, 360,
  `<defs><linearGradient id="scn-${uid}-trunk" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="360"><stop offset="0" stop-color="#fff" stop-opacity=".82"/><stop offset=".5" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`
  + `<path fill="url(#scn-${uid}-trunk)" d="${limb(13, 360, 11, 146, 15, 10, -2)}${limb(11, 152, 80, 60, 9, 4, 13)}${limb(12, 158, 38, 62, 7, 3, 6)}${limb(48, 104, 146, 54, 6, 3, -9)}${limb(76, 78, 174, 60, 4, 2.4, -5)}"/>`
  + `<path ${F(uid, 'c')} d="${cumulus(96, 68, 168, 30, [180, 192, 207, 224, 244, 266, 290, 312, 332, 348, 360])}"/>`
  + `<path ${F(uid, 'c')} d="${cumulus(106, 47, 110, 19, [180, 204, 236, 274, 312, 344, 360])}" opacity=".9"/>`)
  + edge('l', 'far', [70, -44], [12, 0, .6], 100, 76, glow(uid, 50, 38, 50, 24) + '<circle cx="50" cy="38" r="13" fill="#fff" opacity=".8"/>')
  + edge('l', 'far', [150, 182], [-4, 166, .58], 104, 88, `<path ${F(uid, 'f')} d="${limb(52, 88, 51, 52, 4.4, 2.6, 1)}${limb(51, 58, 34, 48, 2.6, 1.4, -2)}${limb(51, 60, 68, 48, 2.6, 1.4, 2)}"/><path ${F(uid, 'c')} d="${cumulus(51, 50, 84, 12, [180, 212, 252, 296, 334, 360])}"/>`)
  + drift(uid, 'r', [22, 82], [6, 76, .8], 52, 12, {d: 21, dl: 4}) + drift(uid, 'l', [30, 200], [8, 64, .8], 64, 14, {d: 26, dl: 11, o: .9})
  + spark('r', [140, 104], [56, 88], .55, {d: 5.5}) + spark('l', [36, 74], [44, 236], .5, {d: 7, dl: 2.5});

// Selva: nuvens em forma de banana nas bordas, no lugar das nuvens comuns ("as bananas na lateral, na borda, como se fossem nuvens"):
// à direita, uma grande saindo da borda com uma menor mais ao longe, embaixo dela; à esquerda, outra; e as nuvenzinhas que flutuam
// também são bananinhas. Cada banana sozinha (em leque ou paralelas, liam-se como as penas de uma asa).
const banana = (uid, o = 1, turn = -6) => `<g transform="translate(14 52) rotate(${turn} 80 -12)"${o < 1 ? ` opacity="${o}"` : ''}><path ${F(uid, 'b')} d="${bananaPuff()}"/><path class="m-nub" d="${BANANA_NUBS}"/></g>`;
const bananas = uid => edge('r', 'mid', [6, -14, .9], [4, 6, .5], 184, 82, banana(uid))
  + edge('r', 'far', [30, 64, .56], [2, 176, .32], 184, 82, banana(uid, .8, 4))
  + edge('l', 'mid', [36, 192, .8], [4, 30, .44], 184, 82, banana(uid, 1, -10))
  + drift(uid, 'r', [36, 178], [4, 176, .8], 60, 20, {d: 22, dl: 6, shape: 'banana'}) + drift(uid, 'l', [100, -26], [22, 74, .8], 52, 18, {d: 19, dl: 13, o: .9, shape: 'banana'})
  + spark('r', [146, 96], [48, 84], .6, {d: 6}) + spark('l', [30, 90], [48, 236], .55, {d: 5, dl: 2});

// Arco-íris: nuvens fofas presas nas bordas e, de cada uma, o arco-íris subindo e saindo pela borda da vitrine (o centro do arco fica
// do lado de fora): faixas de nuvem brancas com o tom de cada cor da peça bem de leve, e um brilho que corre devagar pelas faixas.
// O arco à direita, maior, sai da nuvem acima da seta; o da esquerda, menor e mais ao longe, da nuvem do canto de baixo. Os pés ficam
// no meio da nuvem e se dissolvem nela (na base translúcida, o pé aparecia cortado reto por baixo) e o fim de cada arco se dissolve
// antes da borda (.scn-fade; o quadro da direita tem folga para a nuvenzinha de dentro, que a máscara cortaria).
const RAINBOW = {order: [4, 1, 2, 3]};   // de fora para dentro: rosa, roxo, lavanda, dourado
const arc = (uid, k, cx, cy, R, band) => {
  const r = [0, 1, 2, 3, 4].map(i => R - i * band);
  // um degradê radial no centro do arco pinta as quatro faixas: branco nas emendas, o tom claro da cor no meio de cada uma. As paradas
  // vão de dentro para fora (com a ordem trocada, o navegador as juntava todas na de fora e só a faixa rosa aparecia)
  const stops = RAINBOW.order.map((t, i) => {
    const outer = r[i] / R, inner = r[i + 1] / R, mid = (outer + inner) / 2;
    return `<stop offset="${n(inner * 1000) / 1000}" stop-color="#fff" stop-opacity=".5"/><stop offset="${n(mid * 1000) / 1000}" class="m-t${t}" stop-opacity=".86"/><stop offset="${n((outer - .008) * 1000) / 1000}" stop-color="#fff" stop-opacity=".7"/>`;
  }).reverse().join('');
  // do pé (ângulo 0°, para dentro) até passar da borda (o alto, −100°)
  const at = (rr, a) => [n(cx + Math.cos(rad(a)) * rr), n(cy + Math.sin(rad(a)) * rr)], [ox, oy] = at(R, -104), [ix, iy] = at(r[4], -104);
  // o pé se dissolve dentro da nuvem (a base dela é translúcida: sem isso, as faixas apareciam por ela, cortadas retas embaixo)
  const box = `x="${n(cx - R - 4)}" y="${n(cy - R - 4)}" width="${2 * R + 8}" height="${R + 8}"`;
  return `<defs><radialGradient id="scn-${uid}-bands${k}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${R}">${stops}<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="scn-${uid}-foot${k}g" gradientUnits="userSpaceOnUse" x1="0" y1="${cy - 36}" x2="0" y2="${cy - 6}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + `<mask id="scn-${uid}-foot${k}" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="url(#scn-${uid}-foot${k}g)"/></mask></defs>`
    + `<path fill="url(#scn-${uid}-bands${k})" d="M${n(cx + R)} ${cy}A${R} ${R} 0 0 0 ${ox} ${oy}L${ix} ${iy}A${r[4]} ${r[4]} 0 0 1 ${n(cx + r[4])} ${cy}Z" mask="url(#scn-${uid}-foot${k})"/>`;
};
// o brilho que corre pelas faixas, do pé até a borda: um <span> do tamanho do círculo do meio das faixas, que o CSS gira (transform) em
// volta do centro do arco; o brilho, uma estrelinha numa luz macia da largura das quatro faixas, começa no pé. Na direita o desenho é espelhado, então o centro e o giro também.
const glint = (uid, side, w, h, cx, cy, R) => {
  const x = side === 'r' ? w - cx : cx, size = 2 * R, foot = side === 'r' ? 0 : size;
  return `<span class="scenery-glint" style="left:${n((x - R) / w * 100)}%;top:${n((cy - R) / h * 100)}%;width:${n(size / w * 100)}%;height:${n(size / h * 100)}%;--turn:${side === 'r' ? 1 : -1}"><svg viewBox="0 0 ${size} ${size}" focusable="false"><ellipse cx="${foot}" cy="${R}" rx="18" ry="14" ${F(uid, 'g')}/>${sparkle(foot, R, .8, 1)}</svg></span>`;
};
const rainbow = uid => edge('r', 'mid', [0, -30, 1.2], [0, -4, .6], 148, 152, arc(uid, 'r', -12, 110, 108, 7) + `<path ${F(uid, 'c')} d="${cumulus(76, 120, 120, 30)}"/><path ${F(uid, 'c')} d="${cumulus(120, 126, 48, 13)}" opacity=".85"/>`, glint(uid, 'r', 148, 152, -12, 110, 94), true)
  + edge('l', 'far', [0, 142, 1.1], [0, 148, .56], 124, 136, arc(uid, 'l', -10, 112, 90, 6) + `<path ${F(uid, 'c')} d="${cumulus(60, 122, 104, 26)}"/>`, glint(uid, 'l', 124, 136, -10, 112, 78), true)
  + edge('l', 'mid', [-22, -30], [-22, 30, .6], 140, 46, `<path ${F(uid, 'c')} d="${cumulus(62, 46, 116, 24)}"/><path ${F(uid, 'c')} d="${cumulus(110, 46, 46, 12)}" opacity=".8"/>`)
  + drift(uid, 'r', [60, 178], [8, 172, .8], 46, 11, {d: 20, dl: 3}) + drift(uid, 'l', [132, -22], [40, 76, .8], 40, 9, {d: 24, dl: 12, o: .9})
  + spark('r', [136, 34], [82, 92], .8, {d: 6}) + spark('l', [40, 96], [46, 250], .7, {d: 5, dl: 2.5});

// Jardim: margaridas de pétalas e miolos brancos ("não quero coisa colorida"), as hastes no fio das bordas, por fora das setas.
const daisy = (uid, x, y, r, count, turn = 0, wide) => `<path ${F(uid, 's')} d="${petals(x, y, r, count, turn, wide)}"/><circle cx="${x}" cy="${y}" r="${n(r * .27)}" ${F(uid, 'e')}/>`;
const flowers = uid => edge('r', 'mid', [-6, -26], [-6, 14, .7], 150, 340,
  `<path d="M10 340C8 268 6 196 9 150C12 112 34 86 58 68M9 296C14 268 44 248 78 236M9 168C16 140 30 118 40 106" fill="none" stroke="url(#scn-${uid}-f)" stroke-width="3" stroke-linecap="round"/>`
  + `<path ${F(uid, 's')} d="${blade(10, 252, 44, 232, 9, -5)}M42 106C33 100 33 87 42 78C51 87 51 100 42 106Z"/>` + daisy(uid, 62, 58, 36, 12, 6, .3) + daisy(uid, 84, 230, 20, 10, -8))
  + edge('l', 'mid', [-8, -22], [-8, 22, .62], 130, 308,
    `<path d="M12 308C10 236 8 162 10 110C11 92 14 80 18 72M11 294C24 276 60 260 90 252" fill="none" stroke="url(#scn-${uid}-f)" stroke-width="3" stroke-linecap="round"/>`
    + `<path ${F(uid, 's')} d="${blade(11, 270, 44, 284, 8, 4)}"/>` + daisy(uid, 20, 42, 32, 11, -8) + daisy(uid, 96, 246, 20, 10, 12))
  + drift(uid, 'r', [40, -30], [10, 196, .8], 46, 10, {d: 20, dl: 5}) + drift(uid, 'l', [96, -24], [26, 76, .8], 40, 9, {d: 23, dl: 14, o: .85})
  + spark('r', [118, 96], [64, 90], .6, {d: 5.5}) + spark('l', [40, 80], [8, 238], .55, {d: 6.5, dl: 3});

// Pré-história: as pegadas de três dedos do T-rex subindo pela borda direita, macias como nuvem e um pouco sombreadas para o lado da
// borda da página (o dono gostou das garras: "talvez se ficasse um pouco sombreado nas bordas"), cada vez menores (o rastro some ao
// longe); à esquerda, uma samambaia entrando pela borda.
// o contorno (calcanhar embaixo, na origem; dedos para cima, ~130 unidades de altura): calcanhar, dedo de fora, do meio e o outro
// (08/10/2026: a de antes, com os dedos finos e muito abertos, lia como pegada de pássaro): dedos grossos e mais juntos, que afinam
// até a garra em ponta, e a sola larga do pé de um terópode
const PRINT = [[0, 53], [-18, 49], [-33, 38], [-40, 20], [-42, 4], [-50, -18], [-56, -40], [-61, -60], [-63, -74], [-52, -58], [-44, -40], [-36, -24],
  [-28, -14], [-19, -14], [-16, -36], [-14, -60], [-9, -80], [0, -98], [9, -80], [14, -60], [16, -36], [19, -14], [28, -14], [36, -24], [44, -40], [52, -58],
  [63, -74], [61, -60], [56, -40], [50, -18], [42, 4], [40, 20], [33, 38], [18, 49]];
const PADS = [[0, 20, 15], [0, -34, 9], [0, -62, 7], [-40, -14, 8], [-50, -40, 6.5], [40, -14, 8], [50, -40, 6.5]];
const print = (uid, turn) => `<g transform="translate(66 104) rotate(${turn})"><path ${F(uid, 'p')} d="${smooth(PRINT)}"/><path fill="#fff" opacity=".4" d="${PADS.map(([px, py, r]) => dot(px, py, r)).join('')}"/></g>`;
const tracks = uid => edge('r', 'mid', [16, 166, .62], [-6, 150, .44], 132, 160, print(uid, 10))
  + edge('r', 'mid', [30, 4, .44], [14, 18, .34], 132, 160, print(uid, 16))
  + edge('r', 'far', [104, -26, .3], [60, -4, .24], 132, 160, print(uid, 20))
  + edge('l', 'mid', [-16, -44], [-14, -30, .7], 104, 160, `<path ${F(uid, 'f')} transform="translate(6 156) rotate(20) scale(-1.7 1.7)" d="${fernPath()}"/>`)
  + drift(uid, 'r', [58, 96], [40, 80, .8], 46, 10, {d: 21, dl: 7}) + drift(uid, 'l', [120, -22], [4, 200, .8], 40, 9, {d: 25, dl: 15, o: .85})
  + spark('r', [124, 116], [70, -2], .55, {d: 5.5}) + spark('l', [36, 74], [44, 246], .6, {d: 7, dl: 2});

// Céu: o rastro pontilhado de um voo que entra pela borda direita, dá uma volta no alto e sai de novo pela borda, cúmulos presos nas
// duas bordas e as nuvenzinhas.
const sky = uid => edge('r', 'mid', [0, -28], [0, -4, .6], 176, 128,
  `<defs><linearGradient id="scn-${uid}-trail" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="176" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".4" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity=".95"/></linearGradient></defs>`
  + `<path class="m-trail" stroke="url(#scn-${uid}-trail)" d="M0 112C46 108 104 96 134 66C158 42 150 10 124 10C98 10 94 44 120 52C146 60 158 28 140 10C120 -8 60 -2 0 10"/>`)
  + edge('r', 'mid', [-26, 166], [-26, 158, .58], 156, 60, `<path ${F(uid, 'c')} d="${cumulus(76, 60, 140, 40, [180, 204, 238, 276, 312, 342, 360])}"/><path ${F(uid, 'c')} d="${cumulus(132, 60, 52, 16)}" opacity=".85"/>`)
  + edge('l', 'mid', [-24, -33], [-24, 26, .58], 150, 50, `<path ${F(uid, 'c')} d="${cumulus(70, 50, 136, 34, [180, 202, 232, 268, 302, 334, 356, 360])}"/><path ${F(uid, 'c')} d="${cumulus(126, 50, 48, 13)}" opacity=".8"/>`)
  + drift(uid, 'l', [150, -16], [30, 72, .8], 58, 13, {d: 22, dl: 4}) + drift(uid, 'r', [150, -26], [8, 196, .8], 40, 9, {d: 27, dl: 13, o: .8}) + drift(uid, 'r', [70, 236], [4, 216, .7], 44, 10, {d: 19, dl: 9, o: .9})
  + spark('l', [40, 84], [44, 236], .6, {d: 5.5}) + spark('r', [140, 96], [86, 92], .55, {d: 6.5, dl: 2.5});

const MOTIFS = {bananas, rainbow, acacia, flowers, tracks, sky};

// O fundo de uma camada: `look` = {side, motif} (SHOWCASE › scenery); `uid` torna únicos os ids dos degradês da camada.
export function scenery({side = 'petals', motif = null} = {}, uid = 0) {
  const draw = MOTIFS[motif];
  const back = draw ? `<div class="scenery-back"><svg class="scenery-defs" focusable="false">${defs(uid)}</svg>${draw(uid)}</div>` : '';
  return `<div class="hero-scenery scenery-${SIDES[side] ? side : 'petals'}" data-motif="${draw ? motif : ''}" aria-hidden="true">${mists(side, uid)}${back}</div>`;
}
export const MOTIF_NAMES = Object.freeze(Object.keys(MOTIFS));
export const SIDE_NAMES = Object.freeze(Object.keys(SIDES));
