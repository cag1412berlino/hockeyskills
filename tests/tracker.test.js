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

test('Vorhalt: schiebt die Position in Bewegungsrichtung, aber begrenzt', async () => {
  const { predict, setFieldMeters } = await import('../src/engine.js');
  assert.deepEqual(predict({ x: 100, y: 100 }, { x: 500, y: 0 }, 0.1), { x: 150, y: 100 });
  assert.deepEqual(predict({ x: 100, y: 100 }, { x: 0, y: 0 }, 0.2), { x: 100, y: 100 });
  const far = predict({ x: 0, y: 0 }, { x: 9000, y: 0 }, 0.2);
  assert.equal(far.x, 150, 'ein Ausreißer verschiebt höchstens um 150 Einheiten');
  // Ballgröße passt sich der Feldgröße an (über die laufende Verknüpfung des Exports)
  const engine = await import('../src/engine.js');
  setFieldMeters(3);
  assert.equal(engine.BALL_RADIUS, 23);
  setFieldMeters(2);
  assert.equal(engine.BALL_RADIUS, 35);
});

test('Erkennungstest: gute Erkennung wird gut bewertet, Aussetzer und Störungen fallen auf', async () => {
  const { RecognitionTest, STILL_SECONDS, MOVE_SECONDS } = await import('../src/trackingtest.js');
  const run = (still, move) => {
    const t = new RecognitionTest();
    const dt = 1 / 30;
    for (let i = 0; t.phase !== 'done'; i++) {
      const s = t.time;
      t.add(t.phase === 'still' ? still(i, s) : move(i, s - STILL_SECONDS), dt);
    }
    return t.result();
  };
  const sweep = (i, s) => ({ x: 0.1 + 0.8 * ((s / MOVE_SECONDS) * 3 % 1), y: 0.1 + 0.8 * (s / MOVE_SECONDS), area: 40, rivals: 0 });
  const calm = () => ({ x: 0.5, y: 0.5, area: 40, rivals: 0 });

  const good = run(calm, sweep);
  assert.equal(good.grade, 0, JSON.stringify(good.checks));
  assert.ok(good.checks.every((c) => !c.tip), 'ohne Mängel gibt es keine Tipps');

  const nothing = run(() => null, () => null);
  assert.equal(nothing.grade, 2);
  assert.equal(nothing.found, false);
  assert.match(nothing.checks.at(-1).tip, /Post-it/);

  const flicker = run((i) => (i % 3 ? calm() : null), sweep);
  assert.equal(flicker.checks.find((c) => c.label === 'Im Liegen erkannt').grade, 2);

  const shaky = run((i) => ({ x: 0.5 + (i % 2 ? 0.02 : -0.02), y: 0.5, area: 40, rivals: 0 }), sweep);
  assert.equal(shaky.checks.find((c) => c.label === 'Ruhe im Liegen').grade, 2);

  const crowded = run(() => ({ x: 0.5, y: 0.5, area: 40, rivals: 2 }), sweep);
  assert.equal(crowded.checks.find((c) => c.label === 'Nichts anderes in Ballfarbe').grade, 2);

  const lazy = run(calm, calm);
  assert.equal(lazy.checks.find((c) => c.label === 'In Bewegung erkannt').value, 'nicht gemessen');

  const gaps = run(calm, (i, s) => (s > 2 && s < 3.2 ? null : sweep(i, s)));
  assert.equal(gaps.checks.find((c) => c.label === 'Längster Aussetzer').grade, 2);
});

test('Ballerkennung meldet weitere Flecken in Ballfarbe (z. B. zweites Post-it)', async () => {
  const { detectBall, BALL_PRESETS } = await import('../src/tracker.js');
  const w = 120, h = 80, img = new Uint8ClampedArray(w * h * 4).fill(30);
  const square = (x0, y0, n) => {
    for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) img.set([255, 45, 155, 255], (y * w + x) * 4);
  };
  square(20, 20, 8); // eckig wie ein Post-it
  const one = detectBall(img, w, h, BALL_PRESETS.pink);
  assert.ok(Math.abs(one.x - 23.5) < 0.6 && Math.abs(one.y - 23.5) < 0.6);
  assert.equal(one.rivals, 0);
  square(90, 50, 7);
  assert.equal(detectBall(img, w, h, BALL_PRESETS.pink).rivals, 1);
});

test('Ballerkennung: ein großer Ring in Ballfarbe ist kein Ball, die kleinere Scheibe schon', async () => {
  const { detectBall, BALL_PRESETS } = await import('../src/tracker.js');
  const w = 200, h = 120, img = new Uint8ClampedArray(w * h * 4).fill(20);
  const paint = (x, y) => img.set([255, 45, 155, 255], (y * w + x) * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ring = Math.hypot(x - 50, y - 60);
      if (ring > 26 && ring < 30) paint(x, y);            // Ring, wie das Symbol eines Menüknopfs
      if (Math.hypot(x - 150, y - 60) < 7) paint(x, y);   // Ball
    }
  }
  const found = detectBall(img, w, h, BALL_PRESETS.pink, { x: 50, y: 60 }); // selbst wenn zuletzt am Ring
  assert.ok(Math.abs(found.x - 150) < 1 && Math.abs(found.y - 60) < 1, JSON.stringify(found));
  assert.equal(found.rivals, 0, 'der Ring zählt auch nicht als Störung');
});

test('Kalibrierung: gespeicherte Kalibrierung mit großem Fehler gilt als unbrauchbar', async () => {
  const { calibOk } = await import('../src/calibration.js');
  assert.equal(calibOk({ H: [1, 0, 0, 0, 1, 0, 0, 0, 1], error: 0.01 }), true);
  assert.equal(calibOk({ H: [1, 0, 0, 0, 1, 0, 0, 0, 1], error: null }), true); // von Hand kalibriert
  assert.equal(calibOk({ H: [1, 0, 0, 0, 1, 0, 0, 0, 1], error: 29.4 }), false);
  assert.equal(calibOk(null), false);
});

test('Ballerkennung sucht nur im Spielfeld: Farbe außerhalb zählt nicht', async () => {
  const { detectBall, regionMask, BALL_PRESETS } = await import('../src/tracker.js');
  const w = 200, h = 120, img = new Uint8ClampedArray(w * h * 4).fill(20);
  const blob = (cx, cy, r) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) img.set([255, 45, 155, 255], (y * w + x) * 4);
  };
  blob(20, 100, 12); // großes Ding in Ballfarbe neben dem Feld
  blob(120, 60, 3);  // der kleine Ball im Feld
  const region = regionMask([{ x: 0.3, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.95, y: 0.9 }, { x: 0.25, y: 0.9 }], w, h);
  assert.equal(region[60 * w + 120], 1);
  assert.equal(region[100 * w + 20], 0);
  const free = detectBall(img, w, h, BALL_PRESETS.pink);
  assert.ok(Math.abs(free.x - 20) < 1, 'ohne Feldgrenze gewinnt das große Ding');
  const inside = detectBall(img, w, h, BALL_PRESETS.pink, null, new Uint8Array(w * h), region);
  assert.ok(Math.abs(inside.x - 120) < 1 && Math.abs(inside.y - 60) < 1);
});

test('Blasser Ball (überbelichtet, Filz) auf ähnlich gefärbtem Boden: Farbe per Klick lernen und finden', async () => {
  const { BallTracker, detectBall } = await import('../src/tracker.js');
  // Werte aus einer echten Aufnahme: beiger Boden, gelber Filzball, hell beleuchtet
  const w = 160, h = 90, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([179, 177, 135, 255], i * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - 100, y - 40);
    if (d < 5) data.set(x < 100 ? [242, 244, 190, 255] : [180, 188, 140, 255], (y * w + x) * 4); // halb im Schatten
    if (x > 20 && x < 50 && y > 60 && y < 70) data.set([250, 250, 250, 255], (y * w + x) * 4);   // weiße Projektion
  }
  const t = Object.create(BallTracker.prototype); // ohne Zeichenfläche (die gibt es nur im Browser)
  t.frame = { width: w, height: h, data };
  const color = t.learnBall(99 / w, 40 / h);
  assert.ok(color.pale, 'als blass erkannt');
  assert.ok(Math.abs(color.h - 64) < 12, `Farbton ${color.h}`);
  const found = detectBall(data, w, h, color);
  assert.ok(found && Math.abs(found.x - 98) < 3 && Math.abs(found.y - 40) < 3, JSON.stringify(found));
  assert.ok(t.share(color) < 0.01, 'Boden und weiße Flächen zählen nicht');
});

test('Ball-Verfolgung: bleibt am Ball, auch wenn das Schlägerblatt in Ballfarbe kurz größer ist', async () => {
  const { BallFollower } = await import('../src/tracker.js');
  const f = new BallFollower(480);
  const ball = (x, y) => ({ x, y, area: 20, fill: 0.78 });
  const stick = (x, y) => ({ x, y, area: 45, fill: 0.5 });
  let jumps = 0, prev = null;
  for (let i = 0; i < 60; i++) {
    const list = [ball(200 + i * 2, 150)];
    if (i % 3 === 0) list.push(stick(320, 90 + (i % 7) * 5)); // Schläger taucht immer wieder auf, an wechselnden Stellen
    if (i % 10 === 5) list.shift();                          // Ball kurz verdeckt
    const got = f.step(list);
    if (got && prev && Math.hypot(got.x - prev.x, got.y - prev.y) > 30) jumps++;
    if (got) prev = got;
  }
  assert.equal(jumps, 0, 'kein Sprung zum Schläger');
  // Verschwindet der Ball wirklich, wird ein stabiler anderer Fleck übernommen
  let taken = null;
  for (let i = 0; i < 6; i++) taken = f.step([ball(60, 230)]);
  assert.ok(taken && taken.x === 60, 'neuer Ball an anderer Stelle wird nach kurzer Zeit gefunden');
});
