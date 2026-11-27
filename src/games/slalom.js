// Spiel "Slalom": Den Ball der Reihe nach durch die leuchtenden Tore führen.
// Schnell hintereinander geschaffte Tore bauen eine Serie auf. Ab "Mittel" kosten berührte
// Pfosten Punkte, auf "Schwer" bewegen sich die Tore. Ab Stufe 1 gibt es ein schmales Bonus-Tor.
// Jede Runde hat ihr eigenes Material (Feuerfackeln, Eiskristalle, Backstein, Holz), manchmal ist
// ein Tor golden, und wer eine Runde ohne Pfostenberührung schafft, bekommt ein Feuerwerk.
import { BALL_RADIUS } from '../engine.js';
import { text, glow, noGlow, star, tone } from '../ui.js';
import { Fx } from './common.js';
import { Show, drawPost, rainbow, fireHsl, gold, drawSign } from './spectacle.js';

// Materialien der Runden mit Ansage
const KINDS = [
  { mat: 'neon', name: 'Lichttore' },
  { mat: 'fire', name: 'Feuertore!' },
  { mat: 'ice', name: 'Eistore!' },
  { mat: 'brick', name: 'Backsteintore!' },
  { mat: 'wood', name: 'Holztore!' },
];

const LEVELS = {
  1: { width: 250, gates: 4, posts: false, move: 0 },
  2: { width: 190, gates: 5, posts: true, move: 0 },
  3: { width: 132, gates: 6, posts: true, move: 115 },
};
const POST = 20;

/** Schneiden sich die Strecken p1-p2 und p3-p4? */
function crosses(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return d(p3, p4, p1) * d(p3, p4, p2) < 0 && d(p1, p2, p3) * d(p1, p2, p4) < 0;
}

class Slalom {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.hurt = 0;
    this.down = true;
    this.prev = null;
    this.fx = new Fx();
    this.show = new Show();
    this.kind = KINDS[0];
    this.courses = 0;
    this.chainN = 0;     // Tore in Folge ohne Fehler (bestimmt die Farbe der Lichtschranke)
    this.lastPass = -10;
    this.sign = null;
    this.newCourse();
  }

  newCourse() {
    const { env, p } = this;
    const { field } = env;
    const n = p.gates;
    const side = Math.random() < 0.5 ? 1 : -1;
    // Mit jeder Stufe werden die Tore enger und geraten stärker in Bewegung.
    this.width = p.width * (1 - 0.07 * env.stage);
    this.move = p.move + (env.stage >= 2 ? 35 : 0);
    this.gates = [];
    for (let i = 0; i < n; i++) {
      const row = this.down ? i : n - 1 - i;
      this.gates.push({
        cx: field.w / 2 + side * (i % 2 ? -1 : 1) * field.w * (0.17 + Math.random() * 0.08),
        y: 260 + (row * 630) / (n - 1),
        phase: Math.random() * Math.PI * 2,
        passed: 0,
      });
    }
    // Bonus-Tor: schmal, abseits der Strecke, wer mag holt es sich nebenbei.
    this.bonus = null;
    if (env.stage >= 1) {
      const g = this.gates[1 + Math.floor(Math.random() * (n - 2))];
      this.bonus = { x: field.w - g.cx + (g.cx > field.w / 2 ? -40 : 40), y: g.y, half: 62 };
    }
    // Material der Runde: die erste mit Lichttoren, danach jedes Mal ein anderes
    if (this.courses++ > 0) {
      const pool = KINDS.filter((k) => k !== this.kind);
      this.kind = pool[Math.floor(Math.random() * pool.length)];
      this.sign = { str: this.kind.name, age: 0 };
      env.say(this.kind.name.replace('!', ''));
      if (this.kind.mat === 'ice') this.show.sparkle(field.w / 2, 250, 'snow', 36, field.w / 2);
    }
    // Manchmal ist ein Tor golden: dreifache Punkte
    this.gold = Math.random() < 0.4 ? 1 + Math.floor(Math.random() * (n - 1)) : -1;
    this.clean = true;   // noch kein Pfosten berührt
    this.next = 0;
    this.down = !this.down;
  }

  /** Die beiden Pfosten eines Tors zum aktuellen Zeitpunkt. */
  posts(g) {
    const x = g.cx + this.move * Math.sin(this.time * 1.3 + g.phase);
    return [{ x: x - this.width / 2, y: g.y }, { x: x + this.width / 2, y: g.y }];
  }

  update(dt, ball) {
    const { env, fx } = this;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    for (const g of this.gates) if (g.passed) g.passed += dt;
    fx.update(dt);
    this.show.update(dt);
    if (this.sign) this.sign.age += dt;
    if (this.time - this.lastPass > 4) this.chainN = 0;

    if (!ball.visible) { this.prev = null; return; }
    const cur = { x: ball.x, y: ball.y };
    const gate = this.gates[this.next];
    const [a, b] = this.posts(gate);

    if (this.p.posts && this.hurt <= 0) {
      for (const g of this.gates) {
        const hit = this.posts(g).find((q) => Math.hypot(q.x - cur.x, q.y - cur.y) < POST + BALL_RADIUS * 0.6);
        if (hit) {
          env.addScore(-5);
          env.miss();
          env.sound.bad();
          env.shake(14);
          this.hurt = 1;
          this.clean = false;
          this.chainN = 0;
          fx.text(cur.x, cur.y, '-5');
          if (this.kind.mat === 'neon') fx.burst(hit.x, hit.y, '#fff', 18);
          else this.show.shatter(hit.x, hit.y, this.kind.mat, 14, 0.7);
          if (this.kind.mat === 'fire') this.show.burn(0.8);
          break;
        }
      }
    }

    if (this.prev && this.bonus) {
      const { x, y, half } = this.bonus;
      if (crosses(this.prev, cur, { x: x - half, y }, { x: x + half, y })) {
        const points = env.combo(25, 4);
        env.sound.power();
        fx.text(x, y, `Bonus +${points}`, env.palette[1]);
        fx.burst(x, y, env.palette[1]);
        this.bonus = null;
      }
    }

    if (this.prev && crosses(this.prev, cur, a, b)) {
      gate.passed = 0.001;
      const mid = (a.x + b.x) / 2;
      const golden = this.next === this.gold;
      const color = golden ? gold(62) : rainbow(this.chainN);
      const points = env.combo(golden ? 30 : 10, 3.5);
      this.chainN++;
      this.lastPass = this.time;
      env.sound.pop(this.next);
      fx.text(mid, a.y, golden ? `Goldtor! +${points}` : `+${points}`, color, (golden ? 62 : 50) + env.mult * 8);
      fx.ring(mid, a.y, color, this.width * 0.8);
      // Jedes Material feiert anders
      const mat = this.kind.mat;
      if (golden) { this.show.coins(env.field, 30); env.sound.win(); }
      if (mat === 'fire') this.show.sparkle(mid, a.y, 'ember', 26, this.width / 2);
      else if (mat === 'ice') this.show.sparkle(mid, a.y, 'snow', 18, this.width / 2);
      else if (mat === 'brick' || mat === 'wood') this.show.shatter(mid, a.y, mat, 8, 0.5);
      this.next++;
      if (this.next >= this.gates.length) {
        const { field } = env;
        if (this.clean) {
          env.addScore(50);
          env.sound.win();
          this.show.fireworks(field, 5);
          fx.text(field.w / 2, 520, 'Perfekte Runde! +50', gold(65), 70);
          env.say('Perfekte Runde!');
        } else {
          env.addScore(30);
          env.sound.win();
          fx.text(field.w / 2, 520, 'Runde geschafft! +30', env.palette[1], 64);
        }
        // Eine Feuerrunde endet mit einer Flammenwand über das ganze Bild
        if (mat === 'fire') { this.show.burn(1.4); env.shake(12); }
        this.newCourse();
      }
    }
    this.prev = cur;
  }

  draw(ctx) {
    const { env } = this;
    const [c0, c1, c2] = env.palette;

    // Führungslinie vom Ball bzw. letzten Tor zum nächsten
    const target = this.posts(this.gates[this.next]);
    const tx = (target[0].x + target[1].x) / 2, ty = target[0].y;
    if (this.prev) {
      ctx.beginPath();
      ctx.moveTo(this.prev.x, this.prev.y);
      ctx.lineTo(tx, ty);
      ctx.setLineDash([4, 22]);
      ctx.lineDashOffset = -this.time * 60;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    this.gates.forEach((g, i) => {
      const [a, b] = this.posts(g);
      const active = i === this.next;
      const golden = i === this.gold;
      const color = golden ? gold(60) : g.passed ? c0 : active ? rainbow(this.chainN) : c2;
      ctx.globalAlpha = g.passed ? Math.max(0.25, 1 - g.passed) : active ? 1 : 0.8;

      // Lichtschranke zwischen den Pfosten
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = active ? 5 + 2 * Math.sin(this.time * 8) : 2.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      if (active) glow(ctx, color, 26);
      ctx.stroke();

      noGlow(ctx);
      for (const q of [a, b]) {
        if (this.kind.mat !== 'neon' && !golden) { drawPost(ctx, this.kind.mat, q.x, q.y, POST, this.time); continue; }
        const g2 = ctx.createRadialGradient(q.x - 6, q.y - 8, 2, q.x, q.y, POST);
        g2.addColorStop(0, tone(color, 85));
        g2.addColorStop(1, tone(color, 40));
        ctx.beginPath();
        ctx.arc(q.x, q.y, POST, 0, Math.PI * 2);
        ctx.fillStyle = g2;
        ctx.fill();
      }
      if (golden && !g.passed) star(ctx, (a.x + b.x) / 2, a.y + 46, 16, gold(65), this.time * 2);
      if (!g.passed) text(ctx, i + 1, (a.x + b.x) / 2, a.y - 54, active ? 60 : 40, tone(color, 75), 'center', active ? 12 : 0);
      ctx.globalAlpha = 1;
    });

    if (this.bonus) {
      const { x, y, half } = this.bonus;
      ctx.beginPath();
      ctx.moveTo(x - half, y);
      ctx.lineTo(x + half, y);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 10]);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.setLineDash([]);
      glow(ctx, c1, 16);
      for (const s of [-1, 1]) star(ctx, x + s * half, y, 18, tone(c1, 72), this.time * 2 * s);
      noGlow(ctx);
    }
    this.fx.draw(ctx, env.field);
    this.show.draw(ctx, env.field, this.prev ? { visible: true, ...this.prev } : null);
    if (this.chainN >= 2) text(ctx, `${this.chainN} Tore in Folge`, env.field.w / 2, 130, 24, rainbow(this.chainN), 'center', 8, 600);
    if (this.sign) drawSign(ctx, env.field, this.sign.str, this.sign.age, this.kind.mat === 'fire' ? fireHsl(30, 100, 65) : this.kind.mat === 'ice' ? 'hsl(195 90% 80%)' : '#fff');
  }
}

export default {
  id: 'slalom',
  hint: 'Führe den Ball der Reihe nach durch die Tore – ohne die Pfosten zu berühren!',
  name: 'Slalom',
  duration: 60,
  scale: 0.65,
  medals: [[1040, 2670, 4830], [160, 510, 990], [90, 320, 780]],
  icon(ctx, r) {
    ctx.fillStyle = '#fff';
    for (const [x, y] of [[-0.35, -0.3], [0.35, 0], [-0.35, 0.3]]) {
      ctx.beginPath();
      ctx.arc(r * x, r * y, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.05;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.05, -r * 0.5); ctx.lineTo(-r * 0.05, -r * 0.3);
    ctx.lineTo(r * 0.05, 0); ctx.lineTo(-r * 0.05, r * 0.3); ctx.lineTo(-r * 0.05, r * 0.5);
    ctx.stroke();
  },
  create: (env) => new Slalom(env),
};
