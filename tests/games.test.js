// Spielt jedes Spiel auf jeder Stufe und in jedem Tempo einmal komplett durch,
// mit einem Ball, der Schleifen fährt und zwischendurch verschwindet.
// Fängt Abstürze und kaputte Punktestände ab, nicht den Spielspaß.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayScene } from '../src/scenes.js';
import { games, categories } from '../src/games/index.js';
import { newProfile } from '../src/profile.js';
import { makeFinale } from '../src/session.js';
import { Bot, SKILLS, goals } from '../src/bots.js';
import { playRound } from '../tools/balance.js';

/** Zeichenfläche, die jeden Aufruf schluckt. */
const fakeCtx = new Proxy({}, {
  get: (_, prop) => (prop === 'measureText' ? () => ({ width: 10 })
    : prop.startsWith?.('create') ? () => ({ addColorStop() {} })
    : () => {}),
  set: () => true,
});
const silent = new Proxy({}, { get: () => () => {} });

/** Minimal-App, wie sie der Spielbildschirm braucht. */
function fakeApp(config = {}) {
  return {
    engine: { field: { w: 1000, h: 1000, scale: 1 }, shake() {} },
    config: { speed: 1, demos: true, ...config },
    profile: newProfile('Test'),
    sound: silent, voice: silent, music: silent,
    palette: () => ['hsl(212 90% 55%)', 'hsl(196 90% 55%)', 'hsl(226 90% 62%)', 'hsl(204 90% 72%)'],
    save() {},
    menu() {},
    record: () => ({ xp: 0, badges: [] }),
    result() {},
  };
}

function play(game, level, speed) {
  let result = null;
  const app = fakeApp({ speed });
  app.result = (r) => { result = r; };
  const scene = new PlayScene(app, game, level);
  scene.layout();
  const ball = { x: 500, y: 500, vx: 0, vy: 0, visible: true };
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 200 && !result; i++) {
    const t = i * dt;
    const x = 500 + 380 * Math.sin(t * 1.3), y = 560 + 330 * Math.sin(t * 2.1 + 1);
    ball.vx = (x - ball.x) / dt;
    ball.vy = (y - ball.y) / dt;
    ball.x = x;
    ball.y = y;
    // kurze Aussetzer und einmal eine lange Lücke, die die automatische Pause auslöst
    ball.visible = !(t % 7 < 0.4) && !(t > 20 && t < 24);
    scene.update(dt, ball);
    if (i % 6 === 0) scene.draw(fakeCtx);
  }
  return { result, scene };
}

for (const game of games) {
  for (const level of [1, 2, 3]) {
    test(`${game.name}, Stufe ${level}`, () => {
      for (const speed of [0, 1, 2]) {
        const { result, scene } = play(game, level, speed);
        assert.ok(result, 'Runde endet');
        assert.ok(Number.isFinite(result.score) && result.score >= 0, `Punktestand gültig: ${result.score}`);
        if (game.lives == null && !game.endless) assert.equal(scene.stage, 3, 'alle Schwierigkeitsstufen erreicht');
      }
    });
  }
}

test('jedes Spiel hat Name, Hinweis, Symbol und Sterne-Schwellen', () => {
  const ids = new Set();
  for (const game of games) {
    assert.ok(game.id && !ids.has(game.id), 'eindeutige id');
    ids.add(game.id);
    assert.ok(game.name && game.hint && typeof game.icon === 'function');
    assert.equal(game.medals.length, 3, 'Schwellen für jede der drei Stufen');
    for (const m of game.medals) assert.ok(m.length === 3 && m[0] > 0 && m[0] < m[1] && m[1] < m[2], `${game.name}: ${m}`);
  }
});

test('Training: Kurz nimmt eine Übung je Kategorie, Komplett alle', async () => {
  const { categories, sessionPlan } = await import('../src/games/index.js');
  const short = sessionPlan('short');
  assert.equal(short.length, categories.length);
  categories.forEach((c, i) => assert.ok(c.games.includes(short[i]), 'eine Übung aus jeder Kategorie, reihum'));
  const full = sessionPlan('full');
  assert.equal(full.length, games.length);
  assert.equal(new Set(full).size, games.length, 'keine Übung doppelt');
  assert.ok(sessionPlan('medium').length > short.length);
});

test('Übung im Training: endet nach der Trainingszeit und meldet Punkte und Sterne', () => {
  for (const game of games) {
    let done = null;
    const app = fakeApp({ demos: false });
    app.result = () => assert.fail('im Training gibt es keinen Einzel-Ergebnisbildschirm');
    const scene = new PlayScene(app, game, 2, { seconds: 20, label: 'Übung 1 von 1', onFinish: (score, stars) => { done = { score, stars }; } });
    assert.equal(Object.keys(app.profile.highscores).length, 0);
    scene.layout();
    scene.countdown = 0;
    const ball = { x: 500, y: 500, vx: 0, vy: 0, visible: true };
    for (let i = 0; i < 60 * 25 && !done; i++) {
      ball.x = 500 + 350 * Math.sin(i / 40);
      ball.y = 560 + 300 * Math.sin(i / 27);
      scene.update(1 / 60, ball);
      if (i % 10 === 0) scene.draw(fakeCtx);
    }
    assert.ok(done, `${game.name} endet`);
    assert.ok(done.stars >= 0 && done.stars <= 3);
  }
});

test('Tippen zählt jeden Wechsel über die Linie', async () => {
  const taps = games.find((g) => g.id === 'taps');
  let score = 0;
  const env = {
    field: { w: 1000, h: 1000 }, level: 1, stage: 0, ramp: 1, mult: 1, palette: ['a', 'b', 'c', 'd'], sound: silent,
    combo: (p) => { score += p; return p; }, addScore() {}, miss() {},
  };
  const game = taps.create(env);
  const ball = { x: 500, y: 570, vx: 0, vy: 0, visible: true };
  for (let i = 0; i < 10; i++) {
    ball.x = 500 + (i % 2 ? 120 : -120);
    game.update(0.3, ball);
  }
  assert.equal(game.count, 9, 'zehn Seitenwechsel, der erste setzt nur die Startseite');
  assert.ok(score > 0);
});

test('Vormachen: beim ersten Mal spielt ein Geisterball, danach nicht mehr', () => {
  for (const game of games) {
    const app = fakeApp();
    const scene = new PlayScene(app, game, 1);
    scene.layout();
    assert.ok(scene.demo, `${game.name} wird vorgemacht`);
    const ball = { x: 0, y: 0, vx: 0, vy: 0, visible: false };
    for (let i = 0; i < 60 * 6; i++) {
      scene.update(1 / 60, ball);
      if (i % 10 === 0) scene.draw(fakeCtx);
    }
    assert.equal(scene.demo, null, 'Vormachen ist nach wenigen Sekunden vorbei');
    assert.equal(scene.score, 0, 'Vormachen bringt keine Punkte');
    assert.ok(app.profile.seen[game.id]);
    assert.equal(new PlayScene(app, game, 1).demo, null);
  }
});

test('Simulierte Spieler: Ein starker Spieler holt in jeder Übung Punkte', () => {
  for (const game of games) {
    let result = null;
    const app = fakeApp({ demos: false });
    app.result = (r) => { result = r; };
    const scene = new PlayScene(app, game, 1, null, { events: false });
    scene.layout();
    scene.countdown = 0;
    const bot = new Bot(SKILLS.strong);
    for (let i = 0; i < 30 * 120 && !result; i++) {
      scene.update(1 / 30, bot.ball);
      bot.step(1 / 30, goals[game.id](scene.instance, bot.ball));
    }
    // Endlos-Übungen laufen, solange man durchhält – ein starker Spieler schafft zwei Minuten.
    if (game.endless && !result) scene.finish();
    assert.ok(result, `${game.name} endet`);
    assert.ok(result.score > 0, `${game.name}: ${result.score} Punkte`);
  }
});

test('Zufallsereignisse: Doppelte Punkte, Zeitlupe und Glücksstern', () => {
  const app = fakeApp({ demos: false });
  const scene = new PlayScene(app, games[0], 1, null, { scale: 1 });
  scene.layout();
  scene.countdown = 0;
  scene.trigger('double');
  assert.equal(scene.combo(10, 2), 20);
  scene.env.addScore(5);
  assert.equal(scene.score, 30);
  scene.env.addScore(-5);
  assert.equal(scene.score, 25, 'Abzüge werden nicht verdoppelt');
  scene.trigger('lucky');
  const ball = { x: scene.lucky.x, y: scene.lucky.y, vx: 0, vy: 0, visible: true };
  scene.update(1 / 60, ball);
  assert.equal(scene.lucky, null);
  assert.ok(scene.score >= 75, 'Glücksstern bringt 25, hier verdoppelt');
  scene.trigger('slow');
  assert.ok(scene.slow > 0);
});

test('Anpassende Schwierigkeit: Fehler bremsen, Serien beschleunigen – in Grenzen', () => {
  const scene = new PlayScene(fakeApp({ demos: false }), games[0], 1);
  for (let i = 0; i < 20; i++) scene.miss();
  assert.equal(scene.assist, 0.75);
  for (let i = 0; i < 200; i++) { scene.streakLeft = 1; scene.streak = 5; scene.combo(1, 2); scene.streak = 0; }
  assert.ok(scene.assist <= 1.15);
});

test('Finale: wechselt durch drei Übungen und endet', () => {
  let done = null;
  const app = fakeApp({ demos: false });
  const finale = makeFinale([games[0], games[5], games[11]]);
  assert.ok(finale.medals.every((m) => m.length === 3));
  const scene = new PlayScene(app, finale, 2, { seconds: 30, label: 'Finale', onFinish: (score) => { done = score; } });
  scene.layout();
  scene.countdown = 0;
  const seen = new Set();
  const ball = { x: 500, y: 500, vx: 0, vy: 0, visible: true };
  for (let i = 0; i < 60 * 35 && done == null; i++) {
    ball.x = 500 + 350 * Math.sin(i / 40);
    ball.y = 560 + 300 * Math.sin(i / 27);
    scene.update(1 / 60, ball);
    seen.add(scene.instance.i);
    if (i % 10 === 0) scene.draw(fakeCtx);
  }
  assert.ok(done != null);
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

test('Kamera-Störungen: Auch mit Zittern, Verzögerung und Aussetzern bleibt jede Übung spielbar', () => {
  // Ein mittlerer simulierter Spieler muss mit gestörtem Kamerabild noch mindestens
  // ein Viertel dessen schaffen, was er mit perfektem Bild erreicht.
  const avg = (game, noise) => {
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += playRound(game, 1, SKILLS.medium, noise);
    return sum / 6;
  };
  for (const game of games) {
    const clean = avg(game, false), noisy = avg(game, true);
    assert.ok(noisy > clean * 0.25, `${game.name}: ${Math.round(noisy)} statt ${Math.round(clean)} Punkte`);
  }
});

test('Farben: Spielfarben meiden den Bereich um die Ballfarbe', async () => {
  const { setBallHue, safeHue, worldPalette, THEME_IDS } = await import('../src/themes.js');
  const { BALL_PRESETS } = await import('../src/tracker.js');
  const apart = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  for (const ball of Object.values(BALL_PRESETS)) {
    setBallHue(ball.h);
    for (let h = 0; h < 360; h += 5) assert.ok(apart(safeHue(h), ball.h) >= 40, `Farbton ${h} bei Ball ${ball.name}`);
    for (const id of THEME_IDS) {
      for (const color of worldPalette(id)) {
        const hue = Number(/hsl\((\d+)/.exec(color)[1]);
        assert.ok(apart(hue, ball.h) >= 39, `${id}: ${color} bei Ball ${ball.name}`);
      }
    }
    for (const cat of categories) assert.ok(apart(safeHue(cat.hue), ball.h) >= 40);
  }
  setBallHue(18);
});

test('Themenwelten: Hintergrund und Bodenspuren lassen sich in jeder Welt zeichnen', async () => {
  const { THEMES, Floor } = await import('../src/themes.js');
  const field = { w: 1000, h: 1000 };
  const dots = Array.from({ length: 10 }, (_, i) => ({ x: i / 10, y: i / 10, r: 1, a: 0.2, v: 5, tw: 1 }));
  for (const [id, world] of Object.entries(THEMES)) {
    assert.equal(world.hues.length, 4);
    world.paint(fakeCtx, field, 3.2, 0.7, dots);
    const floor = new Floor();
    const ball = { x: 100, y: 500, visible: true };
    for (let i = 0; i < 120; i++) {
      ball.x += 6;
      floor.update(1 / 60, ball, id);
    }
    assert.ok(floor.marks.length > 0, `${world.name} hinterlässt Spuren`);
    floor.draw(fakeCtx, ball, 80);
    for (let i = 0; i < 300; i++) floor.update(1 / 60, { visible: false }, id);
    assert.equal(floor.marks.length, 0, 'Spuren verblassen wieder');
  }
});

test('Erklär-Animation: jeder Schritt lässt sich zu jedem Zeitpunkt zeichnen', async () => {
  const { drawHowTo, HOWTO_STEPS } = await import('../src/howto.js');
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : /Gradient/.test(String(k)) ? () => gradient : noop),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  assert.equal(HOWTO_STEPS, 6);
  for (let step = 0; step < HOWTO_STEPS; step++) {
    for (let t = 0; t < 8; t += 0.25) drawHowTo(ctx, step, t);
  }
});

test('Rennen endlos: nur Herzen beenden es, es wird immer schneller; im Training bleibt es eine feste Runde', () => {
  const run = games.find((g) => g.id === 'run');
  let result = null;
  const app = fakeApp({ demos: false });
  app.result = (r) => { result = r; };
  const scene = new PlayScene(app, run, 2, null, { events: false });
  scene.layout();
  scene.countdown = 0;
  assert.equal(scene.endless, true);
  assert.equal(scene.lives, 3);
  const off = { x: 5, y: 5, vx: 0, vy: 0, visible: true }; // weit neben der Bahn
  const ramps = [scene.env.ramp];
  scene.elapsed = 120;
  ramps.push(scene.env.ramp); // nach zwei Minuten
  scene.elapsed = 0;
  for (let i = 0; i < 60 * 300 && !result; i++) {
    scene.update(1 / 60, off);
  }
  assert.ok(result, 'endet, wenn alle Herzen weg sind');
  assert.ok(result.held > 3 && result.held < 10, `wer neben der Bahn bleibt, verliert alle drei Herzen in wenigen Sekunden (${result.held} s)`);
  assert.ok(ramps[1] > ramps[0] * 2, `wird schneller: ${ramps}`);
  // Im Training: feste Zeit, keine Herzen
  const timed = new PlayScene(fakeApp({ demos: false }), run, 2, { seconds: 40, onFinish() {} });
  assert.equal(timed.endless, false);
  assert.equal(timed.lives, null);
  assert.equal(timed.timeLeft, 40);
});

test('Tricks: elf Tricks, Themen fürs Dauertraining, Dauertraining endet erst auf Wunsch', async () => {
  const { MOVES, TOPICS, variants, topicGame } = await import('../src/games/tricks.js');
  assert.ok(MOVES.length >= 11);
  for (const t of TOPICS) assert.ok(variants(1, t.id).length >= 4, `${t.name}: genug Tricks`);
  assert.ok(variants(1).length < variants(2).length && variants(2).length < variants(3).length, 'mehr Tricks auf höherer Stufe');
  assert.ok(variants(1, 'vorhand').every((v) => v.side < 0) && variants(1, 'rueckhand').every((v) => v.side > 0));
  // Jeder Weg geht am Verteidiger vorbei, ohne ihn zu berühren
  for (const m of MOVES) {
    for (let i = 0; i < (m.gen ? 50 : 1); i++) {
      const pts = m.gen ? m.gen().pts : m.pts;
      for (const [x, y] of pts) assert.ok(Math.hypot(x, y) > 90, `${m.name} kommt dem Verteidiger zu nah: ${x},${y}`);
    }
  }
  // Zieher: mal kurz, mal lang
  const pullMove = MOVES.find((m) => m.name === 'Rückhandzieher');
  const widths = Array.from({ length: 200 }, () => pullMove.gen().pts[2][0]);
  assert.ok(Math.min(...widths) < 160 && Math.max(...widths) > 300, `Weiten ${Math.min(...widths)} bis ${Math.max(...widths)}`);
  // Vorhandzieher geht links vorbei, Rückhandzieher rechts
  assert.ok(variants(1).find((v) => v.move.name === 'Vorhandzieher').side < 0);
  assert.ok(variants(1).find((v) => v.move.name === 'Rückhandzieher').side > 0);

  const game = topicGame('zieher');
  let result = null;
  const app = fakeApp({ demos: false });
  app.result = (r) => { result = r; };
  const scene = new PlayScene(app, game, 2, null, { events: false });
  scene.layout();
  scene.countdown = 0;
  const bot = new Bot(SKILLS.strong);
  for (let i = 0; i < 30 * 150; i++) {
    scene.update(1 / 30, bot.ball);
    bot.step(1 / 30, goals.tricks(scene.instance, bot.ball));
  }
  assert.equal(result, null, 'läuft nach zweieinhalb Minuten noch');
  assert.ok(scene.instance.n >= 8, `${scene.instance.n} Tricks geschafft`);
  assert.ok(Object.keys(scene.instance.done).every((n) => ['Vorhandzieher', 'Rückhandzieher', 'Rückzieher', 'V-Zieher', 'Doppelzieher'].includes(n)), 'nur Zieher');
  scene.exit.onActivate();
  assert.ok(result, 'X beendet das Dauertraining mit Abrechnung');
  assert.equal(result.heldLabel, 'Geübt');
  assert.ok(result.stars >= 1, `${result.stars} Sterne nach ${Math.round(result.held)} s`);
});

test('Tricks: Linkshänder gespiegelt, jeder Trick variiert, Ketten halten Abstand zu beiden Verteidigern', async () => {
  const { MOVES, variants, shape, topicGame } = await import('../src/games/tricks.js');
  const side = (lefty, name) => variants(1, null, lefty).find((v) => v.move.name === name).side;
  assert.equal(side(false, 'Vorhandzieher'), -1);
  assert.equal(side(true, 'Vorhandzieher'), 1, 'Linkshänder ziehen mit der Vorhand nach rechts');
  assert.ok(variants(1, 'vorhand', true).every((v) => v.side > 0));
  // Formen variieren und kommen dem Verteidiger nie zu nah
  for (const m of MOVES) {
    const xs = new Set();
    for (let i = 0; i < 40; i++) {
      const { pts } = shape(m);
      xs.add(Math.round(Math.max(...pts.map(([x]) => Math.abs(x)))));
      for (const [x, y] of pts) assert.ok(Math.hypot(x, y) > 88, `${m.name}: ${x},${y}`);
    }
    assert.ok(xs.size > 5, `${m.name} variiert`);
  }
  // Ketten: der ganze Weg bleibt im Feld und weg von beiden Verteidigern
  const env = {
    field: { w: 1000, h: 1000 }, level: 3, topic: 'kette', lefty: false, stage: 0, ramp: 1, mult: 1, palette: ['#fff', '#fff', '#fff', '#fff'],
    sound: new Proxy({}, { get: () => () => {} }), say() {}, banner() {}, addScore() {}, combo: () => 1, miss() {}, shake() {},
  };
  const t = topicGame('kette').create(env);
  for (let i = 0; i < 60; i++) {
    t.load();
    assert.equal(t.defenders.length, 2);
    for (const q of t.path) {
      assert.ok(q.x > 20 && q.x < 980 && q.y > 100 && q.y < 1000, `${t.name}: ${Math.round(q.x)},${Math.round(q.y)}`);
      for (const d of t.defenders) assert.ok(Math.hypot(q.x - d.x, q.y - d.y) > 80, `${t.name} zu nah am Verteidiger`);
    }
  }
});
