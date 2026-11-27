// Bausteine für die projizierte Oberfläche: Text, Symbole und Buttons,
// die man auslöst, indem man den Ball kurz darauf liegen lässt.

export function text(ctx, str, x, y, size, color = '#fff', align = 'center') {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function star(ctx, x, y, r, color = '#fff') {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

const stroke = (ctx, r) => {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.14;
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
    ctx.arc(0, 0, r * 0.4, -Math.PI * 0.35, Math.PI * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.02, -r * 0.6); ctx.lineTo(r * 0.3, -r * 0.36); ctx.lineTo(r * 0.02, -r * 0.1);
    ctx.stroke();
  },
  home(ctx, r) {
    stroke(ctx, r);
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, 0); ctx.lineTo(0, -r * 0.42); ctx.lineTo(r * 0.45, 0);
    ctx.moveTo(-r * 0.3, -r * 0.05); ctx.lineTo(-r * 0.3, r * 0.4); ctx.lineTo(r * 0.3, r * 0.4); ctx.lineTo(r * 0.3, -r * 0.05);
    ctx.stroke();
  },
  stars: (n) => (ctx, r) => {
    const s = r * 0.24;
    for (let i = 0; i < n; i++) star(ctx, (i - (n - 1) / 2) * s * 2.2, 0, s);
  },
};

/** Runder Button. Löst aus, wenn der Ball `dwell` Sekunden darauf liegt (oder per Mausklick). */
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
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.lineWidth = r * 0.07;
    ctx.strokeStyle = this.color;
    ctx.stroke();
    if (this.progress > 0) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.88, -Math.PI / 2, -Math.PI / 2 + this.progress * Math.PI * 2);
      ctx.lineWidth = r * 0.14;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    if (this.icon) {
      ctx.save();
      ctx.translate(x, y);
      this.icon(ctx, r);
      ctx.restore();
    }
    if (this.label) text(ctx, this.label, x, y + r + 45, 46);
    if (this.sub) text(ctx, this.sub, x, y + r + 95, 32, 'rgba(255,255,255,0.7)');
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
