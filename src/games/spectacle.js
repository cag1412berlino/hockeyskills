// Große Momente für die Spiele: Hindernisse aus verschiedenen Materialien (Backstein, Holz, Fels,
// Eis, Feuer), was von ihnen übrig bleibt, wenn man sie trifft, und Effekte über das ganze Bild
// (Flammenwand, Feuerwerk, Turbo, Goldregen).
//
// Kamera-Regel: Alle kräftigen Farben laufen durch safeHue und halten so Abstand zur Ballfarbe.
// Was über das ganze Bild geht, lässt um den Ball ein Loch frei, damit kein farbiges Licht auf ihn fällt.
import { BALL_RADIUS } from '../engine.js';
import { safeHue, hueGap } from '../themes.js';
import { glow, noGlow, star, text } from '../ui.js';

const TAU = Math.PI * 2;

/** Farbe mit sicherem Farbton (nie zu nah an der Ballfarbe). */
export const hsl = (h, s, l, a = 1) => `hsl(${Math.round(safeHue(((h % 360) + 360) % 360))} ${s}% ${l}% / ${a})`;

/**
 * Materialfarbe (Backstein, Holz …): behält ihren natürlichen Farbton. Liegt er zu nah an der
 * Ballfarbe, wird sie so blass, dass die Kamera sie nicht für den Ball halten kann.
 */
export const tint = (h, s, l, a = 1) => `hsl(${h} ${hueGap(h) < 55 ? Math.min(s, 18) : s}% ${l}% / ${a})`;

/**
 * Feuerfarbe: Ist der Ball selbst orange oder rot, brennt das Feuer blau – sonst könnte die
 * Kamera die Flammen mit dem Ball verwechseln.
 */
export const fireHsl = (h, s, l, a = 1) => (hueGap(25) < 50 ? hsl(h + 190, s, l, a) : hsl(h, s, l, a));

/** Gold, oder Silber, wenn der Ball goldgelb ist. */
export const gold = (l = 60) => (hueGap(46) < 55 ? `hsl(220 12% ${l + 15}%)` : hsl(46, 95, l));

/** Regenbogenfarbe Nummer i: aufeinanderfolgende Nummern sind deutlich verschieden. */
export const rainbow = (i, l = 62) => hsl(i * 47, 95, l);

/** Die Materialien: Name für Ansagen, Farben der Bruchstücke und ob Feuer im Spiel ist. */
export const MATERIALS = {
  brick: { name: 'Backstein', chunks: () => [tint(8, 55, 40), tint(12, 50, 30), tint(30, 15, 70)] },
  wood: { name: 'Holz', chunks: () => [tint(30, 55, 38), tint(34, 50, 52), tint(26, 45, 25)] },
  stone: { name: 'Fels', chunks: () => [tint(220, 8, 55), tint(220, 10, 38), tint(210, 12, 70)] },
  ice: { name: 'Eis', chunks: () => [hsl(195, 80, 85), hsl(200, 70, 70), '#ffffff'] },
  fire: { name: 'Feuer', chunks: () => [fireHsl(20, 100, 55), fireHsl(40, 100, 60), fireHsl(5, 95, 50)] },
};

/** Kleine, feste Zufallsfolge aus einer Zahl (damit ein Felsbrocken nicht bei jedem Bild anders aussieht). */
function wobble(seed, i) {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** Flammenzunge mit Fuß bei (x, y), Höhe h, Breite w. */
function flame(ctx, x, y, w, h, t, seed) {
  const sway = Math.sin(t * 9 + seed * 3) * w * 0.25;
  const hh = h * (0.85 + 0.15 * Math.sin(t * 13 + seed * 7));
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.bezierCurveTo(x - w / 2, y - hh * 0.5, x + sway - w * 0.1, y - hh * 0.7, x + sway, y - hh);
  ctx.bezierCurveTo(x + sway + w * 0.1, y - hh * 0.7, x + w / 2, y - hh * 0.5, x + w / 2, y);
  ctx.closePath();
}

/** Ein Feuer am Boden: drei Lagen Flammen, außen rot, innen gelb. */
export function drawFire(ctx, x, y, w, h, t, seed = 0, lit = true) {
  const n = Math.max(2, Math.round(w / 34));
  const layers = [[1, fireHsl(8, 100, 50, 0.9)], [0.72, fireHsl(28, 100, 56, 0.95)], [0.45, fireHsl(48, 100, 70)]];
  if (lit) glow(ctx, fireHsl(25, 100, 55), 30);
  for (const [k, color] of layers) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const fx = x - w / 2 + (w * (i + 0.5)) / n;
      flame(ctx, fx, y, (w / n) * 1.35 * k, h * k * (0.7 + 0.3 * wobble(seed, i)), t, seed + i);
      ctx.fill();
    }
    noGlow(ctx);
  }
}

/**
 * Ein Hindernis aus einem Material, Mitte (x, y), Breite w, Höhe h.
 * Feuer wird als Flammenfeld gezeichnet, Fels als Brocken, der Rest als Block.
 */
export function drawBlock(ctx, mat, x, y, w, h, t, seed = 0) {
  const x0 = x - w / 2, y0 = y - h / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  if (mat === 'brick') {
    ctx.fillStyle = tint(8, 55, 36);
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = tint(30, 12, 72);
    ctx.lineWidth = 2.5;
    const row = h / 3;
    for (let r = 0; r < 3; r++) {
      const yy = y0 + r * row;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); ctx.stroke();
      for (let bx = x0 + (r % 2 ? 22 : 0); bx < x0 + w; bx += 44) {
        if (bx <= x0) continue;
        ctx.beginPath(); ctx.moveTo(bx, yy); ctx.lineTo(bx, yy + row); ctx.stroke();
      }
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = tint(10, 45, 22);
    ctx.strokeRect(x0, y0, w, h);
  } else if (mat === 'wood') {
    ctx.fillStyle = tint(32, 55, 40);
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = tint(28, 50, 24);
    ctx.lineWidth = 3;
    for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x0, y0 + (h * i) / 3); ctx.lineTo(x0 + w, y0 + (h * i) / 3); ctx.stroke(); }
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x0 + 6, y0 + 6); ctx.lineTo(x0 + w - 6, y0 + h - 6);
    ctx.moveTo(x0 + w - 6, y0 + 6); ctx.lineTo(x0 + 6, y0 + h - 6); ctx.stroke();
    ctx.strokeRect(x0, y0, w, h);
  } else if (mat === 'ice') {
    ctx.fillStyle = hsl(195, 75, 78, 0.75);
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(x0 + w * 0.15, y0 + h * 0.75); ctx.lineTo(x0 + w * 0.35, y0 + h * 0.2);
    ctx.moveTo(x0 + w * 0.45, y0 + h * 0.8); ctx.lineTo(x0 + w * 0.6, y0 + h * 0.35); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = hsl(205, 70, 55);
    ctx.strokeRect(x0, y0, w, h);
  } else if (mat === 'stone') {
    // Felsbrocken: unregelmäßiges Vieleck
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, k = 0.78 + 0.22 * wobble(seed, i);
      ctx.lineTo(x + Math.cos(a) * (w / 2) * k, y + Math.sin(a) * (h / 2) * k);
    }
    ctx.closePath();
    ctx.fillStyle = tint(220, 8, 45);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = tint(220, 12, 25);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.ellipse(x - w * 0.15, y - h * 0.18, w * 0.16, h * 0.1, -0.4, 0, TAU); ctx.fill();
  } else if (mat === 'fire') {
    ctx.fillStyle = tint(15, 60, 18);
    ctx.beginPath(); ctx.ellipse(x, y + h * 0.35, w / 2, h * 0.18, 0, 0, TAU); ctx.fill();
    drawFire(ctx, x, y + h * 0.4, w, h * 1.3, t, seed);
  }
  ctx.restore();
}

/** Pfosten (von oben gesehen) aus einem Material, für Tore. */
export function drawPost(ctx, mat, x, y, r, t, color) {
  ctx.save();
  if (mat === 'fire') {
    // Fackel: Schale und Flamme
    ctx.fillStyle = tint(30, 25, 30);
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.fill();
    drawFire(ctx, x, y + r * 0.4, r * 1.6, r * 2.6, t, x);
  } else if (mat === 'ice') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) ctx.lineTo(x + Math.cos((i / 6) * TAU + t) * r * 1.1, y + Math.sin((i / 6) * TAU + t) * r * 1.1);
    ctx.closePath();
    ctx.fillStyle = hsl(195, 80, 80, 0.85);
    glow(ctx, '#ffffff', 16);
    ctx.fill();
    noGlow(ctx);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
  } else if (mat === 'wood') {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = tint(32, 55, 45); ctx.fill();
    ctx.strokeStyle = tint(28, 50, 25); ctx.lineWidth = 2;
    for (const k of [0.75, 0.45, 0.18]) { ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.stroke(); }
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  } else if (mat === 'brick') {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = tint(8, 55, 38); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = tint(30, 12, 72); ctx.lineWidth = 2;
    for (let yy = y - r; yy < y + r; yy += r * 0.6) { ctx.beginPath(); ctx.moveTo(x - r, yy); ctx.lineTo(x + r, yy); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = tint(10, 45, 22); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  } else {
    // Leuchtkugel in der Farbe des Tors
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = color ?? '#fff';
    glow(ctx, color ?? '#fff', 18);
    ctx.fill();
    noGlow(ctx);
  }
  ctx.restore();
}

/**
 * Alle großen Effekte eines Spiels. update(dt) jedes Bild, draw(ctx, field, ball) nach dem Spiel,
 * damit die Effekte obenauf liegen.
 */
export class Show {
  constructor() {
    this.chunks = [];   // Bruchstücke mit Schwerkraft
    this.sparks = [];   // Funken, Glut, Münzen
    this.burning = 0;   // Sekunden Flammenwand
    this.burnTotal = 1;
    this.boost = 0;     // Sekunden Turbo (Speedlinien)
    this.rockets = [];  // Feuerwerk, das noch zündet
    this.time = 0;
  }

  /** Ein Hindernis zerbricht: Bruchstücke fliegen auseinander und fallen. */
  shatter(x, y, mat, n = 18, power = 1) {
    const colors = MATERIALS[mat]?.chunks() ?? ['#fff'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
      const v = (200 + Math.random() * 450) * power;
      this.chunks.push({
        x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 14,
        w: 8 + Math.random() * 14, h: 6 + Math.random() * 9, color: colors[i % colors.length], age: 0, life: 0.9 + Math.random() * 0.5,
      });
    }
    if (mat === 'fire' || mat === 'ice') this.sparkle(x, y, mat === 'fire' ? 'ember' : 'snow', 24);
  }

  /** Glut steigt auf, Schneeflocken rieseln, Münzen regnen. */
  sparkle(x, y, kind, n = 20, spread = 60) {
    for (let i = 0; i < n; i++) {
      const up = kind === 'ember';
      this.sparks.push({
        kind, x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 160, vy: up ? -150 - Math.random() * 260 : kind === 'coin' ? 260 + Math.random() * 200 : (Math.random() - 0.5) * 200,
        age: 0, life: 0.8 + Math.random() * 0.8, size: 3 + Math.random() * 5, hue: Math.random() * 360,
      });
    }
  }

  /** Das ganze Bild brennt kurz: Flammen schlagen vom unteren Rand hoch. */
  burn(seconds = 1.3) {
    this.burning = this.burnTotal = seconds;
  }

  /** Feuerwerk: n Raketen, die kurz nacheinander zünden. */
  fireworks(field, n = 5) {
    for (let i = 0; i < n; i++) {
      this.rockets.push({ at: i * 0.22 + Math.random() * 0.1, x: field.w * (0.15 + Math.random() * 0.7), y: 180 + Math.random() * 380, hue: Math.random() * 360 });
    }
  }

  /** Goldregen über das ganze Feld. */
  coins(field, n = 40) {
    for (let i = 0; i < n; i++) {
      this.sparks.push({ kind: 'coin', x: Math.random() * field.w, y: -40 - Math.random() * 300, vx: (Math.random() - 0.5) * 60, vy: 300 + Math.random() * 250, age: 0, life: 2.4, size: 10 + Math.random() * 6, spin: Math.random() * TAU });
    }
  }

  /** Turbo: Speedlinien für ein paar Sekunden. */
  turbo(seconds = 3) {
    this.boost = seconds;
  }

  update(dt) {
    this.time += dt;
    this.burning = Math.max(0, this.burning - dt);
    this.boost = Math.max(0, this.boost - dt);
    for (const c of this.chunks) {
      c.age += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 1300 * dt; c.rot += c.spin * dt;
    }
    this.chunks = this.chunks.filter((c) => c.age < c.life);
    for (const s of this.sparks) {
      s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.kind === 'snow') { s.vy += 60 * dt; s.vx *= 1 - dt; }
      if (s.kind === 'firework') { s.vx *= 1 - 1.8 * dt; s.vy = s.vy * (1 - 1.8 * dt) + 160 * dt; }
      if (s.kind === 'coin') s.spin += dt * 8;
    }
    this.sparks = this.sparks.filter((s) => s.age < s.life);
    for (const r of this.rockets) {
      r.at -= dt;
      if (r.at <= 0 && !r.done) {
        r.done = true;
        for (let i = 0; i < 46; i++) {
          const a = (i / 46) * TAU, v = 260 + Math.random() * 120;
          this.sparks.push({ kind: 'firework', x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 1 + Math.random() * 0.4, size: 3.5, hue: r.hue + (i % 2) * 40 });
        }
      }
    }
    this.rockets = this.rockets.filter((r) => !r.done);
  }

  get busy() {
    return this.burning > 0 || this.chunks.length > 0 || this.sparks.length > 0 || this.boost > 0;
  }

  draw(ctx, field, ball) {
    const keep = ball?.visible ? { x: ball.x, y: ball.y, r: BALL_RADIUS * 2.4 } : null;
    const near = (x, y, k = 1) => keep && Math.hypot(x - keep.x, y - keep.y) < keep.r * k;

    // Speedlinien beim Turbo
    if (this.boost > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.boost) * 0.45;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const x = (wobble(i, 1) * field.w + i * 37) % field.w;
        const y = ((this.time * 1500 + wobble(i, 2) * 1200) % 1200) - 100;
        if (near(x, y + 60, 1.2)) continue;
        ctx.lineWidth = 2 + wobble(i, 3) * 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 90 + wobble(i, 4) * 80); ctx.stroke();
      }
      ctx.restore();
    }

    // Flammenwand über das ganze Bild, mit einem Loch um den Ball
    if (this.burning > 0) {
      const k = this.burning / this.burnTotal;           // 1 -> 0
      const rise = Math.sin(Math.min(1, (1 - k) * 2.2) * Math.PI * 0.5) * (k < 0.3 ? k / 0.3 : 1);
      ctx.save();
      if (keep) {
        ctx.beginPath();
        ctx.rect(0, 0, field.w, field.h);
        ctx.arc(keep.x, keep.y, keep.r, 0, TAU);
        ctx.clip('evenodd');
      }
      ctx.fillStyle = fireHsl(18, 100, 45, 0.28 * rise);
      ctx.fillRect(0, 0, field.w, field.h);
      const n = Math.ceil(field.w / 70);
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (field.w / n);
        const h = (380 + 320 * wobble(i, 5)) * rise;
        drawFire(ctx, x, field.h + 30, (field.w / n) * 1.6, h, this.time, i, false);
      }
      ctx.restore();
      if (Math.random() < 0.6) this.sparkle(Math.random() * field.w, field.h - 60, 'ember', 2, 20);
    }

    // Bruchstücke
    for (const c of this.chunks) {
      if (near(c.x, c.y, 0.6)) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (c.life - c.age) * 3);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }

    // Funken, Glut, Schnee, Münzen, Feuerwerk
    for (const s of this.sparks) {
      if (near(s.x, s.y, 0.6)) continue;
      const a = 1 - s.age / s.life;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      if (s.kind === 'coin') {
        ctx.fillStyle = gold(58);
        ctx.beginPath(); ctx.ellipse(s.x, s.y, s.size * Math.abs(Math.cos(s.spin)) + 2, s.size, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = gold(35); ctx.lineWidth = 2; ctx.stroke();
      } else if (s.kind === 'snow') {
        star(ctx, s.x, s.y, s.size * 1.3, '#ffffff', s.age * 3);
      } else {
        ctx.fillStyle = s.kind === 'ember' ? fireHsl(25 + s.hue / 12, 100, 60) : hsl(s.hue, 95, 65);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size * (0.5 + 0.5 * a), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** Großes Schild in der Bildmitte, das kurz einfliegt (z. B. „Zone: Vulkan!“). */
export function drawSign(ctx, field, str, age, color) {
  if (age > 1.8) return;
  const k = age < 0.25 ? age / 0.25 : age > 1.4 ? (1.8 - age) / 0.4 : 1;
  ctx.globalAlpha = Math.max(0, k);
  // oben unter der Anzeige, damit es nicht mit den großen Einblendungen in der Mitte kollidiert
  text(ctx, str, field.w / 2, 200 - (1 - k) * 30, 46, color, 'center', 12, 600);
  ctx.globalAlpha = 1;
}
