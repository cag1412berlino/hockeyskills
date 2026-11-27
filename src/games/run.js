// Spiel "Rennen": Die Bahn läuft ununterbrochen von oben nach unten durchs Feld.
// Sie besteht aus Kurven, harten Schnitten nach links und rechts und Rückziehern,
// bei denen es ein Stück zurückgeht – wie die Richtungswechsel beim Hockey.
// Auf der Bahn bleiben bringt Punkte, Sterne an den Ecken bringen Serien.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, villain, randomVillain, collectible, tone } from '../ui.js';
import { Fx } from './common.js';

const LEVELS = {
  //            Bahnbreite, Tempo, Anteil harter Schnitte, Anteil Rückzieher, Stachelbälle
  1: { width: 240, speed: 120, cut: 0.25, back: 0.0, hazards: 0 },
  2: { width: 190, speed: 165, cut: 0.35, back: 0.15, hazards: 0.3 },
  3: { width: 155, speed: 210, cut: 0.4, back: 0.25, hazards: 0.45 },
};

/** Abstand von Punkt p zur Strecke a-b. */
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

class Run {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.scroll = 0;   // bisher zurückgelegte Strecke
    this.time = 0;
    // Die Bahn als Punktfolge. d = Position in Laufrichtung (wächst nach vorn), x = seitlich.
    this.pts = [{ x: env.field.w / 2, d: -1100 }, { x: env.field.w / 2, d: 500 }];
    this.items = [];   // Sterne, Stachelbälle und Pfeile an der Bahn
    this.onTrack = false;
    this.offFor = 0;
    this.acc = 0;
    this.hurt = 0;
    this.fx = new Fx();
  }

  get end() { return this.pts[this.pts.length - 1]; }

  /** Seitliches Ziel für das nächste Stück: bevorzugt zur anderen Feldseite. */
  sideways(min, max) {
    const { field } = this.env;
    const room = this.p.width / 2 + 40;
    const { x } = this.end;
    let dir = x > field.w / 2 ? -1 : 1;
    if (Math.random() < 0.2) dir *= -1;
    let nx = x + dir * (min + Math.random() * (max - min));
    if (nx < room || nx > field.w - room) nx = x - dir * (min + Math.random() * (max - min));
    return Math.max(room, Math.min(field.w - room, nx));
  }

  /** Hängt das nächste Stück Bahn an. */
  extend() {
    const { env, p } = this;
    const { x, d } = this.end;
    const roll = Math.random();
    const harder = 0.04 * env.stage; // mit jeder Stufe mehr harte Wechsel
    if (roll < p.back + harder) {
      // Rückzieher: schräg ein Stück zurück, dann geht es weiter nach vorn
      const nx = this.sideways(p.width * 1.5, p.width * 2);
      const back = 110 + Math.random() * 70;
      this.pts.push({ x: nx, d: d - back }, { x: nx, d: d + p.width + 120 });
      this.items.push({ kind: 'arrow', x: (x + nx) / 2, d: d - back / 2, a: Math.atan2(back, nx - x) });
      this.items.push({ kind: 'star', x: nx, d: d - back });
    } else if (roll < p.back + p.cut + harder * 2) {
      // Harter Schnitt: genau quer, dann geradeaus weiter
      const nx = this.sideways(p.width * 1.6, 420 + 60 * env.level);
      this.pts.push({ x: nx, d }, { x: nx, d: d + p.width + 160 });
      this.items.push({ kind: 'arrow', x: (x + nx) / 2, d, a: nx > x ? 0 : Math.PI });
      this.items.push({ kind: 'star', x: nx, d });
    } else {
      // Weiche Kurve
      const nx = this.sideways(150, 420);
      const len = 300 + Math.random() * 160;
      for (let i = 1; i <= 28; i++) {
        const t = i / 28;
        this.pts.push({ x: x + (nx - x) * t * t * (3 - 2 * t), d: d + len * t });
      }
      if (Math.random() < 0.5) this.items.push({ kind: 'star', x: nx, d: d + len });
    }
    // Gerades Zwischenstück, darauf manchmal ein Stachelball am Rand
    const e = this.end;
    this.pts.push({ x: e.x, d: e.d + p.width + 60 });
    if (Math.random() < p.hazards) {
      const side = Math.random() < 0.5 ? 1 : -1;
      this.items.push({ kind: 'hazard', face: randomVillain(), x: e.x + side * p.width * 0.27, d: e.d + p.width / 2 + 30 });
    }
  }

  update(dt, ball) {
    const { env, p, fx } = this;
    const { field } = env;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    fx.update(dt);

    this.scroll += p.speed * env.ramp * dt;
    while (this.end.d < this.scroll + 300) this.extend();
    // Was unten aus dem Bild gelaufen ist, wird vergessen.
    while (this.pts.length > 2 && this.pts[1].d < this.scroll - field.h - 400) this.pts.shift();
    this.items = this.items.filter((it) => !it.gone && it.d > this.scroll - field.h - 100);

    // Bildschirm-Koordinaten der Bahn (y wächst nach unten, die Bahn läuft auf den Spieler zu)
    this.screen = this.pts.map((q) => ({ x: q.x, y: this.scroll - q.d }));

    const was = this.onTrack;
    this.onTrack = false;
    if (ball.visible) {
      for (let i = 1; i < this.screen.length; i++) {
        if (segDist(ball, this.screen[i - 1], this.screen[i]) < p.width / 2) { this.onTrack = true; break; }
      }
    }
    if (this.onTrack) {
      this.offFor = 0;
      this.acc += dt * 3;
      while (this.acc >= 1) { this.acc -= 1; env.addScore(env.mult); }
    } else {
      this.offFor += dt;
      // Kurz daneben ist verziehen, länger daneben kostet die Serie.
      if (this.offFor > 0.5 && ball.visible) env.miss();
      if (was && ball.visible) env.sound.tick();
    }
    if (!ball.visible) return;

    for (const it of this.items) {
      const y = this.scroll - it.d;
      const dist = Math.hypot(ball.x - it.x, ball.y - y);
      if (it.kind === 'star' && dist < 44 + BALL_RADIUS) {
        it.gone = true;
        const points = env.combo(10, 5);
        env.sound.pop(env.mult);
        fx.text(it.x, y, `+${points}`, env.palette[1], 50 + env.mult * 8);
        fx.burst(it.x, y, env.palette[1], 14);
      } else if (it.kind === 'hazard' && this.hurt <= 0 && dist < 26 + BALL_RADIUS * 0.5) {
        env.addScore(-15);
        env.miss();
        env.sound.bad();
        env.shake(18);
        this.hurt = 1.2;
        fx.flash(0.35);
        fx.text(ball.x, ball.y, '-15');
      }
    }
  }

  trace(ctx) {
    ctx.beginPath();
    for (const q of this.screen) ctx.lineTo(q.x, q.y);
  }

  draw(ctx) {
    const { env, p } = this;
    const { field } = env;
    const [c0, c1, c2] = env.palette;
    if (!this.screen) return;

    // Querstreifen, die mitlaufen: so sieht man, dass es ständig vorangeht.
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = this.scroll % 125; y < field.h; y += 125) { ctx.moveTo(0, y); ctx.lineTo(field.w, y); }
    ctx.stroke();

    // Bahn: erst breit in Leuchtfarbe, dann etwas schmaler dunkel darüber – übrig bleiben die Ränder.
    const off = !this.onTrack && Math.floor(this.time * 6) % 2 === 0;
    const edge = this.onTrack ? c0 : off ? '#fff' : c2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.trace(ctx);
    ctx.lineWidth = p.width + 6;
    ctx.strokeStyle = edge;
    glow(ctx, edge, 26);
    ctx.stroke();
    noGlow(ctx);
    ctx.lineWidth = p.width;
    ctx.strokeStyle = tone(c2, 9, 60);
    ctx.stroke();
    // Mittelstreifen
    ctx.setLineDash([26, 40]);
    ctx.lineDashOffset = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();
    ctx.setLineDash([]);

    for (const it of this.items) {
      const y = this.scroll - it.d;
      if (y < -80 || y > field.h + 80) continue;
      if (it.kind === 'star') {
        glow(ctx, c1, 20);
        collectible(ctx, it.x, y, 34 + 4 * Math.sin(this.time * 6 + it.d), tone(c1, 68), this.time * 2);
        noGlow(ctx);
      } else if (it.kind === 'hazard') {
        villain(ctx, it.face, it.x, y, 32, this.time, this.look, Math.PI / 2);
      } else {
        // Pfeile zeigen die Richtung bei harten Wechseln
        ctx.save();
        ctx.translate(it.x, y);
        ctx.rotate(it.a);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 8);
        for (const o of [-22, 8]) {
          ctx.beginPath();
          ctx.moveTo(o, -20); ctx.lineTo(o + 20, 0); ctx.lineTo(o, 20);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    this.fx.draw(ctx, field);
  }
}

export default {
  id: 'run',
  hint: 'Bleib mit dem Ball auf der Bahn!',
  name: 'Rennen',
  duration: 60,
  scale: 3,
  medals: [[460, 750, 1050], [330, 650, 910], [240, 450, 640]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.12, -r * 0.5);
      ctx.lineTo(s * r * 0.45, r * 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([r * 0.16, r * 0.16]);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.45);
    ctx.lineTo(0, r * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  },
  create: (env) => new Run(env),
};
