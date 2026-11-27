// Spiel "Ziele": Leuchtende Kugeln wandern über den Boden.
// Mit dem Ball berühren = Treffer; je schneller nach dem Auftauchen, desto mehr Punkte.
// Besondere Ziele: Doppel-Kugeln zerfallen in zwei kleine, die Uhr schenkt Zeit,
// Stachelbällen (ab "Schwer" oder späten Stufen) muss man ausweichen.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, villain, randomVillain, creature, text } from '../ui.js';
import { Fx, StopZones } from './common.js';

const LEVELS = {
  1: { r: 120, speed: 25, life: 10, max: 3, every: 1.5, bombs: 0, stop: 380 },
  2: { r: 88, speed: 70, life: 6.5, max: 4, every: 1.1, bombs: 0, stop: 300 },
  3: { r: 66, speed: 120, life: 4.5, max: 5, every: 0.85, bombs: 0.18, stop: 240 },
};

class Targets {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.targets = [];
    this.fx = new Fx();
    this.stops = new StopZones(this.p.stop);
    this.spawnIn = 0.2;
    this.time = 0;
    this.clockIn = 14 + Math.random() * 8;
  }

  /** Zufällige freie Stelle, weg vom Ball und von anderen Zielen. */
  freeSpot(r, ball) {
    const { field } = this.env;
    for (let tries = 0; tries < 20; tries++) {
      const x = r + 20 + Math.random() * (field.w - 2 * r - 40);
      const y = r + 160 + Math.random() * (field.h - 2 * r - 180);
      if (ball.visible && Math.hypot(x - ball.x, y - ball.y) < r + 220) continue;
      if (this.targets.some((t) => Math.hypot(x - t.x, y - t.y) < r + t.r + 20)) continue;
      return { x, y };
    }
    return null;
  }

  add(kind, x, y, r, life) {
    const { palette } = this.env;
    const a = Math.random() * Math.PI * 2;
    const speed = this.p.speed * (kind === 'mini' ? 1.8 : 1);
    this.targets.push({
      kind, x, y, r, life, age: 0, face: randomVillain(),
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      color: kind === 'bomb' || kind === 'clock' ? '#fff' : palette[Math.floor(Math.random() * palette.length)],
    });
  }

  spawn(ball) {
    const { env, p } = this;
    // Mit jeder Stufe werden die Ziele etwas kleiner; ab Stufe 2 tauchen überall Stachelbälle auf.
    const r = p.r * (1 - 0.07 * env.stage);
    const bombChance = p.bombs + (env.stage >= 2 ? 0.1 : 0);
    const roll = Math.random();
    const kind = roll < bombChance ? 'bomb' : roll < bombChance + 0.15 && env.level + env.stage >= 2 ? 'split' : 'normal';
    const size = kind === 'split' ? r * 1.25 : r;
    const spot = this.freeSpot(size, ball);
    if (spot) this.add(kind, spot.x, spot.y, size, p.life);
  }

  hit(t) {
    const { env, fx } = this;
    if (t.kind === 'bomb') {
      env.addScore(-20);
      env.miss();
      env.sound.bad();
      env.shake(20);
      fx.flash(0.35);
      fx.text(t.x, t.y, '-20');
      fx.burst(t.x, t.y, '#fff', 14);
      return;
    }
    if (t.kind === 'clock') {
      env.addTime(5);
      env.sound.power();
      fx.text(t.x, t.y, '+5 Sekunden', '#fff', 50);
      fx.ring(t.x, t.y, '#fff', 200);
      return;
    }
    // Je schneller nach dem Auftauchen getroffen, desto mehr Punkte (10 bis 20).
    const quick = Math.max(0, 1 - t.age / t.life);
    const points = env.combo(10 + Math.round(10 * quick));
    env.sound.pop(Math.round(quick * 5));
    fx.text(t.x, t.y, `+${points}`, t.color, 50 + env.mult * 8);
    fx.burst(t.x, t.y, t.color);
    fx.ring(t.x, t.y, t.color, t.r * 1.8);
    this.stops.add(t.x, t.y, t.color);
    if (t.kind === 'split') {
      // zerfällt in zwei kleine, flinke Kugeln
      for (const s of [-1, 1]) this.add('mini', t.x + s * t.r * 0.6, t.y, t.r * 0.5, 3.5);
    }
  }

  update(dt, ball) {
    const { env, p, fx } = this;
    const { field } = env;
    this.time += dt;
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null; // dorthin schauen die Augen
    fx.update(dt);
    // Ball nach einem Treffer zu weit durchgerollt?
    if (this.stops.update(dt, ball).length) {
      env.addScore(-5);
      env.miss();
      env.sound.bad();
      fx.text(ball.x, ball.y, 'Zu weit! -5');
    }

    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.targets.filter((t) => t.kind !== 'mini').length < p.max) {
      this.spawn(ball);
      this.spawnIn = p.every / env.ramp;
    }
    this.clockIn -= dt;
    if (this.clockIn <= 0) {
      const spot = this.freeSpot(60, ball);
      if (spot) this.add('clock', spot.x, spot.y, 60, 4);
      this.clockIn = 16 + Math.random() * 10;
    }

    this.targets = this.targets.filter((t) => {
      t.age += dt;
      t.x += t.vx * env.ramp * dt;
      t.y += t.vy * env.ramp * dt;
      if (t.x < t.r || t.x > field.w - t.r) t.vx *= -1;
      if (t.y < t.r + 140 || t.y > field.h - t.r) t.vy *= -1;
      t.x = Math.min(field.w - t.r, Math.max(t.r, t.x));
      t.y = Math.min(field.h - t.r, Math.max(t.r + 140, t.y));
      if (t.age > 0.3 && ball.visible && Math.hypot(ball.x - t.x, ball.y - t.y) < t.r + BALL_RADIUS) {
        this.hit(t);
        return false;
      }
      return t.age < t.life;
    });
  }

  draw(ctx) {
    this.stops.draw(ctx);
    for (const t of this.targets) {
      const left = 1 - t.age / t.life;
      // federndes Aufploppen
      const k = Math.min(1, t.age / 0.35);
      const r = t.r * (k < 1 ? k * (1.25 - 0.25 * k) : 1 + 0.03 * Math.sin(this.time * 5 + t.x));
      ctx.globalAlpha = Math.min(1, (left * t.life) / 0.5);
      if (t.kind === 'bomb') {
        villain(ctx, t.face, t.x, t.y, r, this.time, this.look, Math.atan2(t.vy, t.vx));
      } else if (t.kind === 'clock') {
        ctx.beginPath();
        ctx.arc(t.x, t.y, r * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(20,20,40,0.9)';
        ctx.fill();
        ctx.lineWidth = r * 0.1;
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        glow(ctx, '#fff', 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(t.x, t.y - r * 0.5); ctx.lineTo(t.x, t.y); ctx.lineTo(t.x + r * 0.32, t.y + r * 0.12);
        ctx.stroke();
        noGlow(ctx);
        text(ctx, '+5', t.x, t.y + r * 1.25, 36, '#fff', 'center', 6);
      } else {
        creature(ctx, t.x, t.y, r, t.color, this.look, this.time);
        if (t.kind === 'split') {
          // zweiter Ring zeigt: hier steckt mehr drin
          ctx.beginPath();
          ctx.arc(t.x, t.y, r * 1.18, 0, Math.PI * 2);
          ctx.setLineDash([10, 12]);
          ctx.lineDashOffset = -this.time * 40;
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = t.color;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Bogen zeigt, wie lange das Ziel noch bleibt.
        ctx.beginPath();
        ctx.arc(t.x, t.y, r + 9, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    this.fx.draw(ctx, this.env.field);
  }
}

export default {
  id: 'targets',
  hint: 'Triff die Kugeln – je schneller, desto besser!',
  name: 'Ziele',
  duration: 60,
  scale: 0.2,
  medals: [[190, 510, 810], [200, 540, 820], [50, 280, 490]],
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
