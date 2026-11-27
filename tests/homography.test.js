import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHomography, applyHomography, isConvexQuad } from '../src/homography.js';

test('Homographie bildet schräges Viereck auf Einheitsquadrat ab', () => {
  const cam = [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.25 }, { x: 0.95, y: 0.9 }, { x: 0.1, y: 0.85 }];
  const dst = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const H = computeHomography(cam, dst);
  cam.forEach((p, i) => {
    const q = applyHomography(H, p.x, p.y);
    assert.ok(Math.hypot(q.x - dst[i].x, q.y - dst[i].y) < 1e-9);
  });
  // Der Schnittpunkt der Diagonalen muss in der Mitte landen.
  const d = (a, b, c, e) => {
    const den = (a.x - b.x) * (c.y - e.y) - (a.y - b.y) * (c.x - e.x);
    const t = ((a.x - c.x) * (c.y - e.y) - (a.y - c.y) * (c.x - e.x)) / den;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };
  const mid = d(cam[0], cam[2], cam[1], cam[3]);
  const q = applyHomography(H, mid.x, mid.y);
  assert.ok(Math.hypot(q.x - 0.5, q.y - 0.5) < 1e-9);
});

test('entartete Punkte ergeben keine Homographie', () => {
  const line = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
  assert.equal(computeHomography(line, line), null);
});

test('isConvexQuad erkennt überkreuzte Ecken', () => {
  const q = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  assert.equal(isConvexQuad(q), true);
  assert.equal(isConvexQuad([q[0], q[2], q[1], q[3]]), false);
});
