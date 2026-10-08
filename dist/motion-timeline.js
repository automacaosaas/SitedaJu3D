// Sequência de animações (Web Animations API) que tocam, invertem e param juntas, todas no mesmo relógio: em qualquer instante
// cada trilha está no ponto `tempo da sequência − delay` dela. Tocar ao contrário espelha a sequência (a última a entrar é a
// primeira a sair) e uma interrupção continua do ponto exato em que estava.
// Sem endDelay (o Chrome não leva para a GPU uma animação com endDelay): quem termina antes fica parada no fim (fill: both) e, na
// volta, só começa a andar quando o relógio chega de novo ao trecho dela. Por isso o play() não usa animation.play() — que, numa
// trilha já terminada, voltaria ao começo —, e sim um startTime comum a todas.

export function planTracks(tracks) {
  const total = Math.max(0, ...tracks.map(track => (track.delay || 0) + track.duration));
  return {total, tracks: tracks.map(track => ({...track, delay: track.delay || 0}))};
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class Timeline {
  constructor() { this.animations = []; this.total = 0; this.run = 0; this.at = 0; this.origin = null; this.rate = 1; }

  load(tracks, time = 0) {
    this.cancel();
    const plan = planTracks(tracks.filter(track => track.el));
    this.total = plan.total;
    this.at = clamp(time, 0, plan.total);
    this.animations = plan.tracks.map(({el, keyframes, duration, delay, easing = 'linear'}) => {
      const animation = el.animate(keyframes, {duration, delay, easing, fill: 'both'});
      animation.pause();
      animation.currentTime = this.at;
      return animation;
    });
    return this;
  }

  // o tempo da sequência: parado no ponto carregado, ou contado do relógio do documento enquanto toca
  get time() {
    if (this.origin === null) return this.at;
    return clamp((document.timeline.currentTime - this.origin) * this.rate, 0, this.total);
  }

  // Resolve com true quando esta execução chega ao fim (ou ao começo, com rate < 0); false se outra execução ou um cancel a substituir.
  play(rate = 1) {
    const run = ++this.run, from = this.time, now = document.timeline.currentTime;
    this.rate = rate; this.origin = now - from / rate;
    for (const animation of this.animations) { animation.playbackRate = rate; animation.startTime = this.origin; }
    return Promise.all(this.animations.map(animation => animation.finished))
      .then(() => run === this.run, () => false);
  }

  cancel() {
    this.run++;
    for (const animation of this.animations) animation.cancel();
    this.animations = []; this.origin = null; this.at = 0;
  }
}
