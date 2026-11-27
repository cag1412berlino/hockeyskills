// Bedienelemente der projizierten Oberfläche: Symbole, Buttons, die man auslöst,
// indem man den Ball kurz darauf liegen lässt, Sprechblase und Konfetti.
// Zeichen-Grundlagen und Figuren werden von hier aus weitergereicht, damit ein Import genügt.
import { theme, glow, noGlow, tone, text, star } from './draw.js';

export * from './draw.js';
export * from './characters.js';

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
  ctx.lineWidth = r * 0.055;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
};

/** Symbole, jeweils um den Nullpunkt gezeichnet, r = Radius des Buttons. */
export const icons = {
  /** Pokal: Punkte-Rangliste */
  trophy(ctx, r) {
    stroke(ctx, r);
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.42); ctx.lineTo(r * 0.3, -r * 0.42);
    ctx.quadraticCurveTo(r * 0.3, r * 0.12, 0, r * 0.14);
    ctx.quadraticCurveTo(-r * 0.3, r * 0.12, -r * 0.3, -r * 0.42);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    // Henkel
    ctx.moveTo(-r * 0.3, -r * 0.32); ctx.quadraticCurveTo(-r * 0.56, -r * 0.3, -r * 0.24, -r * 0.02);
    ctx.moveTo(r * 0.3, -r * 0.32); ctx.quadraticCurveTo(r * 0.56, -r * 0.3, r * 0.24, -r * 0.02);
    // Fuß
    ctx.moveTo(0, r * 0.14); ctx.lineTo(0, r * 0.36);
    ctx.moveTo(-r * 0.24, r * 0.42); ctx.lineTo(r * 0.24, r * 0.42);
    ctx.stroke();
  },
  /** Kalenderblatt: Rangliste der Woche */
  calendar(ctx, r) {
    stroke(ctx, r);
    ctx.beginPath();
    ctx.roundRect(-r * 0.4, -r * 0.34, r * 0.8, r * 0.76, r * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.1); ctx.lineTo(r * 0.4, -r * 0.1);
    ctx.moveTo(-r * 0.2, -r * 0.46); ctx.lineTo(-r * 0.2, -r * 0.24);
    ctx.moveTo(r * 0.2, -r * 0.46); ctx.lineTo(r * 0.2, -r * 0.24);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(-r * 0.22 + (i % 3) * r * 0.22, r * 0.06 + Math.floor(i / 3) * r * 0.2, r * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  /** Schläger und Ball: Rangliste der meisten Spiele */
  stick(ctx, r) {
    stroke(ctx, r);
    ctx.lineWidth = r * 0.1;
    ctx.beginPath();
    ctx.moveTo(r * 0.28, -r * 0.46); ctx.lineTo(-r * 0.14, r * 0.26);
    ctx.quadraticCurveTo(-r * 0.24, r * 0.44, -r * 0.42, r * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r * 0.2, r * 0.3, r * 0.13, 0, Math.PI * 2); ctx.fill();
  },
  /** Medaille am Band: Rekorde */
  medal(ctx, r) {
    stroke(ctx, r);
    ctx.beginPath();
    ctx.moveTo(-r * 0.24, -r * 0.48); ctx.lineTo(-r * 0.06, -r * 0.08);
    ctx.moveTo(r * 0.24, -r * 0.48); ctx.lineTo(r * 0.06, -r * 0.08);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, r * 0.16, r * 0.27, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill(); ctx.stroke();
    star(ctx, 0, r * 0.16, r * 0.15, '#fff');
  },
  /** Zwei Figuren: Spieler wechseln oder alle Altersklassen */
  people(ctx, r) {
    stroke(ctx, r);
    for (const [x, k] of [[-r * 0.18, 1], [r * 0.22, 0.8]]) {
      ctx.beginPath(); ctx.arc(x, -r * 0.2 * k, r * 0.15 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, r * 0.36, r * 0.3 * k, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
  },
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
    const r = this.r * (1 + 0.05 * this.progress);
    const white = this.color === '#fff';
    // Glasfläche: dunkler Verlauf, oben etwas heller
    const g = ctx.createRadialGradient(x, y - r * 0.45, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, white ? 'rgba(70,80,120,0.55)' : tone(this.color, 26, 55));
    g.addColorStop(1, white ? 'rgba(14,18,40,0.9)' : tone(this.color, 6, 60));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // feiner Leuchtring
    ctx.lineWidth = Math.max(2, r * 0.028);
    ctx.strokeStyle = white ? 'rgba(255,255,255,0.9)' : tone(this.color, 66);
    glow(ctx, this.color, 22);
    ctx.stroke();
    noGlow(ctx);
    // Haarlinie innen und Lichtkante oben
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, Math.PI * 1.2, Math.PI * 1.8);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.stroke();
    if (this.progress > 0) {
      // Fortschritt: feiner heller Bogen außen
      ctx.beginPath();
      ctx.arc(x, y, r + 9, -Math.PI / 2, -Math.PI / 2 + this.progress * Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#fff';
      glow(ctx, '#fff', 14);
      ctx.stroke();
      noGlow(ctx);
    }
    if (this.icon) {
      ctx.save();
      ctx.translate(x, y);
      this.icon(ctx, r);
      ctx.restore();
    }
    if (this.label) text(ctx, this.label, x, y + this.r + 40, Math.min(38, 24 + this.r * 0.12), white ? '#fff' : tone(this.color, 80), 'center', 0, 500);
    if (this.sub) text(ctx, this.sub, x, y + this.r + 78, 23, 'rgba(255,255,255,0.6)', 'center', 0, 400);
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
