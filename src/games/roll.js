// Spiel "Zielrollen": Den Ball vom Startfeld aus anschieben und loslassen, sodass er
// von selbst auf der Zielscheibe ausrollt. Trainiert das Gefühl für die Passstärke.
// Liegt er daneben, sagt das Spiel, ob er zu kurz, zu weit oder seitlich vorbei war.
// Die Kamera sieht nur den Ball: Dass der Schläger wirklich loslässt, ist Ehrensache.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, text, tone } from '../ui.js';
import { Fx, Rest, drawBullseye, penalty } from './common.js';

const LEVELS = {
  //   Größe der Zielscheibe, Entfernung zum Ziel (von, bis)
  1: { scale: 1.15, dist: [380, 480] },
  2: { scale: 0.9, dist: [420, 560] },
  3: { scale: 0.72, dist: [460, 640] },
};
const RINGS = [40, 90, 145];
const PAD = 72;        // Radius des Startfelds
const MIN_PUSH = 200;  // so schnell muss der Ball das Startfeld mindestens verlassen

class Roll {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.fx = new Fx();
    this.start = { x: env.field.w / 2, y: 860 };
    this.setup();
  }

  /** Neues Ziel in passender Entfernung vom Startfeld. */
  setup() {
    const { env, p } = this;
    const { field } = env;
    const k = p.scale * (1 - 0.06 * env.stage);
    this.rings = RINGS.map((r) => r * k);
    let t = null;
    for (let tries = 0; tries < 60; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = p.dist[0] + Math.random() * (p.dist[1] - p.dist[0]);
      t = { x: this.start.x + Math.cos(a) * d, y: this.start.y + Math.sin(a) * d };
      if (t.x > 170 && t.x < field.w - 170 && t.y > 330 && t.y < field.h - 170) break;
      t = null;
    }
    // Findet sich nichts (Startfeld ungünstig), kommt das Ziel in die gegenüberliegende Feldhälfte.
    this.target = t ?? { x: field.w - this.start.x, y: this.start.y > 600 ? 400 : 800 };
    this.state = 'load'; // 'load' = Ball aufs Startfeld, 'aim' = bereit, 'roll' = unterwegs, 'show' = Ergebnis
    this.rest = new Rest(0.4, 25);
    this.timer = 0;
  }

  judge(ball) {
    const { env, fx, start, target: t } = this;
    const d = Math.hypot(ball.x - t.x, ball.y - t.y);
    if (d <= this.rings[2]) {
      const ring = d <= this.rings[0] ? 0 : d <= this.rings[1] ? 1 : 2;
      const points = env.combo([25, 15, 8][ring], 14);
      if (ring === 0) env.sound.power(); else env.sound.pop(2 - ring);
      fx.text(t.x, t.y - 40, `${['Perfekt!', 'Gut!', 'Knapp!'][ring]} +${points}`, env.palette[ring === 0 ? 1 : 0], ring === 0 ? 60 : 48);
      fx.ring(t.x, t.y, env.palette[1], this.rings[2] * 1.4);
    } else {
      // Wie weit ist der Ball in Zielrichtung gekommen, und wie weit lag er seitlich daneben?
      const len = Math.hypot(t.x - start.x, t.y - start.y);
      const ux = (t.x - start.x) / len, uy = (t.y - start.y) / len;
      const along = (ball.x - start.x) * ux + (ball.y - start.y) * uy;
      const side = Math.abs((ball.x - start.x) * -uy + (ball.y - start.y) * ux);
      env.miss();
      penalty(env, fx, ball.x, ball.y - 95, 6);
      env.sound.end();
      fx.text(ball.x, ball.y - 40, side > this.rings[2] ? 'Seitlich vorbei' : along < len ? 'Zu kurz!' : 'Zu weit!', '#fff', 50);
    }
    this.state = 'show';
    this.timer = 1.3;
  }

  update(dt, ball) {
    const { env, fx, start } = this;
    const { field } = env;
    this.time += dt;
    fx.update(dt);

    if (this.state === 'show') {
      this.timer -= dt;
      if (this.timer > 0) return;
      // Das nächste Startfeld liegt beim alten Ziel, damit das Kind nicht weit laufen muss.
      this.start = {
        x: Math.max(120, Math.min(field.w - 120, this.target.x)),
        y: Math.max(280, Math.min(field.h - 120, this.target.y)),
      };
      this.setup();
      return;
    }
    if (!ball.visible) return;
    const away = Math.hypot(ball.x - start.x, ball.y - start.y);

    if (this.state === 'load') {
      if (away < PAD && this.rest.update(dt, ball)) {
        this.state = 'aim';
        env.sound.select();
      } else if (away >= PAD) {
        this.rest.reset();
      }
    } else if (this.state === 'aim') {
      if (away > PAD + 25) {
        if (Math.hypot(ball.vx, ball.vy) < MIN_PUSH) {
          fx.text(ball.x, ball.y - 40, 'Fester anschieben!', '#fff', 44);
          this.state = 'load';
          this.rest.reset();
        } else {
          this.state = 'roll';
          this.timer = 0;
          this.rest = new Rest(0.5, 18);
        }
      }
    } else if (this.state === 'roll') {
      this.timer += dt;
      if (this.rest.update(dt, ball) || this.timer > 6) this.judge(ball);
    }
  }

  draw(ctx) {
    const { env, start, target: t, state } = this;
    const [c0, c1] = env.palette;

    // Ziellinie mit laufenden Strichen
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(t.x, t.y);
    ctx.setLineDash([8, 20]);
    ctx.lineDashOffset = -this.time * 80;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();
    ctx.setLineDash([]);

    drawBullseye(ctx, t, this.rings, c0, this.time);

    const ready = state === 'aim';
    ctx.beginPath();
    ctx.arc(start.x, start.y, PAD + (state === 'load' ? 6 * Math.sin(this.time * 7) : 0), 0, Math.PI * 2);
    ctx.fillStyle = tone(c1, ready ? 13 : 9, 70); // dunkel halten: Hier liegt der Ball, farbiges Licht würde ihn verfälschen
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ready ? '#fff' : c1;
    glow(ctx, c1, 22);
    ctx.stroke();
    noGlow(ctx);
    if (state === 'load' && this.rest.progress > 0.05) {
      ctx.beginPath();
      ctx.arc(start.x, start.y, PAD - 12, -Math.PI / 2, -Math.PI / 2 + this.rest.progress * Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    const label = state === 'load' ? 'Ball auf Start legen' : state === 'aim' ? 'Anschieben und loslassen!' : '';
    if (label) text(ctx, label, env.field.w / 2, 215, 44, '#fff', 'center', 6);
    if (state === 'roll') {
      // Ring um den Ball zeigt: Jetzt nicht mehr berühren
      ctx.beginPath();
      ctx.arc(this.rest.anchor?.x ?? 0, this.rest.anchor?.y ?? 0, BALL_RADIUS + 30, -Math.PI / 2, -Math.PI / 2 + this.rest.progress * Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = tone(c1, 75);
      if (this.rest.anchor) ctx.stroke();
    }
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'roll',
  hint: 'Schieb den Ball an und lass ihn ins Ziel rollen!',
  name: 'Zielrollen',
  duration: 60,
  scale: 2.5,
  medals: [[190, 1220, 3910], [120, 690, 3230], [40, 260, 1930]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-r * 0.4, r * 0.25, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([r * 0.08, r * 0.1]);
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, r * 0.16); ctx.lineTo(r * 0.1, -r * 0.06);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(r * 0.3, -r * 0.18, r * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  },
  create: (env) => new Roll(env),
};
