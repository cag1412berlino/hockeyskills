// Spiel "Achter": Den Ball in einer Acht um zwei Hütchen führen.
// Leuchtende Wegpunkte zeigen, wo es langgeht. Jede Schleife bringt Punkte,
// berührte Hütchen kosten welche. Später wechselt die Richtung, und die Wegpunkte werden kleiner.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, tone } from '../ui.js';
import { Fx } from './common.js';

const LEVELS = {
  //   halber Abstand der Hütchen, Radius der Schleifen, Größe der Wegpunkte
  1: { d: 230, R: 160, zone: 95 },
  2: { d: 205, R: 140, zone: 80 },
  3: { d: 165, R: 108, zone: 54 },
};
const POST = 24;

class Eight {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.hurt = 0;
    this.next = 0;
    this.loops = 0;
    this.reversed = false;
    this.fx = new Fx();
    const cx = env.field.w / 2, cy = 590;
    const { d, R } = this.p;
    this.posts = [{ x: cx - d, y: cy }, { x: cx + d, y: cy }];
    const [a, b] = this.posts;
    const mid = { x: cx, y: cy, mid: true };
    // Wegpunkte einer Acht: um das linke Hütchen, durch die Mitte, um das rechte, durch die Mitte.
    this.base = [
      { x: a.x, y: a.y - R }, { x: a.x - R, y: a.y }, { x: a.x, y: a.y + R }, mid,
      { x: b.x, y: b.y - R }, { x: b.x + R, y: b.y }, { x: b.x, y: b.y + R }, mid,
    ];
    this.seq = this.base;
  }

  update(dt, ball) {
    const { env, p, fx } = this;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    fx.update(dt);
    if (!ball.visible) return;

    if (this.hurt <= 0 && this.posts.some((q) => Math.hypot(q.x - ball.x, q.y - ball.y) < POST + BALL_RADIUS * 0.6)) {
      env.addScore(-5);
      env.miss();
      env.sound.bad();
      env.shake(10);
      this.hurt = 1;
      fx.text(ball.x, ball.y, '-5');
    }

    const zone = p.zone * (1 - 0.06 * env.stage);
    const w = this.seq[this.next];
    if (Math.hypot(ball.x - w.x, ball.y - w.y) > zone) return;
    env.addScore(env.mult);
    env.sound.blip();
    this.next = (this.next + 1) % this.seq.length;
    if (!w.mid) return;

    // Durch die Mitte: eine Schleife ist geschafft.
    this.loops++;
    const points = env.combo(10, 7);
    env.sound.pop(env.mult);
    fx.text(w.x, w.y - 50, `+${points}`, env.palette[1], 50 + env.mult * 8);
    fx.ring(w.x, w.y, env.palette[1], 140);
    if (env.stage >= 1 && this.loops % 4 === 0) {
      // Nach zwei ganzen Achten: andersherum. Die Mitte bleibt der Ausgangspunkt.
      this.reversed = !this.reversed;
      this.seq = this.reversed ? [...this.base].reverse() : this.base;
      this.next = this.seq.findIndex((q) => q.mid) + 1;
      fx.text(w.x, w.y - 130, 'Andersherum!', '#fff', 56);
      env.sound.stage();
    }
  }

  draw(ctx) {
    const { env, p } = this;
    const [c0, c1] = env.palette;
    const zone = p.zone * (1 - 0.06 * env.stage);

    // Die Acht als feine, laufende Strichlinie
    ctx.beginPath();
    this.seq.forEach((q, i) => {
      const n = this.seq[(i + 1) % this.seq.length];
      if (!i) ctx.moveTo((q.x + n.x) / 2, (q.y + n.y) / 2);
      const nn = this.seq[(i + 2) % this.seq.length];
      ctx.quadraticCurveTo(n.x, n.y, (n.x + nn.x) / 2, (n.y + nn.y) / 2);
    });
    ctx.setLineDash([10, 18]);
    ctx.lineDashOffset = -this.time * 70;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();
    ctx.setLineDash([]);

    // Der nächste Wegpunkt leuchtet, die zwei danach sind angedeutet.
    for (let k = 2; k >= 0; k--) {
      const q = this.seq[(this.next + k) % this.seq.length];
      ctx.globalAlpha = [1, 0.4, 0.2][k];
      ctx.beginPath();
      ctx.arc(q.x, q.y, zone * (k ? 0.7 : 1 + 0.05 * Math.sin(this.time * 8)), 0, Math.PI * 2);
      ctx.fillStyle = tone(c1, 14, 70);
      ctx.fill();
      ctx.lineWidth = k ? 3 : 6;
      ctx.strokeStyle = c1;
      if (!k) glow(ctx, c1, 24);
      ctx.stroke();
      noGlow(ctx);
    }
    ctx.globalAlpha = 1;

    for (const q of this.posts) {
      const g = ctx.createRadialGradient(q.x - 6, q.y - 8, 2, q.x, q.y, POST);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, tone(c0, 55));
      ctx.beginPath();
      ctx.arc(q.x, q.y, POST, 0, Math.PI * 2);
      ctx.fillStyle = g;
      glow(ctx, c0, 18);
      ctx.fill();
      noGlow(ctx);
    }
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'eight',
  hint: 'Führe den Ball in einer Acht um die Hütchen!',
  name: 'Achter',
  duration: 60,
  scale: 0.35,
  medals: [[180, 530, 900], [160, 570, 950], [60, 460, 1030]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.beginPath();
    ctx.arc(-r * 0.24, 0, r * 0.24, 0, Math.PI * 2);
    ctx.moveTo(r * 0.48, 0);
    ctx.arc(r * 0.24, 0, r * 0.24, 0, Math.PI * 2);
    ctx.stroke();
  },
  create: (env) => new Eight(env),
};
