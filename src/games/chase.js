// Spiel "Fangen": Fänger jagen den Ball – je nach Stufe zwei, drei oder vier.
// Jeder Fänger jagt anders: einer direkt, einer schneidet den Weg ab, einer kommt von der Seite,
// einer ist groß und gemütlich. Fänger sind träge und können nicht eng wenden:
// Mit schnellen Richtungswechseln lässt man sie ins Leere laufen.
// Sterne bringen Punkte, die Schneeflocke friert alle Fänger kurz ein. Drei Leben.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, hazard, star, tone, text } from '../ui.js';
import { Fx } from './common.js';

const LEVELS = {
  1: { count: 2, speed: 95 },
  2: { count: 3, speed: 125 },
  3: { count: 4, speed: 155 },
};

// Die vier Fänger-Typen in der Reihenfolge, in der sie dazukommen.
const KINDS = [
  { name: 'direct', r: 50, pace: 1 },      // läuft geradewegs auf den Ball zu
  { name: 'ahead', r: 44, pace: 1.1 },     // zielt dorthin, wo der Ball gleich sein wird
  { name: 'flank', r: 44, pace: 1.05 },    // kommt von der Seite
  { name: 'heavy', r: 66, pace: 0.75 },    // groß und langsam
];

class Chase {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.safe = 0;      // Sekunden Schonzeit nach dem Start und nach einem Fang
    this.frozen = 0;
    this.survive = 0;
    this.star = null;
    this.ice = null;
    this.iceIn = 10 + Math.random() * 5;
    this.fx = new Fx();
    this.chasers = KINDS.slice(0, this.p.count).map((k) => ({ ...k, x: 0, y: 0, vx: 0, vy: 0 }));
    this.reset();
  }

  /** Alle Fänger zurück in die Ecken, kurze Schonzeit. */
  reset() {
    const { field } = this.env;
    const corners = [[90, 230], [field.w - 90, field.h - 90], [field.w - 90, 230], [90, field.h - 90]];
    this.chasers.forEach((c, i) => {
      [c.x, c.y] = corners[i];
      c.vx = c.vy = 0;
    });
    this.safe = 1.8;
  }

  spot(ball, away) {
    const { field } = this.env;
    let s = null;
    for (let tries = 0; tries < 20; tries++) {
      s = { x: 90 + Math.random() * (field.w - 180), y: 220 + Math.random() * (field.h - 310) };
      if (!ball.visible || Math.hypot(s.x - ball.x, s.y - ball.y) > away) break;
    }
    return s;
  }

  /** Wohin der Fänger gerade will. */
  goal(c, ball) {
    const { field } = this.env;
    if (!ball.visible) return { x: field.w / 2, y: field.h / 2 + 60 };
    if (c.name === 'ahead') return { x: ball.x + ball.vx * 0.6, y: ball.y + ball.vy * 0.6 };
    if (c.name === 'flank') {
      // seitlich versetzt anlaufen; nah am Ball dann direkt zugreifen
      const d = Math.hypot(ball.x - c.x, ball.y - c.y);
      if (d < 220) return ball;
      const a = Math.atan2(ball.y - c.y, ball.x - c.x) + Math.PI / 2;
      return { x: ball.x + Math.cos(a) * 200, y: ball.y + Math.sin(a) * 200 };
    }
    return ball;
  }

  update(dt, ball) {
    const { env, p, fx } = this;
    const { field } = env;
    this.time += dt;
    this.safe = Math.max(0, this.safe - dt);
    this.frozen = Math.max(0, this.frozen - dt);
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    fx.update(dt);

    if (!this.star) this.star = this.spot(ball, 350);
    this.iceIn -= dt;
    if (this.iceIn <= 0 && !this.ice) {
      this.ice = { ...this.spot(ball, 250), age: 0 };
      this.iceIn = 13 + Math.random() * 6;
    }
    if (this.ice && (this.ice.age += dt) > 6) this.ice = null;

    if (this.safe <= 0 && this.frozen <= 0) {
      for (const c of this.chasers) {
        const g = this.goal(c, ball);
        const d = Math.hypot(g.x - c.x, g.y - c.y) || 1;
        const speed = p.speed * c.pace * env.ramp;
        // Träge Lenkung: Die Geschwindigkeit dreht sich nur allmählich zum Ziel.
        c.vx += ((g.x - c.x) / d * speed - c.vx) * Math.min(1, 2.2 * dt);
        c.vy += ((g.y - c.y) / d * speed - c.vy) * Math.min(1, 2.2 * dt);
        // Fänger halten Abstand voneinander, damit sie nicht auf einem Haufen laufen.
        for (const o of this.chasers) {
          if (o === c) continue;
          const dd = Math.hypot(c.x - o.x, c.y - o.y) || 1;
          const min = c.r + o.r + 30;
          if (dd < min) { c.vx += ((c.x - o.x) / dd) * (min - dd) * 4 * dt * 10; c.vy += ((c.y - o.y) / dd) * (min - dd) * 4 * dt * 10; }
        }
        c.x = Math.min(field.w - c.r, Math.max(c.r, c.x + c.vx * dt));
        c.y = Math.min(field.h - c.r, Math.max(c.r + 140, c.y + c.vy * dt));
      }
    }
    if (!ball.visible) return;

    // Jede Sekunde in Freiheit zählt.
    this.survive += dt;
    if (this.survive >= 1) { this.survive -= 1; env.addScore(2); }

    if (Math.hypot(this.star.x - ball.x, this.star.y - ball.y) < 48 + BALL_RADIUS) {
      const points = env.combo(10, 4);
      env.sound.pop(env.mult);
      fx.text(this.star.x, this.star.y, `+${points}`, env.palette[1], 50 + env.mult * 8);
      fx.burst(this.star.x, this.star.y, env.palette[1], 16);
      this.star = this.spot(ball, 350);
    }
    if (this.ice && Math.hypot(this.ice.x - ball.x, this.ice.y - ball.y) < 46 + BALL_RADIUS) {
      env.sound.power();
      this.frozen = 3;
      fx.text(this.ice.x, this.ice.y, 'Eingefroren!', env.palette[2]);
      fx.ring(this.ice.x, this.ice.y, '#fff', 220);
      this.ice = null;
    }

    if (this.safe <= 0 && this.frozen <= 0) {
      for (const c of this.chasers) {
        if (Math.hypot(c.x - ball.x, c.y - ball.y) < c.r * 0.75 + BALL_RADIUS) {
          env.sound.bad();
          env.miss();
          env.shake(26);
          fx.flash(0.45);
          fx.text(ball.x, ball.y, 'Gefangen!');
          env.loseLife();
          this.reset();
          break;
        }
      }
    }
  }

  draw(ctx) {
    const { env } = this;
    const [, c1, c2] = env.palette;
    if (this.star) {
      glow(ctx, c1, 26);
      star(ctx, this.star.x, this.star.y, 44 + 5 * Math.sin(this.time * 6), tone(c1, 68), this.time * 1.5);
      noGlow(ctx);
    }
    const ice = this.ice;
    if (ice) {
      ctx.globalAlpha = ice.age > 4.5 ? 0.5 + 0.5 * Math.sin(this.time * 14) : 1; // blinkt, bevor sie verschwindet
      ctx.beginPath();
      ctx.arc(ice.x, ice.y, 46, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,10,30,0.85)';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = c2;
      glow(ctx, c2, 22);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.moveTo(ice.x - Math.cos(a) * 24, ice.y - Math.sin(a) * 24);
        ctx.lineTo(ice.x + Math.cos(a) * 24, ice.y + Math.sin(a) * 24);
      }
      ctx.stroke();
      noGlow(ctx);
      ctx.globalAlpha = 1;
    }
    for (const c of this.chasers) {
      // In der Schonzeit blinken die Fänger, eingefroren sind sie blass und stehen still.
      ctx.globalAlpha = this.safe > 0 ? 0.35 + 0.3 * Math.sin(this.time * 12) : this.frozen > 0 ? 0.45 : 1;
      hazard(ctx, c.x, c.y, c.r, this.frozen > 0 ? 0 : this.time * 2 * c.pace, this.look);
      if (this.frozen > 0) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 10, 0, Math.PI * 2);
        ctx.lineWidth = 5;
        ctx.strokeStyle = tone(c2, 75);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (this.safe > 0 && this.time > 2) text(ctx, 'Weiter!', env.field.w / 2, 420, 70);
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'chase',
  name: 'Fangen',
  duration: 60,
  lives: 3,
  medals: [140, 280, 440],
  icon(ctx, r) {
    // Ball vorneweg, zwei Fänger hinterher
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(r * 0.38, -r * 0.22, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.05;
    ctx.lineJoin = 'round';
    for (const [x, y, s] of [[-0.3, 0.2, 0.26], [0.02, -0.02, 0.2]]) {
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        const rr = r * s * (i % 2 ? 0.62 : 1);
        ctx.lineTo(r * x + Math.cos(a) * rr, r * y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.stroke();
    }
  },
  create: (env) => new Chase(env),
};
