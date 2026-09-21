// Lightweight decorative gradients, without filters or animation.
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
export function scenery(key) {
  if (key === 'aviaoscopia') return `<div class="clouds" aria-hidden="true">${[1,2,3,4,5,6].map(n => `<i class="cloud c${n}"></i>`).join('')}</div>`;
  const kind = key === 'dinossauroscopio' ? 'ferns' : 'petals';
  return `<div class="hero-scenery scenery-${kind}" aria-hidden="true">${['left','right'].map(side => {
    const id = `mist-${kind}-${side}`;
    return `<svg class="scenery-${side}" viewBox="0 0 360 440" focusable="false"><defs><radialGradient id="${id}" cx="32%" cy="25%" r="87%"><stop stop-color="#fff" stop-opacity=".9"/><stop offset=".4" stop-color="#fff" stop-opacity=".61"/><stop offset=".72" stop-color="#fff" stop-opacity=".24"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><g fill="url(#${id})">${kind === 'ferns' ? fern() : petals}</g></svg>`;
  }).join('')}</div>`;
}
