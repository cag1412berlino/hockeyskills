// Spiel "Pendel": Vorhand-Rückhand-Wechsel. Zwei Felder leuchten abwechselnd auf,
// der Ball muss hin und her. Ein Ring zieht sich um das aktive Feld zusammen:
// Wer ankommt, bevor er geschlossen ist, ist "im Takt" und bekommt dreifache Punkte.
// Alle paar Wechsel ändert sich die Aufgabe: mal enger, mal weiter, an anderer Stelle, in anderer
// Richtung – und in späten Abschnitten kommt ein Dreieck aus drei Feldern dazu.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, creature, tone } from '../ui.js';
import { Fx, penalty } from './common.js';

const LEVELS = {
  //   Feldgröße, Sekunden pro Wechsel bei normalem Abstand, kleinster und größter halber Abstand, schräge Lagen
  1: { r: 95, beat: 1.5, min: 150, max: 270, tilt: 0.45 },
  2: { r: 78, beat: 1.15, min: 125, max: 300, tilt: Math.PI },
  3: { r: 64, beat: 0.9, min: 105, max: 320, tilt: Math.PI },
};
const NORMAL = 200; // bei diesem halben Abstand gilt die Taktzeit aus der Tabelle

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
    // Lage der Felder: Mitte, Drehwinkel, halber Abstand, Anzahl – jeweils aktuell und Ziel (für weiches Umziehen)
    this.c = { x: env.field.w / 2, y: 560, a: 0, d: NORMAL, n: 2 };
    this.goal = { ...this.c };
    this.changeAt = 5; // nach so vielen Wechseln ändert sich die Aufgabe
  }

  /** Taktzeit: Ein weiter Weg bekommt mehr Zeit als ein kurzer. */
  beat() {
    return (this.p.beat * (0.6 + (0.4 * this.goal.d) / NORMAL)) / this.env.ramp;
  }

  /** Die Felder liegen gleichmäßig auf einem Kreis um die Mitte: zwei gegenüber oder drei im Dreieck. */
  pads() {
    const { c } = this;
    return Array.from({ length: c.n }, (_, i) => {
      const a = c.a + Math.PI + (i * Math.PI * 2) / c.n;
      return { x: c.x + Math.cos(a) * c.d, y: c.y + Math.sin(a) * c.d };
    });
  }

  /**
   * Neue Aufgabe: Abstand, Richtung und Ort ändern sich. Ab der zweiten Schwierigkeitsstufe
   * einer Runde kommt gelegentlich ein Dreieck aus drei Feldern dazu.
   */
  change() {
    const { env, p, fx } = this;
    const { field } = env;
    const before = this.goal;
    // Abstand: bewusst mal eng, mal weit – nie zweimal fast derselbe
    let d;
    do d = p.min + Math.random() * (p.max - p.min); while (Math.abs(d - before.d) < 45);
    const n = env.stage >= 2 && Math.random() < 0.28 ? 3 : 2;
    if (n === 3) d = Math.min(d, 230);
    const m = d + p.r + 30;
    this.goal = {
      x: m + Math.random() * Math.max(0, field.w - 2 * m),
      y: m + 150 + Math.random() * Math.max(0, field.h - 2 * m - 150),
      a: (Math.random() - 0.5) * 2 * p.tilt,
      d, n,
    };
    this.c.n = n;
    this.active = 0;
    this.changeAt = this.hits + 4 + Math.floor(Math.random() * 4);
    const what = n === 3 ? 'Dreieck!' : d > before.d + 30 ? 'Weiter auseinander!' : d < before.d - 30 ? 'Enger!' : 'Neue Richtung!';
    fx.text(this.goal.x, Math.max(250, this.goal.y - d - p.r - 30), what, '#fff', 44);
    env.sound.select();
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
    c.d += (goal.d - c.d) * k;

    // Wer zu lange trödelt, verliert die Serie.
    if (this.since > this.beat() * 3 && !this.lapsed) {
      this.lapsed = true;
      env.miss();
      if (ball.visible) penalty(env, this.fx, ball.x, ball.y - 50, 5);
    }
    if (!ball.visible) return;

    const pad = this.pads()[this.active];
    if (Math.hypot(ball.x - pad.x, ball.y - pad.y) < p.r + BALL_RADIUS * 0.5) {
      const inTime = this.hits === 0 || this.since <= this.beat();
      // Kleine Grundpunkte, weil hier sehr viele Wechsel pro Runde zusammenkommen.
      const points = env.combo(inTime ? 3 : 1, this.beat() * 2.5);
      env.sound.pop(inTime ? 4 : 0);
      // Der Hinweis "Im Takt!" erscheint nur, wenn man gerade in den Takt gefunden hat – sonst stapeln sich die Texte.
      this.inTakt = inTime ? (this.inTakt || 0) + 1 : 0;
      fx.text(pad.x, pad.y - p.r, this.inTakt === 1 && this.hits > 0 ? `Im Takt! +${points}` : `+${points}`, env.palette[inTime ? 1 : 0], inTime ? 50 : 40);
      fx.ring(pad.x, pad.y, env.palette[1], p.r * 1.8);
      this.hits++;
      this.active = (this.active + 1) % c.n;
      this.since = 0;
      this.lapsed = false;
      if (this.hits >= this.changeAt) this.change();
    }
  }

  draw(ctx) {
    const { env, p } = this;
    const [c0, c1] = env.palette;
    const pads = this.pads();

    // Verbindungslinien mit laufenden Strichen in Richtung des aktiven Felds
    ctx.setLineDash([10, 18]);
    ctx.lineDashOffset = -this.time * 90;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    pads.forEach((to, i) => {
      const from = pads[(i + pads.length - 1) % pads.length];
      if (pads.length === 2 && i !== this.active) return; // bei zwei Feldern genügt eine Linie
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    pads.forEach((pad, i) => {
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
  scale: 0.8,
  medals: [[190, 820, 1700], [120, 530, 1390], [60, 340, 840]],
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
