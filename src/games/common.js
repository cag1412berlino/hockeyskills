// Gemeinsame Bausteine für mehrere Spiele.
import { glow, noGlow } from '../ui.js';

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
      ctx.setLineDash([26, 20]);
      ctx.lineWidth = 8;
      ctx.strokeStyle = z.color;
      glow(ctx, z.color, 16);
      ctx.stroke();
      noGlow(ctx);
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }
}

/** Kleine Explosion aus Pixel-Quadraten. */
export function burst(list, x, y, color, n = 18) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 150 + Math.random() * 500;
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, color });
  }
}
