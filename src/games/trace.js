// Spiel "Zeichnen": Formen mit dem Ball nachfahren – Kreis, Dreieck, Stern, Herz und mehr.
// Am Ende jeder Form gibt es Punkte nach Genauigkeit: Je näher an der Linie, desto mehr.
// Die Formen werden der Reihe nach schwieriger, die erlaubte Abweichung mit jeder Stufe kleiner.
import { glow, noGlow, text, tone } from '../ui.js';
import { Fx, resample, nearestOnPath, OffTrack } from './common.js';

const LEVELS = { 1: { tol: 95 }, 2: { tol: 72 }, 3: { tol: 42 } };

const ring = (n, f) => Array.from({ length: n + 1 }, (_, i) => f((i / n) * Math.PI * 2, i));
const polygon = (n, rot = -Math.PI / 2) => ring(n, (a) => ({ x: Math.cos(a + rot), y: Math.sin(a + rot) }));

// Formen in einem Kästchen von -1 bis 1; sie werden der Reihe nach gespielt.
const SHAPES = [
  { name: 'Kreis', pts: polygon(48) },
  { name: 'Dreieck', pts: polygon(3) },
  { name: 'Quadrat', pts: polygon(4, -Math.PI * 0.75) },
  { name: 'Zickzack', pts: [[-1, 0.7], [-0.5, -0.7], [0, 0.7], [0.5, -0.7], [1, 0.7]].map(([x, y]) => ({ x, y })) },
  { name: 'Stern', pts: ring(10, (a, i) => ({ x: Math.cos(a - Math.PI / 2) * (i % 2 ? 0.45 : 1), y: Math.sin(a - Math.PI / 2) * (i % 2 ? 0.45 : 1) })) },
  { name: 'Herz', pts: ring(48, (a) => ({ x: Math.sin(a) ** 3, y: -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16 - 0.1 })) },
  { name: 'Spirale', pts: Array.from({ length: 73 }, (_, i) => ({ x: Math.cos(i * 0.26) * (1 - i / 90), y: Math.sin(i * 0.26) * (1 - i / 90) })) },
];
const SIZE = 310;

class Trace {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.n = 0;
    this.fx = new Fx();
    this.load();
  }

  load() {
    const { field } = this.env;
    this.shape = SHAPES[this.n % SHAPES.length];
    this.env.say(this.shape.name);
    this.path = resample(this.shape.pts.map((q) => ({ x: field.w / 2 + q.x * SIZE, y: 585 + q.y * SIZE })));
    this.idx = 0;
    this.running = false;
    this.devSum = 0;
    this.devN = 0;
    this.off = false;
    this.guard = new OffTrack({ grace: 0.4, every: 0.5, start: 2, step: 2 });
  }

  tol() {
    return this.p.tol * (1 - 0.07 * this.env.stage);
  }

  update(dt, ball) {
    const { env, path, fx } = this;
    this.time += dt;
    fx.update(dt);
    if (!ball.visible) return;

    if (!this.running) {
      if (Math.hypot(ball.x - path[0].x, ball.y - path[0].y) < 60) {
        this.running = true;
        env.sound.select();
      }
      return;
    }
    // Nur ein Stück voraus suchen: Bei geschlossenen Formen liegt das Ende am Anfang.
    const { k, d } = nearestOnPath(path, ball, this.idx - 6, this.idx + 14);
    this.off = d > this.tol();
    // Neben der Linie: rot blinken und Abzug, je länger, desto mehr
    this.guard.update(dt, this.off, env, this.fx, ball);
    if (this.off) return;
    if (k > this.idx) {
      if (Math.floor(k / 12) > Math.floor(this.idx / 12)) env.sound.blip();
      this.idx = k;
    }
    this.devSum += d;
    this.devN++;

    if (this.idx >= path.length - 3) {
      // Genauigkeit: mittlere Abweichung im Verhältnis zur erlaubten
      const accuracy = Math.max(0, 1 - this.devSum / this.devN / (this.tol() * 0.8));
      // Tempo: Richtzeit aus der Länge der Form (Punkte liegen 10 auseinander)
      const par = (this.path.length * 10) / [250, 320, 400][env.level - 1];
      const points = env.combo(Math.round(10 + 30 * accuracy), 25, { par });
      env.sound.win();
      fx.text(env.field.w / 2, 585, `${Math.round(accuracy * 100)} % genau  +${points}`, env.palette[1], 60);
      fx.burst(path[path.length - 1].x, path[path.length - 1].y, env.palette[1], 26);
      this.n++;
      this.load();
    }
  }

  draw(ctx) {
    const { env, path, idx } = this;
    const [c0, c1, c2] = env.palette;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Vorlage: zarte breite Spur und feine Strichlinie
    ctx.beginPath();
    for (const q of path) ctx.lineTo(q.x, q.y);
    ctx.lineWidth = this.tol() * 0.7;
    ctx.strokeStyle = this.guard.heat > 0.05 ? OffTrack.red(50, 0.3 * this.guard.heat) : 'rgba(255,255,255,0.06)';
    ctx.stroke();
    ctx.setLineDash([4, 16]);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = this.guard.color(tone(c2, 70));
    ctx.stroke();
    ctx.setLineDash([]);

    if (idx > 0) {
      ctx.beginPath();
      for (let i = 0; i <= idx; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.lineWidth = 6;
      ctx.strokeStyle = c0;
      glow(ctx, c0, 24);
      ctx.stroke();
      noGlow(ctx);
      ctx.lineWidth = 3;
      ctx.strokeStyle = tone(c0, 88);
      ctx.stroke();
    }

    // Startpunkt bzw. die Stelle, an der es weitergeht
    const here = path[idx];
    const waiting = !this.running || this.off;
    ctx.beginPath();
    ctx.arc(here.x, here.y, waiting ? 40 + 8 * Math.sin(this.time * 7) : 22, 0, Math.PI * 2);
    ctx.lineWidth = waiting ? 6 : 4;
    ctx.strokeStyle = '#fff';
    glow(ctx, c1, 18);
    ctx.stroke();
    noGlow(ctx);
    if (!this.running) text(ctx, 'Start', here.x, here.y - 72, 36);
    text(ctx, this.shape.name, env.field.w / 2, 215, 50, tone(c1, 78), 'center', 8);
    this.fx.draw(ctx, env.field);
    this.guard.draw(ctx, env.field);
  }
}

export default {
  id: 'trace',
  hint: 'Fahre die Form mit dem Ball genau nach!',
  name: 'Zeichnen',
  duration: 60,
  scale: 2.25,
  medals: [[80, 750, 1650], [30, 510, 1250], [20, 140, 890]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineJoin = 'round';
    ctx.setLineDash([r * 0.1, r * 0.09]);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = r * (i % 2 ? 0.24 : 0.5);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  },
  create: (env) => new Trace(env),
};
