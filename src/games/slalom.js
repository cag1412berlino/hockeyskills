// Spiel "Slalom": Den Ball der Reihe nach durch die leuchtenden Tore führen.
// Ab "Mittel" kosten berührte Torpfosten Punkte, auf "Schwer" bewegen sich die Tore.
import { BALL_RADIUS } from '../engine.js';
import { text, glow, noGlow } from '../ui.js';

const LEVELS = {
  1: { width: 250, gates: 4, posts: false, move: 0 },
  2: { width: 185, gates: 5, posts: true, move: 0 },
  3: { width: 150, gates: 5, posts: true, move: 70 },
};
const POST = 22;

/** Schneiden sich die Strecken p1-p2 und p3-p4? */
function crosses(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return d(p3, p4, p1) * d(p3, p4, p2) < 0 && d(p1, p2, p3) * d(p1, p2, p4) < 0;
}

class Slalom {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.hurt = 0;
    this.down = true;
    this.prev = null;
    this.floaters = [];
    this.newCourse();
  }

  newCourse() {
    const { field } = this.env;
    const n = this.p.gates;
    const side = Math.random() < 0.5 ? 1 : -1;
    this.gates = [];
    for (let i = 0; i < n; i++) {
      const row = this.down ? i : n - 1 - i;
      this.gates.push({
        cx: field.w / 2 + side * (i % 2 ? -1 : 1) * field.w * (0.17 + Math.random() * 0.08),
        y: 250 + (row * 640) / (n - 1),
        phase: Math.random() * Math.PI * 2,
        passed: 0,
      });
    }
    this.next = 0;
    this.down = !this.down;
  }

  /** Die beiden Pfosten eines Tors zum aktuellen Zeitpunkt. */
  posts(g) {
    const x = g.cx + this.p.move * Math.sin(this.time * 1.3 + g.phase);
    const half = this.p.width / 2;
    return [{ x: x - half, y: g.y }, { x: x + half, y: g.y }];
  }

  update(dt, ball) {
    const { env } = this;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    for (const g of this.gates) if (g.passed) g.passed += dt;
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1);

    if (!ball.visible) { this.prev = null; return; }
    const cur = { x: ball.x, y: ball.y };
    const gate = this.gates[this.next];
    const [a, b] = this.posts(gate);

    if (this.p.posts && this.hurt <= 0) {
      for (const g of this.gates) {
        if (this.posts(g).some((q) => Math.hypot(q.x - cur.x, q.y - cur.y) < POST + BALL_RADIUS * 0.6)) {
          env.addScore(-5);
          env.sound.bad();
          this.hurt = 1;
          this.floaters.push({ x: cur.x, y: cur.y, age: 0, str: '-5' });
          break;
        }
      }
    }

    if (this.prev && crosses(this.prev, cur, a, b)) {
      gate.passed = 0.001;
      env.addScore(10);
      env.sound.pop(this.next);
      this.floaters.push({ x: (a.x + b.x) / 2, y: a.y, age: 0, str: '+10', color: env.palette[0] });
      this.next++;
      if (this.next >= this.gates.length) {
        env.addScore(30);
        env.sound.win();
        this.floaters.push({ x: env.field.w / 2, y: 520, age: 0, str: 'Bonus +30', color: env.palette[1] });
        this.newCourse();
      }
    }
    this.prev = cur;
  }

  draw(ctx) {
    const { env } = this;
    const [c0, c1, c2] = env.palette;
    this.gates.forEach((g, i) => {
      const [a, b] = this.posts(g);
      const active = i === this.next;
      const color = g.passed ? c0 : active ? c1 : c2;
      ctx.globalAlpha = g.passed ? Math.max(0.25, 1 - g.passed) : active ? 1 : 0.65;

      // Lichtschranke zwischen den Pfosten
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = active ? 7 : 3;
      ctx.setLineDash(active ? [16, 12] : [6, 14]);
      ctx.lineDashOffset = -this.time * 60;
      ctx.strokeStyle = color;
      if (active) glow(ctx, color, 24);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const q of [a, b]) {
        ctx.beginPath();
        ctx.moveTo(q.x, q.y - POST * 1.3);
        ctx.lineTo(q.x + POST, q.y + POST * 0.8);
        ctx.lineTo(q.x - POST, q.y + POST * 0.8);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      noGlow(ctx);
      if (!g.passed) text(ctx, i + 1, (a.x + b.x) / 2, a.y - 56, active ? 64 : 44, color, 'center', active ? 16 : 0);
      ctx.globalAlpha = 1;
    });
    for (const f of this.floaters) {
      ctx.globalAlpha = 1 - f.age;
      text(ctx, f.str, f.x, f.y - 40 - f.age * 100, 60, f.color ?? '#fff');
    }
    ctx.globalAlpha = 1;
  }
}

export default {
  id: 'slalom',
  name: 'Slalom',
  duration: 60,
  icon(ctx, r) {
    ctx.fillStyle = '#fff';
    for (const [x, y] of [[-0.35, -0.3], [0.35, 0], [-0.35, 0.3]]) {
      ctx.beginPath();
      ctx.moveTo(r * x, r * y - r * 0.16);
      ctx.lineTo(r * x + r * 0.13, r * y + r * 0.1);
      ctx.lineTo(r * x - r * 0.13, r * y + r * 0.1);
      ctx.fill();
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.05;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.05, -r * 0.5); ctx.lineTo(-r * 0.05, -r * 0.3);
    ctx.lineTo(r * 0.05, 0); ctx.lineTo(-r * 0.05, r * 0.3); ctx.lineTo(-r * 0.05, r * 0.5);
    ctx.stroke();
  },
  create: (env) => new Slalom(env),
};
