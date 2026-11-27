// Spiel "Rennen": Die Bahn läuft ununterbrochen von oben nach unten durchs Feld.
// Sie besteht aus Kurven, harten Schnitten nach links und rechts und Rückziehern,
// bei denen es ein Stück zurückgeht – wie die Richtungswechsel beim Hockey.
//
// Die Strecke führt durch wechselnde Zonen (Backsteinstadt, Holzbrücke, Felsenpass, Eispalast,
// Vulkan): Jede hat ihren eigenen Belag und ihre eigenen Hindernisse, die man umspielen muss.
// Bunte Perlen auf der Bahn bilden eine Kette – je länger, desto mehr Punkte. Dazu Überraschungen:
// Turbo-Felder, goldene Sterne und Feuer, an dem vorbei das ganze Bild in Flammen aufgeht.
// Als einzelne Übung läuft das Rennen endlos: drei Herzen, und es wird immer schneller.
// Jedes Rennen ist anders: andere Startzone, andere Reihenfolge, andere Strecke.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, villain, randomVillain, collectible, tone, text } from '../ui.js';
import { Fx, penalty, OffTrack } from './common.js';
import { Show, drawBlock, rainbow, tint, fireHsl, gold, drawSign } from './spectacle.js';

const LEVELS = {
  //   Bahnbreite, Tempo, Anteil harter Schnitte, Anteil Rückzieher, Stachelbälle, Hindernisse, deren Breite
  1: { width: 240, speed: 120, cut: 0.25, back: 0.0, hazards: 0, blocks: 0.45, block: 0.4 },
  2: { width: 190, speed: 165, cut: 0.35, back: 0.15, hazards: 0.3, blocks: 0.7, block: 0.48 },
  3: { width: 155, speed: 210, cut: 0.4, back: 0.25, hazards: 0.45, blocks: 0.9, block: 0.55 },
};

// Die Zonen der Strecke. mat = Material der Hindernisse, hue = Farbton von Rand und Belag.
const ZONES = [
  { id: 'neon', name: 'Neonstraße', mat: null, hue: null },
  { id: 'brick', name: 'Backsteinstadt', mat: 'brick', hue: 10 },
  { id: 'wood', name: 'Holzbrücke', mat: 'wood', hue: 32 },
  { id: 'stone', name: 'Felsenpass', mat: 'stone', hue: 220 },
  { id: 'ice', name: 'Eispalast', mat: 'ice', hue: 195 },
  { id: 'lava', name: 'Vulkan', mat: 'fire', hue: 18 },
];
const ZONE_LEN = 2100;  // so lang ist eine Zone (Feld-Einheiten Strecke)
const MARK = 36;        // Abstand der Querlinien im Belag

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
    // Die Bahn als Punktfolge. d = Position in Laufrichtung (wächst nach vorn), x = seitlich,
    // s = Länge der Bahn bis hierher (für die Querlinien im Belag).
    this.pts = [{ x: env.field.w / 2, d: -1100, s: 0 }];
    this.push({ x: env.field.w / 2, d: 500 });
    this.items = [];   // Sterne, Perlen, Hindernisse, Turbo-Felder, Pfeile an der Bahn
    this.zones = [{ from: -Infinity, ...ZONES[Math.floor(Math.random() * ZONES.length)] }];
    this.nextZone = 900;
    this.zoneShown = 0;
    this.sign = null;  // { str, age, color }
    this.onTrack = false;
    this.offFor = 0;
    this.acc = 0;
    this.hurt = 0;
    this.gemSeq = 0;   // laufende Nummer der Perlen (bestimmt ihre Farbe)
    this.chain = 0;    // Perlen in Folge eingesammelt
    this.boost = 0;    // Sekunden Turbo
    this.burnCool = 0;
    this.fx = new Fx();
    this.show = new Show();
    this.guard = new OffTrack({ grace: 0.4, every: 0.5, start: 3, step: 3 });
  }

  get end() { return this.pts[this.pts.length - 1]; }

  /** Hängt einen Punkt an die Bahn und führt die Länge mit. */
  push(q) {
    const e = this.end;
    this.pts.push({ ...q, s: e.s + Math.hypot(q.x - e.x, q.d - e.d) });
  }

  zoneAt(d) {
    let z = this.zones[0];
    for (const c of this.zones) if (d >= c.from) z = c;
    return z;
  }

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

  gem(x, d) {
    this.items.push({ kind: 'gem', x, d, seq: this.gemSeq++ });
  }

  /** Hängt das nächste Stück Bahn an. */
  extend() {
    const { env, p } = this;
    const { x, d } = this.end;
    // Neue Zone, wenn die Strecke weit genug ist: nie zweimal dieselbe hintereinander
    if (d > this.nextZone) {
      const last = this.zones[this.zones.length - 1].id;
      const pool = ZONES.filter((z) => z.id !== last);
      this.zones.push({ from: d, ...pool[Math.floor(Math.random() * pool.length)] });
      this.nextZone = d + ZONE_LEN;
    }
    const roll = Math.random();
    // mit jeder Stufe mehr harte Wechsel; endlos wächst es mit der Zeit weiter
    const harder = 0.04 * env.stage + (env.endless ? Math.min(0.15, this.time / 600) : 0);
    if (roll < p.back + harder) {
      // Rückzieher: schräg ein Stück zurück, dann geht es weiter nach vorn
      const nx = this.sideways(p.width * 1.5, p.width * 2);
      const back = 110 + Math.random() * 70;
      this.push({ x: nx, d: d - back });
      this.push({ x: nx, d: d + p.width + 120 });
      this.items.push({ kind: 'arrow', x: (x + nx) / 2, d: d - back / 2, a: Math.atan2(back, nx - x) });
      this.items.push({ kind: 'star', x: nx, d: d - back });
    } else if (roll < p.back + p.cut + harder * 2) {
      // Harter Schnitt: genau quer, dann geradeaus weiter
      const nx = this.sideways(p.width * 1.6, 420 + 60 * env.level);
      this.push({ x: nx, d });
      this.push({ x: nx, d: d + p.width + 160 });
      this.items.push({ kind: 'arrow', x: (x + nx) / 2, d, a: nx > x ? 0 : Math.PI });
      this.items.push({ kind: 'star', x: nx, d });
    } else {
      // Weiche Kurve, darauf eine Perlenkette
      const nx = this.sideways(150, 420);
      const len = 300 + Math.random() * 160;
      for (let i = 1; i <= 28; i++) {
        const t = i / 28;
        const q = { x: x + (nx - x) * t * t * (3 - 2 * t), d: d + len * t };
        this.push(q);
        if (i % 5 === 2) this.gem(q.x, q.d);
      }
      if (Math.random() < 0.5) this.items.push({ kind: 'star', x: nx, d: d + len });
    }
    // Gerades Zwischenstück: hier liegen Hindernisse, Turbo-Felder und Überraschungen
    const e = this.end;
    const len = p.width + 60;
    this.push({ x: e.x, d: e.d + len });
    const zone = this.zoneAt(e.d);
    const mid = e.d + len / 2;
    const side = Math.random() < 0.5 ? 1 : -1;
    const roll2 = Math.random();
    if (zone.mat && roll2 < p.blocks + harder) {
      // Hindernis auf einer Hälfte der Bahn; auf der anderen kommt man vorbei
      const w = p.width * p.block * (zone.mat === 'stone' ? 1.05 : 1);
      const h = zone.mat === 'stone' ? w * 0.8 : zone.mat === 'fire' ? 46 : 40;
      this.items.push({
        kind: 'block', mat: zone.mat, x: e.x + side * (p.width / 2 - w / 2), d: mid, w, h,
        gapX: e.x - side * (p.width / 4), seed: Math.random() * 100,
      });
      this.gem(e.x - side * (p.width / 4), mid);
    } else if (!zone.mat && roll2 < p.hazards + harder * 2) {
      this.items.push({ kind: 'hazard', face: randomVillain(), x: e.x + side * p.width * 0.27, d: mid });
    } else if (roll2 > 0.82) {
      this.items.push({ kind: 'boost', x: e.x, d: mid });
    } else {
      for (const k of [0.25, 0.75]) this.gem(e.x, e.d + len * k);
    }
    if (Math.random() < 0.06) this.items.push({ kind: 'gold', x: e.x, d: e.d + len * 0.85 });
  }

  update(dt, ball) {
    const { env, p, fx, show } = this;
    const { field } = env;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.boost = Math.max(0, this.boost - dt);
    this.burnCool = Math.max(0, this.burnCool - dt);
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    fx.update(dt);
    show.update(dt);
    if (this.sign) this.sign.age += dt;

    this.scroll += p.speed * env.ramp * (this.boost > 0 ? 1.45 : 1) * dt;
    while (this.end.d < this.scroll + 300) this.extend();
    // Was unten aus dem Bild gelaufen ist, wird vergessen.
    while (this.pts.length > 2 && this.pts[1].d < this.scroll - field.h - 400) this.pts.shift();

    // Neue Zone erreicht? (gemessen auf Höhe des Spielers)
    const here = this.zoneAt(this.scroll - 650);
    if (here.from > this.zoneShown) {
      this.zoneShown = here.from;
      const color = here.hue == null ? '#fff' : here.mat === 'fire' ? fireHsl(30, 100, 65) : tint(here.hue, 90, 70);
      this.sign = { str: here.name, age: 0, color };
      env.say(here.name);
      env.sound.stage?.();
      fx.flash(0.25);
      if (here.mat === 'fire') show.burn(1);
      if (here.mat === 'ice') show.sparkle(field.w / 2, 300, 'snow', 40, field.w / 2);
    }

    // Bildschirm-Koordinaten der Bahn (y wächst nach unten, die Bahn läuft auf den Spieler zu)
    this.screen = this.pts.map((q) => ({ x: q.x, y: this.scroll - q.d, s: q.s, d: q.d }));

    const was = this.onTrack;
    this.onTrack = false;
    if (ball.visible) {
      for (let i = 1; i < this.screen.length; i++) {
        if (segDist(ball, this.screen[i - 1], this.screen[i]) < p.width / 2) { this.onTrack = true; break; }
      }
    }
    // Neben der Bahn: rot blinken und Abzug, je länger, desto mehr
    this.guard.update(dt, ball.visible && !this.onTrack, env, fx, ball);
    if (this.onTrack) {
      this.offFor = 0;
      this.acc += dt * 3 * (this.boost > 0 ? 2 : 1);
      while (this.acc >= 1) { this.acc -= 1; env.addScore(env.mult); }
    } else {
      this.offFor += dt;
      // Kurz daneben ist verziehen, länger daneben kostet die Serie.
      if (this.offFor > 0.5 && ball.visible) {
        env.miss();
        // Endlos: wer länger neben der Bahn bleibt, verliert ein Herz
        // (bleibt man weiter daneben, kostet es nach derselben Zeit das nächste Herz)
        if (env.endless && this.offFor > 1.3) {
          this.offFor = 0;
          env.loseLife();
          env.shake(14);
        }
      }
      if (was && ball.visible) env.sound.tick();
    }

    for (const it of this.items) {
      const y = this.scroll - it.d;
      // Perlen, die unbemerkt vorbeigelaufen sind, reißen die Kette
      if (it.kind === 'gem' && !it.gone && !it.missed && y > (ball.visible ? ball.y + 90 : field.h)) {
        it.missed = true;
        if (this.chain >= 4) fx.text(field.w / 2, 170, `Kette gerissen (${this.chain})`, 'rgba(255,255,255,0.8)', 34);
        this.chain = 0;
      }
      // Feuer, an dem man vorbei ist, ohne es zu berühren: Das ganze Bild geht in Flammen auf.
      if (it.kind === 'block' && !it.gone && !it.passed && ball.visible && y > ball.y + it.h / 2 + BALL_RADIUS) {
        it.passed = true;
        if (Math.abs(ball.x - it.x) < it.w / 2 + 110) {
          if (it.mat === 'fire' && this.burnCool <= 0) {
            this.burnCool = 3;
            show.burn(1.3);
            const points = env.combo(12, 6);
            env.sound.power();
            env.shake(10);
            fx.text(ball.x, ball.y - 70, `Durchs Feuer! +${points}`, fireHsl(40, 100, 65), 52);
          } else {
            const points = env.combo(5, 6);
            fx.text(ball.x, ball.y - 70, `Knapp vorbei! +${points}`, '#fff', 40);
            show.sparkle(ball.x, ball.y, it.mat === 'ice' ? 'snow' : 'ember', 8, 30);
          }
        }
      }
    }
    this.items = this.items.filter((it) => !it.gone && it.d > this.scroll - field.h - 100);
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
      } else if (it.kind === 'gem' && dist < 26 + BALL_RADIUS) {
        it.gone = true;
        this.chain++;
        const value = 1 + Math.min(this.chain, 12);
        env.addScore(value);
        const color = rainbow(it.seq);
        env.sound.tone(330 * 2 ** (Math.min(this.chain, 24) / 12), 0.07, { type: 'triangle', vol: 0.12 });
        fx.burst(it.x, y, color, 8);
        if (this.chain % 5 === 0) {
          // Jede fünfte Perle in Folge füttert die Serie, jede zehnte gibt ein Feuerwerk
          const points = env.combo(10, 8);
          fx.text(it.x, y - 20, `Kette ${this.chain}! +${points}`, color, 54);
          if (this.chain % 10 === 0) {
            show.fireworks(field, 4);
            env.say(`Regenbogenkette ${this.chain}!`);
          }
        }
      } else if (it.kind === 'gold' && dist < 50 + BALL_RADIUS) {
        it.gone = true;
        const points = env.combo(40, 6);
        env.sound.win();
        show.coins(field, 50);
        show.fireworks(field, 3);
        env.shake(12);
        fx.text(it.x, y - 30, `Jackpot! +${points}`, gold(65), 66);
        env.say('Jackpot!');
      } else if (it.kind === 'boost' && dist < p.width / 2) {
        it.gone = true;
        this.boost = 3.5;
        show.turbo(3.5);
        env.sound.power();
        fx.text(ball.x, ball.y - 70, 'Turbo! Punkte x2', '#fff', 56);
      } else if (it.kind === 'block' && this.hurt <= 0) {
        const dx = Math.max(0, Math.abs(ball.x - it.x) - it.w / 2);
        const dy = Math.max(0, Math.abs(ball.y - y) - it.h / 2);
        if (Math.hypot(dx, dy) < BALL_RADIUS * 0.6) {
          it.gone = true;
          this.hurt = 1;
          env.miss();
          env.sound.bad();
          env.shake(it.mat === 'stone' ? 26 : 18);
          show.shatter(it.x, y, it.mat, it.mat === 'stone' ? 14 : 22);
          if (it.mat === 'fire') show.burn(0.9);
          penalty(env, fx, ball.x, ball.y - 60, 10);
          if (env.endless) env.loseLife();
          fx.text(ball.x, ball.y - 110, { brick: 'Bumm!', wood: 'Krach!', stone: 'Autsch!', ice: 'Klirr!', fire: 'Heiß!' }[it.mat], '#fff', 50);
        }
      } else if (it.kind === 'hazard' && this.hurt <= 0 && dist < 26 + BALL_RADIUS * 0.5) {
        env.addScore(-15);
        env.miss();
        env.sound.bad();
        env.shake(18);
        this.hurt = 1.2;
        fx.flash(0.35);
        fx.text(ball.x, ball.y, '-15');
        if (env.endless) env.loseLife();
      }
    }
  }

  trace(ctx, from = 0, to = this.screen.length) {
    ctx.beginPath();
    for (let i = from; i < to; i++) ctx.lineTo(this.screen[i].x, this.screen[i].y);
  }

  /** Querlinien im Belag der Bahn, je nach Zone als Ziegelfugen, Bretter, Eisrisse oder Glut. */
  drawSurface(ctx) {
    const { p } = this;
    const pts = this.screen;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (Math.max(a.y, b.y) < -60 || Math.min(a.y, b.y) > 1060) continue;
      const z = this.zoneAt(b.d);
      if (!z.mat) continue;
      const len = b.s - a.s;
      if (len <= 0) continue;
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      for (let s = Math.ceil(a.s / MARK) * MARK; s < b.s; s += MARK) {
        const k = s - a.s, x = a.x + ux * k, y = a.y + uy * k;
        const n = Math.round(s / MARK);
        const half = p.width / 2 - 4;
        ctx.beginPath();
        if (z.mat === 'brick') {
          // Ziegelreihen: Fuge quer, dazu versetzte kurze Fugen
          ctx.moveTo(x - uy * half, y + ux * half); ctx.lineTo(x + uy * half, y - ux * half);
          for (let o = (n % 2 ? -0.25 : 0.25); o < 1; o += 0.5) {
            const ox = -uy * half * (o * 2 - 1), oy = ux * half * (o * 2 - 1);
            ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + ux * MARK, y + oy + uy * MARK);
          }
          ctx.strokeStyle = tint(10, 35, 30); ctx.lineWidth = 2.5;
        } else if (z.mat === 'wood') {
          ctx.moveTo(x - uy * half, y + ux * half); ctx.lineTo(x + uy * half, y - ux * half);
          ctx.strokeStyle = tint(30, 45, 22); ctx.lineWidth = 3;
        } else if (z.mat === 'stone') {
          if (n % 2) continue;
          for (const o of [-0.5, 0.1, 0.6]) { const r = 3 + (n % 3); ctx.moveTo(x - uy * half * o + r, y + ux * half * o); ctx.arc(x - uy * half * o, y + ux * half * o, r, 0, Math.PI * 2); }
          ctx.strokeStyle = tint(220, 8, 50); ctx.lineWidth = 2;
        } else if (z.mat === 'ice') {
          if (n % 3) continue;
          ctx.moveTo(x - uy * half * 0.6, y + ux * half * 0.6); ctx.lineTo(x + uy * half * 0.2 + ux * 20, y - ux * half * 0.2 + uy * 20);
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
        } else if (z.mat === 'fire') {
          // glühende Risse im Lavagestein
          ctx.moveTo(x - uy * half * 0.7, y + ux * half * 0.7);
          ctx.lineTo(x + ux * 12 - uy * half * 0.1, y + uy * 12 + ux * half * 0.1);
          ctx.lineTo(x + uy * half * 0.6, y - ux * half * 0.6);
          ctx.strokeStyle = fireHsl(20, 100, 50, 0.4 + 0.3 * Math.sin(this.time * 4 + n)); ctx.lineWidth = 3;
        }
        ctx.stroke();
      }
    }
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

    // Bahn stückweise, damit jede Zone ihren eigenen Rand und Belag hat:
    // erst breit in Leuchtfarbe, dann etwas schmaler dunkel darüber – übrig bleiben die Ränder.
    const off = !this.onTrack && Math.floor(this.time * 6) % 2 === 0;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const runs = [];
    for (let i = 1; i < this.screen.length; i++) {
      const z = this.zoneAt(this.screen[i].d);
      if (!runs.length || runs[runs.length - 1].z !== z) runs.push({ z, from: i - 1, to: i + 1 });
      else runs[runs.length - 1].to = i + 1;
    }
    for (const pass of [0, 1]) {
      for (const { z, from, to } of runs) {
        this.trace(ctx, from, to);
        if (pass === 0) {
          const base = z.hue == null ? (this.onTrack ? c0 : c2) : z.mat === 'fire' ? fireHsl(z.hue, 95, this.onTrack ? 58 : 45) : tint(z.hue, 85, this.onTrack ? 62 : 45);
          const edge = this.guard.active ? this.guard.color(base) : off ? '#fff' : this.boost > 0 ? '#fff' : base;
          ctx.lineWidth = p.width + 6;
          ctx.strokeStyle = edge;
          glow(ctx, edge, this.boost > 0 ? 40 : 26);
          ctx.stroke();
          noGlow(ctx);
        } else {
          ctx.lineWidth = p.width;
          ctx.strokeStyle = z.hue == null ? tone(c2, 9, 60) : tint(z.hue, z.mat === 'stone' ? 6 : 30, z.mat === 'ice' ? 22 : 12);
          ctx.stroke();
        }
      }
    }
    this.drawSurface(ctx);
    // Mittelstreifen
    this.trace(ctx);
    ctx.setLineDash([26, 40]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();
    ctx.setLineDash([]);

    for (const it of this.items) {
      const y = this.scroll - it.d;
      if (y < -90 || y > field.h + 90) continue;
      if (it.kind === 'star') {
        glow(ctx, c1, 20);
        collectible(ctx, it.x, y, 34 + 4 * Math.sin(this.time * 6 + it.d), tone(c1, 68), this.time * 2);
        noGlow(ctx);
      } else if (it.kind === 'gem') {
        // Perle in Regenbogenfarbe; die nächste der Kette pulsiert
        const color = rainbow(it.seq);
        ctx.beginPath();
        ctx.arc(it.x, y, 15 + 2 * Math.sin(this.time * 7 + it.seq), 0, Math.PI * 2);
        ctx.fillStyle = color;
        glow(ctx, color, 14);
        ctx.fill();
        noGlow(ctx);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(it.x - 5, y - 5, 4.5, 0, Math.PI * 2); ctx.fill();
      } else if (it.kind === 'block') {
        drawBlock(ctx, it.mat, it.x, y, it.w, it.h, this.time, it.seed);
      } else if (it.kind === 'gold') {
        const r = 40 + 5 * Math.sin(this.time * 8);
        glow(ctx, gold(60), 34);
        collectible(ctx, it.x, y, r, gold(60), this.time * 3);
        noGlow(ctx);
      } else if (it.kind === 'boost') {
        // Turbo-Feld: leuchtende Pfeile nach vorn
        ctx.save();
        ctx.translate(it.x, y);
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          ctx.globalAlpha = 0.4 + 0.6 * (((this.time * 3 - k * 0.33) % 1 + 1) % 1);
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(-p.width * 0.3, 30 - k * 26); ctx.lineTo(0, 6 - k * 26); ctx.lineTo(p.width * 0.3, 30 - k * 26); ctx.stroke();
        }
        ctx.restore();
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
    this.guard.draw(ctx, field);
    this.show.draw(ctx, field, this.look ? { visible: true, ...this.look } : null);
    // Kette oben rechts: so viele Perlen in Folge
    if (this.chain >= 2) {
      text(ctx, `Perlenkette ${this.chain}`, field.w / 2, 130, 26, rainbow(this.gemSeq), 'center', 8, 600);
    }
    if (this.sign) drawSign(ctx, field, this.sign.str, this.sign.age, this.sign.color);
  }
}

export default {
  id: 'run',
  hint: 'Bleib auf der Bahn, umspiel die Hindernisse – so lange du durchhältst!',
  name: 'Rennen',
  duration: 60,
  endless: { lives: 3 }, // als einzelne Übung endlos mit drei Herzen
  scale: 0.75,
  medals: [[290, 910, 1820], [50, 560, 1230], [20, 200, 700]],
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
