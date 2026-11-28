// Gemeinsame Bausteine für mehrere Spiele: Effekte und die Stoppzone.
import { glow, noGlow, text, collectible, tone } from '../ui.js';
import { safeHue } from '../themes.js';
import { METERS } from '../engine.js';

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
export function drawCollectible(ctx, s, color, time, r = 44) {
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

/** Punktabzug mit rotem Hinweis an der Stelle (x, y). Die Punktzahl fällt nie unter null. */
export function penalty(env, fx, x, y, points) {
  env.addScore(-points);
  fx.text(x, y, `−${points}`, '#ff8f8f', 44);
}

/**
 * Außerhalb der Spur: für alle Übungen mit Korridor (Weg, Bahn, Linie, Lichtkreis).
 * Nach einer kurzen Schonzeit leuchtet der Rand rot und blinkt, und solange der Ball draußen
 * bleibt, gibt es immer wieder Punktabzug – jedes Mal etwas mehr (2, 4, 6 …).
 * update() jedes Bild mit off = true/false, draw() nach dem Spiel; color() liefert die Farbe,
 * in der die Übung ihre Spur gerade zeichnen soll (rot blinkend, wenn man draußen ist).
 */
export class OffTrack {
  constructor({ grace = 0.3, every = 0.5, start = 2, step = 2, max = 12 } = {}) {
    Object.assign(this, { grace, every, start, step, max });
    this.out = 0;     // Sekunden am Stück draußen
    this.paid = 0;    // Abzüge in diesem Ausflug
    this.tick = 0;
    this.heat = 0;    // 0..1, wie stark der rote Rand leuchtet
    this.time = 0;
    this.lost = 0;    // Punkte, die das Draußensein bisher gekostet hat
  }

  get active() { return this.out > this.grace; }

  /** Kurzer roter Blitz, z. B. beim Anstoßen an eine Wand. */
  hit() { this.heat = 1; }

  update(dt, off, env, fx, ball) {
    this.time += dt;
    if (!off || !ball?.visible) {
      this.out = 0;
      this.paid = 0;
      this.tick = 0;
      this.heat = Math.max(0, this.heat - dt * 3);
      return;
    }
    this.out += dt;
    this.heat = Math.min(1, this.heat + dt * 5);
    if (this.out <= this.grace) return;
    if (this.paid === 0) {
      // gerade hinaus: Serie weg, erster Abzug
      env.miss();
      env.sound.bad();
      this.pay(env, fx, ball);
      return;
    }
    this.tick += dt;
    if (this.tick >= this.every) {
      this.tick -= this.every;
      this.pay(env, fx, ball);
    }
  }

  /** Ein Abzug, jedes Mal etwas mehr. */
  pay(env, fx, ball) {
    const points = Math.min(this.max, this.start + this.step * this.paid);
    this.paid++;
    this.lost += points;
    penalty(env, fx, ball.x, ball.y - 70, points);
    env.shake(3 + Math.min(10, this.paid * 2));
  }

  /** Warnfarbe: Rot, aber immer mit Abstand zur Ballfarbe. */
  static red(l = 58, a = 1) {
    return `hsl(${Math.round(safeHue(0))} 95% ${l}% / ${a})`;
  }

  /** Farbe für die Spur: normal oder, wenn man draußen ist, rot blinkend. */
  color(normal) {
    if (this.heat <= 0.05) return normal;
    return Math.floor(this.time * 10) % 2 === 0 ? OffTrack.red() : '#ffffff';
  }

  draw(ctx, field) {
    if (this.heat <= 0.02) return;
    // roter Schein an allen vier Rändern, pulsierend
    const a = this.heat * (0.35 + 0.2 * Math.sin(this.time * 14));
    const band = 140;
    const sides = [
      [0, 0, field.w, band, 0, 0, 0, band],
      [0, field.h - band, field.w, band, 0, field.h, 0, field.h - band],
      [0, 0, band, field.h, 0, 0, band, 0],
      [field.w - band, 0, band, field.h, field.w, 0, field.w - band, 0],
    ];
    for (const [x, y, w, h, x0, y0, x1, y1] of sides) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, OffTrack.red(50, a));
      g.addColorStop(1, OffTrack.red(50, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    if (this.active) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 12);
      text(ctx, 'Zurück in die Spur!', field.w / 2, field.h - 150, 40, OffTrack.red(70), 'center', 10, 600);
      ctx.globalAlpha = 1;
    }
  }
}

/**
 * Wie groß die nächste Strecke wird: mal ganz klein (etwa 1 m breit), mal halb so breit wie das Feld,
 * mal über die ganze Breite – an einer zufälligen Stelle. Liefert den Rahmen { x0, x1, y0, y1, kind }.
 * minMeters: so schmal darf es höchstens werden (z. B. für Tore, die Platz brauchen).
 */
export const SPAN_TOP = 230, SPAN_BOTTOM = 920;
export function pickSpan(field, { minMeters = 1, margin = 110, avoid = null } = {}) {
  const perMeter = 1000 / METERS;
  const full = field.w - 2 * margin;
  const kinds = ['klein', 'mittel', 'gross'].filter((k) => k !== avoid);
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const w = Math.min(full, kind === 'gross' ? full : kind === 'mittel' ? Math.max(full * 0.5, perMeter * minMeters * 1.4) : Math.max(perMeter * minMeters, 380));
  const H = SPAN_BOTTOM - SPAN_TOP;
  const h = kind === 'gross' ? H : kind === 'mittel' ? H * 0.8 : Math.min(H, Math.max(320, w * 0.75));
  const x0 = margin + Math.random() * (full - w);
  const y0 = SPAN_TOP + Math.random() * (H - h);
  return { x0, x1: x0 + w, y0, y1: y0 + h, kind };
}
