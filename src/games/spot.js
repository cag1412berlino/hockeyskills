// Spiel "Punktlandung": Den Ball genau auf der Zielscheibe zum Liegen bringen.
// Je näher an der Mitte er ruhig liegt, desto mehr Punkte. Jede Scheibe bleibt nur
// eine begrenzte Zeit; mit jeder Stufe wird sie kleiner und die Zeit kürzer.
import { BALL_RADIUS } from '../engine.js';
import { tone } from '../ui.js';
import { Fx, Rest, randomSpot, drawBullseye } from './common.js';

const LEVELS = {
  1: { scale: 1, life: 10 },
  2: { scale: 0.8, life: 8 },
  3: { scale: 0.64, life: 6.5 },
};
const RINGS = [35, 80, 130];

class Spot {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.target = null;
    this.rest = new Rest(0.6, 20);
    this.fx = new Fx();
  }

  newTarget(ball) {
    const { env, p } = this;
    const k = p.scale * (1 - 0.06 * env.stage);
    this.target = { ...randomSpot(env.field, ball, 420), rings: RINGS.map((r) => r * k), left: p.life / env.ramp };
    this.target.total = this.target.left;
    this.rest.reset();
  }

  update(dt, ball) {
    const { env, fx } = this;
    this.time += dt;
    fx.update(dt);
    if (!this.target) this.newTarget(ball);
    const t = this.target;

    t.left -= dt;
    if (t.left <= 0) {
      env.miss();
      fx.text(t.x, t.y, 'Zu spät', '#fff', 40);
      this.newTarget(ball);
      return;
    }
    const d = Math.hypot(ball.x - t.x, ball.y - t.y);
    if (!ball.visible || d > t.rings[2] + BALL_RADIUS * 0.5) { this.rest.reset(); return; }
    if (!this.rest.update(dt, ball)) return;

    const ring = d <= t.rings[0] ? 0 : d <= t.rings[1] ? 1 : 2;
    const points = env.combo([20, 12, 6][ring], 7);
    if (ring === 0) env.sound.power(); else env.sound.pop(2 - ring);
    fx.text(t.x, t.y - 40, `${['Perfekt!', 'Gut!', 'Knapp!'][ring]} +${points}`, env.palette[ring === 0 ? 1 : 0], ring === 0 ? 60 : 48);
    fx.ring(t.x, t.y, env.palette[1], t.rings[2] * 1.4);
    if (ring === 0) fx.burst(t.x, t.y, env.palette[1], 20);
    this.newTarget(ball);
  }

  draw(ctx) {
    const { env, target: t, rest } = this;
    const [c0, c1] = env.palette;
    if (t) {
      drawBullseye(ctx, t, t.rings, c0, this.time);
      // äußerer Bogen: verbleibende Zeit
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.rings[2] + 14, -Math.PI / 2, -Math.PI / 2 + (t.left / t.total) * Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.stroke();
      // Bogen um den Ball: füllt sich, während er ruhig liegt
      if (rest.anchor && rest.progress > 0.05) {
        ctx.beginPath();
        ctx.arc(rest.anchor.x, rest.anchor.y, BALL_RADIUS + 30, -Math.PI / 2, -Math.PI / 2 + rest.progress * Math.PI * 2);
        ctx.lineWidth = 5;
        ctx.strokeStyle = tone(c1, 75);
        ctx.stroke();
      }
    }
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'spot',
  hint: 'Leg den Ball genau in die Mitte und lass ihn ruhig liegen!',
  name: 'Punktlandung',
  duration: 60,
  scale: 1.05,
  medals: [[130, 960, 3780], [80, 610, 3800], [50, 370, 3530]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
    ctx.moveTo(-r * 0.55, 0); ctx.lineTo(-r * 0.25, 0);
    ctx.moveTo(r * 0.25, 0); ctx.lineTo(r * 0.55, 0);
    ctx.moveTo(0, -r * 0.55); ctx.lineTo(0, -r * 0.25);
    ctx.moveTo(0, r * 0.25); ctx.lineTo(0, r * 0.55);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  },
  create: (env) => new Spot(env),
};
