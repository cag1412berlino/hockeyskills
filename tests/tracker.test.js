import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBall, rgbToHsv, BALL_PRESETS } from '../src/tracker.js';
import { findBrightSpot } from '../src/calibration.js';

function image(w, h, bg = [40, 40, 40]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...bg, 255], i * 4);
  const disc = (cx, cy, r, rgb) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (Math.hypot(x - cx, y - cy) <= r) data.set([...rgb, 255], (y * w + x) * 4);
    }
  };
  return { data, disc };
}

test('rgbToHsv', () => {
  assert.deepEqual(rgbToHsv(255, 0, 0), [0, 1, 1]);
  assert.equal(Math.round(rgbToHsv(255, 106, 0)[0]), 25);
});

test('findet orangen Ball und ignoriert andere Farben', () => {
  const img = image(160, 90);
  img.disc(40, 30, 12, [0, 120, 255]);   // blaues Ziel
  img.disc(120, 20, 10, [255, 255, 255]); // weißer Fleck
  img.disc(100, 60, 5, [255, 90, 10]);    // Ball
  const b = detectBall(img.data, 160, 90, BALL_PRESETS.orange);
  assert.ok(b);
  assert.ok(Math.hypot(b.x - 100, b.y - 60) < 1);
});

test('kein Ball im Bild', () => {
  const img = image(160, 90);
  img.disc(40, 30, 12, [0, 200, 80]);
  assert.equal(detectBall(img.data, 160, 90, BALL_PRESETS.orange), null);
});

test('bevorzugt den Fleck nahe der letzten Position', () => {
  const img = image(160, 90);
  img.disc(30, 30, 5, [255, 90, 10]);
  img.disc(120, 60, 6, [255, 90, 10]);
  const b = detectBall(img.data, 160, 90, BALL_PRESETS.orange, { x: 31, y: 30 });
  assert.ok(Math.hypot(b.x - 30, b.y - 30) < 1);
});

test('findBrightSpot findet den Kalibrierpunkt', () => {
  const w = 80, h = 60;
  const ref = new Float32Array(w * h).fill(20);
  const img = Float32Array.from(ref, (v) => v + 4); // leicht heller durch Belichtung
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (Math.hypot(x - 50, y - 20) <= 4) img[y * w + x] = 200;
  }
  const s = findBrightSpot(ref, img, w, h);
  assert.ok(Math.hypot(s.x - 50, s.y - 20) < 0.5);
  assert.equal(findBrightSpot(ref, ref, w, h), null);
});
