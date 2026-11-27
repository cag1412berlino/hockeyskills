// Soundeffekte, direkt im Browser erzeugt (keine Audiodateien nötig).
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
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
    if (!ac || ac.state !== 'running' || this.muted) return;
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

/** Sprachansagen über die Vorlesefunktion des Browsers, für Kinder, die noch nicht lesen. */
export class Voice {
  constructor() {
    this.enabled = true;
  }

  say(text) {
    if (!this.enabled || typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel(); // Neues ist wichtiger als Altes
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      u.rate = 1.05;
      u.pitch = 1.15;
      speechSynthesis.speak(u);
    } catch {
      // Vorlesen nicht verfügbar – dann eben ohne
    }
  }
}

// Vier Takte Begleitung: Grundton je Takt und die Töne, aus denen die Melodie gewürfelt wird.
const BARS = [
  { root: 110, tones: [220, 262, 330, 392] },   // a-Moll
  { root: 87.3, tones: [175, 220, 262, 349] },  // F-Dur
  { root: 130.8, tones: [262, 330, 392, 523] }, // C-Dur
  { root: 98, tones: [196, 247, 294, 392] },    // G-Dur
];

/**
 * Leise Hintergrundmusik, im Browser erzeugt. Mit der Serie (intensity 1 bis 4) wird sie
 * schneller und bekommt mehr Stimmen: erst Bass, dann Melodie, dann Schlagwerk.
 */
export class Music {
  constructor(sound) {
    this.sound = sound;
    this.enabled = true;
    this.level = 1;
    this.timer = null;
    this.step = 0;
    this.nextAt = 0;
  }

  intensity(n) {
    this.level = n;
  }

  start() {
    const ac = this.sound.ctx;
    if (this.timer || !this.enabled || !ac) return;
    this.step = 0;
    this.nextAt = ac.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 80);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Plant die Töne der nächsten Viertelsekunde vor. */
  schedule() {
    const ac = this.sound.ctx;
    if (!ac || ac.state !== 'running') return;
    while (this.nextAt < ac.currentTime + 0.25) {
      const beat = 60 / (96 + this.level * 9) / 2; // Achtelnoten
      const bar = BARS[Math.floor(this.step / 8) % BARS.length];
      const i = this.step % 8;
      const delay = Math.max(0, this.nextAt - ac.currentTime);
      if (i % 4 === 0) this.sound.tone(bar.root, beat * 3, { type: 'triangle', vol: 0.09, delay });
      if (this.level >= 2 || i % 2 === 0) {
        this.sound.tone(bar.tones[(i * 3 + Math.floor(this.step / 8)) % 4], beat * 0.9, { type: 'sine', vol: 0.035, delay });
      }
      if (this.level >= 3 && i % 2 === 1) this.sound.tone(1800, 0.03, { type: 'square', vol: 0.012, delay });
      this.nextAt += beat;
      this.step++;
    }
  }
}
