// Spiel "Rhythmus": Kugeln laufen auf Bahnen nach unten. Wenn eine Kugel den Kreis
// am Ende ihrer Bahn erreicht, muss der Ball dort liegen. Die Bahnen wechseln ständig –
// so entsteht ein Vorhand-Rückhand-Wechsel im Takt. Auf "Leicht" zwei Bahnen, sonst drei.
import { glow, noGlow, orb, tone } from '../ui.js';
import { Fx } from './common.js';

const LEVELS = {
  1: { lanes: 2, every: 1.3, speed: 260 },
  2: { lanes: 3, every: 1.0, speed: 320 },
  3: { lanes: 3, every: 0.78, speed: 380 },
};
const HIT_Y = 790;   // hier sitzen die Kreise
const WINDOW = 75;   // so nah muss die Kugel am Kreis sein, damit sie zählt
const PAD = 70;
const NOTES = [392, 494, 587]; // ein Ton pro Bahn

class Rhythm {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.spawnIn = 0.6;
    this.last = -1;
    this.notes = [];
    this.fx = new Fx();
    const cx = env.field.w / 2;
    this.lanes = this.p.lanes === 2 ? [cx - 160, cx + 160] : [cx - 250, cx, cx + 250];
  }

  update(dt, ball) {
    const { env, p, fx } = this;
    this.time += dt;
    fx.update(dt);

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      // nie zweimal dieselbe Bahn hintereinander
      let lane;
      do lane = Math.floor(Math.random() * this.lanes.length); while (lane === this.last);
      this.last = lane;
      this.notes.push({ lane, y: 170 });
      this.spawnIn = p.every / env.ramp;
    }

    this.notes = this.notes.filter((n) => {
      n.y += p.speed * env.ramp * dt;
      const x = this.lanes[n.lane];
      const off = Math.abs(n.y - HIT_Y);
      if (off < WINDOW && ball.visible && Math.abs(ball.x - x) < PAD + 30 && Math.abs(ball.y - HIT_Y) < 150) {
        const perfect = off < 28;
        const points = env.combo(perfect ? 10 : 6, (p.every / env.ramp) * 2.2);
        env.sound.tone(NOTES[n.lane % NOTES.length] * (perfect ? 2 : 1), 0.18, { type: 'triangle', vol: 0.25 });
        fx.text(x, HIT_Y - 90, perfect ? `Perfekt! +${points}` : `+${points}`, env.palette[perfect ? 1 : 0], perfect ? 50 : 42);
        fx.ring(x, HIT_Y, env.palette[1], PAD * 2);
        return false;
      }
      if (n.y > HIT_Y + WINDOW) {
        env.miss();
        fx.text(x, HIT_Y, 'Verpasst', '#fff', 36);
        return false;
      }
      return true;
    });
  }

  draw(ctx) {
    const { env } = this;
    const [c0, c1, c2] = env.palette;
    this.lanes.forEach((x, i) => {
      // Bahn
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x - PAD, 160, PAD * 2, HIT_Y - 160);
      // Kreis am Ende der Bahn; leuchtet auf, wenn gleich eine Kugel ankommt
      const soon = this.notes.some((n) => n.lane === i && HIT_Y - n.y < 220);
      ctx.beginPath();
      ctx.arc(x, HIT_Y, PAD, 0, Math.PI * 2);
      ctx.fillStyle = tone(c0, soon ? 22 : 9, 70);
      ctx.fill();
      ctx.lineWidth = soon ? 8 : 4;
      ctx.strokeStyle = soon ? '#fff' : c0;
      glow(ctx, c0, soon ? 30 : 14);
      ctx.stroke();
      noGlow(ctx);
    });
    for (const n of this.notes) orb(ctx, this.lanes[n.lane], n.y, 44, n.lane % 2 ? c2 : c1);
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'rhythm',
  hint: 'Leg den Ball in den Kreis, wenn die Kugel ankommt!',
  name: 'Rhythmus',
  duration: 60,
  scale: 0.4,
  medals: [[260, 860, 1200], [130, 540, 1180], [110, 390, 1120]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    // Musiknote
    ctx.beginPath();
    ctx.ellipse(-r * 0.14, r * 0.3, r * 0.15, r * 0.11, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.01, r * 0.28); ctx.lineTo(-r * 0.01, -r * 0.42); ctx.lineTo(r * 0.28, -r * 0.3);
    ctx.stroke();
  },
  create: (env) => new Rhythm(env),
};
