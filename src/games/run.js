// Spiel "Rennen": Die Strecke läuft ununterbrochen von oben nach unten durchs Feld.
// Der Ball muss auf der Bahn bleiben, die weit nach links und rechts ausschwenkt.
// Sterne bringen Punkte, ab "Mittel" liegen Stachelbälle auf der Bahn.
import { BALL_RADIUS } from '../engine.js';
import { text, glow, noGlow, hazard, star } from '../ui.js';

const LEVELS = {
  1: { width: 250, speed: 130, seg: 460, swing: 0.6, hazards: 0 },
  2: { width: 195, speed: 190, seg: 380, swing: 0.85, hazards: 3 }, // Stachelball in jedem 3. Abschnitt
  3: { width: 155, speed: 250, seg: 320, swing: 1, hazards: 2 },
};

class Run {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.scroll = 0;     // bisher zurückgelegte Strecke
    this.time = 0;
    this.points = [];    // Mitte der Bahn an den Stützstellen
    this.items = new Map();
    this.onTrack = false;
    this.streak = 0;     // Sekunden ohne Unterbrechung auf der Bahn
    this.acc = 0;
    this.offFor = 0;
    this.hurt = 0;
    this.flash = 0;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.floaters = [];
  }

  /** Mitte der Bahn an Stützstelle i. Am Anfang gerade, danach abwechselnd weit nach links und rechts. */
  point(i) {
    const { field } = this.env;
    if (i <= 1) return field.w / 2;
    while (this.points.length <= i) {
      const room = field.w / 2 - this.p.width / 2 - 30;
      this.side *= Math.random() < 0.8 ? -1 : 1;
      this.points.push(field.w / 2 + this.side * room * this.p.swing * (0.45 + Math.random() * 0.55));
    }
    return this.points[i];
  }

  /** Mitte der Bahn bei Streckenposition d. */
  center(d) {
    const i = Math.floor(d / this.p.seg);
    const t = d / this.p.seg - i;
    const a = this.point(i), b = this.point(i + 1);
    return a + (b - a) * t * t * (3 - 2 * t);
  }

  /** Stern und eventuell Stachelball im Abschnitt i. */
  item(i) {
    if (i < 2) return null;
    if (!this.items.has(i)) {
      const s = Math.random() < 0.5 ? 1 : -1;
      this.items.set(i, {
        d: i * this.p.seg, // am Wendepunkt, dort verläuft die Bahn gerade
        starOff: s * this.p.width * 0.24,
        hazOff: this.p.hazards && i % this.p.hazards === 0 ? -s * this.p.width * 0.27 : null,
        taken: false,
      });
    }
    return this.items.get(i);
  }

  visibleItems() {
    const { field } = this.env;
    const out = [];
    const first = Math.floor((this.scroll - field.h) / this.p.seg) - 1;
    const last = Math.floor(this.scroll / this.p.seg) + 1;
    for (let i = first; i <= last; i++) {
      const it = this.item(i);
      if (it) out.push({ it, y: this.scroll - it.d, cx: this.center(it.d) });
    }
    return out;
  }

  update(dt, ball) {
    const { env, p } = this;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.flash = Math.max(0, this.flash - dt);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1);

    this.scroll += p.speed * (1 + 0.35 * Math.min(1, this.time / 60)) * dt;

    const was = this.onTrack;
    this.onTrack = ball.visible && Math.abs(ball.x - this.center(this.scroll - ball.y)) < p.width / 2;
    if (this.onTrack) {
      this.offFor = 0;
      this.streak += dt;
      // Je länger ohne Unterbrechung auf der Bahn, desto höher der Multiplikator.
      this.acc += dt * 3 * this.multiplier();
      while (this.acc >= 1) { this.acc -= 1; env.addScore(1); }
    } else {
      this.offFor += dt;
      if (this.offFor > 0.4) this.streak = 0;
      if (was && ball.visible) env.sound.tick();
    }
    if (!ball.visible) return;

    for (const { it, y, cx } of this.visibleItems()) {
      if (!it.taken && Math.hypot(ball.x - (cx + it.starOff), ball.y - y) < 42 + BALL_RADIUS) {
        it.taken = true;
        env.addScore(10);
        env.sound.pop(this.multiplier());
        this.floaters.push({ x: ball.x, y: ball.y, age: 0, str: '+10', color: env.palette[1] });
      }
      if (it.hazOff != null && this.hurt <= 0 && Math.hypot(ball.x - (cx + it.hazOff), ball.y - y) < 24 + BALL_RADIUS * 0.5) {
        env.addScore(-15);
        env.sound.bad();
        this.hurt = 1.2;
        this.flash = 0.4;
        this.streak = 0;
        this.floaters.push({ x: ball.x, y: ball.y, age: 0, str: '-15' });
      }
    }
  }

  multiplier() {
    return Math.min(5, 1 + Math.floor(this.streak / 4));
  }

  draw(ctx) {
    const { env, p } = this;
    const { field } = env;
    const [c0, c1, c2] = env.palette;
    const half = p.width / 2;

    // Querstreifen, die mitlaufen: so sieht man, dass es ständig vorangeht.
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = this.scroll % 125; y < field.h; y += 125) { ctx.moveTo(0, y); ctx.lineTo(field.w, y); }
    ctx.stroke();

    // Bahn als Fläche mit leuchtenden Rändern
    const ys = [];
    for (let y = -20; y <= field.h + 20; y += 20) ys.push(y);
    const cx = ys.map((y) => this.center(this.scroll - y));
    ctx.beginPath();
    ys.forEach((y, i) => ctx.lineTo(cx[i] - half, y));
    for (let i = ys.length - 1; i >= 0; i--) ctx.lineTo(cx[i] + half, ys[i]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fill();

    const off = !this.onTrack && Math.floor(this.time * 6) % 2 === 0;
    const edge = this.onTrack ? c0 : off ? '#fff' : c2;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = edge;
    glow(ctx, edge, 22);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ys.forEach((y, i) => ctx.lineTo(cx[i] + s * half, y));
      ctx.stroke();
    }
    noGlow(ctx);

    // Mittelstreifen
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let d = Math.ceil((this.scroll - field.h) / 80) * 80; d < this.scroll; d += 80) {
      ctx.fillRect(this.center(d) - 3, this.scroll - d - 14, 6, 28);
    }

    for (const { it, y, cx: x } of this.visibleItems()) {
      if (!it.taken) {
        glow(ctx, c1, 20);
        star(ctx, x + it.starOff, y, 40, c1, this.time * 2);
        noGlow(ctx);
      }
      if (it.hazOff != null) hazard(ctx, x + it.hazOff, y, 30, this.time * 2);
    }

    const m = this.multiplier();
    if (m > 1) text(ctx, `x${m}`, 30, 175, 60, c1, 'left');
    for (const f of this.floaters) {
      ctx.globalAlpha = 1 - f.age;
      text(ctx, f.str, f.x, f.y - 60 - f.age * 100, 60, f.color ?? '#fff');
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
      ctx.fillRect(0, 0, field.w, field.h);
    }
  }
}

export default {
  id: 'run',
  name: 'Rennen',
  duration: 60,
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.12, -r * 0.5);
      ctx.lineTo(s * r * 0.45, r * 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([r * 0.16, r * 0.16]);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.45);
    ctx.lineTo(0, r * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  },
  create: (env) => new Run(env),
};
