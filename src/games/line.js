// Spiel "Linie": Den Ball an einer geschwungenen Linie entlangführen und die Punkte einsammeln.
// Ab "Mittel" pendeln Stachelbälle über die Linie – abwarten und im richtigen Moment durch.
import { BALL_RADIUS } from '../engine.js';
import { text, glow, noGlow, hazard, star } from '../ui.js';

const LEVELS = {
  1: { tol: 95, points: 4, obstacles: 0, period: 0 },
  2: { tol: 70, points: 5, obstacles: 2, period: 3.2 },
  3: { tol: 52, points: 6, obstacles: 3, period: 2.3 },
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Weiche Kurve durch die Stützpunkte, als Liste dicht liegender Punkte. */
function spline(ctrl, field) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[i - 1] ?? ctrl[i], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[i + 2] ?? ctrl[i + 1];
    const steps = Math.max(8, Math.round(dist(p1, p2) / 10));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push({
        x: Math.min(field.w - 60, Math.max(60, f(p0.x, p1.x, p2.x, p3.x))),
        y: Math.min(field.h - 60, Math.max(180, f(p0.y, p1.y, p2.y, p3.y))),
      });
    }
  }
  out.push({ ...ctrl[ctrl.length - 1] });
  return out;
}

class Line {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.hurt = 0;
    this.flash = 0;
    this.carry = 0;
    this.dir = 1;
    this.floaters = [];
    this.newPath(null);
  }

  /** Neue Linie quer über das Feld; sie beginnt dort, wo die letzte aufgehört hat. */
  newPath(start) {
    const { field } = this.env;
    const n = this.p.points;
    const m = 110;
    const flip = Math.random() < 0.5 ? 0 : 1;
    const ctrl = [];
    for (let i = 0; i < n; i++) {
      const fx = i / (n - 1);
      ctrl.push({
        x: this.dir > 0 ? m + fx * (field.w - 2 * m) : field.w - m - fx * (field.w - 2 * m),
        y: (i + flip) % 2 ? 210 + Math.random() * 220 : 620 + Math.random() * 250,
      });
    }
    if (start) ctrl[0] = { ...start };
    this.path = spline(ctrl, field);
    this.idx = 0;
    this.obstacles = [];
    for (let k = 1; k <= this.p.obstacles; k++) {
      const j = Math.round((this.path.length - 1) * (k / (this.p.obstacles + 1)));
      const a = this.path[j - 1], b = this.path[j + 1];
      const len = dist(a, b) || 1;
      this.obstacles.push({
        cx: this.path[j].x, cy: this.path[j].y,
        nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len, // quer zur Linie
        phase: Math.random() * Math.PI * 2, r: 44, x: 0, y: 0,
      });
    }
    this.dir *= -1;
  }

  update(dt, ball) {
    const { env, p, path } = this;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.flash = Math.max(0, this.flash - dt);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1);

    for (const o of this.obstacles) {
      const s = Math.sin((this.time * Math.PI * 2) / p.period + o.phase) * 170;
      o.x = o.cx + o.nx * s;
      o.y = o.cy + o.ny * s;
    }
    if (!ball.visible) return;

    // Nur ein kurzes Stück vorausschauen, damit man die Linie nicht abkürzen kann.
    let best = this.idx;
    for (let k = this.idx; k < Math.min(path.length, this.idx + 12); k++) {
      if (dist(ball, path[k]) < p.tol) best = k;
    }
    if (best > this.idx) {
      this.carry += best - this.idx;
      this.idx = best;
      while (this.carry >= 5) {
        this.carry -= 5;
        env.addScore(1);
        env.sound.blip();
      }
    }

    if (this.hurt <= 0) {
      for (const o of this.obstacles) {
        if (dist(ball, o) < o.r * 0.8 + BALL_RADIUS) {
          env.addScore(-15);
          env.sound.bad();
          this.hurt = 1.2;
          this.flash = 0.4;
          this.floaters.push({ x: o.x, y: o.y, age: 0, str: '-15' });
          break;
        }
      }
    }

    if (this.idx >= path.length - 1) {
      const end = path[path.length - 1];
      env.addScore(50);
      env.sound.win();
      this.floaters.push({ x: end.x, y: end.y, age: 0, str: '+50', color: env.palette[0] });
      this.newPath(end);
    }
  }

  trace(ctx, from, to) {
    ctx.beginPath();
    for (let i = from; i <= to; i++) ctx.lineTo(this.path[i].x, this.path[i].y);
  }

  draw(ctx) {
    const { env, path, idx } = this;
    const [c0, c1, c2] = env.palette;
    const last = path.length - 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Noch offener Teil: dunkle Spur mit Punkten zum Einsammeln
    this.trace(ctx, idx, last);
    ctx.lineWidth = 30;
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.stroke();
    ctx.fillStyle = c2;
    glow(ctx, c2, 14);
    for (let i = idx + 5 - (idx % 5); i < last; i += 5) ctx.fillRect(path[i].x - 6, path[i].y - 6, 12, 12);
    noGlow(ctx);

    // Geschaffter Teil leuchtet
    if (idx > 0) {
      this.trace(ctx, 0, idx);
      ctx.lineWidth = 8;
      ctx.strokeStyle = c0;
      glow(ctx, c0, 22);
      ctx.stroke();
      noGlow(ctx);
    }

    // Ziel und aktuelle Stelle ("hier geht es weiter")
    star(ctx, path[last].x, path[last].y, 44 + 5 * Math.sin(this.time * 5), c1, this.time);
    const pulse = 30 + 14 * Math.sin(this.time * 7);
    ctx.beginPath();
    ctx.arc(path[idx].x, path[idx].y, pulse, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    glow(ctx, c0, 18);
    ctx.stroke();
    noGlow(ctx);

    for (const o of this.obstacles) hazard(ctx, o.x, o.y, o.r, this.time * 2);
    for (const f of this.floaters) {
      ctx.globalAlpha = 1 - f.age;
      text(ctx, f.str, f.x, f.y - 50 - f.age * 100, 60, f.color ?? '#fff');
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
      ctx.fillRect(0, 0, env.field.w, env.field.h);
    }
  }
}

export default {
  id: 'line',
  name: 'Linie',
  duration: 60,
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.065;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, r * 0.15);
    ctx.bezierCurveTo(-r * 0.25, -r * 0.7, r * 0.2, r * 0.75, r * 0.55, -r * 0.15);
    ctx.stroke();
  },
  create: (env) => new Line(env),
};
