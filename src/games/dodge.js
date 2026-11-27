// Spiel "Ausweichen": Stachelbälle fliegen über das Feld. Sterne einsammeln, nicht treffen lassen.
// Drei Leben; eine Warnung am Rand zeigt, wo der nächste Stachelball hereinkommt.
// Extras: Der Schild fängt einen Treffer ab, die Schneeflocke bremst alle Stachelbälle.
// In späten Stufen fliegen manche Stachelbälle im Zickzack.
import { BALL_RADIUS } from '../engine.js';
import { text, glow, noGlow, villain, randomVillain, tone } from '../ui.js';
import { Fx, randomSpot, drawCollectible, drawPickup, PICKUP_SECONDS } from './common.js';

const LEVELS = {
  1: { speed: 140, every: 2.2, r: 58, max: 3 },
  2: { speed: 220, every: 1.5, r: 50, max: 5 },
  3: { speed: 310, every: 1.1, r: 44, max: 7 },
};
const WARN = 0.9; // Sekunden Vorwarnung

class Dodge {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.hurt = 0;
    this.spawnIn = 1;
    this.survive = 0;
    this.hazards = [];
    this.star = null;
    this.power = null;          // herumliegendes Extra
    this.powerIn = 9 + Math.random() * 5;
    this.shield = false;
    this.slow = 0;              // Sekunden, die die Bremse noch wirkt
    this.fx = new Fx();
  }

  spawn(ball) {
    const { env, p } = this;
    const { field } = env;
    const r = p.r;
    const edge = Math.floor(Math.random() * 4);
    const along = 0.15 + Math.random() * 0.7;
    const from = [
      { x: along * field.w, y: -r }, { x: field.w + r, y: along * field.h },
      { x: along * field.w, y: field.h + r }, { x: -r, y: along * field.h },
    ][edge];
    // Ab "Mittel" zielt jeder zweite Stachelball auf den Ball.
    const aim = env.level > 1 && ball.visible && Math.random() < 0.5
      ? ball
      : { x: field.w * (0.25 + Math.random() * 0.5), y: field.h * (0.3 + Math.random() * 0.45) };
    const len = Math.hypot(aim.x - from.x, aim.y - from.y);
    const speed = p.speed * env.ramp;
    this.hazards.push({
      x: from.x, y: from.y, r, wait: WARN, age: 0,
      vx: ((aim.x - from.x) / len) * speed, vy: ((aim.y - from.y) / len) * speed,
      zigzag: env.stage >= 2 && Math.random() < 0.4,
      face: randomVillain(),
      wx: Math.min(field.w - 40, Math.max(40, from.x)), wy: Math.min(field.h - 40, Math.max(40, from.y)),
    });
  }

  update(dt, ball) {
    const { env, p, fx } = this;
    const { field } = env;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    fx.update(dt);
    const pace = this.slow > 0 ? 0.35 : 1;

    if (!this.star) this.star = randomSpot(field, ball);
    this.spawnIn -= dt * pace;
    if (this.spawnIn <= 0 && this.hazards.length < p.max + Math.floor(env.stage / 2)) {
      this.spawn(ball);
      this.spawnIn = p.every / env.ramp;
    }
    this.powerIn -= dt;
    if (this.powerIn <= 0 && !this.power) {
      this.power = { ...randomSpot(field, ball, 250), kind: this.shield || Math.random() < 0.5 ? 'ice' : 'shield', age: 0 };
      this.powerIn = 12 + Math.random() * 6;
    }
    if (this.power && (this.power.age += dt) > PICKUP_SECONDS) this.power = null;

    this.hazards = this.hazards.filter((h) => {
      if (h.wait > 0) { h.wait -= dt; return true; }
      h.age += dt * pace;
      let { vx, vy } = h;
      if (h.zigzag) {
        // seitliches Pendeln quer zur Flugrichtung
        const len = Math.hypot(vx, vy), s = Math.cos(h.age * 5) * len * 0.9;
        vx += (-h.vy / len) * s;
        vy += (h.vx / len) * s;
      }
      h.x += vx * dt * pace;
      h.y += vy * dt * pace;
      const out = h.x < -h.r - 20 || h.y < -h.r - 20 || h.x > field.w + h.r + 20 || h.y > field.h + h.r + 20;
      return !(out && h.age > 1);
    });

    if (!ball.visible) return;

    // Jede überstandene Sekunde zählt.
    this.survive += dt;
    if (this.survive >= 1) { this.survive -= 1; env.addScore(1); }

    if (Math.hypot(this.star.x - ball.x, this.star.y - ball.y) < 50 + BALL_RADIUS) {
      const points = env.combo(10, 4);
      env.sound.pop(env.mult);
      fx.text(this.star.x, this.star.y, `+${points}`, env.palette[1], 50 + env.mult * 8);
      fx.burst(this.star.x, this.star.y, env.palette[1], 16);
      this.star = randomSpot(field, ball);
    }

    const pw = this.power;
    if (pw && Math.hypot(pw.x - ball.x, pw.y - ball.y) < 46 + BALL_RADIUS) {
      env.sound.power();
      if (pw.kind === 'shield') { this.shield = true; fx.text(pw.x, pw.y, 'Schild!', env.palette[0]); }
      else { this.slow = 4; fx.text(pw.x, pw.y, 'Zeitlupe!', env.palette[2]); }
      fx.ring(pw.x, pw.y, '#fff', 180);
      this.power = null;
    }

    if (this.hurt <= 0) {
      for (const h of this.hazards) {
        if (h.wait <= 0 && Math.hypot(h.x - ball.x, h.y - ball.y) < h.r * 0.75 + BALL_RADIUS) {
          this.hurt = 1.5;
          if (this.shield) {
            // Der Schild fängt den Treffer ab.
            this.shield = false;
            env.sound.select();
            fx.ring(ball.x, ball.y, env.palette[0], 220);
            fx.text(ball.x, ball.y, 'Abgewehrt!', env.palette[0]);
          } else {
            env.sound.bad();
            env.miss();
            env.shake(24);
            fx.flash(0.45);
            env.loseLife();
          }
          break;
        }
      }
    }
  }

  draw(ctx) {
    const { env } = this;
    const [c0, c1, c2] = env.palette;
    if (this.slow > 0) {
      // kühler Schleier, solange die Zeitlupe wirkt
      ctx.fillStyle = tone(c2, 50);
      ctx.globalAlpha = 0.08;
      ctx.fillRect(0, 0, env.field.w, env.field.h);
      ctx.globalAlpha = 1;
    }
    if (this.star) drawCollectible(ctx, this.star, c1, this.time);
    if (this.power) drawPickup(ctx, this.power, this.power.kind, this.power.kind === 'shield' ? c0 : c2, this.time);
    for (const h of this.hazards) {
      if (h.wait > 0) {
        // Blinkende Warnung am Rand
        if (Math.floor(h.wait * 8) % 2 === 0) text(ctx, '!', h.wx, h.wy, 100);
      } else {
        villain(ctx, h.zigzag ? 'dart' : h.face, h.x, h.y, h.r, this.time, this.look, Math.atan2(h.vy, h.vx));
      }
    }
    if (this.shield && this.look) {
      ctx.beginPath();
      ctx.arc(this.look.x, this.look.y, BALL_RADIUS + 36, 0, Math.PI * 2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = c0;
      glow(ctx, c0, 24);
      ctx.stroke();
      noGlow(ctx);
    }
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'dodge',
  hint: 'Sammle Sterne und weiche den Stachelbällen aus!',
  name: 'Ausweichen',
  duration: 60,
  lives: 3,
  scale: 1.05,
  medals: [[200, 600, 1350], [190, 600, 1220], [190, 540, 1210]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.05;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const rr = r * (i % 2 ? 0.28 : 0.46);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.stroke();
  },
  create: (env) => new Dodge(env),
};
