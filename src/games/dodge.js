// Spiel "Ausweichen": Stachelbälle fliegen über das Feld. Sterne einsammeln, nicht treffen lassen.
// Drei Leben; eine Warnung am Rand zeigt, wo der nächste Stachelball hereinkommt.
import { BALL_RADIUS } from '../engine.js';
import { text, glow, noGlow, hazard, star } from '../ui.js';

const LEVELS = {
  1: { speed: 150, every: 2.2, r: 60, max: 3 },
  2: { speed: 250, every: 1.4, r: 52, max: 5 },
  3: { speed: 360, every: 1.0, r: 46, max: 7 },
};
const WARN = 0.9; // Sekunden Vorwarnung

class Dodge {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.hurt = 0;
    this.flash = 0;
    this.spawnIn = 1;
    this.survive = 0;
    this.hazards = [];
    this.floaters = [];
    this.star = null;
  }

  placeStar(ball) {
    const { field } = this.env;
    for (let tries = 0; tries < 20; tries++) {
      const s = { x: 90 + Math.random() * (field.w - 180), y: 220 + Math.random() * (field.h - 310) };
      this.star = s;
      if (!ball.visible || Math.hypot(s.x - ball.x, s.y - ball.y) > 320) return;
    }
  }

  spawn(ball, ramp) {
    const { field } = this.env;
    const r = this.p.r;
    const edge = Math.floor(Math.random() * 4);
    const along = 0.15 + Math.random() * 0.7;
    const from = [
      { x: along * field.w, y: -r }, { x: field.w + r, y: along * field.h },
      { x: along * field.w, y: field.h + r }, { x: -r, y: along * field.h },
    ][edge];
    // Ab "Mittel" zielt jeder zweite Stachelball auf den Ball.
    const aim = this.env.level > 1 && ball.visible && Math.random() < 0.5
      ? ball
      : { x: field.w * (0.25 + Math.random() * 0.5), y: field.h * (0.3 + Math.random() * 0.45) };
    const len = Math.hypot(aim.x - from.x, aim.y - from.y);
    const speed = this.p.speed * ramp;
    this.hazards.push({
      x: from.x, y: from.y, r, wait: WARN, age: 0,
      vx: ((aim.x - from.x) / len) * speed, vy: ((aim.y - from.y) / len) * speed,
      wx: Math.min(field.w - 40, Math.max(40, from.x)), wy: Math.min(field.h - 40, Math.max(40, from.y)),
    });
  }

  update(dt, ball) {
    const { env, p } = this;
    const { field } = env;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.flash = Math.max(0, this.flash - dt);
    const ramp = 1 + 0.4 * Math.min(1, this.time / 60);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1);

    if (!this.star) this.placeStar(ball);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.hazards.length < p.max) {
      this.spawn(ball, ramp);
      this.spawnIn = p.every / ramp;
    }

    this.hazards = this.hazards.filter((h) => {
      if (h.wait > 0) { h.wait -= dt; return true; }
      h.age += dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      const out = h.x < -h.r - 20 || h.y < -h.r - 20 || h.x > field.w + h.r + 20 || h.y > field.h + h.r + 20;
      return !(out && h.age > 1);
    });

    if (!ball.visible) return;

    // Jede überstandene Sekunde zählt.
    this.survive += dt;
    if (this.survive >= 1) { this.survive -= 1; env.addScore(1); }

    if (Math.hypot(this.star.x - ball.x, this.star.y - ball.y) < 50 + BALL_RADIUS) {
      env.addScore(10);
      env.sound.pop(2);
      this.floaters.push({ x: this.star.x, y: this.star.y, age: 0, str: '+10', color: env.palette[0] });
      this.placeStar(ball);
    }

    if (this.hurt <= 0) {
      for (const h of this.hazards) {
        if (h.wait <= 0 && Math.hypot(h.x - ball.x, h.y - ball.y) < h.r * 0.75 + BALL_RADIUS) {
          env.sound.bad();
          this.hurt = 1.5;
          this.flash = 0.5;
          env.loseLife();
          break;
        }
      }
    }
  }

  draw(ctx) {
    const { env } = this;
    const [c0, c1] = env.palette;
    if (this.star) {
      glow(ctx, c1, 26);
      star(ctx, this.star.x, this.star.y, 50 + 6 * Math.sin(this.time * 6), c1, this.time * 1.5);
      noGlow(ctx);
    }
    for (const h of this.hazards) {
      if (h.wait > 0) {
        // Blinkende Warnung am Rand
        if (Math.floor(h.wait * 8) % 2 === 0) text(ctx, '!', h.wx, h.wy, 110);
      } else {
        hazard(ctx, h.x, h.y, h.r, this.time * 3);
      }
    }
    for (const f of this.floaters) {
      ctx.globalAlpha = 1 - f.age;
      text(ctx, f.str, f.x, f.y - 40 - f.age * 100, 60, f.color ?? '#fff');
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.8})`;
      ctx.fillRect(0, 0, env.field.w, env.field.h);
    }
  }
}

export default {
  id: 'dodge',
  name: 'Ausweichen',
  duration: 60,
  lives: 3,
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.05;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const rr = r * (i % 2 ? 0.26 : 0.46);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.stroke();
  },
  create: (env) => new Dodge(env),
};
