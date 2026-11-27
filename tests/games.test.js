// Spielt jedes Spiel auf jeder Stufe und in jedem Tempo einmal komplett durch,
// mit einem Ball, der Schleifen fährt und zwischendurch verschwindet.
// Fängt Abstürze und kaputte Punktestände ab, nicht den Spielspaß.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayScene } from '../src/scenes.js';
import { games } from '../src/games/index.js';

/** Zeichenfläche, die jeden Aufruf schluckt. */
const fakeCtx = new Proxy({}, {
  get: (_, prop) => (prop === 'measureText' ? () => ({ width: 10 })
    : prop.startsWith?.('create') ? () => ({ addColorStop() {} })
    : () => {}),
  set: () => true,
});
const silent = new Proxy({}, { get: () => () => {} });

function play(game, level, speed) {
  let result = null;
  const app = {
    engine: { field: { w: 1000, h: 1000, scale: 1 }, shake() {} },
    config: { speed, highscores: {} },
    sound: silent,
    palette: () => ['hsl(212 90% 55%)', 'hsl(196 90% 55%)', 'hsl(226 90% 62%)', 'hsl(204 90% 72%)'],
    save() {},
    menu() {},
    result: (g, l, score) => { result = { score }; },
  };
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
        if (game.lives == null) assert.equal(scene.stage, 3, 'alle Schwierigkeitsstufen erreicht');
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
    assert.equal(game.medals.length, 3);
    assert.ok(game.medals[0] < game.medals[1] && game.medals[1] < game.medals[2]);
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
    const app = {
      engine: { field: { w: 1000, h: 1000, scale: 1 }, shake() {} },
      config: { speed: 1, highscores: {} },
      sound: silent,
      palette: () => ['hsl(212 90% 55%)', 'hsl(196 90% 55%)', 'hsl(226 90% 62%)', 'hsl(204 90% 72%)'],
      save() { assert.fail('im Training werden keine Einzelrekorde gespeichert'); },
      menu() {},
      result() { assert.fail('im Training gibt es keinen Einzel-Ergebnisbildschirm'); },
    };
    const scene = new PlayScene(app, game, 2, { seconds: 20, label: 'Übung 1 von 1', onFinish: (score, stars) => { done = { score, stars }; } });
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
