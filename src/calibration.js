// Kalibrierung: findet heraus, wo das Spielfeld im Kamerabild liegt.
// Ergebnis ist eine Homographie von Kamera-Koordinaten (0..1) auf Projektions-Koordinaten (0..1).
import { computeHomography, fitHomography, invertHomography, applyHomography, isConvexQuad } from './homography.js';
import { findBlobs } from './tracker.js';

export class CalibrationError extends Error {}

/** Größte erlaubte Abweichung eines Kalibrierpunkts (Anteil der Projektion). */
export const MAX_ERROR = 0.03;

/** Ist eine gespeicherte Kalibrierung brauchbar? Alte, verunglückte Kalibrierungen werden so aussortiert. */
export function calibOk(calib) {
  return !!calib?.H && (calib.error == null || calib.error < MAX_ERROR);
}

/** Helligkeit pro Pixel aus RGBA-Daten. */
export function toGray(rgba, out = new Float32Array(rgba.length / 4)) {
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return out;
}

/** Sucht die Stelle, die in img deutlich heller ist als in ref. Liefert {x, y} in Pixeln oder null. */
export function findBrightSpot(ref, img, w, h) {
  let max = 0;
  for (let i = 0; i < img.length; i++) max = Math.max(max, img[i] - ref[i]);
  if (max < 25) return null;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < img.length; i++) mask[i] = img[i] - ref[i] > max * 0.5 ? 1 : 0;
  // Der Punkt ist ein kompakter runder Fleck; Streifen und Flächen (etwa eine Wand, die durch die
  // Belichtungsautomatik heller wird) zählen nicht.
  const blobs = findBlobs(mask, w, h, 3).filter((b) => b.area < w * h * 0.1
    && b.area / (b.bw * b.bh) > 0.45 && Math.max(b.bw, b.bh) / Math.min(b.bw, b.bh) < 3);
  if (!blobs.length) return null;
  return blobs.reduce((a, b) => (b.area > a.area ? b : a));
}

const drawDots = (dots) => (ctx, cw, ch) => {
  ctx.fillStyle = '#fff';
  for (const d of dots) {
    ctx.beginPath();
    ctx.arc(d.x * cw, d.y * ch, Math.min(cw, ch) * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
};

const SIDES = ['oben', 'rechts', 'unten', 'links'];

/**
 * Welchen Teil des Spielfelds sieht die Kamera? corners = Ecken des Felds in der Projektion.
 * Liefert { seen: Anteil 0..1, missing: ['oben', …] } – die Seiten, an denen ein Stück fehlt.
 */
export function fieldCoverage(H, corners) {
  const back = invertHomography(H);
  if (!back) return { seen: 0, missing: [...SIDES] };
  const N = 20;
  let seen = 0;
  const edge = [[0, 0], [0, 0], [0, 0], [0, 0]]; // je Seite: sichtbar, gesamt
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N, v = (j + 0.5) / N;
      const p = inField(corners, u, v);
      const w = back[6] * p.x + back[7] * p.y + back[8];
      const cam = applyHomography(back, p.x, p.y);
      const ok = w > 0 && cam.x > 0.01 && cam.x < 0.99 && cam.y > 0.01 && cam.y < 0.99;
      if (ok) seen++;
      // Randstreifen je Seite, ohne die Ecken (die gehören zu zwei Seiten)
      const midU = u > 0.2 && u < 0.8, midV = v > 0.2 && v < 0.8;
      const strips = [v < 0.15 && midU, u > 0.85 && midV, v > 0.85 && midU, u < 0.15 && midV];
      strips.forEach((inside, s) => { if (inside) { edge[s][1]++; if (ok) edge[s][0]++; } });
    }
  }
  return { seen: seen / (N * N), missing: SIDES.filter((_, s) => edge[s][0] < edge[s][1] * 0.9) };
}

/** Punkt im Spielfeld (u, v von 0 bis 1) in Projektions-Koordinaten. */
function inField(corners, u, v) {
  const [a, b, c, d] = corners;
  const top = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  const bottom = { x: d.x + (c.x - d.x) * u, y: d.y + (c.y - d.y) * u };
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
}

const FULL = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/**
 * Automatisch: projiziert nacheinander ein Raster aus 16 weißen Punkten über das ganze Spielfeld
 * und sucht jeden im Kamerabild. Aus allen gefundenen Punkten wird die Lage des Felds berechnet;
 * falsch erkannte Punkte werden aussortiert. Das klappt auch, wenn die Kamera nicht das ganze
 * Feld sieht – dann sagt das Ergebnis, an welcher Seite ein Stück fehlt.
 * corners = Ecken des Spielfelds in der Projektion (oben links, oben rechts, unten rechts, unten links).
 * io = { show(drawFn), wait(ms), grabGray() -> {data, w, h} }
 */
export async function autoCalibrate(io, corners = FULL) {
  const steps = [0.08, 0.36, 0.64, 0.92];
  const pairs = [];
  for (const v of steps) {
    // Für jede Reihe ein frisches Vergleichsbild, falls die Kamera ihre Belichtung nachregelt.
    io.show(drawDots([]));
    await io.wait(500);
    const ref = await io.grabGray();
    if (!ref) throw new CalibrationError('Kein Kamerabild.');
    for (const u of steps) {
      const dot = inField(corners, u, v);
      io.show(drawDots([dot]));
      await io.wait(450);
      const g = await io.grabGray();
      const s = g && findBrightSpot(ref.data, g.data, g.w, g.h);
      if (s) pairs.push({ cam: { x: (s.x + 0.5) / g.w, y: (s.y + 0.5) / g.h }, dot, u, v });
    }
  }

  const SEE = 'Sieht die Kamera das Spielfeld? Ist der Raum dunkel genug? Währenddessen nicht durchs Bild laufen.';
  // Aus je vier Punkten eine Lage berechnen und zählen, wie viele der übrigen dazu passen.
  // Die Lage mit den meisten passenden Punkten gewinnt; falsch erkannte Punkte fallen so heraus.
  const errOf = (H, p) => {
    const q = applyHomography(H, p.cam.x, p.cam.y);
    return Math.hypot(q.x - p.dot.x, q.y - p.dot.y);
  };
  let best = [];
  const n = pairs.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    const four = [pairs[a], pairs[b], pairs[c], pairs[d]];
    const h = computeHomography(four.map((p) => p.cam), four.map((p) => p.dot));
    if (!h) continue;
    const fits = pairs.filter((p) => errOf(h, p) < MAX_ERROR);
    if (fits.length > best.length) best = fits;
  }
  let H = null, worst = Infinity;
  if (best.length >= 6) {
    H = fitHomography(best.map((p) => p.cam), best.map((p) => p.dot));
    if (H) worst = Math.max(...best.map((p) => errOf(H, p)));
  }
  pairs.length = 0;
  pairs.push(...best);
  if (!H || worst >= MAX_ERROR) {
    throw new CalibrationError(`Es wurden zu wenige Kalibrierpunkte sicher erkannt. ${SEE}`);
  }
  const spread = (key) => Math.max(...pairs.map((p) => p[key])) - Math.min(...pairs.map((p) => p[key]));
  if (spread('u') < 0.5 || spread('v') < 0.5) {
    throw new CalibrationError('Die Kamera sieht nur einen kleinen Teil des Spielfelds. Kamera weiter weg oder höher stellen und noch einmal kalibrieren.');
  }
  return { H, error: worst, points: pairs.length, ...fieldCoverage(H, corners) };
}

/**
 * Manuell: zeigt ein Standbild der Kamera, der Nutzer klickt die vier Ecken des Spielfelds an.
 * corners = Ecken des Spielfelds in Projektions-Koordinaten (oben links, oben rechts, unten rechts, unten links).
 * io = { show, wait, snapshot() -> Canvas, onClick(fn|null), onCancel(fn|null) }
 */
export async function manualCalibrate(io, corners) {
  // Erst das Spielfeld mit nummerierten Ecken zeigen, damit es (mit Beamer) im Standbild zu sehen ist.
  io.show((ctx, cw, ch) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(4, cw * 0.004);
    ctx.beginPath();
    corners.forEach((c, i) => (i ? ctx.lineTo(c.x * cw, c.y * ch) : ctx.moveTo(c.x * cw, c.y * ch)));
    ctx.closePath();
    ctx.stroke();
  });
  await io.wait(800);
  const snap = io.snapshot();
  if (!snap) throw new CalibrationError('Kein Kamerabild.');

  const names = ['OBEN LINKS', 'OBEN RECHTS', 'UNTEN RECHTS', 'UNTEN LINKS'];
  const pts = [];
  let rect = null;

  return new Promise((resolve, reject) => {
    const done = () => { io.onClick(null); io.onCancel(null); };
    io.show((ctx, cw, ch) => {
      const s = Math.min(cw / snap.width, (ch * 0.88) / snap.height);
      rect = { w: snap.width * s, h: snap.height * s };
      rect.x = (cw - rect.w) / 2;
      rect.y = ch * 0.1;
      ctx.drawImage(snap, rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(ch * 0.032)}px system-ui, sans-serif`;
      ctx.fillText(`Klicke im Bild auf die Ecke ${names[pts.length] ?? ''} des Spielfelds (${pts.length + 1}/4) – Esc bricht ab`, cw / 2, ch * 0.05);
      ctx.strokeStyle = '#0ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = rect.x + p.x * rect.w, y = rect.y + p.y * rect.h;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.stroke();
      pts.forEach((p, i) => {
        const x = rect.x + p.x * rect.w, y = rect.y + p.y * rect.h;
        ctx.fillStyle = '#0ff';
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(String(i + 1), x + 24, y - 24);
      });
    });
    io.onCancel(() => { done(); reject(new CalibrationError('Abgebrochen.')); });
    io.onClick((px, py) => {
      if (!rect) return;
      const x = (px - rect.x) / rect.w, y = (py - rect.y) / rect.h;
      if (x < 0 || y < 0 || x > 1 || y > 1) return;
      pts.push({ x, y });
      if (pts.length < 4) return;
      done();
      const H = isConvexQuad(pts) && computeHomography(pts, corners);
      if (H) resolve({ H, error: null, ...fieldCoverage(H, corners) });
      else reject(new CalibrationError('Die Ecken bitte der Reihe nach im Uhrzeigersinn anklicken.'));
    });
  });
}
