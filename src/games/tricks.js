// Spiel "Tricks": der Trick-Trainer. Ein Geisterball zeigt eine Umspielbewegung um einen
// Verteidiger, danach macht das Kind sie nach: vom Startpunkt aus dem gezeigten Weg folgen,
// den Verteidiger nicht berühren und rechtzeitig ankommen. Die Tricks kommen in gemischter
// Reihenfolge und in beide Richtungen. Wer es nicht schafft, bekommt denselben Trick noch einmal gezeigt.
//
// Zwei Arten zu spielen: die Runde auf Zeit (Tricks je nach Stufe) und das Dauertraining zu einem
// Thema (Zieher, Vorhand, Rückhand, Dribbeln, Drehungen, Täuschen): ohne Zeitgrenze, bis man aufhört.
//
// Die Tricks sind als einfache Wege beschrieben und lassen sich hier leicht anpassen oder ergänzen:
// Punkte [seitlich, vor/zurück] relativ zum Verteidiger; der Spieler kommt von unten (positives y).
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, villain, orb, text, tone } from '../ui.js';
import { Fx, resample, nearestOnPath, OffTrack } from './common.js';

const arc = (r, from, to, n = 14) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

// pts: Weg um den Verteidiger, diff: ab welcher Stufe der Trick in der Runde auf Zeit vorkommt,
// topics: zu welchen Themen er gehört. only: 1 = nur nach rechts, -1 = nur nach links.
// Ohne only kommt der Trick in beide Richtungen (gespiegelt).
// gen (optional) baut den Weg jedes Mal neu, z. B. mal kurz, mal lang gezogen.
//
// Wie im Hockey üblich (Rechtshänder): Beim Vorhandzieher wird der Ball mit der Vorhand nach links
// gezogen, beim Rückhandzieher mit der Rückhand nach rechts.
const PULL = [[0, 320], [0, 125], [190, 125], [190, -230]];

/** Zieher mit zufälliger Weite (wie weit quer gezogen wird) und Höhe (wie nah am Verteidiger). */
function pull() {
  const wide = 130 + Math.random() * 210;           // 130 (kurz) bis 340 (lang)
  const at = 105 + Math.random() * 70;              // so weit vor dem Verteidiger wird gezogen
  const label = wide > 265 ? 'Langer' : wide < 175 ? 'Kurzer' : '';
  return { pts: [[0, 330], [0, at], [wide, at - 10], [wide, -230]], label };
}

export const MOVES = [
  // gerade an, kurz vor dem Verteidiger mit der Vorhand quer nach links ziehen, vorbei – mal kurz, mal lang
  { name: 'Vorhandzieher', pts: PULL, gen: pull, diff: 1, only: -1, topics: ['zieher', 'vorhand'] },
  // dasselbe mit der Rückhand nach rechts
  { name: 'Rückhandzieher', pts: PULL, gen: pull, diff: 1, only: 1, topics: ['zieher', 'rueckhand'] },
  // im Bogen außen herum
  { name: 'Umlaufen', pts: [[0, 320], ...arc(185, 90, -90)], diff: 1, topics: ['dribbeln'] },
  // an, ein Stück zurück, seitlich weg
  { name: 'Rückzieher', pts: [[0, 320], [0, 115], [0, 250], [190, 195], [190, -230]], diff: 2, topics: ['zieher'] },
  // zwei schnelle Haken
  { name: 'Zickzack', pts: [[0, 320], [110, 190], [-120, 70], [-120, -230]], diff: 2, topics: ['dribbeln', 'taeuschen'] },
  // kurz zur einen Seite antäuschen, dann zur anderen vorbei
  { name: 'Körpertäuschung', pts: [[0, 320], [0, 205], [-75, 175], [0, 150], [190, 110], [190, -230]], diff: 2, topics: ['taeuschen'] },
  // schräg an, zurückziehen, zur anderen Seite weg – die Spur sieht aus wie ein V
  { name: 'V-Zieher', pts: [[-40, 320], [-130, 95], [-10, 230], [150, 70], [150, -230]], diff: 2, topics: ['zieher', 'taeuschen'] },
  // erst zur einen Seite antäuschen, dann weit zur anderen ziehen
  { name: 'Doppelzieher', pts: [[0, 320], [0, 185], [-160, 165], [160, 95], [160, -230]], diff: 3, topics: ['zieher', 'taeuschen'] },
  // Indisches Dribbling: schnell links-rechts vor dem Körper, dann vorbei
  { name: 'Indisches Dribbling', pts: [[0, 330], [-55, 290], [55, 250], [-55, 210], [55, 170], [-40, 135], [180, 95], [180, -230]], diff: 3, topics: ['dribbeln', 'vorhand', 'rueckhand'] },
  // Drehung: vor dem Verteidiger eine ganze Runde um sich selbst, dann vorbei
  { name: 'Drehung', pts: [[0, 330], [0, 225], ...arc(62, 180, -180, 22).map(([x, y]) => [x + 62, y + 225]), [190, 150], [190, -230]], diff: 3, topics: ['drehung'] },
  // Rückwärtsdrehung: vor dem Verteidiger abdrehen, mit dem Rücken zu ihm herum und seitlich weg
  { name: 'Rückwärtsdrehung', pts: [[0, 330], [0, 170], ...arc(70, -90, 90, 14).map(([x, y]) => [x * -1 + 0, y + 240]), [150, 240], [200, 120], [200, -230]], diff: 3, topics: ['drehung', 'taeuschen'] },
];

/** Themen für das Dauertraining. */
export const TOPICS = [
  { id: 'zieher', name: 'Zieher', sub: 'Vorhand, Rückhand, V, Rück', icon: 'V-Zieher' },
  { id: 'vorhand', name: 'Vorhand', sub: 'mit der Vorhand nach links vorbei', icon: 'Vorhandzieher' },
  { id: 'rueckhand', name: 'Rückhand', sub: 'mit der Rückhand nach rechts vorbei', icon: 'Rückhandzieher' },
  { id: 'dribbeln', name: 'Dribbeln', sub: 'Indisch, Zickzack, Bogen', icon: 'Indisches Dribbling' },
  { id: 'drehung', name: 'Drehungen', sub: 'Drehung, Rückwärtsdrehung', icon: 'Drehung' },
  { id: 'taeuschen', name: 'Täuschen', sub: 'Antäuschen und weg', icon: 'Körpertäuschung' },
  { id: 'kette', name: 'Trick-Ketten', sub: 'zwei Verteidiger hintereinander', icon: 'Rückzieher' },
  { id: 'alle', name: 'Alle Tricks', sub: 'alles gemischt', icon: 'Doppelzieher' },
];

/**
 * Weg eines Tricks für dieses eine Mal: Zieher haben ihre eigene Zufallsweite, alle anderen
 * werden etwas breiter oder schmaler und näher oder weiter gezogen. k verkleinert den ganzen Trick
 * (für Trick-Ketten). Liefert { pts, label }.
 */
export function shape(move, k = 1) {
  const made = move.gen ? move.gen() : { pts: move.pts, label: '' };
  const sx = move.gen ? 1 : 0.85 + Math.random() * 0.45; // seitlich 85 % bis 130 %
  const sy = move.gen ? 1 : 0.92 + Math.random() * 0.2;  // vor/zurück 92 % bis 112 %
  // Kein Stück des Wegs näher als 100 am Verteidiger (wichtig für die verkleinerten Ketten):
  // erst fein unterteilen, dann zu nahe Punkte nach außen schieben
  const scaled = made.pts.map(([x, y]) => [x * sx * k, y * sy * k]);
  const pts = [];
  scaled.forEach(([x, y], i) => {
    if (i > 0) {
      const [px, py] = scaled[i - 1];
      const n = Math.ceil(Math.hypot(x - px, y - py) / 20);
      for (let j = 1; j < n; j++) pts.push([px + ((x - px) * j) / n, py + ((y - py) * j) / n]);
    }
    pts.push([x, y]);
  });
  for (const q of pts) {
    const d = Math.hypot(q[0], q[1]);
    if (d > 0 && d < 100) { q[0] = (q[0] / d) * 100; q[1] = (q[1] / d) * 100; }
  }
  return { pts, label: made.label };
}

/** Richtung, in der ein Weg am Verteidiger vorbeigeht: 1 = rechts, -1 = links. */
const exitSide = (move) => Math.sign(move.pts[move.pts.length - 1][0]) || 1;

/**
 * Alle Varianten (Trick + Richtung) für eine Stufe oder ein Thema.
 * lefty: Linkshänder – Vorhand und Rückhand sind dann gespiegelt (Vorhandzieher nach rechts).
 */
export function variants(level, topic = null, lefty = false) {
  const out = [];
  const hand = lefty ? -1 : 1;
  const pick = topic === 'kette' ? 'alle' : topic;
  for (const move of MOVES) {
    for (const mirror of [1, -1]) {
      const side = exitSide(move) * mirror;
      if (move.only && side !== move.only * hand) continue;
      // Vorhand: alles, was auf der Vorhandseite vorbeigeht (Rechtshänder links), Rückhand: die andere Seite
      if (pick === 'vorhand' && side * hand > 0) continue;
      if (pick === 'rueckhand' && side * hand < 0) continue;
      if (pick && !['alle', 'vorhand', 'rueckhand'].includes(pick) && !move.topics.includes(pick)) continue;
      if (!pick && move.diff > level) continue;
      out.push({ move, mirror, side });
    }
  }
  return out;
}

const LEVELS = {
  //   erlaubte Abweichung, Zeit im Verhältnis zum Geisterball
  1: { tol: 95, time: 3.2 },
  2: { tol: 78, time: 2.5 },
  3: { tol: 50, time: 1.6 },
};
const GHOST_SPEED = 300; // Feld-Einheiten pro Sekunde
const REACH = 62;        // so weit reicht der Verteidiger

class Tricks {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.n = 0;          // wie viele Tricks schon geschafft sind
    this.done = {};      // geschafft je Trick (Dauertraining)
    this.fx = new Fx();
    this.guard = new OffTrack({ grace: 0.25, every: 0.4, start: 2, step: 2 });
    this.home = { x: env.field.w / 2, y: 530 };
    this.defenders = [{ ...this.home }];
    this.pool = variants(env.level, env.topic ?? null, env.lefty);
    // Trick-Ketten: im Thema „Trick-Ketten“ immer, auf „Schwer“ jeder dritte Trick
    this.chains = env.topic === 'kette' ? 1 : env.level === 3 && !env.topic ? 1 / 3 : 0;
    // Auf „Mittel“ und „Schwer“ macht der Verteidiger einen Schritt auf den Ball zu
    this.lunge = { 1: 0, 2: 18, 3: 28 }[env.level];
    this.deck = [];
    this.current = null;
    this.load();
  }

  /** Nächster Trick aus dem gemischten Stapel; nie zweimal derselbe hintereinander. */
  draw_() {
    if (!this.deck.length) {
      this.deck = [...this.pool].sort(() => Math.random() - 0.5);
      if (this.deck.length > 1 && this.deck[this.deck.length - 1] === this.current) this.deck.unshift(this.deck.pop());
    }
    return this.deck.pop();
  }

  /** Bereitet den nächsten Trick vor (oder eine Kette aus zwei Tricks gegen zwei Verteidiger). */
  load() {
    this.current = this.draw_();
    const chain = Math.random() < this.chains;
    this.chainOf = chain ? [this.current, this.draw_()] : null;
    if (chain) {
      // Zwei Verteidiger schräg hintereinander; der zweite steht auf der Seite, zu der der erste Trick hinausführt
      const [a, b] = this.chainOf;
      const cx = this.home.x;
      const d1 = { x: cx - a.side * 130, y: 700 }, d2 = { x: cx + a.side * 130, y: 330 };
      this.defenders = [d1, d2];
      const pa = shape(a.move, 0.75), pb = shape(b.move, 0.75);
      const pts = [
        ...pa.pts.map(([px, py]) => ({ x: d1.x + px * a.mirror, y: d1.y + py })),
        ...pb.pts.map(([px, py]) => ({ x: d2.x + px * b.mirror, y: d2.y + py })),
      ];
      this.path = resample(pts);
      const name = (v, made) => (made.label ? `${made.label} ${v.move.name}` : v.move.name);
      this.name = `${name(a, pa)} + ${name(b, pb)}`;
      this.env.say(`Trick-Kette: ${name(a, pa)}, dann ${name(b, pb)}`);
    } else {
      const { move, mirror, side } = this.current;
      this.defenders = [{ ...this.home }];
      const { x, y } = this.home;
      const made = shape(move);
      const full = made.label ? `${made.label} ${move.name}` : move.name;
      this.name = `${full}${side > 0 ? ' →' : ' ←'}`;
      this.path = resample(made.pts.map(([px, py]) => ({ x: x + px * mirror, y: y + py })));
      this.env.say(move.only ? full : `${full} nach ${side > 0 ? 'rechts' : 'links'}`);
    }
    this.ghostTime = (this.path.length * 10) / GHOST_SPEED;
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
    this.resetDefenders();
  }

  resetDefenders() {
    for (const d of this.defenders) { d.dx = 0; d.dy = 0; }
  }

  /** Auf Mittel und Schwer greift der Verteidiger an: ein Schritt auf den Ball zu, wenn er nah ist. */
  moveDefenders(dt, ball) {
    for (const d of this.defenders) {
      d.dx ??= 0; d.dy ??= 0;
      let gx = 0, gy = 0;
      const dist = Math.hypot(ball.x - d.x, ball.y - d.y);
      if (this.state === 'do' && this.lunge && ball.visible && dist < 240) {
        // je länger man trödelt, desto entschlossener greift er an
        const k = Math.min(1, 0.5 + this.t / Math.max(1, this.ghostTime * 1.5));
        gx = ((ball.x - d.x) / dist) * this.lunge * k;
        gy = ((ball.y - d.y) / dist) * this.lunge * k;
      }
      const step = Math.min(1, dt * 5);
      d.dx += (gx - d.dx) * step;
      d.dy += (gy - d.dy) * step;
    }
  }

  update(dt, ball) {
    const { env, p, path, fx } = this;
    this.time += dt;
    this.t += dt;
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    fx.update(dt);
    this.moveDefenders(dt, ball);
    if (this.state !== 'do') this.guard.update(dt, false, env, fx, ball);

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
    for (const d of this.defenders) {
      if (Math.hypot(ball.x - d.x - d.dx, ball.y - d.y - d.dy) < REACH + BALL_RADIUS * 0.5) {
        return this.fail('Der Verteidiger hat ihn!', ball);
      }
    }
    if (this.t > this.limit()) return this.fail('Zu langsam!', ball);
    const { k, d } = nearestOnPath(path, ball, this.idx - 6, this.idx + 14);
    // Neben dem Weg: rot blinken und Abzug, der immer größer wird; nach 1,6 Sekunden ist der Trick verpatzt.
    this.guard.update(dt, d > p.tol, env, fx, ball);
    if (d > p.tol) {
      this.offFor += dt;
      if (this.offFor > 1.6) this.fail('Zu weit vom Weg!', ball);
      return;
    }
    this.offFor = 0;
    this.idx = Math.max(this.idx, k);
    this.devSum += d;
    this.devN++;

    if (this.idx >= path.length - 3) {
      const accuracy = Math.max(0, 1 - this.devSum / this.devN / (p.tol * 0.8));
      // Tempo nach Sekunden: so flott wie der Geisterball (mit etwas Luft) ist x1
      const quick = this.t < this.ghostTime * 0.9;
      const points = env.combo((15 + Math.round(10 * accuracy)) * (this.chainOf ? 2 : 1), 20, { par: this.ghostTime * 1.3 + 0.4, took: this.t });
      env.sound.win();
      // nicht in den Namen des Tricks hineinschreiben, der oben steht
      fx.text(ball.x, Math.max(400, ball.y - 50), `${this.chainOf ? 'Kette geschafft! ' : quick ? 'Blitzschnell! ' : ''}+${points}`, env.palette[1], 58);
      fx.burst(ball.x, ball.y, env.palette[1], 26);
      this.n++;
      this.done[this.current.move.name] = (this.done[this.current.move.name] || 0) + 1;
      // Jeder zehnte geschaffte Trick wird gefeiert
      if (this.n % 10 === 0) { env.banner(`${this.n} Tricks!`); env.say(`${this.n} Tricks geschafft!`); }
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
    ctx.strokeStyle = this.guard.heat > 0.05 ? OffTrack.red(50, 0.3 * this.guard.heat) : 'rgba(255,255,255,0.06)';
    ctx.stroke();
    ctx.setLineDash([14, 18]);
    ctx.lineDashOffset = -this.time * 110;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = this.guard.color(tone(c0, 68));
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

    // Verteidiger mit Reichweite (folgt seinem Angriffsschritt)
    for (const d of this.defenders) {
      const x = d.x + (d.dx || 0), y = d.y + (d.dy || 0);
      ctx.beginPath();
      ctx.arc(x, y, REACH + 8, 0, Math.PI * 2);
      ctx.setLineDash([6, 10]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = Math.hypot(d.dx || 0, d.dy || 0) > 8 ? '#ffffff' : 'rgba(255,255,255,0.4)';
      ctx.stroke();
      ctx.setLineDash([]);
      villain(ctx, 'brute', x, y, REACH * (this.chainOf ? 0.7 : 0.8), this.time, this.look);
    }

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

    text(ctx, this.name, env.field.w / 2, 205, this.chainOf ? 38 : 52, tone(c1, 80), 'center', 8);
    if (this.n > 0) text(ctx, `${this.n} geschafft`, env.field.w / 2, 150, 24, 'rgba(255,255,255,0.7)', 'center', 0, 500);
    const sub = state === 'show' ? 'Schau zu …' : state === 'ready' ? 'Ball zum Startpunkt' : '';
    if (sub) text(ctx, sub, env.field.w / 2, 262, 32, '#fff', 'center', 0);
    this.fx.draw(ctx, env.field);
    this.guard.draw(ctx, env.field);
  }
}

const module = { default: null };
export default module.default = {
  id: 'tricks',
  hint: 'Schau dir den Trick an und mach ihn nach!',
  name: 'Tricks',
  duration: 75,
  scale: 0.95,
  medals: [[150, 830, 1620], [50, 590, 1450], [20, 90, 480]],
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

/** Die Übung „Tricks“ als Dauertraining zu einem Thema: ohne Zeitgrenze, bis man aufhört. */
export function topicGame(topicId) {
  const topic = TOPICS.find((t) => t.id === topicId);
  const base = module.default;
  return {
    ...base,
    name: `Tricks: ${topic.name}`,
    hint: `${topic.name} üben, so lange du magst. Zum Aufhören den Ball aufs X legen.`,
    scoreId: `tricks-${topic.id}`,
    topic: topic.id,
    endless: { lives: null, steady: true },
    create: (env) => new Tricks(env),
  };
}
