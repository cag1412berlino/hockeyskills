import test from 'node:test';
import assert from 'node:assert/strict';
import { DwellButton } from '../src/ui.js';

test('Ball liegt beim Erscheinen schon auf dem Button: erst herunter, dann zählt es', () => {
  let hits = 0;
  const b = new DwellButton({ x: 0, y: 0, r: 50, dwell: 1, onActivate: () => hits++ });
  for (let i = 0; i < 150; i++) b.update(1 / 30, { x: 0, y: 0, visible: true });
  assert.equal(hits, 0, 'löst nicht von selbst aus');
  b.update(1 / 30, { x: 200, y: 0, visible: true });
  for (let i = 0; i < 32; i++) b.update(1 / 30, { x: 0, y: 0, visible: true });
  assert.equal(hits, 1);
});
