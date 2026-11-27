// Gemeinsame Bausteine für mehrere Spiele: Effekte und die Stoppzone.
import { glow, noGlow, text } from '../ui.js';

/** Sammelt alle kurzlebigen Effekte eines Spiels: Funken, Druckwellen, Punktetexte, Blitz. */
export class Fx {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.flashAmt = 0;
  }

  burst(x, y, color, n = 22) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 120 + Math.random() * 520;
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0,
        life: 0.4 + Math.random() * 0.45, size: 3 + Math.random() * 7, color,
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
      ctx.lineWidth = 6 * (1 - k) + 1;
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
      text(ctx, t.str, t.x, t.y - 30 - t.age * 90, t.size * pop, t.color);
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
