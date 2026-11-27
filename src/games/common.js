// Gemeinsame Bausteine für mehrere Spiele: Effekte und die Stoppzone.
import { glow, noGlow, text, collectible, tone } from '../ui.js';

/** Sammelt alle kurzlebigen Effekte eines Spiels: Funken, Druckwellen, Punktetexte, Blitz. */
export class Fx {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.flashAmt = 0;
  }

  burst(x, y, color, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 120 + Math.random() * 520;
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0,
        life: 0.4 + Math.random() * 0.5, size: 1.5 + Math.random() * 4.5, color,
      });
    }
  }

  ring(x, y, color, r = 130) {
    this.rings.push({ x, y, color, r, age: 0 });
  }

  text(x, y, str, color = '#fff', size = 58) {
    this.texts.push({ x, y, str, color, size, age: 0 });
  }

  flash(amount = 0.4) {
    this.flashAmt = amount;
  }

  update(dt) {
    this.flashAmt = Math.max(0, this.flashAmt - dt);
    for (const p of this.parts) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
      p.vy *= 1 - 2.5 * dt;
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < 0.45);
    for (const t of this.texts) t.age += dt;
    this.texts = this.texts.filter((t) => t.age < 1);
  }

  draw(ctx, field) {
    for (const r of this.rings) {
      const k = r.age / 0.45;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      ctx.strokeStyle = r.color;
      ctx.stroke();
    }
    for (const p of this.parts) {
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - (p.age / p.life) * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const t of this.texts) {
      // springt kurz auf, steigt dann hoch und verblasst
      const pop = t.age < 0.12 ? 0.6 + (t.age / 0.12) * 0.6 : Math.max(1, 1.2 - (t.age - 0.12) * 2);
      ctx.globalAlpha = Math.min(1, (1 - t.age) * 2.5);
      text(ctx, t.str, t.x, t.y - 30 - t.age * 90, t.size * 0.72 * pop, t.color, 'center', t.size * 0.1, 600);
    }
    ctx.globalAlpha = 1;
    if (this.flashAmt > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashAmt})`;
      ctx.fillRect(0, 0, field.w, field.h);
    }
  }
}

/**
 * Stoppzone: Nach einem Treffer soll der Ball in der Nähe bleiben (Ballkontrolle).
 * Rollt er innerhalb kurzer Zeit aus dem Kreis heraus, gibt es Minuspunkte.
 */
export class StopZones {
  constructor(radius, seconds = 0.6) {
    this.radius = radius;
    this.seconds = seconds;
    this.zones = [];
  }

  add(x, y, color) {
    this.zones.push({ x, y, color, left: this.seconds });
  }

  /** Liefert die Zonen, aus denen der Ball gerade herausgerollt ist. */
  update(dt, ball) {
    const broken = [];
    this.zones = this.zones.filter((z) => {
      z.left -= dt;
      if (ball.visible && Math.hypot(ball.x - z.x, ball.y - z.y) > this.radius) {
        broken.push(z);
        return false;
      }
      return z.left > 0;
    });
    return broken;
  }

  draw(ctx) {
    for (const z of this.zones) {
      ctx.globalAlpha = Math.min(1, z.left / this.seconds + 0.2);
      ctx.beginPath();
      ctx.arc(z.x, z.y, this.radius, 0, Math.PI * 2);
      ctx.setLineDash([14, 14]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = z.color;
      glow(ctx, z.color, 12);
      ctx.stroke();
      noGlow(ctx);
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }
}

/** Zufällige Stelle im Feld, möglichst mindestens `away` Einheiten vom Ball entfernt. */
export function randomSpot(field, ball, away = 320) {
  let s = null;
  for (let tries = 0; tries < 20; tries++) {
    s = { x: 90 + Math.random() * (field.w - 180), y: 220 + Math.random() * (field.h - 310) };
    if (!ball.visible || Math.hypot(s.x - ball.x, s.y - ball.y) > away) break;
  }
  return s;
}

/** Pulsierendes Sammelstück der aktuellen Welt (Stern, Muschel, Kristall oder Blüte). */
export function drawStar(ctx, s, color, time, r = 44) {
  glow(ctx, color, 26);
  collectible(ctx, s.x, s.y, r + 5 * Math.sin(time * 6), tone(color, 68), time * 1.5);
  noGlow(ctx);
}

/**
 * Extra zum Einsammeln: runde Plakette mit Symbol ('shield' = Schild, 'ice' = Schneeflocke).
 * Kurz bevor es verschwindet (nach 4,5 von 6 Sekunden), blinkt es.
 */
export const PICKUP_SECONDS = 6;
export function drawPickup(ctx, p, kind, color, time) {
  ctx.globalAlpha = p.age > PICKUP_SECONDS - 1.5 ? 0.5 + 0.5 * Math.sin(time * 14) : 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 46, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,10,30,0.85)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  glow(ctx, color, 22);
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  if (kind === 'shield') {
    ctx.moveTo(p.x - 20, p.y - 20); ctx.lineTo(p.x + 20, p.y - 20);
    ctx.lineTo(p.x + 20, p.y + 2); ctx.lineTo(p.x, p.y + 24); ctx.lineTo(p.x - 20, p.y + 2);
    ctx.closePath();
  } else {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      ctx.moveTo(p.x - Math.cos(a) * 24, p.y - Math.sin(a) * 24);
      ctx.lineTo(p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24);
    }
  }
  ctx.stroke();
  noGlow(ctx);
  ctx.globalAlpha = 1;
}

/** Macht aus Eckpunkten [{x, y}, …] eine dichte Punktfolge mit etwa `step` Einheiten Abstand. */
export function resample(points, step = 10) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let s = 0; s < n; s++) out.push({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n });
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

/**
 * Nächstgelegener Punkt einer Punktfolge zum Ball, gesucht nur zwischen den Stellen from und to.
 * So kann man einem Weg folgen, ohne in einen benachbarten Abschnitt hinüberzuspringen.
 */
export function nearestOnPath(path, ball, from, to) {
  let k = Math.max(0, from), d = Infinity;
  for (let i = Math.max(0, from); i <= Math.min(path.length - 1, to); i++) {
    const di = Math.hypot(ball.x - path[i].x, ball.y - path[i].y);
    if (di < d) { d = di; k = i; }
  }
  return { k, d };
}

/** Erkennt, ob der Ball ruhig liegt: `seconds` lang höchstens `eps` Einheiten Bewegung. */
export class Rest {
  constructor(seconds = 0.6, eps = 22) {
    this.seconds = seconds;
    this.eps = eps;
    this.reset();
  }

  reset() {
    this.anchor = null;
    this.t = 0;
  }

  get progress() {
    return Math.min(1, this.t / this.seconds);
  }

  /** Gibt true zurück, sobald der Ball lange genug ruhig liegt. */
  update(dt, ball) {
    if (!ball.visible) { this.reset(); return false; }
    if (!this.anchor || Math.hypot(ball.x - this.anchor.x, ball.y - this.anchor.y) > this.eps) {
      this.anchor = { x: ball.x, y: ball.y };
      this.t = 0;
      return false;
    }
    this.t += dt;
    return this.t >= this.seconds;
  }
}

/** Zielscheibe aus drei Ringen; rings = Radien von innen nach außen. */
export function drawBullseye(ctx, t, rings, color, time) {
  rings.slice().reverse().forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fillStyle = tone(color, 8 + i * 7, 70);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = tone(color, 45 + i * 12);
    if (i === 2) glow(ctx, color, 18);
    ctx.stroke();
    noGlow(ctx);
  });
  ctx.beginPath();
  ctx.arc(t.x, t.y, 7 + 2 * Math.sin(time * 6), 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}
