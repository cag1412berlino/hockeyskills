// Spiel "Draht" (heißer Draht): Den Ball durch einen schmalen, gewundenen Gang zum Stern führen,
// ohne die Wand zu berühren. Wer anstößt, muss zum letzten Kontrollpunkt zurück.
// Kein Tempo-Spiel: Es zählt, wie weit man sauber kommt. Mit jeder Stufe wird der Gang enger.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, collectible, text, tone } from '../ui.js';
import { Fx, OffTrack } from './common.js';
import { spline } from './line.js';

const LEVELS = { 1: { width: 205 }, 2: { width: 172 }, 3: { width: 142 } };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

class Wire {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.zap = 0;
    this.dir = 1;
    this.fx = new Fx();
    this.newPath(null);
  }

  /** Neuer Gang quer übers Feld; er beginnt dort, wo der letzte aufgehört hat. */
  newPath(start) {
    const { env, p } = this;
    const { field } = env;
    const m = 130;
    const flip = Math.random() < 0.5 ? 0 : 1;
    const ctrl = [];
    for (let i = 0; i < 4; i++) {
      const fx = i / 3;
      ctrl.push({
        x: this.dir > 0 ? m + fx * (field.w - 2 * m) : field.w - m - fx * (field.w - 2 * m),
        y: (i + flip) % 2 ? 260 + Math.random() * 160 : 700 + Math.random() * 170,
      });
    }
    if (start) ctrl[0] = { ...start };
    this.path = spline(ctrl, field);
    this.width = p.width * (1 - 0.06 * env.stage);
    this.guard ??= new OffTrack();
    const last = this.path.length - 1;
    this.checkpoints = [1 / 3, 2 / 3].map((f) => ({ at: Math.round(last * f), done: false }));
    this.from = 0;                       // hier geht es nach einem Fehler weiter
    this.idx = 0;
    this.running = !!start;              // beim allerersten Gang muss der Ball erst zum Start
    this.dir *= -1;
  }

  update(dt, ball) {
    const { env, path, fx } = this;
    this.time += dt;
    this.zap = Math.max(0, this.zap - dt);
    fx.update(dt);
    this.guard.update(dt, false, env, fx, ball);
    if (!ball.visible) return;

    if (!this.running) {
      if (dist(ball, path[this.from]) < 60) {
        this.running = true;
        this.idx = this.from;
        env.sound.select();
      }
      return;
    }

    // Nächstgelegene Stelle des Gangs suchen – nur in der Nähe der bisherigen Position,
    // damit man nicht in einen benachbarten Abschnitt hinüberspringen kann.
    let best = this.idx, min = Infinity;
    for (let k = Math.max(0, this.idx - 12); k < Math.min(path.length, this.idx + 16); k++) {
      const d = dist(ball, path[k]);
      if (d < min) { min = d; best = k; }
    }
    if (min > this.width / 2 - BALL_RADIUS * 0.35) {
      // Wand berührt
      env.addScore(-5);
      env.miss();
      env.sound.bad();
      env.shake(16);
      this.zap = 0.5;
      this.guard.hit();
      fx.text(ball.x, ball.y, 'Angestoßen! -5');
      this.running = false;
      return;
    }
    this.idx = best;

    for (const cp of this.checkpoints) {
      if (!cp.done && this.idx >= cp.at) {
        cp.done = true;
        this.from = cp.at;
        const points = env.combo(10, 12);
        env.sound.pop(env.mult);
        fx.text(path[cp.at].x, path[cp.at].y, `+${points}`, env.palette[1]);
        fx.ring(path[cp.at].x, path[cp.at].y, env.palette[1], this.width);
      }
    }
    if (this.idx >= path.length - 3) {
      const end = path[path.length - 1];
      const points = env.combo(30, 12);
      env.sound.win();
      fx.text(end.x, end.y, `Geschafft! +${points}`, env.palette[0], 64);
      fx.burst(end.x, end.y, env.palette[0], 30);
      this.newPath(end);
    }
  }

  draw(ctx) {
    const { env, path } = this;
    const [c0, c1, c2] = env.palette;
    const last = path.length - 1;

    // Gang: erst breit in Leuchtfarbe, dann etwas schmaler dunkel darüber – übrig bleiben die Wände.
    const wall = this.zap > 0 ? this.guard.color(c0) : c0;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const q of path) ctx.lineTo(q.x, q.y);
    ctx.lineWidth = this.width + 6;
    ctx.strokeStyle = wall;
    glow(ctx, wall, 24);
    ctx.stroke();
    noGlow(ctx);
    ctx.lineWidth = this.width;
    ctx.strokeStyle = tone(c2, 9, 60);
    ctx.stroke();

    // Geschaffter Teil als feine Leuchtspur
    if (this.idx > 0) {
      ctx.beginPath();
      for (let i = 0; i <= this.idx; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.lineWidth = 3;
      ctx.strokeStyle = tone(c1, 70);
      ctx.stroke();
    }

    for (const cp of this.checkpoints) {
      const q = path[cp.at];
      ctx.beginPath();
      ctx.arc(q.x, q.y, 18, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = cp.done ? tone(c1, 70) : 'rgba(255,255,255,0.45)';
      ctx.stroke();
    }
    glow(ctx, c1, 22);
    collectible(ctx, path[last].x, path[last].y, 36 + 4 * Math.sin(this.time * 5), tone(c1, 68), this.time);
    noGlow(ctx);

    if (!this.running) {
      // Startpunkt: hier muss der Ball zuerst hin
      const s = path[this.from];
      ctx.beginPath();
      ctx.arc(s.x, s.y, 46 + 8 * Math.sin(this.time * 7), 0, Math.PI * 2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#fff';
      glow(ctx, '#fff', 18);
      ctx.stroke();
      noGlow(ctx);
      text(ctx, 'Start', s.x, s.y - 80, 40);
    }
    this.fx.draw(ctx, env.field);
    this.guard.draw(ctx, env.field);
  }
}

export default {
  id: 'wire',
  hint: 'Führe den Ball durch den Gang, ohne die Wand zu berühren!',
  name: 'Draht',
  duration: 60,
  scale: 0.6,
  medals: [[40, 770, 1280], [20, 530, 1290], [20, 190, 1260]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const o of [-0.1, 0.1]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, r * (0.25 + o));
      ctx.bezierCurveTo(-r * 0.2, r * (-0.55 + o), r * 0.15, r * (0.6 + o), r * 0.5, r * (-0.2 + o));
      ctx.stroke();
    }
  },
  create: (env) => new Wire(env),
};
