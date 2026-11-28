import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, guardColor } from '../src/colorguard.js';
import { setBallHue, hueGap } from '../src/themes.js';

const hueOf = (c) => parseColor(c).h;

test('liest gängige Farbschreibweisen', () => {
  assert.equal(Math.round(parseColor('#ff0000').h), 0);
  assert.equal(Math.round(parseColor('#0f0').h), 120);
  assert.equal(Math.round(parseColor('rgba(0, 0, 255, 0.5)').h), 240);
  assert.equal(parseColor('rgba(0, 0, 255, 0.5)').a, 0.5);
  assert.equal(Math.round(parseColor('hsl(300 80% 60% / 0.4)').h), 300);
  assert.equal(parseColor('hsl(300, 80%, 60%)').s, 0.8);
  assert.equal(parseColor('white'), null);
});

test('pinker Ball: pinke Farben werden verschoben, andere bleiben', () => {
  setBallHue(320, 20);
  for (const c of ['#ff4fd8', 'hsl(330 90% 60%)', 'rgba(255,0,180,0.7)', 'hsl(300 80% 55% / 0.5)']) {
    assert.ok(hueGap(hueOf(guardColor(c))) >= 54, `${c} -> ${guardColor(c)}`);
  }
  assert.equal(guardColor('hsl(120 80% 50%)'), 'hsl(120 80% 50%)');
  assert.equal(guardColor('#ffffff'), '#ffffff'); // Weiß hat keinen Farbton
  assert.equal(guardColor('rgba(0,0,0,0.5)'), 'rgba(0,0,0,0.5)');
  // Deckkraft bleibt erhalten
  assert.equal(parseColor(guardColor('rgba(255,0,180,0.7)')).a, 0.7);
});

test('gelber Ball: Gelb wird verschoben; Wechsel der Ballfarbe wirkt sofort', () => {
  setBallHue(56, 20);
  assert.ok(hueGap(hueOf(guardColor('#ffd700'))) >= 54);
  setBallHue(320, 20);
  assert.equal(guardColor('#ffd700'), '#ffd700');
});

test('breite Toleranz in der Erkennung vergrößert die Sperrzone', () => {
  setBallHue(200, 40);
  assert.ok(hueGap(hueOf(guardColor('hsl(270 90% 50%)'))) >= 74);
});
