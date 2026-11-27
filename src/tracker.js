// Ballerkennung über die Farbe: Pixel im Farbbereich des Balls suchen,
// zusammenhängende Flecken bilden, den passendsten Fleck als Ball nehmen.

export const BALL_PRESETS = {
  orange: { name: 'Orange', h: 18, hTol: 14, sMin: 0.5, vMin: 0.45, css: '#ff6a00' },
  yellow: { name: 'Gelb', h: 64, hTol: 16, sMin: 0.5, vMin: 0.5, css: '#d8ff00' },
  green: { name: 'Grün', h: 115, hTol: 22, sMin: 0.5, vMin: 0.45, css: '#39ff14' },
  pink: { name: 'Pink', h: 325, hTol: 18, sMin: 0.45, vMin: 0.45, css: '#ff2d9b' },
};

/** Liefert [Farbton 0..360, Sättigung 0..1, Helligkeit 0..1]. */
export function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, max ? d / max : 0, max / 255];
}

/** Markiert in mask (Uint8Array) alle Pixel, die zur Ballfarbe passen. */
export function colorMask(rgba, w, h, color, mask) {
  const vMin = color.vMin * 255;
  const n = w * h;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    if (max < vMin) { mask[i] = 0; continue; }
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    const d = max - min;
    if (d < color.sMin * max) { mask[i] = 0; continue; }
    let hue;
    if (max === r) hue = ((g - b) / d + 6) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    let dh = Math.abs(hue - color.h);
    if (dh > 180) dh = 360 - dh;
    mask[i] = dh <= color.hTol ? 1 : 0;
  }
  return mask;
}

let stack = new Int32Array(0);

/**
 * Findet zusammenhängende Flecken in mask (Werte 1). Besuchte Pixel werden auf 2 gesetzt.
 * Liefert [{area, x, y, bw, bh}] mit dem Schwerpunkt in Pixeln und der Größe des umschließenden Rechtecks.
 */
export function findBlobs(mask, w, h, minArea = 1) {
  if (stack.length < w * h) stack = new Int32Array(w * h);
  const blobs = [];
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1) continue;
    let top = 0, area = 0, sx = 0, sy = 0;
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack[top++] = start;
    mask[start] = 2;
    while (top) {
      const i = stack[--top];
      const x = i % w, y = (i - x) / w;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && mask[i - 1] === 1) { mask[i - 1] = 2; stack[top++] = i - 1; }
      if (x < w - 1 && mask[i + 1] === 1) { mask[i + 1] = 2; stack[top++] = i + 1; }
      if (y > 0 && mask[i - w] === 1) { mask[i - w] = 2; stack[top++] = i - w; }
      if (y < h - 1 && mask[i + w] === 1) { mask[i + w] = 2; stack[top++] = i + w; }
    }
    if (area >= minArea) blobs.push({ area, x: sx / area, y: sy / area, bw: x1 - x0 + 1, bh: y1 - y0 + 1 });
  }
  return blobs;
}

/**
 * Sieht der Fleck aus wie ein Ball? Ein Ball (oder Post-it) ist eine gefüllte, kompakte Fläche.
 * Ringe, Linien und Schriftzüge in ähnlicher Farbe füllen ihr umschließendes Rechteck kaum aus.
 * Liefert den Füllgrad (0..1) oder 0, wenn der Fleck kein Ball sein kann.
 */
export function ballLike(b) {
  if (!b.bw || !b.bh) return 1; // ohne Maße keine Aussage
  const fill = b.area / (b.bw * b.bh);
  if (b.area < 16) return Math.max(0.5, fill); // winzige Flecken sind zu grob gerastert für eine Formprüfung
  const aspect = Math.max(b.bw, b.bh) / Math.min(b.bw, b.bh);
  if (fill < 0.42 || aspect > 3.5) return 0;
  return Math.min(1, fill);
}

/**
 * Sucht den Ball in einem RGBA-Bild. last ist die letzte Position (oder null);
 * ein Fleck in ihrer Nähe wird bevorzugt, damit die Erkennung nicht springt.
 */
export function detectBall(rgba, w, h, color, last = null, mask = new Uint8Array(w * h)) {
  colorMask(rgba, w, h, color, mask);
  const minArea = Math.max(6, Math.round(w * h * 0.00004));
  const maxArea = w * h * 0.15; // größere Flächen sind kein Ball (z. B. oranger Boden)
  let best = null, bestScore = 0;
  const seen = [];
  for (const b of findBlobs(mask, w, h, minArea)) {
    if (b.area > maxArea) continue;
    const fill = ballLike(b);
    if (!fill) continue;
    let score = b.area * fill * fill;
    if (last && Math.hypot(b.x - last.x, b.y - last.y) < w * 0.15) score *= 2;
    if (score > bestScore) { bestScore = score; best = b; }
    seen.push(b);
  }
  // Wie viele andere Flecken sind ähnlich groß? (Hinweis auf Störungen in Ballfarbe)
  if (best) best.rivals = seen.filter((b) => b !== best && b.area >= best.area * 0.3).length;
  return best;
}

/**
 * Fasst mehrere gelernte Farben zu einer zusammen, die alle abdeckt (z. B. derselbe Ball an
 * verschiedenen Stellen des Felds). Liefert null, wenn nichts gelernt wurde.
 */
export function mergeColors(list) {
  if (!list.length) return null;
  const rad = Math.PI / 180;
  const mean = Math.atan2(
    list.reduce((a, c) => a + Math.sin(c.h * rad), 0),
    list.reduce((a, c) => a + Math.cos(c.h * rad), 0)) / rad;
  const h = Math.round((mean + 360) % 360);
  const away = (c) => Math.abs(((c.h - h + 540) % 360) - 180);
  return {
    h,
    hTol: Math.min(40, Math.max(...list.map((c) => away(c) + c.hTol))),
    sMin: Math.min(...list.map((c) => c.sMin)),
    vMin: Math.min(...list.map((c) => c.vMin)),
  };
}

/** Holt Bilder aus der Kamera (verkleinert) und sucht darin den Ball. */
export class BallTracker {
  constructor(procWidth = 480) {
    this.procWidth = procWidth;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.frame = null; // letztes Bild (ImageData)
    this.mask = null;  // letzte Maske (0 = kein Treffer, sonst Ballfarbe)
    this.last = null;
  }

  /** Zeichnet die Quelle verkleinert und gibt die Pixel zurück (oder null). */
  grab(source) {
    const sw = source.videoWidth || source.width;
    const sh = source.videoHeight || source.height;
    if (!sw || !sh) return null;
    const w = this.procWidth;
    const h = Math.round((w * sh) / sw);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.mask = new Uint8Array(w * h);
      this.last = null;
    }
    this.ctx.drawImage(source, 0, 0, w, h);
    this.frame = this.ctx.getImageData(0, 0, w, h);
    return this.frame;
  }

  /** Liefert die Ballposition im Kamerabild, normiert auf 0..1, oder null. */
  process(source, color) {
    const img = this.grab(source);
    if (!img) return null;
    const { width: w, height: h } = img;
    const b = detectBall(img.data, w, h, color, this.last, this.mask);
    this.last = b;
    return b ? { x: (b.x + 0.5) / w, y: (b.y + 0.5) / h, area: b.area, rivals: b.rivals } : null;
  }

  /** Lernt die Ballfarbe aus dem letzten Bild an der normierten Stelle (nx, ny). */
  sampleColor(nx, ny, sFloor = 0.3) {
    if (!this.frame) return null;
    const { width: w, height: h, data } = this.frame;
    const cx = Math.round(nx * w), cy = Math.round(ny * h);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = cy - 3; y <= cy + 3; y++) {
      for (let x = cx - 3; x <= cx + 3; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = (y * w + x) * 4;
        r += data[p]; g += data[p + 1]; b += data[p + 2]; n++;
      }
    }
    if (!n) return null;
    const [hue, s, v] = rgbToHsv(r / n, g / n, b / n);
    return {
      h: Math.round(hue),
      hTol: 14,
      sMin: Math.max(sFloor, s * 0.6),
      vMin: Math.max(0.25, v * 0.5),
    };
  }
}
