// Spiel "Wolke": Ein Ziel treffen – aber dazwischen hängt eine Gewitterwolke.
// Der Ball muss außen herum. Auf "Mittel" pendelt die Wolke, auf "Schwer" stellt sie sich in den Weg.
import { BALL_RADIUS } from '../engine.js';
import { text, glow, noGlow } from '../ui.js';
import { StopZones, burst } from './common.js';

const LEVELS = {
  1: { r: 135, target: 95, sway: 0, chase: 0, stop: 380 },
  2: { r: 125, target: 75, sway: 130, chase: 0, stop: 300 },
  3: { r: 115, target: 62, sway: 0, chase: 130, stop: 240 },
};

// Die Wolke besteht aus überlappenden Kreisen: [x, y, Radius] relativ zur Wolkengröße.
const PUFFS = [[-0.55, 0.15, 0.5], [0, -0.25, 0.62], [0.55, 0.1, 0.52], [-0.1, 0.3, 0.55], [0.3, 0.32, 0.45]];

function puffs(ctx, x, y, r) {
  ctx.beginPath();
  for (const [px, py, pr] of PUFFS) {
    ctx.moveTo(x + (px + pr) * r, y + py * r);
    ctx.arc(x + px * r, y + py * r, pr * r, 0, Math.PI * 2);
  }
}

export function drawCloud(ctx, x, y, r, angry = false) {
  puffs(ctx, x, y, r);
  ctx.lineWidth = r * 0.08;
  ctx.strokeStyle = '#fff';
  glow(ctx, '#fff', angry ? 40 : 14);
  ctx.stroke();
  noGlow(ctx);
  ctx.fillStyle = angry ? '#9a9aa8' : '#34343f';
  ctx.fill();
  // Blitz
  ctx.beginPath();
  ctx.moveTo(x + r * 0.08, y - r * 0.38);
  ctx.lineTo(x - r * 0.2, y + r * 0.08);
  ctx.lineTo(x + r * 0.02, y + r * 0.08);
  ctx.lineTo(x - r * 0.1, y + r * 0.45);
  ctx.lineTo(x + r * 0.24, y - r * 0.08);
  ctx.lineTo(x + r * 0.02, y - r * 0.08);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
}

class Cloud {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.hurt = 0;
    this.flash = 0;
    this.roundTime = 0;
    this.target = null;
    this.cloud = null;
    this.particles = [];
    this.floaters = [];
    this.stops = new StopZones(this.p.stop);
  }

  /** Neues Ziel weit weg vom Ball, die Wolke genau dazwischen. */
  newRound(ball) {
    const { field, palette } = this.env;
    const from = ball.visible ? ball : { x: field.w / 2, y: field.h / 2 };
    const r = this.p.target;
    // Von mehreren zufälligen Stellen die nehmen, die am weitesten vom Ball entfernt ist.
    let t = null, far = -1;
    for (let tries = 0; tries < 8; tries++) {
      const c = { x: r + 40 + Math.random() * (field.w - 2 * r - 80), y: r + 190 + Math.random() * (field.h - 2 * r - 230), r };
      const d = Math.hypot(c.x - from.x, c.y - from.y);
      if (d > far) { far = d; t = c; }
    }
    t.color = palette[Math.floor(Math.random() * palette.length)];
    this.target = t;
    const len = Math.hypot(t.x - from.x, t.y - from.y) || 1;
    this.cloud = {
      bx: (from.x + t.x) / 2, by: (from.y + t.y) / 2,       // Grundposition
      nx: -(t.y - from.y) / len, ny: (t.x - from.x) / len,   // quer zum direkten Weg
      x: (from.x + t.x) / 2, y: (from.y + t.y) / 2,
      phase: Math.random() * Math.PI * 2,
    };
    this.roundTime = 0;
  }

  update(dt, ball) {
    const { env, p } = this;
    this.time += dt;
    this.roundTime += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.flash = Math.max(0, this.flash - dt);
    for (const q of this.particles) { q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    this.particles = this.particles.filter((q) => q.age < 0.6);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1);

    for (const z of this.stops.update(dt, ball)) {
      env.addScore(-5);
      env.sound.bad();
      this.floaters.push({ x: ball.x, y: ball.y, age: 0, str: 'Zu weit -5' });
    }

    if (!this.target) this.newRound(ball);
    const { target: t, cloud: c } = this;

    if (p.sway) {
      const s = Math.sin(this.time * 1.6 + c.phase) * p.sway;
      c.x = c.bx + c.nx * s;
      c.y = c.by + c.ny * s;
    }
    if (!ball.visible) return;

    if (p.chase) {
      // Die Wolke schiebt sich immer wieder zwischen Ball und Ziel.
      const gx = ball.x + (t.x - ball.x) * 0.55, gy = ball.y + (t.y - ball.y) * 0.55;
      const d = Math.hypot(gx - c.x, gy - c.y);
      const step = Math.min(d, p.chase * dt);
      if (d > 1) { c.x += ((gx - c.x) / d) * step; c.y += ((gy - c.y) / d) * step; }
      // Sie darf das Ziel aber nie ganz verdecken.
      const dt2 = Math.hypot(c.x - t.x, c.y - t.y);
      const min = p.r + t.r + 40;
      if (dt2 < min && dt2 > 0) { c.x = t.x + ((c.x - t.x) / dt2) * min; c.y = t.y + ((c.y - t.y) / dt2) * min; }
    }

    if (this.hurt <= 0 && Math.hypot(ball.x - c.x, ball.y - c.y) < p.r * 0.85 + BALL_RADIUS * 0.5) {
      env.addScore(-10);
      env.sound.bad();
      this.hurt = 1.2;
      this.flash = 0.45;
      this.floaters.push({ x: c.x, y: c.y - p.r, age: 0, str: '-10' });
    }

    if (Math.hypot(ball.x - t.x, ball.y - t.y) < t.r + BALL_RADIUS) {
      const points = 10 + Math.max(0, Math.round(10 - this.roundTime * 2)); // schnell = mehr Punkte
      env.addScore(points);
      env.sound.pop(Math.min(5, points - 10) / 2);
      this.floaters.push({ x: t.x, y: t.y, age: 0, str: `+${points}`, color: t.color });
      burst(this.particles, t.x, t.y, t.color);
      this.stops.add(t.x, t.y, t.color);
      this.newRound(ball);
    }
  }

  draw(ctx) {
    const { env, p, target: t, cloud: c } = this;
    this.stops.draw(ctx);
    if (t) {
      const r = t.r * Math.min(1, this.roundTime / 0.25);
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * 0.92, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fill();
      ctx.lineWidth = r * 0.08;
      ctx.strokeStyle = t.color;
      glow(ctx, t.color, 24);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * (0.36 + 0.05 * Math.sin(this.time * 6)), 0, Math.PI * 2);
      ctx.fillStyle = t.color;
      ctx.fill();
      noGlow(ctx);
      drawCloud(ctx, c.x, c.y, p.r, this.hurt > 0.8);
    }
    for (const q of this.particles) {
      ctx.globalAlpha = 1 - q.age / 0.6;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - 6, q.y - 6, 12, 12);
    }
    for (const f of this.floaters) {
      ctx.globalAlpha = 1 - f.age;
      text(ctx, f.str, f.x, f.y - 40 - f.age * 100, 60, f.color ?? '#fff');
    }
    ctx.globalAlpha = 1;
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
      ctx.fillRect(0, 0, env.field.w, env.field.h);
    }
  }
}

export default {
  id: 'cloud',
  name: 'Wolke',
  duration: 60,
  icon(ctx, r) {
    puffs(ctx, 0, 0, r * 0.42);
    ctx.lineWidth = r * 0.085;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.fill();
  },
  create: (env) => new Cloud(env),
};
