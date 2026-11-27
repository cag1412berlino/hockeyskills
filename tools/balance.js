// Austarieren ohne Kamera: Lässt simulierte Spieler (Anfänger, mittel, stark) jede Übung
// auf jeder Stufe viele Male spielen und zeigt die mittleren Punktzahlen.
//
//   node tools/balance.js            Tabelle mit Punkten und vorgeschlagenen Sterne-Schwellen
//   node tools/balance.js --noise    dasselbe mit Störungen wie von einer echten Kamera
//                                    (Zittern, Verzögerung, kurze Aussetzer)
//   node tools/balance.js --write    schreibt die vorgeschlagenen Schwellen in die Spieldateien
import { readFileSync, writeFileSync } from 'node:fs';
import { PlayScene } from '../src/play.js';
import { games } from '../src/games/index.js';
import { Bot, SKILLS, goals } from '../src/bots.js';
import { newProfile } from '../src/profile.js';

const args = new Set(process.argv.slice(2));
const RUNS = args.has('--quick') ? 4 : 14;
const DT = 1 / 30;
const silent = new Proxy({}, { get: () => () => {} });

/** Verfälscht die Ballposition so, wie es eine Webcam täte. */
export class Camera {
  constructor({ jitter = 7, latency = 0.1, dropEvery = 5, dropFor = 0.2 } = {}) {
    Object.assign(this, { jitter, latency, dropEvery, dropFor });
    this.queue = [];
    this.t = 0;
    this.seen = { x: 0, y: 0, vx: 0, vy: 0, visible: false };
  }

  see(ball, dt) {
    this.t += dt;
    this.queue.push({ t: this.t, x: ball.x + (Math.random() - 0.5) * 2 * this.jitter, y: ball.y + (Math.random() - 0.5) * 2 * this.jitter });
    while (this.queue.length > 1 && this.queue[1].t <= this.t - this.latency) this.queue.shift();
    const raw = this.queue[0];
    const s = this.seen;
    if (this.t % this.dropEvery < this.dropFor) return s; // Aussetzer: letzte Position bleibt stehen
    // dieselbe Glättung wie in der App
    const nx = s.visible ? s.x + (raw.x - s.x) * 0.7 : raw.x, ny = s.visible ? s.y + (raw.y - s.y) * 0.7 : raw.y;
    s.vx = s.visible ? (nx - s.x) / dt : 0;
    s.vy = s.visible ? (ny - s.y) / dt : 0;
    s.x = nx; s.y = ny; s.visible = true;
    return s;
  }
}

/** Spielt eine Runde und liefert die Punktzahl. */
export function playRound(game, level, skill, noise = false, scale = undefined) {
  let score = null;
  const app = {
    engine: { field: { w: 1000, h: 1000, scale: 1 }, shake() {} },
    config: { speed: 1, demos: false },
    profile: newProfile('Bot'),
    sound: silent, voice: silent, music: silent,
    palette: () => ['hsl(212 90% 55%)', 'hsl(196 90% 55%)', 'hsl(226 90% 62%)', 'hsl(204 90% 72%)'],
    save() {}, menu() {},
    record: () => ({ xp: 0, badges: [] }),
    result: (g, l, s) => { score = s; },
  };
  const scene = new PlayScene(app, game, level, null, { events: false, scale });
  scene.layout();
  scene.countdown = 0;
  const bot = new Bot(skill);
  const cam = noise ? new Camera() : null;
  for (let i = 0; i < 4000 && score == null; i++) {
    const seen = cam ? cam.see(bot.ball, DT) : bot.ball;
    scene.update(DT, seen);
    if (score == null && scene.instance) bot.step(DT, goals[game.id](scene.instance, seen));
  }
  return score ?? scene.score;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const round10 = (n) => Math.max(10, Math.round(n / 10) * 10);

if (import.meta.url === `file://${process.argv[1]}`) {
  const noise = args.has('--noise');
  console.log(`Übung            | Stufe | Anfänger | Mittel | Stark   ${noise ? '(mit Kamera-Störungen)' : ''}`);
  for (const game of games) {
    if (args.has('--write')) {
      // Erst den Ausgleichsfaktor bestimmen: Ein mittlerer Spieler soll auf "Mittel" bei rund 1000 Punkten landen.
      const raw = mean(Array.from({ length: RUNS }, () => playRound(game, 2, SKILLS.medium, false, 1)));
      game.scale = Math.min(3, Math.max(0.15, Math.round((1000 / Math.max(1, raw)) * 20) / 20));
      const file = new URL(`../src/games/${game.id}.js`, import.meta.url);
      const src = readFileSync(file, 'utf8');
      writeFileSync(file, /\n {2}scale: /.test(src) ? src.replace(/\n {2}scale: [\d.]+,/, `\n  scale: ${game.scale},`) : src.replace(/\n {2}medals: /, `\n  scale: ${game.scale},\n  medals: `));
    }
    const m = {};
    for (const [name, skill] of Object.entries(SKILLS)) {
      m[name] = [1, 2, 3].map((level) => mean(Array.from({ length: RUNS }, () => playRound(game, level, skill, noise))));
    }
    [0, 1, 2].forEach((l) => console.log(
      `${(l ? '' : game.name).padEnd(16)} |   ${l + 1}   | ${String(Math.round(m.beginner[l])).padStart(8)} | ${String(Math.round(m.medium[l])).padStart(6)} | ${String(Math.round(m.strong[l])).padStart(5)}`));
    // Sterne je Stufe. Simulierte Spieler ermüden nicht und zögern nie, echte Kinder liegen darunter.
    // Deshalb gibt es einen Stern schon für gut ein Drittel dessen, was der simulierte Anfänger schafft,
    // zwei für gut die Hälfte des mittleren und drei für zwei Drittel des starken Spielers.
    const proposal = [0, 1, 2].map((l) => {
      const one = Math.max(20, round10(m.beginner[l] * 0.35));
      const two = Math.max(round10(m.medium[l] * 0.55), round10(one * 1.6), 50);
      const three = Math.max(round10(m.strong[l] * 0.68), round10(two * 1.4), 100);
      return [one, two, three];
    });
    console.log(`${''.padEnd(16)} | Sterne -> ${JSON.stringify(proposal)}`);
    if (args.has('--write')) {
      const file = new URL(`../src/games/${game.id}.js`, import.meta.url);
      const src = readFileSync(file, 'utf8');
      writeFileSync(file, src.replace(/medals: \[.*\],/, `medals: ${JSON.stringify(proposal).replaceAll(',', ', ')},`));
    }
  }
}
