// Soundeffekte, direkt im Browser erzeugt (keine Audiodateien nötig).
export class Sound {
  constructor() {
    this.ctx = null;
  }

  /** Muss einmal nach einem Klick oder Tastendruck aufgerufen werden. */
  resume() {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, delay = 0, slideTo = null } = {}) {
    const ac = this.ctx;
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  select() { this.tone(660, 0.12, { type: 'triangle' }); this.tone(990, 0.15, { type: 'triangle', delay: 0.08 }); }
  blip() { this.tone(1200, 0.05, { type: 'square', vol: 0.06 }); }
  tick() { this.tone(440, 0.12, { type: 'square', vol: 0.12 }); }
  go() { this.tone(880, 0.4, { type: 'square', vol: 0.15 }); }
  /** Treffer; step erhöht den Ton bei Serien. */
  pop(step = 0) { this.tone(500 + step * 70, 0.16, { type: 'triangle', vol: 0.3, slideTo: 1200 + step * 100 }); }
  /** Streak erreicht: aufsteigende Töne, je höher die Stufe, desto höher. */
  streak(level = 2) { [0, 4, 7, 12].forEach((n, i) => this.tone(440 * 2 ** ((n + level * 2) / 12), 0.14, { type: 'square', vol: 0.12, delay: i * 0.06 })); }
  /** Das Spiel wird schwieriger. */
  stage() { this.tone(330, 0.12, { type: 'sawtooth', vol: 0.12 }); this.tone(660, 0.25, { type: 'sawtooth', vol: 0.12, delay: 0.1 }); }
  /** Extra eingesammelt. */
  power() { this.tone(520, 0.3, { type: 'sine', vol: 0.25, slideTo: 1560 }); }
  bad() { this.tone(180, 0.35, { type: 'sawtooth', vol: 0.2, slideTo: 70 }); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.25, delay: i * 0.13 })); }
  end() { this.tone(440, 0.2, { type: 'triangle' }); this.tone(330, 0.35, { type: 'triangle', delay: 0.18 }); }
}
