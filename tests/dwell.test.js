import test from 'node:test';
import assert from 'node:assert/strict';
import { DwellButton, HOLD_OFF } from '../src/ui.js';

test('Ball liegt beim Erscheinen schon auf dem Button: löst nach Wartezeit trotzdem aus', () => {
  let hits = 0;
  const b = new DwellButton({ x: 0, y: 0, r: 50, dwell: 1, onActivate: () => hits++ });
  const ball = { x: 0, y: 0, visible: true };
  let t = 0;
  while (t < HOLD_OFF + 0.9) { b.update(1 / 30, ball); t += 1 / 30; }
  assert.equal(hits, 0, 'nicht sofort');
  while (t < HOLD_OFF + 1.2) { b.update(1 / 30, ball); t += 1 / 30; }
  assert.equal(hits, 1);
});

test('Ball kommt neu auf den Button: löst nach der normalen Zeit aus', () => {
  let hits = 0;
  const b = new DwellButton({ x: 0, y: 0, r: 50, dwell: 1, onActivate: () => hits++ });
  b.update(1 / 30, { x: 200, y: 0, visible: true });
  for (let i = 0; i < 32; i++) b.update(1 / 30, { x: 0, y: 0, visible: true });
  assert.equal(hits, 1);
});
