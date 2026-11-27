// Spiel "Tricks": der Trick-Trainer. Ein Geisterball zeigt eine Umspielbewegung um einen
// Verteidiger, danach macht das Kind sie nach: vom Startpunkt aus dem gezeigten Weg folgen,
// den Verteidiger nicht berühren und rechtzeitig ankommen. Jeder Trick kommt einmal nach
// rechts und einmal nach links. Wer es nicht schafft, bekommt denselben Trick noch einmal gezeigt.
//
// Die Tricks sind als einfache Wege beschrieben und lassen sich hier leicht anpassen oder ergänzen:
// Punkte [seitlich, vor/zurück] relativ zum Verteidiger; der Spieler kommt von unten (positives y).
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, villain, orb, text, tone } from '../ui.js';
import { Fx, resample, nearestOnPath } from './common.js';

const arc = (r, from, to, n = 14) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

const MOVES = [
  // gerade an, quer ziehen, vorbei
  { name: 'Seitzieher', pts: [[0, 320], [0, 125], [190, 125], [190, -230]] },
  // im Bogen außen herum
  { name: 'Umlaufen', pts: [[0, 320], ...arc(185, 90, -90), [0, -230]] },
  // schräg an, zurückziehen, zur anderen Seite weg – die Spur sieht aus wie ein V
  { name: 'V-Zieher', pts: [[-40, 320], [-130, 95], [-10, 230], [150, 70], [150, -230]] },
  // erst zur einen Seite antäuschen, dann zur anderen ziehen
  { name: 'Doppelzieher', pts: [[0, 320], [0, 185], [-160, 165], [160, 95], [160, -230]] },
  // an, ein Stück zurück, seitlich weg
  { name: 'Rückzieher', pts: [[0, 320], [0, 115], [0, 250], [190, 195], [190, -230]] },
  // zwei schnelle Haken
  { name: 'Zickzack', pts: [[0, 320], [110, 190], [-120, 70], [-120, -230]] },
];

const LEVELS = {
  //   Anzahl Tricks, erlaubte Abweichung, Zeit im Verhältnis zum Geisterball
  1: { moves: 2, tol: 95, time: 3.2 },
  2: { moves: 4, tol: 78, time: 2.5 },
  3: { moves: 6, tol: 50, time: 1.6 },
};
const GHOST_SPEED = 300; // Feld-Einheiten pro Sekunde
const REACH = 62;        // so weit reicht der Verteidiger

class Tricks {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.n = 0;          // wie viele Tricks schon geschafft sind
    this.fx = new Fx();
    this.defender = { x: env.field.w / 2, y: 530 };
    this.load();
  }

  /** Bereitet den nächsten Trick vor: jeder Trick erst nach rechts, dann gespiegelt nach links. */
  load() {
    const move = MOVES[Math.floor(this.n / 2) % this.p.moves];
    const mirror = this.n % 2 ? -1 : 1;
    const { x, y } = this.defender;
    this.name = `${move.name} ${mirror > 0 ? '→' : '←'}`;
    this.path = resample(move.pts.map(([px, py]) => ({ x: x + px * mirror, y: y + py })));
    this.ghostTime = (this.path.length * 10) / GHOST_SPEED;
    this.env.say(`${move.name} nach ${mirror > 0 ? 'rechts' : 'links'}`);
    this.state = 'show'; // 'show' = vormachen, 'ready' = Ball zum Start, 'do' = nachmachen
    this.t = 0;
    this.idx = 0;
  }

  limit() {
    return (this.ghostTime * this.p.time) / (1 + 0.1 * this.env.stage) + 0.8;
  }

  fail(msg, ball) {
    const { env, fx } = this;
    env.miss();
    env.addScore(-6);
    env.sound.bad();
    env.shake(12);
    fx.text(ball.x, Math.max(400, ball.y - 40), `${msg} −6`, '#ff8f8f', 46);
    this.state = 'show';
    this.t = 0;
    this.idx = 0;
  }

  update(dt, ball) {
    const { env, p, path, fx } = this;
    this.time += dt;
    this.t += dt;
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    fx.update(dt);

    if (this.state === 'show') {
      if (this.t >= this.ghostTime + 0.3) { this.state = 'ready'; this.t = 0; }
      return;
    }
    if (!ball.visible) return;

    if (this.state === 'ready') {
      if (Math.hypot(ball.x - path[0].x, ball.y - path[0].y) < 62) {
        this.state = 'do';
        this.t = 0;
        this.idx = 0;
        this.devSum = 0;
        this.devN = 0;
        this.offFor = 0;
        env.sound.go();
      }
      return;
    }

    // Nachmachen
    if (Math.hypot(ball.x - this.defender.x, ball.y - this.defender.y) < REACH + BALL_RADIUS * 0.5) {
      return this.fail('Der Verteidiger hat ihn!', ball);
    }
    if (this.t > this.limit()) return this.fail('Zu langsam!', ball);
    const { k, d } = nearestOnPath(path, ball, this.idx - 6, this.idx + 14);
    if (d > p.tol) {
      this.offFor += dt;
      if (this.offFor > 0.8) this.fail('Zu weit vom Weg!', ball);
      return;
    }
    this.offFor = 0;
    this.idx = Math.max(this.idx, k);
    this.devSum += d;
    this.devN++;

    if (this.idx >= path.length - 3) {
      const accuracy = Math.max(0, 1 - this.devSum / this.devN / (p.tol * 0.8));
      const quick = this.t < this.ghostTime * 1.5; // fast so flott wie der Geisterball
      const points = env.combo(10 + Math.round(10 * accuracy) + (quick ? 10 : 0), 20);
      env.sound.win();
      // nicht in den Namen des Tricks hineinschreiben, der oben steht
      fx.text(ball.x, Math.max(400, ball.y - 50), `${quick ? 'Blitzschnell! ' : ''}+${points}`, env.palette[1], 58);
      fx.burst(ball.x, ball.y, env.palette[1], 26);
      this.n++;
      this.load();
    }
  }

  draw(ctx) {
    const { env, path, state } = this;
    const [c0, c1] = env.palette;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Weg mit laufenden Strichen in Bewegungsrichtung
    ctx.beginPath();
    for (const q of path) ctx.lineTo(q.x, q.y);
    ctx.lineWidth = this.p.tol * 0.7;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.stroke();
    ctx.setLineDash([14, 18]);
    ctx.lineDashOffset = -this.time * 110;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = tone(c0, 68);
    ctx.stroke();
    ctx.setLineDash([]);

    if (state === 'do' && this.idx > 0) {
      ctx.beginPath();
      for (let i = 0; i <= this.idx; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.lineWidth = 6;
      ctx.strokeStyle = c1;
      glow(ctx, c1, 24);
      ctx.stroke();
      noGlow(ctx);
    }

    // Zielpunkt
    const end = path[path.length - 1];
    ctx.beginPath();
    ctx.arc(end.x, end.y, 30, 0, Math.PI * 2);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = tone(c1, 70);
    ctx.stroke();

    // Verteidiger mit Reichweite
    const d = this.defender;
    ctx.beginPath();
    ctx.arc(d.x, d.y, REACH + 8, 0, Math.PI * 2);
    ctx.setLineDash([6, 10]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.stroke();
    ctx.setLineDash([]);
    villain(ctx, 'brute', d.x, d.y, REACH * 0.8, this.time, this.look);

    if (state === 'show') {
      // Geisterball macht den Trick vor
      const i = Math.min(path.length - 1, Math.floor((this.t / this.ghostTime) * (path.length - 1)));
      ctx.globalAlpha = 0.85;
      orb(ctx, path[i].x, path[i].y, BALL_RADIUS, '#fff');
      ctx.globalAlpha = 1;
    } else if (state === 'ready') {
      const s = path[0];
      ctx.beginPath();
      ctx.arc(s.x, s.y, 46 + 8 * Math.sin(this.time * 7), 0, Math.PI * 2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#fff';
      glow(ctx, '#fff', 18);
      ctx.stroke();
      noGlow(ctx);
    } else {
      // ablaufende Zeit als Balken unter dem Namen
      const left = Math.max(0, 1 - this.t / this.limit());
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.moveTo(env.field.w / 2 - 160, 262); ctx.lineTo(env.field.w / 2 + 160, 262); ctx.stroke();
      ctx.strokeStyle = left < 0.3 ? '#fff' : c1;
      ctx.beginPath(); ctx.moveTo(env.field.w / 2 - 160, 262); ctx.lineTo(env.field.w / 2 - 160 + 320 * left, 262); ctx.stroke();
    }

    text(ctx, this.name, env.field.w / 2, 205, 52, tone(c1, 80), 'center', 8);
    const sub = state === 'show' ? 'Schau zu …' : state === 'ready' ? 'Ball zum Startpunkt' : '';
    if (sub) text(ctx, sub, env.field.w / 2, 262, 32, '#fff', 'center', 0);
    this.fx.draw(ctx, env.field);
  }
}

export default {
  id: 'tricks',
  hint: 'Schau dir den Trick an und mach ihn nach!',
  name: 'Tricks',
  duration: 75,
  scale: 0.75,
  medals: [[120, 640, 1050], [70, 580, 940], [20, 490, 860]],
  icon(ctx, r) {
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // V-förmige Spur um einen Punkt
    ctx.beginPath();
    ctx.arc(0, -r * 0.12, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, r * 0.5); ctx.lineTo(-r * 0.36, r * 0.02); ctx.lineTo(-r * 0.02, r * 0.26);
    ctx.lineTo(r * 0.36, -r * 0.02); ctx.lineTo(r * 0.36, -r * 0.5);
    ctx.moveTo(r * 0.24, -r * 0.38); ctx.lineTo(r * 0.36, -r * 0.5); ctx.lineTo(r * 0.48, -r * 0.38);
    ctx.stroke();
  },
  create: (env) => new Tricks(env),
};
