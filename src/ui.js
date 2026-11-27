// Bausteine für die projizierte Oberfläche: Leuchtschrift, Figuren, Symbole
// und Buttons, die man auslöst, indem man den Ball kurz darauf liegen lässt.

export const theme = {
  family: '"Fredoka", system-ui, sans-serif',
  px: 1, // Bildschirm-Pixel pro Feld-Einheit (für den Leuchteffekt)
};

/** Neon-Leuchten für alles, was danach gezeichnet wird. Mit noGlow wieder ausschalten. */
export function glow(ctx, color, blur = 22) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * theme.px;
}

export function noGlow(ctx) {
  ctx.shadowBlur = 0;
}

/** Hellere oder dunklere Variante einer Spielfarbe (hsl-Farben aus der Palette). */
export function tone(color, lightness, saturation = 90) {
  const m = /hsl\((\d+(?:\.\d+)?)/.exec(color);
  return m ? `hsl(${m[1]} ${saturation}% ${lightness}%)` : color;
}

export function text(ctx, str, x, y, size, color = '#fff', align = 'center', blur = size * 0.3) {
  ctx.font = `600 ${size}px ${theme.family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if (blur) glow(ctx, color, blur);
  ctx.fillText(String(str), x, y);
  noGlow(ctx);
}

/** Überschrift wie eine Leuchtreklame: heller Kern, farbiger Schein. */
export function title(ctx, str, x, y, size, color) {
  text(ctx, str, x, y, size, color, 'center', size * 0.5);
  text(ctx, str, x, y, size, tone(color, 92), 'center', size * 0.12);
}

export function star(ctx, x, y, r, color = '#fff', rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.5 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.18;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fill();
}

/** Zwei Augen, die in Richtung (lookX, lookY) schauen. */
export function eyes(ctx, x, y, r, lookX, lookY, angry = false) {
  const d = Math.hypot(lookX - x, lookY - y) || 1;
  const px = ((lookX - x) / d) * r * 0.07, py = ((lookY - y) / d) * r * 0.07;
  for (const s of [-1, 1]) {
    const ex = x + s * r * 0.3, ey = y - r * 0.08;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0a18';
    ctx.beginPath();
    ctx.arc(ex + px, ey + py, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    if (angry) {
      // schräge Augenbraue
      ctx.strokeStyle = '#0a0a18';
      ctx.lineWidth = r * 0.09;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - s * r * 0.22, ey - r * 0.14);
      ctx.lineTo(ex + s * r * 0.22, ey - r * 0.32);
      ctx.stroke();
    }
  }
}

/** Leuchtende Kugel mit Glanzlicht; mit look = {x, y} bekommt sie Augen, die dorthin schauen. */
export function orb(ctx, x, y, r, color, look = null) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, tone(color, 78));
  g.addColorStop(0.55, color);
  g.addColorStop(1, tone(color, 28));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  glow(ctx, color, 28);
  ctx.fill();
  noGlow(ctx);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.32, y - r * 0.5, r * 0.26, r * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
  if (look) eyes(ctx, x, y + r * 0.05, r, look.x, look.y);
}

/** Gefahr sieht in allen Spielen gleich aus: ein weißgrauer Stachelball mit bösem Blick. */
export function hazard(ctx, x, y, r, rot = 0, look = null) {
  ctx.beginPath();
  for (let i = 0; i < 20; i++) {
    const a = rot + (i * Math.PI) / 10;
    const rr = i % 2 ? r * 0.7 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#e9e9f2');
  g.addColorStop(1, '#6c6c7e');
  ctx.fillStyle = g;
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = '#fff';
  glow(ctx, '#fff', 16);
  ctx.fill();
  ctx.stroke();
  noGlow(ctx);
  eyes(ctx, x, y + r * 0.05, r * 0.85, look?.x ?? x, look?.y ?? y + 1, true);
}

/** Herz für die Lebensanzeige; x, y ist die Mitte. */
export function heart(ctx, x, y, size, color) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.85);
  ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.75, y - s * 1.15, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.75, y - s * 1.15, x + s * 1.5, y - s * 0.1, x, y + s * 0.85);
  ctx.fillStyle = color;
  ctx.fill();
}

const stroke = (ctx, r) => {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.085;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
};

/** Symbole, jeweils um den Nullpunkt gezeichnet, r = Radius des Buttons. */
export const icons = {
  back(ctx, r) {
    stroke(ctx, r);
    ctx.beginPath();
    ctx.moveTo(r * 0.4, 0); ctx.lineTo(-r * 0.4, 0);
    ctx.moveTo(-r * 0.05, -r * 0.35); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.05, r * 0.35);
    ctx.stroke();
  },
  close(ctx, r) {
    stroke(ctx, r);
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.3); ctx.lineTo(r * 0.3, r * 0.3);
    ctx.moveTo(r * 0.3, -r * 0.3); ctx.lineTo(-r * 0.3, r * 0.3);
    ctx.stroke();
  },
  replay(ctx, r) {
    stroke(ctx, r);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.42, -Math.PI * 0.2, Math.PI * 1.5);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-r * 0.02, -r * 0.68); ctx.lineTo(r * 0.3, -r * 0.42); ctx.lineTo(-r * 0.02, -r * 0.16);
    ctx.closePath();
    ctx.fill();
  },
  home(ctx, r) {
    stroke(ctx, r);
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, 0); ctx.lineTo(0, -r * 0.42); ctx.lineTo(r * 0.45, 0);
    ctx.moveTo(-r * 0.3, -r * 0.05); ctx.lineTo(-r * 0.3, r * 0.4); ctx.lineTo(r * 0.3, r * 0.4); ctx.lineTo(r * 0.3, -r * 0.05);
    ctx.stroke();
  },
  /** n Pfeile nach rechts: 1 = langsam, 3 = schnell. */
  speed: (n) => (ctx, r) => {
    const s = r * 0.2;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * s * 1.5;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, -s); ctx.lineTo(x + s * 0.6, 0); ctx.lineTo(x - s * 0.6, s);
      ctx.closePath();
      ctx.fill();
    }
  },
  stars: (n) => (ctx, r) => {
    const s = r * 0.2;
    for (let i = 0; i < n; i++) star(ctx, (i - (n - 1) / 2) * s * 2.6, 0, s);
  },
};

/** Runder Leucht-Button. Löst aus, wenn der Ball `dwell` Sekunden darauf liegt (oder per Mausklick). */
export class DwellButton {
  constructor({ x, y, r, dwell = 1, color = '#fff', icon = null, label = '', sub = '', onActivate }) {
    Object.assign(this, { x, y, r, dwell, color, icon, label, sub, onActivate });
    this.progress = 0;
    // Liegt der Ball beim Erscheinen schon auf dem Button, muss er ihn erst einmal verlassen.
    this.armed = false;
  }

  contains(x, y) {
    return Math.hypot(x - this.x, y - this.y) < this.r;
  }

  /** Gibt true zurück, wenn der Button gerade ausgelöst hat. */
  update(dt, ball) {
    const inside = ball.visible && this.contains(ball.x, ball.y);
    if (!this.armed) {
      if (!inside) this.armed = true;
      return false;
    }
    if (!inside) {
      this.progress = Math.max(0, this.progress - dt * 2);
      return false;
    }
    this.progress += dt / this.dwell;
    if (this.progress < 1) return false;
    this.progress = 0;
    this.armed = false;
    this.onActivate();
    return true;
  }

  draw(ctx) {
    const { x, y } = this;
    const r = this.r * (1 + 0.06 * this.progress);
    const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, tone(this.color, 24, 70));
    g.addColorStop(1, tone(this.color, 7, 70));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.color === '#fff' ? 'rgba(30,30,48,0.9)' : g;
    ctx.fill();
    ctx.lineWidth = r * 0.05;
    ctx.strokeStyle = this.color;
    glow(ctx, this.color, 24);
    ctx.stroke();
    noGlow(ctx);
    if (this.progress > 0) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, -Math.PI / 2, -Math.PI / 2 + this.progress * Math.PI * 2);
      ctx.lineWidth = r * 0.09;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#fff';
      glow(ctx, '#fff', 18);
      ctx.stroke();
      noGlow(ctx);
    }
    if (this.icon) {
      ctx.save();
      ctx.translate(x, y);
      this.icon(ctx, r);
      ctx.restore();
    }
    if (this.label) text(ctx, this.label, x, y + this.r + 46, 44, tone(this.color, 70), 'center', 8);
    if (this.sub) text(ctx, this.sub, x, y + this.r + 92, 30, '#fff', 'center', 0);
  }
}

/** Aktualisiert Buttons; bricht ab, sobald einer ausgelöst hat (die Szene kann dann gewechselt haben). */
export function updateButtons(buttons, dt, ball) {
  for (const b of buttons) if (b.update(dt, ball)) return true;
  return false;
}

export function clickButtons(buttons, x, y) {
  const b = buttons.find((btn) => btn.contains(x, y));
  if (b) b.onActivate();
  return !!b;
}

/**
 * Skilli, das Maskottchen: eine blaue Kugel mit weißem Stirnband.
 * mood: 'happy' = lächelt, 'cheer' = jubelt und hüpft, 'sad' = schaut betrübt.
 */
export function mascot(ctx, x, y, r, mood = 'happy', time = 0, look = null) {
  const hop = mood === 'cheer' ? -Math.abs(Math.sin(time * 7)) * r * 0.35 : Math.sin(time * 2) * r * 0.05;
  const cy = y + hop;
  // Schatten am Boden
  ctx.beginPath();
  ctx.ellipse(x, y + r * 1.02, r * (0.75 + hop / r * 0.5), r * 0.14, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  orb(ctx, x, cy, r, 'hsl(212 90% 55%)');
  // Stirnband
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - r, cy - r * 0.62, r * 2, r * 0.24);
  ctx.restore();
  eyes(ctx, x, cy + r * 0.08, r, look?.x ?? x, look?.y ?? cy + (mood === 'sad' ? 10 : -10));
  // Mund
  ctx.strokeStyle = '#0a0a18';
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood === 'cheer') {
    ctx.ellipse(x, cy + r * 0.5, r * 0.2, r * 0.17, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a18';
    ctx.fill();
  } else if (mood === 'sad') {
    ctx.arc(x, cy + r * 0.68, r * 0.24, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else {
    ctx.arc(x, cy + r * 0.34, r * 0.28, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
}

/** Sprechblase mit Text, die Spitze zeigt nach links unten (zum Maskottchen). */
export function bubble(ctx, str, x, y, size = 30) {
  ctx.font = `600 ${size}px ${theme.family}`;
  const w = ctx.measureText(str).width + size * 1.4, h = size * 1.9;
  ctx.beginPath();
  ctx.roundRect(x, y - h / 2, w, h, h / 2);
  ctx.moveTo(x + 22, y + h / 2 - 2);
  ctx.lineTo(x - 6, y + h / 2 + 18);
  ctx.lineTo(x + 50, y + h / 2 - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0b1d4a';
  ctx.fillText(str, x + size * 0.7, y + 2);
}

/** Konfetti-Regen in den Vereinsfarben. */
export class Confetti {
  constructor(width, colors, n = 110) {
    this.bits = Array.from({ length: n }, () => ({
      x: Math.random() * width, y: -40 - Math.random() * 500,
      vx: (Math.random() - 0.5) * 120, vy: 220 + Math.random() * 260,
      rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12,
      size: 10 + Math.random() * 12, color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }

  update(dt) {
    for (const b of this.bits) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.spin * dt;
    }
  }

  draw(ctx) {
    for (const b of this.bits) {
      if (b.y > 1040) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2 * Math.abs(Math.cos(b.rot * 1.3)) + 2);
      ctx.restore();
    }
  }
}
