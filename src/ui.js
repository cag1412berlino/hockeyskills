// Bausteine für die projizierte Oberfläche im Arcade-Stil: Leuchtschrift, Symbole
// und Buttons, die man auslöst, indem man den Ball kurz darauf liegen lässt.

export const theme = {
  family: 'ui-monospace, Menlo, Consolas, monospace',
  scale: 0.9, // Korrekturfaktor, damit Texte in beiden Schriften etwa gleich breit sind
  px: 1,      // Bildschirm-Pixel pro Feld-Einheit (für den Leuchteffekt)
};

export function usePixelFont() {
  theme.family = '"Press Start 2P", monospace';
  theme.scale = 0.55;
}

/** Neon-Leuchten für alles, was danach gezeichnet wird. Mit noGlow wieder ausschalten. */
export function glow(ctx, color, blur = 22) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * theme.px;
}

export function noGlow(ctx) {
  ctx.shadowBlur = 0;
}

export function text(ctx, str, x, y, size, color = '#fff', align = 'center', blur = size * 0.25) {
  ctx.font = `${size * theme.scale}px ${theme.family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if (blur) glow(ctx, color, blur);
  ctx.fillText(String(str).toUpperCase(), x, y);
  noGlow(ctx);
}

/** Überschrift mit versetztem Farbschatten, wie auf alten Spielautomaten. */
export function title(ctx, str, x, y, size, color, shadow) {
  text(ctx, str, x + size * 0.06, y + size * 0.06, size, shadow, 'center', 0);
  text(ctx, str, x, y, size, color);
}

export function star(ctx, x, y, r, color = '#fff', rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Gefahr sieht in allen Spielen gleich aus: ein weißer, sich drehender Stachelball. */
export function hazard(ctx, x, y, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = rot + (i * Math.PI) / 8;
    const rr = i % 2 ? r * 0.62 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#3a3a44';
  ctx.fill();
  ctx.lineWidth = r * 0.12;
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = '#fff';
  glow(ctx, '#fff', 18);
  ctx.stroke();
  noGlow(ctx);
  ctx.lineWidth = r * 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.22, y - r * 0.22); ctx.lineTo(x + r * 0.22, y + r * 0.22);
  ctx.moveTo(x + r * 0.22, y - r * 0.22); ctx.lineTo(x - r * 0.22, y + r * 0.22);
  ctx.stroke();
}

const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

/** Pixel-Herz für die Lebensanzeige; x, y ist die Mitte. */
export function heart(ctx, x, y, size, color) {
  const s = size / 7;
  ctx.fillStyle = color;
  HEART.forEach((row, j) => {
    for (let i = 0; i < 7; i++) {
      if (row[i] === 'X') ctx.fillRect(x - size / 2 + i * s, y - s * 3 + j * s, s + 0.5, s + 0.5);
    }
  });
}

const stroke = (ctx, r) => {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.14;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
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
    const s = r * 0.24;
    for (let i = 0; i < n; i++) star(ctx, (i - (n - 1) / 2) * s * 2.2, 0, s);
  },
};

/** Runder Neon-Button. Löst aus, wenn der Ball `dwell` Sekunden darauf liegt (oder per Mausklick). */
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
    const { x, y, r } = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.lineWidth = r * 0.07;
    ctx.strokeStyle = this.color;
    glow(ctx, this.color, 26);
    ctx.stroke();
    noGlow(ctx);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.lineWidth = r * 0.025;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (this.progress > 0) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, -Math.PI / 2, -Math.PI / 2 + this.progress * Math.PI * 2);
      ctx.lineWidth = r * 0.14;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#fff';
      glow(ctx, '#fff', 20);
      ctx.stroke();
      noGlow(ctx);
    }
    if (this.icon) {
      ctx.save();
      ctx.translate(x, y);
      this.icon(ctx, r);
      ctx.restore();
    }
    if (this.label) text(ctx, this.label, x, y + r + 48, 46, this.color);
    if (this.sub) text(ctx, this.sub, x, y + r + 100, 32, '#fff', 'center', 0);
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
