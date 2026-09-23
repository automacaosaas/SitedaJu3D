// Sequência de animações (Web Animations API) que tocam, invertem e param juntas. Cada trilha ganha um
// endDelay para todas terminarem no mesmo instante: tocar ao contrário espelha a sequência (a última a
// entrar é a primeira a sair) e uma interrupção continua do ponto exato em que estava.

export function planTracks(tracks) {
  const total = Math.max(0, ...tracks.map(track => (track.delay || 0) + track.duration));
  return {total, tracks: tracks.map(track => {
    const delay = track.delay || 0;
    return {...track, delay, endDelay: total - delay - track.duration};
  })};
}

export class Timeline {
  constructor() { this.animations = []; this.total = 0; this.run = 0; }

  load(tracks, time = 0) {
    this.cancel();
    const plan = planTracks(tracks.filter(track => track.el));
    this.total = plan.total;
    this.animations = plan.tracks.map(({el, keyframes, duration, delay, endDelay, easing = 'linear'}) => {
      const animation = el.animate(keyframes, {duration, delay, endDelay, easing, fill: 'both'});
      animation.pause();
      animation.currentTime = time;
      return animation;
    });
    return this;
  }

  get time() { return this.animations[0]?.currentTime ?? 0; }

  // Resolve com true quando esta execução chega ao fim; false se outra execução ou um cancel a substituir.
  play(rate = 1) {
    const run = ++this.run;
    for (const animation of this.animations) { animation.playbackRate = rate; animation.play(); }
    return Promise.all(this.animations.map(animation => animation.finished))
      .then(() => run === this.run, () => false);
  }

  cancel() {
    this.run++;
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
  }
}
