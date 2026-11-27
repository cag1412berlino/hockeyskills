// Spiel "Tippen": Den Ball so oft wie möglich über die Linie und zurück ziehen –
// kurze, schnelle Berührungen wie beim engen Vorhand-Rückhand-Wechsel.
// Gezählt wird erst, wenn der Ball auf der anderen Seite die gestrichelte Marke erreicht.
// Später zieht die Linie um und dreht sich.
import { glow, noGlow, text, tone } from '../ui.js';
import { Fx } from './common.js';

const LEVELS = {
  //   Abstand der Marke von der Linie, "schnell" heißt unter so vielen Sekunden
  1: { gap: 70, fast: 0.9 },
  2: { gap: 55, fast: 0.7 },
  3: { gap: 32, fast: 0.45 },
};
const REACH = 330;      // so weit von der Linienmitte zählt ein Wechsel noch
const MOVE_EVERY = 12;  // nach so vielen Wechseln zieht die Linie um

class Taps {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.since = 0;
    this.count = 0;
    this.side = 0;     // auf welcher Seite der Ball zuletzt die Marke erreicht hat
    this.fx = new Fx();
    // Mitte und Richtung der Linie, jeweils aktuell und Ziel (für weiches Umziehen)
    this.c = { x: env.field.w / 2, y: 570, a: Math.PI / 2 };
    this.goal = { ...this.c };
  }

  relocate() {
    const { field, stage } = this.env;
    this.goal = {
      x: 300 + Math.random() * (field.w - 600),
      y: 420 + Math.random() * (field.h - 700),
      a: stage >= 2 ? Math.PI / 2 + (Math.floor(Math.random() * 4) * Math.PI) / 4 : Math.PI / 2,
    };
    this.side = 0;
  }

  update(dt, ball) {
    const { env, p, fx, c, goal } = this;
    this.time += dt;
    this.since += dt;
    fx.update(dt);
    const k = Math.min(1, 4 * dt);
    c.x += (goal.x - c.x) * k;
    c.y += (goal.y - c.y) * k;
    c.a += (goal.a - c.a) * k;
    if (!ball.visible) return;
    if (Math.hypot(ball.x - c.x, ball.y - c.y) > REACH) { this.side = 0; return; }

    // Abstand des Balls von der Linie, mit Vorzeichen für die Seite
    const s = (ball.x - c.x) * -Math.sin(c.a) + (ball.y - c.y) * Math.cos(c.a);
    const now = s > p.gap ? 1 : s < -p.gap ? -1 : 0;
    if (!now || now === this.side) return;
    if (this.side) {
      this.count++;
      const points = env.combo(this.since <= p.fast ? 3 : this.since <= p.fast * 1.8 ? 2 : 1, p.fast * 3.5);
      env.sound.pop(Math.min(5, env.mult + 1));
      fx.text(ball.x, ball.y, `+${points}`, env.palette[1], 40);
      this.since = 0;
      if (env.stage >= 1 && this.count % MOVE_EVERY === 0) this.relocate();
    }
    this.side = now;
  }

  draw(ctx) {
    const { env, p, c } = this;
    const [c0, c1] = env.palette;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.a);
    // Marken links und rechts der Linie
    ctx.setLineDash([12, 14]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-230, s * p.gap);
      ctx.lineTo(230, s * p.gap);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-260, 0);
    ctx.lineTo(260, 0);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = c0;
    glow(ctx, c0, 26);
    ctx.stroke();
    noGlow(ctx);
    ctx.restore();
    text(ctx, this.count, c.x, c.y - 300 < 200 ? c.y + 330 : c.y - 320, 110, tone(c1, 75), 'center', 12);
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'taps',
  hint: 'Zieh den Ball so oft du kannst über die Linie!',
  name: 'Tippen',
  duration: 60,
  scale: 0.45,
  medals: [[160, 530, 950], [190, 530, 960], [200, 760, 1060]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.5); ctx.lineTo(0, r * 0.5);
    ctx.moveTo(-r * 0.4, -r * 0.2); ctx.lineTo(r * 0.4, -r * 0.2);
    ctx.moveTo(r * 0.28, -r * 0.3); ctx.lineTo(r * 0.4, -r * 0.2); ctx.lineTo(r * 0.28, -r * 0.1);
    ctx.moveTo(r * 0.4, r * 0.2); ctx.lineTo(-r * 0.4, r * 0.2);
    ctx.moveTo(-r * 0.28, r * 0.1); ctx.lineTo(-r * 0.4, r * 0.2); ctx.lineTo(-r * 0.28, r * 0.3);
    ctx.stroke();
  },
  create: (env) => new Taps(env),
};
