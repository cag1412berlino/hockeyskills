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

// ---------- Kalibrierung mit Punktraster ----------

/** Gedachte Kamera: bildet Projektions-Koordinaten über P ins Kamerabild ab und „sieht“ helle Punkte. */
function fakeCamera(P, { liar = null } = {}) {
  const w = 480, h = 270;
  let dots = [], shots = 0;
  return {
    wait: async () => {},
    show(fn) {
      dots = [];
      fn({ set fillStyle(v) {}, beginPath() {}, fill() {}, arc: (x, y) => dots.push({ x, y }) }, 1, 1);
    },
    async grabGray() {
      const data = new Float32Array(w * h).fill(20);
      shots++;
      for (const d of dots) {
        let c = applyHomography(P, d.x, d.y);
        if (liar && shots === liar) c = { x: 0.9, y: 0.9 }; // ein Punkt wird an falscher Stelle „gesehen“
        const cx = Math.round(c.x * w - 0.5), cy = Math.round(c.y * h - 0.5);
        for (let y = cy - 2; y <= cy + 2; y++) {
          for (let x = cx - 2; x <= cx + 2; x++) if (x >= 0 && y >= 0 && x < w && y < h) data[y * w + x] = 220;
        }
      }
      return { data, w, h };
    },
  };
}

test('Kalibrierung: Raster findet das Feld, auch schräg und in einem Teil der Projektion', async () => {
  const { autoCalibrate } = await import('../src/calibration.js');
  const { computeHomography: ch } = await import('../src/homography.js');
  const quad = [{ x: 0.2, y: 0.15 }, { x: 0.85, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.8 }]; // Projektion im Kamerabild
  const P = ch([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], quad);
  const field = [{ x: 0.1, y: 0 }, { x: 0.9, y: 0 }, { x: 0.9, y: 1 }, { x: 0.1, y: 1 }];
  const r = await autoCalibrate(fakeCamera(P), field);
  assert.equal(r.points, 16);
  assert.deepEqual(r.missing, []);
  assert.ok(r.seen > 0.99);
  const back = applyHomography(r.H, ...Object.values(applyHomography(P, 0.3, 0.7)));
  assert.ok(Math.hypot(back.x - 0.3, back.y - 0.7) < 0.01, JSON.stringify(back));
});

test('Kalibrierung: ein falsch erkannter Punkt wird aussortiert', async () => {
  const { autoCalibrate } = await import('../src/calibration.js');
  const { computeHomography: ch } = await import('../src/homography.js');
  const full = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const P = ch(full, [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }]);
  const r = await autoCalibrate(fakeCamera(P, { liar: 8 }), full);
  assert.equal(r.points, 15);
  const back = applyHomography(r.H, 0.5, 0.5);
  assert.ok(Math.hypot(back.x - 0.5, back.y - 0.5) < 0.01);
});

test('Kalibrierung: sieht die Kamera den oberen Rand nicht, klappt es trotzdem und wird gemeldet', async () => {
  const { autoCalibrate } = await import('../src/calibration.js');
  const { computeHomography: ch } = await import('../src/homography.js');
  const full = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  // oberes Fünftel der Projektion liegt über dem Kamerabild
  const P = ch(full, [{ x: 0.2, y: -0.2 }, { x: 0.8, y: -0.2 }, { x: 0.85, y: 0.9 }, { x: 0.15, y: 0.9 }]);
  const r = await autoCalibrate(fakeCamera(P), full);
  assert.deepEqual(r.missing, ['oben']);
  assert.ok(r.seen > 0.6 && r.seen < 0.95, String(r.seen));
  const back = applyHomography(r.H, ...Object.values(applyHomography(P, 0.6, 0.6)));
  assert.ok(Math.hypot(back.x - 0.6, back.y - 0.6) < 0.01);
});

test('Kalibrierung: sieht die Kamera fast nichts, gibt es eine klare Fehlermeldung', async () => {
  const { autoCalibrate, CalibrationError } = await import('../src/calibration.js');
  const { computeHomography: ch } = await import('../src/homography.js');
  const full = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const P = ch(full, [{ x: 0.5, y: -3 }, { x: 4, y: -3 }, { x: 4, y: 0.5 }, { x: 0.5, y: 0.5 }]);
  await assert.rejects(() => autoCalibrate(fakeCamera(P), full), CalibrationError);
});
