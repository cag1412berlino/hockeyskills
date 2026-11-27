// Alle Figuren: freundliche Wesen und Sammelstücke der Themenwelten, die Bösewichte
// und der Trainer als Maskottchen.
import { theme, glow, noGlow, tone, star } from './draw.js';

/** Zwei Augen, die in Richtung (lookX, lookY) schauen. */
export function eyes(ctx, x, y, r, lookX, lookY, angry = false) {
  const d = Math.hypot(lookX - x, lookY - y) || 1;
  const px = ((lookX - x) / d) * r * 0.06, py = ((lookY - y) / d) * r * 0.06;
  for (const s of [-1, 1]) {
    const ex = x + s * r * 0.27, ey = y - r * 0.08;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.16, r * 0.185, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1026';
    ctx.beginPath();
    ctx.arc(ex + px, ey + py, r * 0.085, 0, Math.PI * 2);
    ctx.fill();
    // Glanzpunkt im Auge
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex + px - r * 0.03, ey + py - r * 0.035, r * 0.028, 0, Math.PI * 2);
    ctx.fill();
    if (angry) {
      // schräge Augenbraue
      ctx.strokeStyle = '#0b1026';
      ctx.lineWidth = r * 0.06;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - s * r * 0.2, ey - r * 0.16);
      ctx.lineTo(ex + s * r * 0.19, ey - r * 0.3);
      ctx.stroke();
    }
  }
}

/** Leuchtende Kugel mit weichem Verlauf, Randlicht und Glanz; mit look = {x, y} bekommt sie Augen. */
export function orb(ctx, x, y, r, color, look = null) {
  const g = ctx.createRadialGradient(x - r * 0.28, y - r * 0.34, r * 0.05, x, y, r);
  g.addColorStop(0, tone(color, 84));
  g.addColorStop(0.35, tone(color, 62));
  g.addColorStop(0.8, tone(color, 42));
  g.addColorStop(1, tone(color, 26));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  glow(ctx, color, 30);
  ctx.fill();
  noGlow(ctx);
  // feines Randlicht unten
  ctx.beginPath();
  ctx.arc(x, y, r * 0.93, Math.PI * 0.18, Math.PI * 0.82);
  ctx.lineWidth = r * 0.035;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.stroke();
  // Glanz oben links
  ctx.beginPath();
  ctx.ellipse(x - r * 0.34, y - r * 0.52, r * 0.2, r * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  if (look) eyes(ctx, x, y + r * 0.05, r, look.x, look.y);
}

/** Gefahr sieht in allen Spielen gleich aus: ein weißgrauer Stachelball mit bösem Blick. */
export function hazard(ctx, x, y, r, rot = 0, look = null) {
  // feine, leicht geschwungene Stacheln
  const n = 14;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i * Math.PI * 2) / n, a1 = rot + ((i + 0.5) * Math.PI * 2) / n, a2 = rot + ((i + 1) * Math.PI * 2) / n;
    if (!i) ctx.moveTo(x + Math.cos(a0) * r * 0.74, y + Math.sin(a0) * r * 0.74);
    ctx.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r);
    ctx.lineTo(x + Math.cos(a2) * r * 0.74, y + Math.sin(a2) * r * 0.74);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r);
  g.addColorStop(0, '#f6f7fc');
  g.addColorStop(0.55, '#b9bccd');
  g.addColorStop(1, '#6a6e86');
  ctx.fillStyle = g;
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.035;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  glow(ctx, '#fff', 16);
  ctx.fill();
  noGlow(ctx);
  ctx.stroke();
  eyes(ctx, x, y + r * 0.06, r * 0.78, look?.x ?? x, look?.y ?? y + 1, true);
}

// ---------- Wesen und Sammelstücke der Themenwelten ----------

/**
 * Freundliches Wesen der aktuellen Welt (das, was man treffen oder einsammeln soll):
 * im Weltraum ein kleiner Außerirdischer, unter Wasser ein Fisch, im Eis ein Schneewesen,
 * im Nachtwald ein Glühkäfer. Der Körper ist immer eine Kugel mit Radius r in der Farbe color.
 */
export function creature(ctx, x, y, r, color, look = null, time = 0) {
  const light = tone(color, 74), dark = tone(color, 34);
  ctx.lineCap = 'round';
  if (theme.world === 'sea') {
    // Schwanzflosse auf der Seite, von der der Ball nicht kommt, dazu Rückenflosse
    const s = look && look.x < x ? 1 : -1;
    const wag = Math.sin(time * 9 + x) * r * 0.12;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(x + s * r * 0.8, y);
    ctx.lineTo(x + s * r * 1.5, y - r * 0.5 + wag);
    ctx.lineTo(x + s * r * 1.32, y);
    ctx.lineTo(x + s * r * 1.5, y + r * 0.5 + wag);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.35, y - r * 0.85); ctx.quadraticCurveTo(x, y - r * 1.5, x + r * 0.4, y - r * 0.82);
    ctx.fill();
  } else if (theme.world === 'ice') {
    // runde Ohren und ein weißer Schal
    for (const s of [-1, 1]) orb(ctx, x + s * r * 0.66, y - r * 0.7, r * 0.3, color);
  } else if (theme.world === 'jungle') {
    // schwirrende Flügel und Fühler
    const flap = 0.55 + 0.35 * Math.sin(time * 26 + y);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + s * r * 0.75, y - r * 0.6, r * 0.62, r * 0.3 * flap, s * -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (theme.world === 'space' || theme.world === 'jungle') {
    // Fühler mit Kugeln (Außerirdischer) bzw. feine Fühler (Käfer)
    const bob = Math.sin(time * 5 + x) * r * 0.06;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * r * 0.3, y - r * 0.9);
      ctx.quadraticCurveTo(x + s * r * 0.36, y - r * 1.25, x + s * r * 0.56 + bob, y - r * 1.38);
      ctx.stroke();
      if (theme.world === 'space') {
        ctx.fillStyle = light;
        ctx.beginPath(); ctx.arc(x + s * r * 0.56 + bob, y - r * 1.38, r * 0.1, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  orb(ctx, x, y, r, color, look);
  if (theme.world === 'ice') {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.96, Math.PI * 0.2, Math.PI * 0.8);
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
  }
}

/**
 * Sammelstück der aktuellen Welt: Stern (Weltraum), Muschel (Unterwasser),
 * Kristall (Eis) oder Blüte (Nachtwald). rot dreht bzw. bewegt es.
 */
export function collectible(ctx, x, y, r, color, rot = 0) {
  if (theme.world === 'sea') {
    // Muschel: Fächer mit Rillen
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.8);
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (1.08 + (0.84 * i) / 10);
      const rr = r * (i % 2 ? 0.94 : 1.04);
      ctx.lineTo(x + Math.cos(a) * rr, y + r * 0.25 + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.beginPath();
    for (let i = 1; i < 10; i += 2) {
      const a = Math.PI * (1.08 + (0.84 * i) / 10);
      ctx.moveTo(x, y + r * 0.7); ctx.lineTo(x + Math.cos(a) * r * 0.88, y + r * 0.25 + Math.sin(a) * r * 0.88);
    }
    ctx.stroke();
  } else if (theme.world === 'ice') {
    // Kristall: geschliffener Edelstein
    const w = r * 0.8, sway = Math.sin(rot * 2) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(w, -r * 0.3); ctx.lineTo(0, r); ctx.lineTo(-w, -r * 0.3);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(w, -r * 0.3); ctx.lineTo(0, -r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-w, -r * 0.3); ctx.lineTo(w, -r * 0.3);
    ctx.moveTo(0, -r); ctx.lineTo(0, r);
    ctx.stroke();
    ctx.restore();
  } else if (theme.world === 'jungle') {
    // Blüte mit fünf Blättern
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const a = rot * 0.5 + (i * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.32, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, r * 0.24, 0, Math.PI * 2); ctx.fill();
  } else {
    star(ctx, x, y, r, color, rot);
  }
}

// ---------- Bösewichte ----------
// Alle sind weißgrau mit bösem Blick: So erkennt man Gefahr in jedem Spiel sofort,
// auch wenn die Gestalten verschieden sind.

/** Grauer Verlauf und heller Rand für den gerade angelegten Pfad. */
function villainSkin(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r * 1.05);
  g.addColorStop(0, '#f6f7fc');
  g.addColorStop(0.55, '#b9bccd');
  g.addColorStop(1, '#6a6e86');
  ctx.fillStyle = g;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  glow(ctx, '#fff', 16);
  ctx.fill();
  noGlow(ctx);
  ctx.stroke();
}

/** Ein einzelnes großes Auge mit schwerem Lid. */
function cyclops(ctx, x, y, r, look) {
  const d = Math.hypot((look?.x ?? x) - x, (look?.y ?? y + 1) - y) || 1;
  const px = (((look?.x ?? x) - x) / d) * r * 0.1, py = (((look?.y ?? y + 1) - y) / d) * r * 0.1;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b1026';
  ctx.beginPath();
  ctx.arc(x + px, y + py, r * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + px - r * 0.06, y + py - r * 0.07, r * 0.05, 0, Math.PI * 2);
  ctx.fill();
  // Lid
  ctx.beginPath();
  ctx.arc(x, y, r * 0.37, Math.PI * 1.08, Math.PI * 1.92);
  ctx.closePath();
  ctx.fillStyle = '#7a7e96';
  ctx.fill();
}

const VILLAIN_SHAPES = {
  /** Zacke: der Stachelball. */
  spike(ctx, x, y, r, t, look) {
    hazard(ctx, x, y, r, t * 2, look);
  },

  /** Brummer: ein bulliger Klotz mit Hörnern und zusammengebissenen Zähnen. */
  brute(ctx, x, y, r, t, look) {
    const bob = Math.sin(t * 5) * r * 0.03;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(x + s * r * 0.75, y - r * 0.55 + bob);
      ctx.lineTo(x + s * r * 0.98, y - r * 1.08 + bob);
      ctx.lineTo(x + s * r * 0.4, y - r * 0.72 + bob);
    }
    villainSkin(ctx, x, y, r);
    ctx.beginPath();
    ctx.roundRect(x - r * 0.86, y - r * 0.78 + bob, r * 1.72, r * 1.6, r * 0.34);
    villainSkin(ctx, x, y, r);
    eyes(ctx, x, y - r * 0.02 + bob, r * 0.95, look?.x ?? x, look?.y ?? y + 1, true);
    // Zähne
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) ctx.lineTo(x - r * 0.36 + i * r * 0.12, y + r * (i % 2 ? 0.5 : 0.38) + bob);
    ctx.lineWidth = r * 0.05;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0b1026';
    ctx.stroke();
  },

  /** Glibber: ein wabernder Tropf mit einem einzigen großen Auge. */
  blob(ctx, x, y, r, t, look) {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      // unten hängen drei Zipfel herunter
      const drip = Math.sin(a) > 0.2 ? Math.max(0, Math.cos(a * 3 + Math.PI)) * 0.2 : 0;
      const rr = r * (0.86 + 0.07 * Math.sin(a * 3 + t * 3) + drip * (0.8 + 0.2 * Math.sin(t * 4 + a)));
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    villainSkin(ctx, x, y, r);
    cyclops(ctx, x, y - r * 0.12, r, look);
  },

  /** Flitzer: ein schmaler Pfeil mit Schweif, zeigt in Flugrichtung. */
  dart(ctx, x, y, r, t, look, dir = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(dir);
    // Fahrtstreifen
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.05;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    for (const [oy, len] of [[-0.42, 0.5], [0, 0.75], [0.42, 0.5]]) {
      const flick = 0.2 * Math.sin(t * 14 + oy * 5);
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, r * oy);
      ctx.lineTo(-r * (1.0 + len + flick), r * oy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(r * 1.08, 0);
    ctx.quadraticCurveTo(r * 0.2, -r * 0.82, -r * 0.92, -r * 0.62);
    ctx.quadraticCurveTo(-r * 0.5, 0, -r * 0.92, r * 0.62);
    ctx.quadraticCurveTo(r * 0.2, r * 0.82, r * 1.08, 0);
    ctx.closePath();
    villainSkin(ctx, 0, 0, r);
    ctx.restore();
    eyes(ctx, x + Math.cos(dir) * r * 0.1, y + Math.sin(dir) * r * 0.1 + r * 0.04, r * 0.72, look?.x ?? x, look?.y ?? y + 1, true);
  },

  /** Krabbler: runder Leib auf sechs zappelnden Beinen. */
  crawler(ctx, x, y, r, t, look) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.09;
    ctx.strokeStyle = '#d8dae8';
    for (let i = 0; i < 6; i++) {
      const s = i < 3 ? -1 : 1;
      const k = (i % 3) - 1;
      const step = Math.sin(t * 12 + i * 2.1) * 0.14;
      ctx.beginPath();
      ctx.moveTo(x + s * r * 0.5, y + k * r * 0.3);
      ctx.lineTo(x + s * r * 0.95, y + k * r * 0.45 - r * 0.25 + step * r);
      ctx.lineTo(x + s * r * 1.15, y + k * r * 0.55 + r * 0.2 + step * r);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.72, r * 0.66, 0, 0, Math.PI * 2);
    villainSkin(ctx, x, y, r * 0.72);
    eyes(ctx, x, y + r * 0.02, r * 0.74, look?.x ?? x, look?.y ?? y + 1, true);
  },

  /** Wirbel: ein rotierendes Sägeblatt mit einem Auge in der Mitte. */
  saw(ctx, x, y, r, t, look) {
    const rot = t * 5;
    const n = 9;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2, b = rot + ((i + 1) / n) * Math.PI * 2;
      if (!i) ctx.moveTo(x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66);
      // jeder Zahn ist nach vorn gebogen
      ctx.quadraticCurveTo(x + Math.cos(a + 0.2) * r * 1.02, y + Math.sin(a + 0.2) * r * 1.02, x + Math.cos(b - 0.12) * r, y + Math.sin(b - 0.12) * r);
      ctx.lineTo(x + Math.cos(b) * r * 0.66, y + Math.sin(b) * r * 0.66);
    }
    ctx.closePath();
    villainSkin(ctx, x, y, r);
    cyclops(ctx, x, y, r * 0.95, look);
  },
};

export const VILLAINS = Object.keys(VILLAIN_SHAPES);

/** Zufälliger Bösewicht. */
export function randomVillain() {
  return VILLAINS[Math.floor(Math.random() * VILLAINS.length)];
}

/**
 * Zeichnet einen Bösewicht. kind: 'spike', 'brute', 'blob', 'dart', 'crawler' oder 'saw'.
 * time bewegt ihn, look = {x, y} ist, wohin er schaut, dir die Flugrichtung (nur für 'dart').
 */
export function villain(ctx, kind, x, y, r, time = 0, look = null, dir = 0) {
  (VILLAIN_SHAPES[kind] ?? VILLAIN_SHAPES.spike)(ctx, x, y, r, time, look, dir);
}

/**
 * Der Trainer, das Maskottchen: eine Comic-Figur mit grauen Haaren, Brille und weißer
 * Vereins-Trainingsjacke. Er atmet, blinzelt, schaut dem Ball nach und winkt ab und zu.
 * mood: 'happy' = lächelt und winkt, 'cheer' = springt mit hochgerissenen Armen, 'sad' = lässt den Kopf hängen.
 * (x, y) ist die Mitte der Figur, r ihre halbe Höhe.
 */
export function mascot(ctx, x, y, r, mood = 'happy', time = 0, look = null) {
  const INK = '#141a33', SKIN = '#f4b892', SKIN_DARK = '#e39b76', HAIR = '#cfd4dc', HAIR_DARK = '#9aa2ae';
  const JACKET = '#f7f9fd', JACKET_SHADE = '#dbe3f1', NAVY = '#1f2f6e', SHIRT = '#a8cdf0';
  const cheer = mood === 'cheer', sad = mood === 'sad';
  const jump = cheer ? Math.abs(Math.sin(time * 6)) : 0;                 // 0..1 in der Luft
  const breathe = Math.sin(time * 2.4);
  const lift = jump * r * 0.34;
  const wave = !cheer && !sad && time % 6 < 1.6 ? Math.sin(time * 14) : null; // winkt alle sechs Sekunden kurz
  const blink = (time + 0.3) % 3.7 < 0.13;

  // Schatten am Boden (wird im Sprung kleiner)
  ctx.beginPath();
  ctx.ellipse(x, y + r * 1.02, r * (0.62 - jump * 0.2), r * 0.11, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fill();

  ctx.save();
  ctx.translate(x, y + r * 0.94 - lift);
  ctx.scale(r / 100, r / 100);       // ab hier: Figur 200 hoch, Füße bei y = 0
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const outline = (w = 6) => { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke(); };
  const fill = (color, w = 6) => { ctx.fillStyle = color; ctx.fill(); if (w) outline(w); };

  // --- Beine (dunkelblaue Hose) und weiße Schuhe ---
  for (const side of [-1, 1]) {
    const kick = cheer ? side * 10 * jump : 0;
    ctx.beginPath();
    ctx.moveTo(side * 17, -52);
    ctx.lineTo(side * 19 + kick, -12);
    ctx.lineWidth = 27; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 17; ctx.strokeStyle = NAVY; ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(side * 25 + kick, -6, 21, 11, 0, 0, Math.PI * 2);
    fill('#ffffff', 5.5);
  }

  const top = -116 + breathe * 1.2 + (sad ? 4 : 0);   // Schulterhöhe
  // Arm: Ärmel der Jacke mit blauem Streifen, hautfarbene Hand
  const arm = (side, hx, hy) => {
    const sx = side * 40, sy = top + 10;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo((sx + hx) / 2 + side * 12, (sy + hy) / 2, hx, hy);
    ctx.lineWidth = 27; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 17; ctx.strokeStyle = JACKET; ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = NAVY; ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, 10.5, 0, Math.PI * 2);
    fill(SKIN, 5);
  };
  // linker Arm (hinter dem Körper gezeichnet, wenn er hängt)
  if (cheer) arm(-1, -72, top - 54 + Math.sin(time * 12) * 4);
  else arm(-1, -52, top + (sad ? 58 : 52));

  // --- Jacke ---
  ctx.beginPath();
  ctx.moveTo(-40, top + 4);
  ctx.quadraticCurveTo(0, top - 12, 40, top + 4);
  ctx.quadraticCurveTo(52, top + 40, 46, -46);
  ctx.quadraticCurveTo(0, -38, -46, -46);
  ctx.quadraticCurveTo(-52, top + 40, -40, top + 4);
  ctx.closePath();
  fill(JACKET);
  ctx.save();
  ctx.clip();
  // Schatten rechts und blaue Schulterstreifen
  ctx.fillStyle = JACKET_SHADE;
  ctx.beginPath(); ctx.ellipse(54, -70, 26, 60, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = NAVY; ctx.lineWidth = 4.5;
  for (const side of [-1, 1]) {
    for (const k of [0, 8]) {
      ctx.beginPath(); ctx.moveTo(side * (16 + k), top - 6); ctx.lineTo(side * (44 + k), top + 12); ctx.stroke();
    }
  }
  ctx.restore();
  // hellblaues Hemd im offenen Kragen
  ctx.beginPath();
  ctx.moveTo(-13, top - 2); ctx.lineTo(0, top + 30); ctx.lineTo(13, top - 2); ctx.closePath();
  fill(SHIRT, 4.5);
  // Reißverschluss und Kragen der Jacke
  ctx.beginPath(); ctx.moveTo(0, top + 30); ctx.lineTo(0, -44);
  ctx.lineWidth = 3; ctx.strokeStyle = HAIR_DARK; ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 22, top - 6); ctx.lineTo(side * 2, top + 30); ctx.lineTo(side * 20, top + 20); ctx.closePath();
    fill(JACKET, 4.5);
  }
  // Vereinswappen auf der Brust
  ctx.save();
  ctx.translate(24, top + 46);
  ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, Math.PI * 2); fill('#1e7fe0', 3.5);
  ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 6.5, Math.PI * 0.75, Math.PI * 1.75); ctx.closePath(); ctx.fillStyle = '#8fb8ee'; ctx.fill();
  ctx.restore();

  // --- Kopf ---
  const headY = top - 40 + (sad ? 5 : 0) + (cheer ? -2 : 0);
  ctx.save();
  ctx.translate(0, headY);
  ctx.rotate(sad ? 0.08 : wave !== null ? wave * 0.03 : Math.sin(time * 1.3) * 0.025);
  // Ohren
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(side * 43, 4, 8, 11, 0, 0, Math.PI * 2); fill(SKIN, 5);
  }
  // Graue Haare an den Seiten und hinten
  ctx.beginPath();
  ctx.moveTo(-45, 4);
  ctx.bezierCurveTo(-54, -34, -30, -56, 0, -54);
  ctx.bezierCurveTo(30, -56, 54, -34, 45, 4);
  ctx.bezierCurveTo(40, -18, 26, -30, 0, -30);
  ctx.bezierCurveTo(-26, -30, -40, -18, -45, 4);
  ctx.closePath();
  fill(HAIR, 5.5);
  // Gesicht
  ctx.beginPath();
  ctx.moveTo(-40, -8);
  ctx.bezierCurveTo(-40, -48, 40, -48, 40, -8);
  ctx.bezierCurveTo(42, 22, 24, 44, 0, 44);
  ctx.bezierCurveTo(-24, 44, -42, 22, -40, -8);
  ctx.closePath();
  fill(SKIN);
  // Hohe Stirn mit lichtem grauem Haar oben, dazu zwei Stirnfalten
  ctx.beginPath();
  ctx.moveTo(-22, -39);
  ctx.bezierCurveTo(-10, -47, 12, -47, 24, -38);
  ctx.bezierCurveTo(10, -41, -8, -41, -22, -39);
  ctx.closePath();
  fill(HAIR, 3.5);
  ctx.lineWidth = 2.5; ctx.strokeStyle = SKIN_DARK;
  ctx.beginPath(); ctx.moveTo(-14, -30); ctx.quadraticCurveTo(0, -33, 14, -30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-10, -24); ctx.quadraticCurveTo(0, -26, 10, -24); ctx.stroke();
  // Bäckchen
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(side * 25, 15, 9, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,110,90,0.4)'; ctx.fill();
  }
  // Augen hinter der Brille
  const lx = look ? Math.max(-1, Math.min(1, (look.x - x) / (r * 4))) : 0;
  const ly = look ? Math.max(-1, Math.min(1, (look.y - (y - lift)) / (r * 4))) : sad ? 0.8 : 0;
  for (const side of [-1, 1]) {
    const ex = side * 18, ey = -1;
    if (blink || (cheer && jump > 0.5)) {
      ctx.beginPath(); ctx.arc(ex, ey + 4, 8, Math.PI * 1.15, Math.PI * 1.85);
      ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(ex, ey, 9, 8, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex + lx * 3.5, ey + ly * 2.5, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#4a3222'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex + lx * 3.5 - 1.6, ey + ly * 2.5 - 1.8, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    // Augenbrauen (grau, kräftig)
    const tilt = sad ? side * 5 : cheer ? -side * 2 : -side * 1.5;
    ctx.beginPath();
    ctx.moveTo(ex - 11, -18 - tilt - (cheer ? 3 : 0)); ctx.lineTo(ex + 11, -18 + tilt - (cheer ? 3 : 0));
    ctx.lineWidth = 5; ctx.strokeStyle = '#6d7480'; ctx.stroke();
  }
  // Brille: zwei eckige Gläser mit Steg und Bügeln
  ctx.lineWidth = 5; ctx.strokeStyle = INK;
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.roundRect(side * 18 - 14.5, -12, 29, 21, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(side * 32.5, -5); ctx.lineTo(side * 42, -3); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(-3.5, -4); ctx.lineTo(3.5, -4); ctx.stroke();
  // Nase
  ctx.beginPath(); ctx.moveTo(-3, 6); ctx.quadraticCurveTo(-9, 18, 2, 19);
  ctx.lineWidth = 4; ctx.strokeStyle = SKIN_DARK; ctx.stroke();
  // Mund
  ctx.beginPath();
  if (cheer) {
    ctx.moveTo(-15, 25); ctx.quadraticCurveTo(0, 46, 15, 25); ctx.closePath();
    fill('#7a2a2a', 4.5);
    ctx.beginPath(); ctx.moveTo(-11, 27); ctx.lineTo(11, 27);
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  } else if (sad) {
    ctx.arc(0, 38, 11, Math.PI * 1.2, Math.PI * 1.8);
    ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.stroke();
  } else {
    // breites Lächeln mit Zähnen
    ctx.moveTo(-15, 25); ctx.quadraticCurveTo(0, 30, 15, 25); ctx.quadraticCurveTo(0, 41, -15, 25); ctx.closePath();
    fill('#ffffff', 4);
  }
  ctx.restore();

  // --- rechter Arm: winkt, jubelt oder hängt ---
  if (cheer) arm(1, 72, top - 54 - Math.sin(time * 12) * 4);
  else if (wave !== null) arm(1, 70 + wave * 8, top - 32);
  else arm(1, 52, top + (sad ? 58 : 52));

  ctx.restore();

  // Funkeln beim Jubeln
  if (cheer) {
    for (let i = 0; i < 3; i++) {
      const a = time * 3 + i * 2.1, d = r * (1.15 + 0.15 * Math.sin(time * 5 + i));
      const sx = x + Math.cos(a) * d, sy = y - r * 0.3 - lift * 0.5 + Math.sin(a) * d * 0.6, k = r * 0.1;
      ctx.beginPath();
      ctx.moveTo(sx - k, sy); ctx.lineTo(sx + k, sy); ctx.moveTo(sx, sy - k); ctx.lineTo(sx, sy + k);
      ctx.lineWidth = Math.max(1.5, r * 0.04); ctx.lineCap = 'round'; ctx.strokeStyle = '#fff3a0'; ctx.stroke();
    }
  }
}
