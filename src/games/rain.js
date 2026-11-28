// Spiel "Steinschlag": Der Ball bleibt unten in der Zone. Von oben fallen Felsbrocken, Mauern,
// Eisblöcke und Feuer – mal klein, mal riesig. Man weicht seitlich aus, mal nur ein Stück, mal
// quer über das halbe Feld: So übt man schnelle Wechsel mit Vor- und Rückhand.
// Auf "Mittel" und "Schwer" kommen Mauern mit einer Lücke, durch die man muss.
// Als einzelne Übung läuft es endlos mit drei Herzen und wird immer schneller.
import { BALL_RADIUS } from '../engine.js';
import { collectible, glow, noGlow, text, tone } from '../ui.js';
import { Fx, OffTrack } from './common.js';
import { Show, drawBlock, hsl, rainbow } from './spectacle.js';
import { hueGap } from '../themes.js';

// Farbe für alles, was Punkte bringt: Gold, außer der Ball ist gelblich – dann ein kräftiges Grün.
// Gefahren sind rot-weiß umrandet. So sieht man sofort, was man holen und was man meiden muss.
const prizeHue = () => (hueGap(46) >= 60 ? 46 : 150);
const prize = (l = 60, a = 1) => hsl(prizeHue(), 100, l, a);
// Gefahren bekommen eine kräftige eigene Farbe (pink, rot, lila oder blau) – nie die des Balls
// und nie die der Punkte-Sachen. So heben sie sich klar vom dunklen Hintergrund ab.
const HAZARD_HUES = [330, 0, 275, 215];
function hazardHue() {
  const ok = HAZARD_HUES.filter((h) => hueGap(h) >= 60 && Math.abs(((h - prizeHue() + 540) % 360) - 180) >= 60);
  const list = ok.length ? ok : HAZARD_HUES;
  return list[Math.floor(Math.random() * list.length)];
}

const LEVELS = {
  //   Fallgeschwindigkeit, Sekunden zwischen zwei Wellen, Anteil Mauern mit Lücke, kleinste Lücke
  1: { speed: 230, every: 1.9, walls: 0, gap: 0 },
  2: { speed: 300, every: 1.45, walls: 0.3, gap: 300 },
  3: { speed: 380, every: 1.1, walls: 0.45, gap: 230 },
};
// hier unten muss der Ball bleiben – mit Abstand zum Feldrand, damit er nicht aus dem Bild der Kamera rollt
export const ZONE = { top: 680, bottom: 900 };
const MATS = ['stone', 'brick', 'ice', 'fire', 'wood'];

class Rain {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.items = [];
    this.next = 1.2;
    this.lastSide = 1;
    this.dodged = 0;
    this.hurt = 0;
    this.fx = new Fx();
    this.show = new Show();
    this.guard = new OffTrack({ grace: 0.5, every: 0.6, start: 3, step: 3 });
  }

  /** Neue Welle: ein Brocken (klein oder riesig), eine Mauer mit Lücke oder ein paar kleine Steine. */
  spawn(ball) {
    const { env, p } = this;
    const W = env.field.w;
    const mat = MATS[Math.floor(Math.random() * MATS.length)];
    const harder = env.stage * 0.06;
    const roll = Math.random();
    // Ziel ist meist da, wo der Ball gerade ist – so muss man wirklich ausweichen
    const aim = ball.visible ? ball.x : W / 2;
    if (roll < p.walls + harder) {
      // Mauer über die ganze Breite mit einer Lücke, abwechselnd links und rechts vom Ball
      this.lastSide = -this.lastSide;
      const gap = Math.max(p.gap - env.stage * 15, BALL_RADIUS * 5);
      const far = 180 + Math.random() * Math.min(500, W * 0.35);
      const gx = Math.max(gap / 2 + 20, Math.min(W - gap / 2 - 20, aim + this.lastSide * far));
      const h = 46;
      const wallHue = hazardHue();
      if (gx - gap / 2 > 20) this.items.push({ kind: 'block', hue: wallHue, mat, x: (gx - gap / 2) / 2, y: -60, w: gx - gap / 2, h });
      if (gx + gap / 2 < W - 20) this.items.push({ kind: 'block', hue: wallHue, mat, x: (gx + gap / 2 + W) / 2, y: -60, w: W - gx - gap / 2, h });
      this.items.push({ kind: 'gem', x: gx, y: -60, seq: this.dodged });
      env.sound.tick();
    } else if (roll < 0.65) {
      // Ein Brocken: abwechselnd klein (kurzer Schritt) und riesig (langer Zieher)
      const big = Math.random() < 0.45;
      const w = big ? 260 + Math.random() * Math.min(340, W * 0.25) : 90 + Math.random() * 70;
      const x = Math.max(w / 2, Math.min(W - w / 2, aim + (Math.random() - 0.5) * w * 0.6));
      this.items.push({ kind: 'block', hue: hazardHue(), mat: big && mat === 'fire' ? 'stone' : mat, x, y: -80, w, h: mat === 'stone' ? Math.min(w * 0.7, 150) : 60, big, seed: Math.random() * 99 });
    } else {
      // Steinregen: drei kleine Brocken verteilt, einer davon auf den Ball
      for (let i = 0; i < 3; i++) {
        const x = i === 0 ? aim : 80 + Math.random() * (W - 160);
        this.items.push({ kind: 'block', hue: hazardHue(), mat: 'stone', x, y: -60 - i * 120, w: 70, h: 56, seed: Math.random() * 99 });
      }
    }
    // Ab und zu ein Stern zum Einsammeln, der in der Zone landet
    if (Math.random() < 0.3) this.items.push({ kind: 'star', x: 100 + Math.random() * (W - 200), y: -200 });
  }

  update(dt, ball) {
    const { env, p, fx, show } = this;
    const { field } = env;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    fx.update(dt);
    show.update(dt);
    // Raus aus der Zone (nach oben) kostet: rot blinken und steigender Abzug
    this.guard.update(dt, ball.visible && (ball.y < ZONE.top - BALL_RADIUS || ball.y > ZONE.bottom + BALL_RADIUS * 1.5), env, fx, ball);

    this.next -= dt;
    if (this.next <= 0) {
      this.spawn(ball);
      this.next = p.every / env.ramp;
    }
    const speed = p.speed * env.ramp;
    for (const it of this.items) {
      it.y += speed * dt * (it.kind === 'star' ? 0.75 : 1);
      if (it.gone || !ball.visible) continue;
      const dx = Math.max(0, Math.abs(ball.x - it.x) - (it.w ?? 60) / 2);
      const dy = Math.max(0, Math.abs(ball.y - it.y) - (it.h ?? 60) / 2);
      const hit = Math.hypot(dx, dy) < BALL_RADIUS * 0.6;
      if (it.kind === 'block') {
        if (hit && this.hurt <= 0) {
          it.gone = true;
          this.hurt = 1;
          env.miss();
          env.sound.bad();
          env.shake(it.big ? 26 : 16);
          show.shatter(ball.x, ball.y - 20, it.mat, it.big ? 26 : 14);
          if (it.mat === 'fire') show.burn(0.8);
          fx.text(ball.x, ball.y - 90, { brick: 'Bumm!', wood: 'Krach!', stone: 'Autsch!', ice: 'Klirr!', fire: 'Heiß!' }[it.mat], '#fff', 50);
          env.loseLife();
        } else if (!it.passed && it.y - it.h / 2 > ball.y + BALL_RADIUS) {
          // sauber ausgewichen: je knapper, desto mehr
          it.passed = true;
          const close = Math.abs(ball.x - it.x) - it.w / 2 < 70;
          this.dodged++;
          const points = env.combo(it.big ? 12 : 8, 2.6);
          fx.text(ball.x, ball.y - 80, close ? `Knapp! +${points}` : `+${points}`, rainbow(this.dodged), close ? 50 : 40);
          if (this.dodged % 10 === 0) { show.fireworks(field, 3); env.say(`${this.dodged} mal ausgewichen!`); }
        }
      } else if (hit) {
        it.gone = true;
        if (it.kind === 'star') {
          const points = env.combo(20, 3);
          env.sound.power();
          fx.text(it.x, it.y - 30, `Stern! +${points}`, prize(65), 54);
          show.coins(field, 20);
        } else {
          // Edelstein in der Lücke der Mauer
          const points = env.combo(10, 3);
          env.sound.pop(env.mult);
          fx.burst(it.x, it.y, prize(60), 16);
          fx.text(it.x, it.y - 30, `Durch die Lücke! +${points}`, prize(65), 46);
        }
      }
    }
    this.items = this.items.filter((it) => !it.gone && it.y < field.h + 160);
  }

  draw(ctx) {
    const { env } = this;
    const { field } = env;
    const c1 = env.palette[1];
    // Hintergrund kräftig abdunkeln, damit alles, was fällt, klar heraussticht
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, field.w, field.h);
    // Zone unten, in der der Ball bleiben muss
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = tone(c1, 50, 60);
    ctx.fillRect(0, ZONE.top, field.w, ZONE.bottom - ZONE.top);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.guard.color(tone(c1, 70));
    ctx.lineWidth = 4;
    ctx.setLineDash([24, 18]);
    ctx.lineDashOffset = -this.time * 40;
    ctx.beginPath(); ctx.moveTo(0, ZONE.top); ctx.lineTo(field.w, ZONE.top); ctx.moveTo(0, ZONE.bottom); ctx.lineTo(field.w, ZONE.bottom); ctx.stroke();
    ctx.setLineDash([]);
    // Schatten auf der Zone: wo gleich etwas einschlägt (hilft beim Ausweichen)
    for (const it of this.items) {
      if (it.kind !== 'block' || it.y > ZONE.top) continue;
      const near = Math.max(0, Math.min(1, 1 - (ZONE.top - it.y) / 700));
      ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.3 * near})`;
      ctx.fillRect(it.x - it.w / 2, ZONE.top + 6, it.w, 14);
    }
    for (const it of this.items) {
      if (it.kind === 'block') {
        // Fallstreifen darüber: man sieht sofort, dass es fällt und wie schnell
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (const fx of [-0.3, 0, 0.3]) { ctx.moveTo(it.x + fx * it.w, it.y - it.h / 2 - 12); ctx.lineTo(it.x + fx * it.w, it.y - it.h / 2 - 70); }
        ctx.stroke();
        drawBlock(ctx, it.mat, it.x, it.y, it.w, it.h, this.time, it.seed ?? 0);
        // Gefahr: der Brocken selbst in kräftiger Farbe (Struktur bleibt sichtbar, kein Rahmen)
        ctx.save();
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = hsl(it.hue ?? 330, 100, 55);
        ctx.fillRect(it.x - it.w / 2, it.y - it.h / 2, it.w, it.h);
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = hsl(it.hue ?? 330, 100, 60, 0.55);
        ctx.fillRect(it.x - it.w / 2, it.y - it.h / 2, it.w, it.h);
        ctx.restore();
      } else {
        // Punkte: immer dieselbe klare Farbe, pulsierender Ring und ein Plus
        const pulse = 1 + 0.12 * Math.sin(this.time * 8);
        ctx.beginPath();
        ctx.arc(it.x, it.y, 46 * pulse, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = prize(70, 0.8);
        glow(ctx, prize(60), 26);
        ctx.stroke();
        noGlow(ctx);
        if (it.kind === 'star') collectible(ctx, it.x, it.y, 32, prize(60), this.time * 3);
        else {
          // Edelstein in der Mauerlücke: Raute
          ctx.beginPath();
          ctx.moveTo(it.x, it.y - 26); ctx.lineTo(it.x + 20, it.y); ctx.lineTo(it.x, it.y + 26); ctx.lineTo(it.x - 20, it.y); ctx.closePath();
          ctx.fillStyle = prize(62);
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
        text(ctx, '+', it.x + 40, it.y - 34, 34, prize(75), 'center', 6, 700);
      }
    }
    if (this.dodged >= 3) text(ctx, `${this.dodged} ausgewichen`, field.w / 2, 130, 24, rainbow(this.dodged), 'center', 6, 600);
    this.fx.draw(ctx, field);
    this.show.draw(ctx, field, this.look ? { visible: true, ...this.look } : null);
    this.guard.draw(ctx, field);
  }
}

export default {
  id: 'rain',
  hint: 'Bleib unten in der Zone und weich aus – mal ein Stück, mal ganz weit!',
  name: 'Steinschlag',
  duration: 60,
  lives: 3,
  endless: { lives: 3 }, // als einzelne Übung endlos mit drei Herzen
  scale: 0.2,
  medals: [[270, 460, 640], [280, 570, 810], [350, 580, 850]],
  icon(ctx, r) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.05;
    ctx.lineCap = 'round';
    // fallende Brocken, groß und klein, darunter die Zone mit Ball
    ctx.fillRect(-r * 0.45, -r * 0.5, r * 0.4, r * 0.14);
    ctx.fillRect(r * 0.15, -r * 0.2, r * 0.16, r * 0.14);
    ctx.beginPath(); ctx.moveTo(-r * 0.25, -r * 0.3); ctx.lineTo(-r * 0.25, -r * 0.15); ctx.moveTo(r * 0.23, 0); ctx.lineTo(r * 0.23, r * 0.12); ctx.stroke();
    ctx.setLineDash([r * 0.08, r * 0.06]);
    ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.25); ctx.lineTo(r * 0.5, r * 0.25); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(-r * 0.05, r * 0.4, r * 0.09, 0, Math.PI * 2); ctx.fill();
  },
  create: (env) => new Rain(env),
};
