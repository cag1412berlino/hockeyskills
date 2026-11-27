// Spiel "Wolke": Ein Ziel treffen – aber dazwischen wabert eine Gewitterwolke.
// Die Wolke verändert ständig ihre Form und wird größer und kleiner. Der Ball muss außen herum.
// Auf "Mittel" pendelt sie, auf "Schwer" stellt sie sich in den Weg. In späten Stufen
// wandert das Ziel und eine zweite kleine Wolke kreist um die große.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, creature, eyes } from '../ui.js';
import { Fx, StopZones } from './common.js';

const LEVELS = {
  1: { r: 125, target: 95, sway: 0, chase: 0, stop: 380 },
  2: { r: 115, target: 78, sway: 130, chase: 0, stop: 300 },
  3: { r: 118, target: 52, sway: 0, chase: 175, stop: 200 },
};

/** Eine Wolke als weiche, sich verformende Blase. */
class Blob {
  constructor(r) {
    this.base = r;
    this.x = 0;
    this.y = 0;
    this.seed = Math.random() * 100;
    this.breathe = 0.2; // wie stark sie größer und kleiner wird
    this.angry = 0;
  }

  /** Abstand des Randes von der Mitte in Richtung a zum Zeitpunkt t. */
  radius(a, t) {
    const s = this.seed;
    const size = 1 + this.breathe * Math.sin(t * 0.9 + s);
    const wobble = 0.16 * Math.sin(3 * a + t * 1.3 + s) + 0.11 * Math.sin(5 * a - t * 1.7 + s * 2) + 0.07 * Math.sin(2 * a + t * 0.8);
    return this.base * size * (1 + wobble);
  }

  touches(ball, t) {
    const a = Math.atan2(ball.y - this.y, ball.x - this.x);
    return Math.hypot(ball.x - this.x, ball.y - this.y) < this.radius(a, t) * 0.92 + BALL_RADIUS * 0.4;
  }

  draw(ctx, t, look) {
    const { x, y } = this;
    const n = 56;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius(a, t);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(x, y - this.base * 0.3, this.base * 0.1, x, y, this.base * 1.4);
    g.addColorStop(0, this.angry > 0 ? '#f4f4ff' : '#8f8fa8');
    g.addColorStop(1, this.angry > 0 ? '#9a9ab8' : '#2c2c40');
    ctx.fillStyle = g;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';
    glow(ctx, '#fff', this.angry > 0 ? 44 : 20);
    ctx.fill();
    ctx.stroke();
    noGlow(ctx);
    // Gelegentliches Wetterleuchten im Inneren
    if (Math.sin(t * 2.3 + this.seed) > 0.86) {
      ctx.beginPath();
      let bx = x - this.base * 0.1, by = y + this.base * 0.2;
      ctx.moveTo(bx, by);
      for (let i = 0; i < 4; i++) {
        bx += (i % 2 ? -1 : 1) * this.base * 0.22;
        by += this.base * 0.16;
        ctx.lineTo(bx, by);
      }
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    eyes(ctx, x, y - this.base * 0.1, this.base * 0.75, look?.x ?? x, look?.y ?? y + 1, true);
  }
}

class Cloud {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.hurt = 0;
    this.roundTime = 0;
    this.target = null;
    this.cloud = new Blob(this.p.r);
    this.mini = new Blob(this.p.r * 0.45);
    this.fx = new Fx();
    this.stops = new StopZones(this.p.stop);
  }

  /** Neues Ziel weit weg vom Ball, die Wolke genau dazwischen. */
  newRound(ball) {
    const { field, palette } = this.env;
    const from = ball.visible ? ball : { x: field.w / 2, y: field.h / 2 };
    const r = this.p.target * (1 - 0.06 * this.env.stage);
    // Von mehreren zufälligen Stellen die nehmen, die am weitesten vom Ball entfernt ist.
    let t = null, far = -1;
    for (let tries = 0; tries < 8; tries++) {
      const c = { x: r + 40 + Math.random() * (field.w - 2 * r - 80), y: r + 190 + Math.random() * (field.h - 2 * r - 230), r };
      const d = Math.hypot(c.x - from.x, c.y - from.y);
      if (d > far) { far = d; t = c; }
    }
    t.color = palette[Math.floor(Math.random() * palette.length)];
    const a = Math.random() * Math.PI * 2;
    t.vx = Math.cos(a) * 45;
    t.vy = Math.sin(a) * 45;
    this.target = t;
    const len = Math.hypot(t.x - from.x, t.y - from.y) || 1;
    const c = this.cloud;
    c.bx = c.x = (from.x + t.x) / 2;                // Grundposition
    c.by = c.y = (from.y + t.y) / 2;
    c.nx = -(t.y - from.y) / len;                   // quer zum direkten Weg
    c.ny = (t.x - from.x) / len;
    this.roundTime = 0;
  }

  update(dt, ball) {
    const { env, p, fx, cloud: c, mini } = this;
    const { field } = env;
    this.time += dt;
    this.roundTime += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    c.angry = mini.angry = this.hurt > 0.8 ? 1 : 0;
    c.breathe = 0.18 + 0.06 * env.stage; // atmet mit jeder Stufe stärker
    fx.update(dt);

    if (this.stops.update(dt, ball).length) {
      env.addScore(-5);
      env.miss();
      env.sound.bad();
      fx.text(ball.x, ball.y, 'Zu weit! -5');
    }

    if (!this.target) this.newRound(ball);
    const t = this.target;

    // Ab Stufe 1 wandert das Ziel langsam.
    if (env.stage >= 1) {
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if (t.x < t.r + 30 || t.x > field.w - t.r - 30) t.vx *= -1;
      if (t.y < t.r + 180 || t.y > field.h - t.r - 30) t.vy *= -1;
    }

    if (p.sway) {
      const s = Math.sin(this.time * 1.6 * env.ramp) * p.sway;
      c.x = c.bx + c.nx * s;
      c.y = c.by + c.ny * s;
    }
    if (p.chase && ball.visible) {
      // Die Wolke schiebt sich immer wieder zwischen Ball und Ziel.
      const gx = ball.x + (t.x - ball.x) * 0.55, gy = ball.y + (t.y - ball.y) * 0.55;
      const d = Math.hypot(gx - c.x, gy - c.y);
      const step = Math.min(d, p.chase * env.ramp * dt);
      if (d > 1) { c.x += ((gx - c.x) / d) * step; c.y += ((gy - c.y) / d) * step; }
    }
    // Die Wolke darf das Ziel nie ganz verdecken.
    const dc = Math.hypot(c.x - t.x, c.y - t.y);
    const min = p.r * 1.3 + t.r + 30;
    if (dc < min && dc > 0) { c.x = t.x + ((c.x - t.x) / dc) * min; c.y = t.y + ((c.y - t.y) / dc) * min; }

    // Ab Stufe 2 kreist eine kleine Wolke um die große.
    this.hasMini = env.stage >= 2;
    mini.x = c.x + Math.cos(this.time * 1.1) * p.r * 2.3;
    mini.y = c.y + Math.sin(this.time * 1.1) * p.r * 2.3;

    if (!ball.visible) return;

    if (this.hurt <= 0 && (c.touches(ball, this.time) || (this.hasMini && mini.touches(ball, this.time)))) {
      env.addScore(-10);
      env.miss();
      env.sound.bad();
      env.shake(18);
      this.hurt = 1.2;
      fx.flash(0.4);
      fx.text(ball.x, ball.y, '-10');
    }

    if (Math.hypot(ball.x - t.x, ball.y - t.y) < t.r + BALL_RADIUS) {
      // schnell = mehr Punkte
      const points = env.combo(10 + Math.max(0, Math.round(10 - this.roundTime * 2)), 4);
      env.sound.pop(env.mult);
      fx.text(t.x, t.y, `+${points}`, t.color, 50 + env.mult * 8);
      fx.burst(t.x, t.y, t.color);
      fx.ring(t.x, t.y, t.color, t.r * 1.8);
      this.stops.add(t.x, t.y, t.color);
      this.newRound(ball);
    }
  }

  draw(ctx) {
    const { target: t } = this;
    this.stops.draw(ctx);
    if (t) {
      const k = Math.min(1, this.roundTime / 0.3);
      creature(ctx, t.x, t.y, t.r * k * (1.25 - 0.25 * k), t.color, this.look, this.time);
      this.cloud.draw(ctx, this.time, this.look);
      if (this.hasMini) this.mini.draw(ctx, this.time, this.look);
    }
    this.fx.draw(ctx, this.env.field);
  }
}

export default {
  id: 'cloud',
  hint: 'Triff die Kugel, aber weiche der Wolke aus!',
  name: 'Wolke',
  duration: 60,
  scale: 1.25,
  medals: [[300, 1020, 1620], [110, 620, 1350], [40, 370, 1070]],
  icon(ctx, r) {
    const s = r * 0.42;
    ctx.beginPath();
    for (const [px, py, pr] of [[-0.55, 0.15, 0.5], [0, -0.25, 0.62], [0.55, 0.1, 0.52], [-0.1, 0.3, 0.55], [0.3, 0.32, 0.45]]) {
      ctx.moveTo((px + pr) * s, py * s);
      ctx.arc(px * s, py * s, pr * s, 0, Math.PI * 2);
    }
    ctx.lineWidth = r * 0.085;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#101020';
    ctx.fill();
  },
  create: (env) => new Cloud(env),
};
