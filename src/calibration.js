// Kalibrierung: findet heraus, wo die Projektion im Kamerabild liegt.
// Ergebnis ist eine Homographie von Kamera-Koordinaten (0..1) auf Projektions-Koordinaten (0..1).
import { computeHomography, applyHomography, isConvexQuad } from './homography.js';
import { findBlobs } from './tracker.js';

export class CalibrationError extends Error {}

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
  const blobs = findBlobs(mask, w, h, 3).filter((b) => b.area < w * h * 0.1);
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

/**
 * Automatisch: projiziert nacheinander vier weiße Punkte und sucht sie im Kamerabild.
 * io = { show(drawFn), wait(ms), grabGray() -> {data, w, h} }
 */
export async function autoCalibrate(io) {
  const targets = [
    { x: 0.15, y: 0.15 }, { x: 0.85, y: 0.15 }, { x: 0.85, y: 0.85 }, { x: 0.15, y: 0.85 },
  ];
  const locate = async (dot, ref) => {
    io.show(drawDots([dot]));
    await io.wait(600);
    const g = await io.grabGray();
    const s = findBrightSpot(ref.data, g.data, g.w, g.h);
    return s && { x: (s.x + 0.5) / g.w, y: (s.y + 0.5) / g.h };
  };

  io.show(drawDots([]));
  await io.wait(800);
  const ref = await io.grabGray();
  if (!ref) throw new CalibrationError('Kein Kamerabild.');

  const cam = [];
  for (const t of targets) {
    const p = await locate(t, ref);
    if (!p) {
      throw new CalibrationError(
        'Ein Kalibrierpunkt wurde nicht gefunden. Sieht die Kamera die ganze Projektion? Ist der Raum dunkel genug?');
    }
    cam.push(p);
  }
  if (!isConvexQuad(cam)) throw new CalibrationError('Die Punkte wurden nicht sauber erkannt. Bitte noch einmal versuchen.');
  const H = computeHomography(cam, targets);
  if (!H) throw new CalibrationError('Kalibrierung fehlgeschlagen.');

  // Kontrolle mit einem fünften Punkt in der Mitte.
  const mid = await locate({ x: 0.5, y: 0.5 }, ref);
  let error = null;
  if (mid) {
    const p = applyHomography(H, mid.x, mid.y);
    error = Math.hypot(p.x - 0.5, p.y - 0.5);
  }
  return { H, error };
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
      ctx.font = `bold ${Math.round(ch * 0.04)}px system-ui, sans-serif`;
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
      if (H) resolve({ H, error: null });
      else reject(new CalibrationError('Die Ecken bitte der Reihe nach im Uhrzeigersinn anklicken.'));
    });
  });
}
