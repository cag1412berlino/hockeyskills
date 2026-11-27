// Spiel "Ziele": Leuchtende Ziele wandern über den Boden.
// Mit dem Ball berühren = Treffer. Auf "Schwer" gibt es Stachelbälle, denen man ausweichen muss.
import { BALL_RADIUS } from '../engine.js';
import { text, glow, noGlow, hazard } from '../ui.js';
import { StopZones, burst } from './common.js';

const LEVELS = {
  1: { r: 120, speed: 25, life: 10, max: 3, every: 1.5, bombs: 0, stop: 380 },
  2: { r: 85, speed: 70, life: 6.5, max: 4, every: 1.1, bombs: 0, stop: 300 },
  3: { r: 62, speed: 120, life: 4.5, max: 5, every: 0.85, bombs: 0.2, stop: 240 },
};

class Targets {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.targets = [];
    this.particles = [];
    this.floaters = [];
    this.spawnIn = 0.2;
    this.time = 0;
    this.flash = 0;
    this.stops = new StopZones(this.p.stop);
  }

  spawn(ball) {
    const { field, palette } = this.env;
    const r = this.p.r;
    for (let tries = 0; tries < 20; tries++) {
      const x = r + 20 + Math.random() * (field.w - 2 * r - 40);
      const y = r + 150 + Math.random() * (field.h - 2 * r - 170);
      if (ball.visible && Math.hypot(x - ball.x, y - ball.y) < r + 220) continue;
      if (this.targets.some((t) => Math.hypot(x - t.x, y - t.y) < r * 2.2)) continue;
      const a = Math.random() * Math.PI * 2;
      const bomb = Math.random() < this.p.bombs;
      this.targets.push({
        x, y, r, bomb, age: 0,
        vx: Math.cos(a) * this.p.speed, vy: Math.sin(a) * this.p.speed,
        color: bomb ? '#fff' : palette[Math.floor(Math.random() * palette.length)],
      });
      return;
    }
  }

  hit(t) {
    const { env } = this;
    if (t.bomb) {
      env.addScore(-20);
      env.sound.bad();
      this.flash = 0.4;
      this.floaters.push({ x: t.x, y: t.y, age: 0, str: '-20' });
    } else {
      // Je schneller nach dem Auftauchen getroffen, desto mehr Punkte (10 bis 20).
      const quick = Math.max(0, 1 - t.age / this.p.life);
      const points = 10 + Math.round(10 * quick);
      env.addScore(points);
      env.sound.pop(Math.round(quick * 5));
      this.floaters.push({ x: t.x, y: t.y, age: 0, str: `+${points}`, color: t.color });
      this.stops.add(t.x, t.y, t.color);
    }
    burst(this.particles, t.x, t.y, t.color);
  }

  update(dt, ball) {
    const { field } = this.env;
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt);
    // Ball nach einem Treffer zu weit durchgerollt?
    for (const z of this.stops.update(dt, ball)) {
      this.env.addScore(-5);
      this.env.sound.bad();
      this.floaters.push({ x: ball.x, y: ball.y, age: 0, str: 'Zu weit -5' });
    }
    const ramp = 1 + 0.5 * Math.min(1, this.time / 60); // wird im Lauf der Runde schneller

    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.targets.length < this.p.max) {
      this.spawn(ball);
      this.spawnIn = this.p.every / ramp;
    }

    this.targets = this.targets.filter((t) => {
      t.age += dt;
      t.x += t.vx * ramp * dt;
      t.y += t.vy * ramp * dt;
      if (t.x < t.r || t.x > field.w - t.r) t.vx *= -1;
      if (t.y < t.r + 130 || t.y > field.h - t.r) t.vy *= -1;
      t.x = Math.min(field.w - t.r, Math.max(t.r, t.x));
      t.y = Math.min(field.h - t.r, Math.max(t.r + 130, t.y));
      if (t.age > 0.3 && ball.visible && Math.hypot(ball.x - t.x, ball.y - t.y) < t.r + BALL_RADIUS) {
        this.hit(t);
        return false;
      }
      return t.age < this.p.life;
    });

    for (const p of this.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.particles = this.particles.filter((p) => p.age < 0.6);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 0.9);
  }

  draw(ctx) {
    const { field } = this.env;
    this.stops.draw(ctx);
    for (const t of this.targets) {
      const left = 1 - t.age / this.p.life;
      const r = t.r * Math.min(1, t.age / 0.3);
      ctx.globalAlpha = Math.min(1, (left * this.p.life) / 0.5);
      if (t.bomb) {
        hazard(ctx, t.x, t.y, r, this.time * 1.5);
      } else {
        // Leuchtender Ring mit gefülltem Kern
        ctx.beginPath();
        ctx.arc(t.x, t.y, r * 0.92, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fill();
        ctx.lineWidth = r * 0.08;
        ctx.strokeStyle = t.color;
        glow(ctx, t.color, 24);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(t.x, t.y, r * (0.36 + 0.05 * Math.sin(this.time * 6 + t.x)), 0, Math.PI * 2);
        ctx.fillStyle = t.color;
        ctx.fill();
        noGlow(ctx);
        // Weißer Bogen zeigt, wie lange das Ziel noch bleibt.
        ctx.beginPath();
        ctx.arc(t.x, t.y, r * 0.68, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
        ctx.lineWidth = r * 0.045;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.age / 0.6;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
    }
    for (const f of this.floaters) {
      ctx.globalAlpha = 1 - f.age / 0.9;
      text(ctx, f.str, f.x, f.y - f.age * 120, 60, f.color ?? '#fff');
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
      ctx.fillRect(0, 0, field.w, field.h);
    }
  }
}

export default {
  id: 'targets',
  name: 'Ziele',
  duration: 60,
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    for (const k of [0.55, 0.32]) {
      ctx.beginPath();
      ctx.arc(0, 0, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  },
  create: (env) => new Targets(env),
};
