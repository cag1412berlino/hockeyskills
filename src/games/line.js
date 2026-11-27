// Spiel "Linie": Den Ball an einer geschwungenen Linie entlangführen und die Lichtpunkte einsammeln.
// Unterwegs gibt es einen Stopp-Punkt: dort muss der Ball kurz ruhig liegen.
// Ab "Mittel" pendeln Stachelbälle über die Linie – abwarten und im richtigen Moment durch.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, villain, star, tone, text } from '../ui.js';
import { Fx, Rest } from './common.js';

const LEVELS = {
  1: { tol: 95, points: 4, obstacles: 0, period: 3.5 },
  2: { tol: 72, points: 5, obstacles: 2, period: 3.2 },
  3: { tol: 54, points: 6, obstacles: 3, period: 2.4 },
};
const HOLD = 0.8; // Sekunden, die der Ball am Stopp-Punkt ruhig liegen muss

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Weiche Kurve durch die Stützpunkte, als Liste dicht liegender Punkte. */
export function spline(ctrl, field) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[i - 1] ?? ctrl[i], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[i + 2] ?? ctrl[i + 1];
    const steps = Math.max(8, Math.round(dist(p1, p2) / 10));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push({
        x: Math.min(field.w - 60, Math.max(60, f(p0.x, p1.x, p2.x, p3.x))),
        y: Math.min(field.h - 60, Math.max(190, f(p0.y, p1.y, p2.y, p3.y))),
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
    this.carry = 0;
    this.pellets = 0;
    this.dir = 1;
    this.fx = new Fx();
    this.newPath(null);
  }

  /** Neue Linie quer über das Feld; sie beginnt dort, wo die letzte aufgehört hat. */
  newPath(start) {
    const { env, p } = this;
    const { field } = env;
    const n = p.points + (env.stage >= 2 ? 1 : 0); // später mehr Kurven
    const m = 110;
    const flip = Math.random() < 0.5 ? 0 : 1;
    const ctrl = [];
    for (let i = 0; i < n; i++) {
      const fx = i / (n - 1);
      ctrl.push({
        x: this.dir > 0 ? m + fx * (field.w - 2 * m) : field.w - m - fx * (field.w - 2 * m),
        y: (i + flip) % 2 ? 220 + Math.random() * 220 : 620 + Math.random() * 250,
      });
    }
    if (start) ctrl[0] = { ...start };
    this.path = spline(ctrl, field);
    this.idx = 0;
    this.tol = p.tol * (1 - 0.07 * env.stage); // mit jeder Stufe muss man genauer führen
    // Stopp-Punkt ungefähr in der Mitte
    this.stopAt = Math.round((this.path.length - 1) * (0.4 + Math.random() * 0.2));
    this.rest = new Rest(HOLD, 24);
    this.stopDone = false;
    this.obstacles = [];
    const count = p.obstacles + (env.stage >= 3 ? 1 : 0);
    for (let k = 1; k <= count; k++) {
      let j = Math.round((this.path.length - 1) * (k / (count + 1)));
      if (Math.abs(j - this.stopAt) < 14) j += 18; // nicht auf den Stopp-Punkt legen
      j = Math.min(this.path.length - 2, j);
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
    const { env, p, path, fx } = this;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    fx.update(dt);

    for (const o of this.obstacles) {
      const s = Math.sin((this.time * Math.PI * 2 * env.ramp) / p.period + o.phase) * 170;
      o.x = o.cx + o.nx * s;
      o.y = o.cy + o.ny * s;
    }
    if (!ball.visible) return;

    // Am Stopp-Punkt geht es erst weiter, wenn der Ball kurz ruhig gelegen hat.
    const limit = this.stopDone ? path.length : this.stopAt + 1;
    // Nur ein kurzes Stück vorausschauen, damit man die Linie nicht abkürzen kann.
    let best = this.idx;
    for (let k = this.idx; k < Math.min(limit, this.idx + 12); k++) {
      if (dist(ball, path[k]) < this.tol) best = k;
    }
    if (best > this.idx) {
      this.carry += best - this.idx;
      this.idx = best;
      while (this.carry >= 5) {
        this.carry -= 5;
        this.pellets++;
        env.sound.blip();
        // Jeder Lichtpunkt zählt; alle sechs Punkte am Stück gibt es einen Serien-Treffer.
        if (this.pellets % 6 === 0) env.combo(5, 4); else env.addScore(env.mult);
      }
    }

    if (!this.stopDone && this.idx >= this.stopAt) {
      const s = path[this.stopAt];
      // "Ruhig" heißt: bleibt in einem kleinen Umkreis. Die Geschwindigkeit taugt dafür nicht,
      // weil das Kamerabild immer leicht zittert und ein liegender Ball dann scheinbar rast.
      if (dist(ball, s) >= this.tol) this.rest.reset();
      else if (this.rest.update(dt, ball)) {
        this.stopDone = true;
        const points = env.combo(15, 3);
        env.sound.power();
        fx.text(s.x, s.y, `Stopp! +${points}`, env.palette[1]);
        fx.ring(s.x, s.y, env.palette[1], 160);
      }
    }

    if (this.hurt <= 0) {
      for (const o of this.obstacles) {
        if (dist(ball, o) < o.r * 0.8 + BALL_RADIUS) {
          env.addScore(-15);
          env.miss();
          env.sound.bad();
          env.shake(18);
          this.hurt = 1.2;
          fx.flash(0.35);
          fx.text(o.x, o.y, '-15');
          break;
        }
      }
    }

    if (this.idx >= path.length - 1) {
      const end = path[path.length - 1];
      const points = env.combo(40, 3);
      env.sound.win();
      fx.text(end.x, end.y, `+${points}`, env.palette[0], 70);
      fx.burst(end.x, end.y, env.palette[0], 30);
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

    // Noch offener Teil: zarte Spur mit Lichtpunkten zum Einsammeln
    this.trace(ctx, idx, last);
    ctx.lineWidth = this.tol * 0.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.stroke();
    ctx.fillStyle = tone(c2, 70);
    glow(ctx, c2, 14);
    for (let i = idx + 5 - (idx % 5); i < last; i += 5) {
      ctx.beginPath();
      ctx.arc(path[i].x, path[i].y, 6 + 2 * Math.sin(this.time * 5 + i), 0, Math.PI * 2);
      ctx.fill();
    }
    noGlow(ctx);

    // Geschaffter Teil leuchtet
    if (idx > 0) {
      this.trace(ctx, 0, idx);
      ctx.lineWidth = 6;
      ctx.strokeStyle = c0;
      glow(ctx, c0, 24);
      ctx.stroke();
      noGlow(ctx);
      ctx.lineWidth = 3;
      ctx.strokeStyle = tone(c0, 88);
      ctx.stroke();
    }

    // Stopp-Punkt: Ring, der sich füllt, solange der Ball ruhig liegt
    if (!this.stopDone) {
      const s = path[this.stopAt];
      ctx.beginPath();
      ctx.arc(s.x, s.y, 58, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,10,30,0.8)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = c1;
      glow(ctx, c1, 20);
      ctx.stroke();
      if (this.rest.progress > 0) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 46, -Math.PI / 2, -Math.PI / 2 + this.rest.progress * Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      noGlow(ctx);
      text(ctx, 'Stopp', s.x, s.y + 2, 30, '#fff', 'center', 0);
    }

    // Ziel und aktuelle Stelle ("hier geht es weiter")
    glow(ctx, c1, 22);
    star(ctx, path[last].x, path[last].y, 40 + 5 * Math.sin(this.time * 5), tone(c1, 68), this.time);
    noGlow(ctx);
    const pulse = 26 + 10 * Math.sin(this.time * 7);
    ctx.beginPath();
    ctx.arc(path[idx].x, path[idx].y, pulse, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff';
    glow(ctx, c0, 18);
    ctx.stroke();
    noGlow(ctx);

    for (const o of this.obstacles) villain(ctx, 'saw', o.x, o.y, o.r, this.time, this.look);
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'line',
  hint: 'Führe den Ball an der Linie entlang!',
  name: 'Linie',
  duration: 60,
  scale: 0.4,
  medals: [[330, 1330, 2770], [20, 390, 940], [20, 50, 310]],
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
