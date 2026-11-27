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
