import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayScene } from '../src/play.js';
import { games } from '../src/games/index.js';
import { newProfile } from '../src/profile.js';

const silent = new Proxy({}, { get: () => () => {} });

function stubApp(calls) {
  return {
    engine: { field: { w: 2000, h: 1000, scale: 1 }, shake() {} },
    config: { speed: 1, demos: false },
    profile: newProfile('Test'),
    sound: silent, voice: silent, music: silent,
    palette: () => ['#58f', '#5df', '#76f', '#9cf'],
    save() {}, menu() { calls.push('menu'); },
    record: () => { calls.push('record'); return { xp: 0, badges: [] }; },
    result: () => calls.push('result'),
    careerRecord: () => calls.push('career'),
  };
}

test('Freies Spiel: keine Herzen, keine Zeit, nichts wird gewertet', () => {
  for (const id of ['rain', 'run', 'targets', 'slalom', 'taps']) {
    const calls = [];
    const game = games.find((g) => g.id === id);
    const scene = new PlayScene(stubApp(calls), game, 3, null, { free: true, events: false, back: () => calls.push('back') });
    scene.layout();
    scene.countdown = 0;
    // drei Minuten stillstehen: Steine treffen, man verlässt die Bahn – es geht trotzdem weiter
    for (let i = 0; i < 180 * 30; i++) scene.update(1 / 30, { visible: true, x: 1000, y: 780, vx: 0, vy: 0 });
    assert.equal(scene.done, undefined, `${id}: läuft noch`);
    assert.equal(scene.lives, null);
    scene.finish();
    assert.deepEqual(calls, ['back'], `${id}: nur zurück, nichts verbucht`);
  }
});
