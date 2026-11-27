// Spiel "Lichtkegel": Ein Lichtkreis wandert durchs Feld, der Ball muss darin bleiben.
// Je länger am Stück, desto mehr Punkte. Mit jeder Stufe wird der Kreis kleiner,
// schneller und wechselt öfter die Richtung.
import { glow, noGlow, tone } from '../ui.js';
import { Fx, OffTrack } from './common.js';

const LEVELS = {
  1: { r: 155, speed: 95 },
  2: { r: 125, speed: 130 },
  3: { r: 100, speed: 165 },
};

class Spotlight {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.x = env.field.w / 2;
    this.y = 560;
    this.vx = 0;
    this.vy = 0;
    this.goal = { x: this.x, y: this.y };
    this.goalIn = 1.5;   // am Anfang steht das Licht kurz still
    this.inside = false;
    this.hold = 0;       // Sekunden am Stück im Licht
    this.outFor = 0;
    this.guard = new OffTrack({ grace: 0.5, every: 0.7, start: 4, step: 3 });
    this.acc = 0;
    this.fx = new Fx();
  }

  radius() {
    return this.p.r * (1 - 0.08 * this.env.stage);
  }

  update(dt, ball) {
    const { env, p, fx } = this;
    const { field } = env;
    this.time += dt;
    fx.update(dt);

    this.goalIn -= dt;
    const r = this.radius();
    if (this.goalIn <= 0 || Math.hypot(this.goal.x - this.x, this.goal.y - this.y) < 50) {
      this.goal = { x: r + 30 + Math.random() * (field.w - 2 * r - 60), y: r + 180 + Math.random() * (field.h - 2 * r - 210) };
      this.goalIn = 4 / env.ramp;
    }
    // Weiches Lenken zum nächsten Zielpunkt
    const d = Math.hypot(this.goal.x - this.x, this.goal.y - this.y) || 1;
    const speed = p.speed * env.ramp;
    this.vx += (((this.goal.x - this.x) / d) * speed - this.vx) * Math.min(1, 1.6 * dt);
    this.vy += (((this.goal.y - this.y) / d) * speed - this.vy) * Math.min(1, 1.6 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.inside = ball.visible && Math.hypot(ball.x - this.x, ball.y - this.y) < r;
    this.guard.update(dt, ball.visible && !this.inside, env, fx, ball);
    if (this.inside) {
      this.outFor = 0;
      const before = Math.floor(this.hold / 2);
      this.hold += dt;
      this.acc += dt * 3;
      while (this.acc >= 1) { this.acc -= 1; env.addScore(env.mult); }
      // alle zwei Sekunden am Stück gibt es einen Serien-Treffer
      if (Math.floor(this.hold / 2) > before) {
        const points = env.combo(5, 3);
        env.sound.pop(env.mult);
        fx.text(this.x, this.y - r - 20, `+${points}`, env.palette[1], 46);
      }
    } else if (ball.visible) {
      this.outFor += dt;
      // Kurz draußen ist verziehen. Danach blinkt es rot, die Serie ist weg, und solange man
      // im Dunkeln bleibt, wird der Abzug immer größer.
      if (this.outFor > 0.5) this.hold = 0;
    }
  }

  draw(ctx) {
    const { env } = this;
    const [c0, c1] = env.palette;
    const r = this.radius();
    const g = ctx.createRadialGradient(this.x, this.y, r * 0.1, this.x, this.y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    const blink = !this.inside && Math.floor(this.time * 6) % 2 === 0;
    const edge = this.inside ? c1 : this.guard.active ? this.guard.color(c0) : blink ? '#fff' : c0;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = edge;
    glow(ctx, edge, 28);
    ctx.stroke();
    noGlow(ctx);
    // Fortschritt bis zum nächsten Serien-Treffer
    if (this.inside) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 14, -Math.PI / 2, -Math.PI / 2 + ((this.hold % 2) / 2) * Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = tone(c1, 78);
      ctx.stroke();
    }
    this.fx.draw(ctx, env.field);
    this.guard.draw(ctx, env.field);
  }
}

export default {
  id: 'spotlight',
  hint: 'Bleib mit dem Ball im Licht!',
  name: 'Lichtkegel',
  duration: 60,
  scale: 0.45,
  medals: [[250, 670, 940], [50, 560, 830], [20, 200, 630]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38);
      ctx.lineTo(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52);
    }
    ctx.stroke();
  },
  create: (env) => new Spotlight(env),
};
