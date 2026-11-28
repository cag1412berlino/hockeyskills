// Spiel "Tippen": Den Ball so oft wie möglich über die Linie und zurück ziehen –
// schnelle Berührungen wie beim Vorhand-Rückhand-Wechsel.
// Gezählt wird erst, wenn der Ball auf der anderen Seite die gestrichelte Marke erreicht.
// "Leicht": ruhige Linie, kurze Wege. Ab "Mittel" liegen die Marken weiter auseinander (längere
// Zieher), die Linie wandert ständig und schwenkt, und es gibt Überraschungen: Drehung, Sprung,
// Goldlinie (doppelte Punkte). Auf "Schwer" atmet zusätzlich der Abstand der Marken.
import { glow, noGlow, text, tone } from '../ui.js';
import { Fx } from './common.js';
import { gold } from './spectacle.js';

const LEVELS = {
  //   Abstand der Marke von der Linie, "schnell" heißt unter so vielen Sekunden,
  //   wie weit die Linie wandert (x, y), wie stark sie schwenkt (Bogenmaß), Überraschung alle n Wechsel
  1: { gap: 70, fast: 0.9, drift: [0, 0], sway: 0, every: 0 },
  2: { gap: 100, fast: 0.85, drift: [170, 70], sway: 0.4, every: 9 },
  3: { gap: 135, fast: 0.8, drift: [270, 100], sway: 0.7, every: 7 },
};
const REACH = 360;      // so weit von der Linienmitte zählt ein Wechsel noch
const MOVE_EVERY = 12;  // nach so vielen Wechseln zieht die Linie um (Leicht)
const SURPRISES = [
  { id: 'turn', name: 'Drehung!' },
  { id: 'jump', name: 'Sprung!' },
  { id: 'gold', name: 'Goldlinie – doppelte Punkte!' },
];

class Taps {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.since = 0;
    this.count = 0;
    this.side = 0;     // auf welcher Seite der Ball zuletzt die Marke erreicht hat
    this.fx = new Fx();
    this.goldLeft = 0; // Sekunden Goldlinie
    this.sign = null;
    this.last = null;
    // Mitte und Richtung der Linie, jeweils aktuell und Ziel (für weiches Umziehen)
    this.c = { x: env.field.w / 2, y: 570, a: Math.PI / 2 };
    this.goal = { ...this.c };
    this.now = { ...this.c, gap: this.p.gap };
  }

  relocate() {
    const { field, stage } = this.env;
    this.goal = {
      x: 340 + Math.random() * (field.w - 680),
      y: 430 + Math.random() * (field.h - 720),
      a: stage >= 2 || this.env.level >= 2 ? Math.PI / 2 + (Math.floor(Math.random() * 4) * Math.PI) / 4 : Math.PI / 2,
    };
    this.side = 0;
  }

  /** Überraschung ab "Mittel": jedes Mal eine andere als zuletzt. */
  surprise() {
    const { env, fx } = this;
    const s = SURPRISES.filter((x) => x !== this.last)[Math.floor(Math.random() * (SURPRISES.length - 1))];
    this.last = s;
    this.sign = { str: s.name, age: 0 };
    env.say(s.name.replace(/ –.*|!/g, ''));
    if (s.id === 'turn') { this.goal.a += Math.PI / 2; this.side = 0; }
    else if (s.id === 'jump') this.relocate();
    else { this.goldLeft = 6; env.sound.power(); fx.burst(this.now.x, this.now.y, gold(62), 30); }
  }

  update(dt, ball) {
    const { env, p, fx, c, goal } = this;
    this.time += dt;
    this.since += dt;
    this.goldLeft = Math.max(0, this.goldLeft - dt);
    if (this.sign && (this.sign.age += dt) > 1.8) this.sign = null;
    fx.update(dt);
    const k = Math.min(1, 4 * dt);
    c.x += (goal.x - c.x) * k;
    c.y += (goal.y - c.y) * k;
    c.a += (goal.a - c.a) * k;
    // Ab "Mittel" wandert und schwenkt die Linie ständig, auf "Schwer" atmet auch der Abstand der Marken
    const t = this.time, { field } = env;
    const now = this.now;
    now.x = Math.max(300, Math.min(field.w - 300, c.x + p.drift[0] * Math.sin(t * 0.45)));
    now.y = Math.max(330, Math.min(field.h - 230, c.y + p.drift[1] * Math.sin(t * 0.7 + 1)));
    now.a = c.a + p.sway * Math.sin(t * 0.6);
    now.gap = p.gap + (env.level >= 3 ? 25 * Math.sin(t * 0.9) : 0);
    if (!ball.visible) return;
    if (Math.hypot(ball.x - now.x, ball.y - now.y) > REACH) { this.side = 0; return; }

    // Abstand des Balls von der Linie, mit Vorzeichen für die Seite
    const s = (ball.x - now.x) * -Math.sin(now.a) + (ball.y - now.y) * Math.cos(now.a);
    const side = s > now.gap ? 1 : s < -now.gap ? -1 : 0;
    if (!side || side === this.side) return;
    if (this.side) {
      this.count++;
      const base = this.since <= p.fast ? 3 : this.since <= p.fast * 1.8 ? 2 : 1;
      const points = env.combo(base * (this.goldLeft > 0 ? 2 : 1), p.fast * 3.5);
      env.sound.pop(Math.min(5, env.mult + 1));
      fx.text(ball.x, ball.y, `+${points}`, this.goldLeft > 0 ? gold(65) : env.palette[1], 40);
      this.since = 0;
      if (p.every && this.count % p.every === 0) this.surprise();
      else if (!p.every && env.stage >= 1 && this.count % MOVE_EVERY === 0) this.relocate();
    }
    this.side = side;
  }

  draw(ctx) {
    const { env, now } = this;
    const [c0, c1] = env.palette;
    const golden = this.goldLeft > 0;
    const line = golden ? gold(60) : c0;
    ctx.save();
    ctx.translate(now.x, now.y);
    ctx.rotate(now.a);
    // Marken links und rechts der Linie
    ctx.setLineDash([12, 14]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = golden ? gold(70) : 'rgba(255,255,255,0.4)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-230, s * now.gap);
      ctx.lineTo(230, s * now.gap);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-260, 0);
    ctx.lineTo(260, 0);
    ctx.lineWidth = golden ? 9 : 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = line;
    glow(ctx, line, golden ? 40 : 26);
    ctx.stroke();
    noGlow(ctx);
    ctx.restore();
    const ty = now.y - 330 < 200 ? now.y + 340 : now.y - 330;
    text(ctx, this.count, now.x, ty, 110, golden ? gold(70) : tone(c1, 75), 'center', 12);
    if (golden) text(ctx, `x2 · ${Math.ceil(this.goldLeft)}`, now.x, ty + 70, 30, gold(70), 'center', 8, 600);
    if (this.sign) {
      const a = this.sign.age, k = a < 0.25 ? a / 0.25 : a > 1.4 ? (1.8 - a) / 0.4 : 1;
      ctx.globalAlpha = Math.max(0, k);
      text(ctx, this.sign.str, env.field.w / 2, 200, 46, '#fff', 'center', 12, 600);
      ctx.globalAlpha = 1;
    }
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'taps',
  hint: 'Zieh den Ball so oft du kannst über die Linie – ab Mittel wandert sie!',
  name: 'Tippen',
  duration: 60,
  scale: 0.4,
  medals: [[140, 530, 950], [110, 550, 1210], [70, 360, 950]],
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
