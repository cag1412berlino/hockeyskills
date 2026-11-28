// Spiel "Slalom": Den Ball durch die leuchtenden Tore führen. Jede Runde sieht anders aus und
// spielt sich anders:
//   Streckenformen: Zickzack von oben nach unten, quer über das Feld, im Kreis, kreuz und quer.
//   Spielarten:     der Reihe nach · Countdown-Tore (jedes Tor schließt nach ein paar Sekunden) ·
//                   freie Fahrt (alle Tore offen, Reihenfolge egal) · Drehtore (ab "Mittel") ·
//                   Wandertore (ab "Mittel").
// Schnell geschaffte Tore bringen mehr Punkte (Tempo nach Sekunden). Ab "Mittel" kosten berührte
// Pfosten Punkte. Dazu Material je Runde (Feuer, Eis, Backstein, Holz), Goldtore, ein Bonus-Tor
// und ein Feuerwerk für eine Runde ohne Pfostenberührung.
import { BALL_RADIUS, FIT } from '../engine.js';
import { text, glow, noGlow, star, tone } from '../ui.js';
import { Fx } from './common.js';
import { Show, drawPost, rainbow, fireHsl, gold, drawSign } from './spectacle.js';

// Materialien der Runden
const KINDS = [
  { mat: 'neon', name: 'Lichttore' },
  { mat: 'fire', name: 'Feuertore' },
  { mat: 'ice', name: 'Eistore' },
  { mat: 'brick', name: 'Backsteintore' },
  { mat: 'wood', name: 'Holztore' },
];

const SHAPES = ['zigzag', 'across', 'circle', 'scatter'];
const MODES = {
  order: { name: 'Der Reihe nach', min: 1 },
  fuse: { name: 'Countdown-Tore', min: 1 },
  free: { name: 'Freie Fahrt', min: 1 },
  spin: { name: 'Drehtore', min: 2 },
  drift: { name: 'Wandertore', min: 2 },
};

const LEVELS = {
  1: { width: 250, gates: 4, posts: false, move: 0, par: 2.6, fuse: 5.5 },
  2: { width: 190, gates: 5, posts: true, move: 0, par: 2.1, fuse: 4.2 },
  3: { width: 132, gates: 6, posts: true, move: 115, par: 1.7, fuse: 3.2 },
};
const POST = 20;
const TOP = 260, BOTTOM = 890; // hier liegen die Tore (oben ist die Anzeige)

/** Schneiden sich die Strecken p1-p2 und p3-p4? */
function crosses(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return d(p3, p4, p1) * d(p3, p4, p2) < 0 && d(p1, p2, p3) * d(p1, p2, p4) < 0;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Torpositionen für eine Streckenform. Liefert Punkte in Fahrreihenfolge. */
export function layout(shape, n, W) {
  const pts = [];
  if (shape === 'zigzag') {
    const side = Math.random() < 0.5 ? 1 : -1, down = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
      const row = down ? i : n - 1 - i;
      pts.push({ x: W / 2 + side * (i % 2 ? -1 : 1) * W * (0.17 + Math.random() * 0.08), y: TOP + (row * (BOTTOM - TOP)) / (n - 1) });
    }
  } else if (shape === 'across') {
    // quer über die ganze Breite, abwechselnd oben und unten
    const right = Math.random() < 0.5, high = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
      const col = right ? i : n - 1 - i;
      pts.push({ x: 200 + (col * (W - 400)) / (n - 1), y: (i % 2) === (high ? 0 : 1) ? 360 + Math.random() * 60 : 740 + Math.random() * 60 });
    }
  } else if (shape === 'circle') {
    // im Kreis um die Mitte, mal links-, mal rechtsherum
    const cx = W / 2, cy = (TOP + BOTTOM) / 2 + 10, rx = Math.min(W * 0.32, 560), ry = 300;
    const dir = Math.random() < 0.5 ? 1 : -1, start = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = start + dir * (i / n) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
  } else {
    // kreuz und quer: zufällig verteilt, aber nie zu dicht beieinander
    for (let i = 0; i < n; i++) {
      let p, tries = 0;
      do {
        p = { x: 200 + Math.random() * (W - 400), y: TOP + Math.random() * (BOTTOM - TOP) };
      } while (tries++ < 60 && pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 330));
      pts.push(p);
    }
  }
  return pts;
}

class Slalom {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.hurt = 0;
    this.prev = null;
    this.fx = new Fx();
    this.show = new Show();
    this.kind = KINDS[0];
    this.shape = null;
    this.mode = 'order';
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
    // Mit jeder Stufe werden die Tore enger und geraten stärker in Bewegung.
    // kleiner auf großen Feldern, aber immer so breit, dass der Ball zwischen den Pfosten durchpasst
    this.width = Math.max(p.width * FIT * (1 - 0.07 * env.stage), BALL_RADIUS * 2 + POST * 2 + 30);
    const first = this.courses++ === 0;
    // Neue Runde: andere Streckenform und andere Spielart als zuletzt (die erste ist ein klassischer Zickzack)
    this.shape = first ? 'zigzag' : pick(SHAPES.filter((x) => x !== this.shape));
    const modes = Object.keys(MODES).filter((m) => MODES[m].min <= env.level && m !== this.mode);
    this.mode = first ? 'order' : pick(modes);
    this.move = this.mode === 'drift' ? 90 + p.move : p.move + (env.stage >= 2 ? 35 : 0);
    if (this.shape === 'circle' && this.mode === 'drift') this.move *= 0.6;
    const pts = layout(this.shape, n, field.w);
    this.gates = pts.map((q, i) => {
      // Fahrtrichtung durch das Tor: vom vorigen zum nächsten Tor
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const ang = i === 0 ? Math.atan2(pts[1].y - q.y, pts[1].x - q.x) : Math.atan2(b.y - a.y, b.x - a.x);
      return { x: q.x, y: q.y, ang, phase: Math.random() * Math.PI * 2, passed: 0, missed: false };
    });
    // Bonus-Tor: schmal, neben der Strecke zwischen zwei Toren
    this.bonus = null;
    if (env.stage >= 1 && this.mode !== 'free') {
      const i = Math.floor(Math.random() * (n - 1));
      const a = this.gates[i], b = this.gates[i + 1];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const off = 170 * (Math.random() < 0.5 ? 1 : -1);
      const x = (a.x + b.x) / 2 - Math.sin(ang) * off, y = (a.y + b.y) / 2 + Math.cos(ang) * off;
      if (x > 120 && x < field.w - 120 && y > TOP - 40 && y < BOTTOM + 40) this.bonus = { x, y, ang, half: 62 };
    }
    if (!first) {
      this.kind = pick(KINDS.filter((k) => k !== this.kind));
      const shapeName = { zigzag: 'Zickzack', across: 'Quer übers Feld', circle: 'Im Kreis', scatter: 'Kreuz und quer' }[this.shape];
      this.sign = { str: `${MODES[this.mode].name}! · ${shapeName}`, age: 0 };
      env.say(MODES[this.mode].name);
      if (this.kind.mat === 'ice') this.show.sparkle(field.w / 2, 250, 'snow', 36, field.w / 2);
    }
    // Manchmal ist ein Tor golden: dreifache Punkte
    this.gold = Math.random() < 0.4 ? 1 + Math.floor(Math.random() * (n - 1)) : -1;
    this.clean = true;   // noch kein Pfosten berührt
    this.next = 0;
    this.left = n;       // noch offene Tore
    this.fuse = this.mode === 'fuse' ? p.fuse + 1.5 : 0; // die erste Lunte etwas länger
  }

  /** Drehwinkel eines Tors jetzt (Drehtore schwingen hin und her). */
  angle(g) {
    return g.ang + (this.mode === 'spin' ? Math.sin(this.time * 1.1 + g.phase) * 0.9 : 0);
  }

  /** Die beiden Pfosten eines Tors zum aktuellen Zeitpunkt. */
  posts(g) {
    const a = this.angle(g);
    const nx = -Math.sin(a), ny = Math.cos(a); // quer zur Fahrtrichtung
    const shift = this.move * Math.sin(this.time * 1.3 + g.phase);
    // Wandernde Tore bleiben im Spielfeld und unter der Anzeige
    const cx = Math.max(140, Math.min(this.env.field.w - 140, g.x + nx * shift));
    const cy = Math.max(TOP - 30, Math.min(BOTTOM + 50, g.y + ny * shift));
    const h = this.width / 2;
    return [{ x: cx - nx * h, y: cy - ny * h }, { x: cx + nx * h, y: cy + ny * h }];
  }

  /** Tore, die gerade durchfahren werden dürfen. */
  open() {
    if (this.mode === 'free') return this.gates.filter((g) => !g.passed && !g.missed);
    const g = this.gates[this.next];
    return g ? [g] : [];
  }

  /** Für die simulierten Spieler: das nächste sinnvolle Tor. */
  target(ball) {
    const list = this.open();
    if (!list.length) return null;
    return list.reduce((best, g) => (Math.hypot(g.x - ball.x, g.y - ball.y) < Math.hypot(best.x - ball.x, best.y - ball.y) ? g : best));
  }

  /** Ein Tor ist erledigt (geschafft oder verpasst). Ist es das letzte, ist die Runde vorbei. */
  advance() {
    this.left--;
    if (this.mode !== 'free') this.next++;
    if (this.mode === 'fuse') this.fuse = this.p.fuse;
    if (this.left > 0) return;
    const { env } = this;
    const { field } = env;
    if (this.clean) {
      env.addScore(50);
      env.sound.win();
      this.show.fireworks(field, 5);
      this.fx.text(field.w / 2, 520, 'Perfekte Runde! +50', gold(65), 70);
      env.say('Perfekte Runde!');
    } else {
      env.addScore(30);
      env.sound.win();
      this.fx.text(field.w / 2, 520, 'Runde geschafft! +30', env.palette[1], 64);
    }
    // Eine Feuerrunde endet mit einer Flammenwand über das ganze Bild
    if (this.kind.mat === 'fire') { this.show.burn(1.4); env.shake(12); }
    this.newCourse();
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

    // Countdown-Tore: Läuft die Zeit ab, fällt das Tor zu
    if (this.mode === 'fuse' && ball.visible) {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        const g = this.gates[this.next];
        const [a, b] = this.posts(g);
        g.missed = true;
        env.addScore(-5);
        env.miss();
        env.sound.bad();
        this.clean = false;
        this.chainN = 0;
        fx.text((a.x + b.x) / 2, (a.y + b.y) / 2, 'Zu spät! -5', '#fff', 50);
        this.show.shatter((a.x + b.x) / 2, (a.y + b.y) / 2, this.kind.mat === 'neon' ? 'ice' : this.kind.mat, 12, 0.6);
        this.advance();
        return;
      }
    }

    if (!ball.visible) { this.prev = null; return; }
    const cur = { x: ball.x, y: ball.y };

    if (this.p.posts && this.hurt <= 0) {
      for (const g of this.gates) {
        if (g.missed) continue;
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
      const { x, y, ang, half } = this.bonus;
      const nx = -Math.sin(ang) * half, ny = Math.cos(ang) * half;
      if (crosses(this.prev, cur, { x: x - nx, y: y - ny }, { x: x + nx, y: y + ny })) {
        const points = env.combo(25, 4);
        env.sound.power();
        fx.text(x, y, `Bonus +${points}`, env.palette[1]);
        fx.burst(x, y, env.palette[1]);
        this.bonus = null;
      }
    }

    if (this.prev) {
      for (const gate of this.open()) {
        const [a, b] = this.posts(gate);
        if (!crosses(this.prev, cur, a, b)) continue;
        gate.passed = 0.001;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const index = this.gates.indexOf(gate);
        const golden = index === this.gold;
        const color = golden ? gold(62) : rainbow(this.chainN);
        // Tempo nach Sekunden: Richtzeit je Tor, gemessen seit dem letzten Tor
        const points = env.combo(golden ? 30 : 10, 3.5, { par: this.p.par * (this.shape === 'across' ? 1.3 : 1) });
        this.chainN++;
        this.lastPass = this.time;
        env.sound.pop(this.chainN);
        fx.text(mx, my, golden ? `Goldtor! +${points}` : `+${points}`, color, (golden ? 62 : 50) + env.mult * 8);
        fx.ring(mx, my, color, this.width * 0.8);
        // Jedes Material feiert anders
        const mat = this.kind.mat;
        if (golden) { this.show.coins(env.field, 30); env.sound.win(); }
        if (mat === 'fire') this.show.sparkle(mx, my, 'ember', 26, this.width / 2);
        else if (mat === 'ice') this.show.sparkle(mx, my, 'snow', 18, this.width / 2);
        else if (mat === 'brick' || mat === 'wood') this.show.shatter(mx, my, mat, 8, 0.5);
        this.advance();
        break;
      }
    }
    this.prev = cur;
  }

  draw(ctx) {
    const { env } = this;
    const [c0, c1, c2] = env.palette;
    const open = this.open();

    // Führungslinie vom Ball zum nächsten Tor (in freier Fahrt keine – da sucht man selbst)
    if (this.prev && this.mode !== 'free' && open[0]) {
      const [p, q] = this.posts(open[0]);
      ctx.beginPath();
      ctx.moveTo(this.prev.x, this.prev.y);
      ctx.lineTo((p.x + q.x) / 2, (p.y + q.y) / 2);
      ctx.setLineDash([4, 22]);
      ctx.lineDashOffset = -this.time * 60;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    this.gates.forEach((g, i) => {
      if (g.missed) return;
      const [a, b] = this.posts(g);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const active = open.includes(g);
      const golden = i === this.gold;
      const color = golden ? gold(60) : g.passed ? c0 : active ? rainbow(this.chainN + (this.mode === 'free' ? i : 0)) : c2;
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

      // Fahrtrichtung: kleiner Pfeil durch das aktive Tor
      if (active && !g.passed && this.mode !== 'free') {
        const ang = this.angle(g);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(-14, -12); ctx.lineTo(6, 0); ctx.lineTo(-14, 12);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.stroke();
        ctx.restore();
      }

      // Countdown-Tor: Ring, der abläuft
      if (active && this.mode === 'fuse') {
        const f = Math.max(0, this.fuse / this.p.fuse);
        ctx.beginPath();
        ctx.arc(mx, my, this.width / 2 + 34, -Math.PI / 2, -Math.PI / 2 + Math.min(1, f) * Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = f < 0.3 ? `rgba(255,255,255,${0.5 + 0.5 * Math.sin(this.time * 20)})` : tone(c1, 70);
        ctx.stroke();
      }

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
      if (golden && !g.passed) star(ctx, mx, my + 46, 16, gold(65), this.time * 2);
      // Nummer über dem Tor (in freier Fahrt ohne Nummern)
      if (!g.passed && this.mode !== 'free') text(ctx, i + 1, mx, my - 54, active ? 60 : 40, tone(color, 75), 'center', active ? 12 : 0);
      ctx.globalAlpha = 1;
    });

    if (this.bonus) {
      const { x, y, ang, half } = this.bonus;
      const nx = -Math.sin(ang) * half, ny = Math.cos(ang) * half;
      ctx.beginPath();
      ctx.moveTo(x - nx, y - ny);
      ctx.lineTo(x + nx, y + ny);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 10]);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.setLineDash([]);
      glow(ctx, c1, 16);
      star(ctx, x - nx, y - ny, 18, tone(c1, 72), this.time * 2);
      star(ctx, x + nx, y + ny, 18, tone(c1, 72), -this.time * 2);
      noGlow(ctx);
    }
    this.fx.draw(ctx, env.field);
    this.show.draw(ctx, env.field, this.prev ? { visible: true, ...this.prev } : null);
    if (this.chainN >= 2) text(ctx, `${this.chainN} Tore in Folge`, env.field.w / 2, 130, 24, rainbow(this.chainN), 'center', 8, 600);
    else if (this.mode !== 'order') text(ctx, MODES[this.mode].name, env.field.w / 2, 130, 22, 'rgba(255,255,255,0.7)', 'center', 6, 600);
    if (this.sign) drawSign(ctx, env.field, this.sign.str, this.sign.age, this.kind.mat === 'fire' ? fireHsl(30, 100, 65) : this.kind.mat === 'ice' ? 'hsl(195 90% 80%)' : '#fff');
  }
}

export default {
  id: 'slalom',
  hint: 'Führe den Ball durch die Tore – jede Runde anders: im Zickzack, quer, im Kreis, mit Countdown oder freier Fahrt!',
  name: 'Slalom',
  duration: 60,
  scale: 0.25,
  medals: [[670, 2220, 4060], [60, 400, 960], [20, 90, 480]],
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
