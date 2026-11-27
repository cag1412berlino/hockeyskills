// Spiel "Pendel": Vorhand-Rückhand-Wechsel. Zwei Felder leuchten abwechselnd auf,
// der Ball muss hin und her. Ein Ring zieht sich um das aktive Feld zusammen:
// Wer ankommt, bevor er geschlossen ist, ist "im Takt" und bekommt dreifache Punkte.
// Später wandert das Feldpaar durchs Feld und dreht sich (quer, schräg, vor und zurück).
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, creature, tone } from '../ui.js';
import { Fx } from './common.js';

const LEVELS = {
  //   Feldgröße, halber Abstand der Felder, Sekunden pro Wechsel
  1: { r: 95, d: 200, beat: 1.5 },
  2: { r: 78, d: 180, beat: 1.15 },
  3: { r: 64, d: 160, beat: 0.9 },
};
const MOVE_EVERY = 8; // nach so vielen Wechseln zieht das Feldpaar um

class Pendulum {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.since = 0;      // Sekunden seit dem letzten Wechsel
    this.hits = 0;
    this.active = 0;
    this.lapsed = false;
    this.fx = new Fx();
    // Mitte und Drehwinkel des Feldpaars, jeweils aktuell und Ziel (für weiches Umziehen)
    this.c = { x: env.field.w / 2, y: 560, a: 0 };
    this.goal = { ...this.c };
  }

  beat() {
    return this.p.beat / this.env.ramp;
  }

  pads() {
    const { c, p } = this;
    const dx = Math.cos(c.a) * p.d, dy = Math.sin(c.a) * p.d;
    return [{ x: c.x - dx, y: c.y - dy }, { x: c.x + dx, y: c.y + dy }];
  }

  /** Neuer Platz für das Feldpaar; ab Stufe 2 auch schräg oder längs. */
  relocate() {
    const { env, p } = this;
    const { field } = env;
    const m = p.d + p.r + 30;
    this.goal = {
      x: m + Math.random() * (field.w - 2 * m),
      y: m + 150 + Math.random() * (field.h - 2 * m - 150),
      a: env.stage >= 2 ? (Math.floor(Math.random() * 4) * Math.PI) / 4 : 0,
    };
  }

  update(dt, ball) {
    const { env, p, fx, c, goal } = this;
    this.time += dt;
    this.since += dt;
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    fx.update(dt);
    const k = Math.min(1, 4 * dt);
    c.x += (goal.x - c.x) * k;
    c.y += (goal.y - c.y) * k;
    c.a += (goal.a - c.a) * k;

    // Wer zu lange trödelt, verliert die Serie.
    if (this.since > this.beat() * 3 && !this.lapsed) {
      this.lapsed = true;
      env.miss();
    }
    if (!ball.visible) return;

    const pad = this.pads()[this.active];
    if (Math.hypot(ball.x - pad.x, ball.y - pad.y) < p.r + BALL_RADIUS * 0.5) {
      const inTime = this.hits === 0 || this.since <= this.beat();
      // Kleine Grundpunkte, weil hier sehr viele Wechsel pro Runde zusammenkommen.
      const points = env.combo(inTime ? 3 : 1, this.beat() * 2.5);
      env.sound.pop(inTime ? 4 : 0);
      fx.text(pad.x, pad.y - p.r, inTime ? `Im Takt! +${points}` : `+${points}`, env.palette[inTime ? 1 : 0], inTime ? 54 : 44);
      fx.ring(pad.x, pad.y, env.palette[1], p.r * 1.8);
      this.hits++;
      this.active = 1 - this.active;
      this.since = 0;
      this.lapsed = false;
      if (env.stage >= 1 && this.hits % MOVE_EVERY === 0) this.relocate();
    }
  }

  draw(ctx) {
    const { env, p } = this;
    const [c0, c1] = env.palette;
    const [a, b] = this.pads();

    // Verbindungslinie mit laufenden Strichen in Richtung des aktiven Felds
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.setLineDash([10, 18]);
    ctx.lineDashOffset = (this.active ? -1 : 1) * this.time * 90;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();
    ctx.setLineDash([]);

    [a, b].forEach((pad, i) => {
      if (i === this.active) {
        creature(ctx, pad.x, pad.y, p.r * (1 + 0.04 * Math.sin(this.time * 8)), c1, this.look, this.time);
        // Takt-Ring: zieht sich zusammen, solange man noch im Takt ist
        const left = 1 - this.since / this.beat();
        if (left > 0) {
          ctx.beginPath();
          ctx.arc(pad.x, pad.y, p.r * (1.08 + 0.7 * left), 0, Math.PI * 2);
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#fff';
          glow(ctx, '#fff', 14);
          ctx.stroke();
          noGlow(ctx);
        }
      } else {
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = tone(c0, 10, 70);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = tone(c0, 40);
        ctx.stroke();
      }
    });
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'pendulum',
  hint: 'Zieh den Ball im Takt hin und her!',
  name: 'Pendel',
  duration: 60,
  scale: 0.65,
  medals: [[180, 780, 1370], [130, 600, 1420], [70, 420, 1340]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * r * 0.38, 0, r * 0.16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-r * 0.14, 0); ctx.lineTo(r * 0.14, 0);
    ctx.moveTo(-r * 0.06, -r * 0.08); ctx.lineTo(-r * 0.14, 0); ctx.lineTo(-r * 0.06, r * 0.08);
    ctx.moveTo(r * 0.06, -r * 0.08); ctx.lineTo(r * 0.14, 0); ctx.lineTo(r * 0.06, r * 0.08);
    ctx.stroke();
  },
  create: (env) => new Pendulum(env),
};
