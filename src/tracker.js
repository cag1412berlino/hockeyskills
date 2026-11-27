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
  // winzige Flecken sind zu grob gerastert für eine genaue Formprüfung – nur ganz schmale (ein Schlägerstück) fallen raus
  if (b.area < 16) return Math.max(b.bw, b.bh) / Math.min(b.bw, b.bh) > 3 ? 0 : Math.max(0.5, fill);
  const aspect = Math.max(b.bw, b.bh) / Math.min(b.bw, b.bh);
  if (fill < 0.45 || aspect > 2.6) return 0;
  return Math.min(1, fill);
}

/**
 * Sucht den Ball in einem RGBA-Bild. last ist die letzte Position (oder null);
 * ein Fleck in ihrer Nähe wird bevorzugt, damit die Erkennung nicht springt.
 * region (optional) ist eine Maske wie mask: 1 = hier darf gesucht werden.
 */
export function detectBall(rgba, w, h, color, last = null, mask = new Uint8Array(w * h), region = null) {
  const list = candidates(rgba, w, h, color, mask, region);
  let best = null, bestScore = 0;
  for (const b of list) {
    let score = b.area * b.fill * b.fill;
    if (last && Math.hypot(b.x - last.x, b.y - last.y) < w * 0.15) score *= 2;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  // Wie viele andere Flecken sind ähnlich groß? (Hinweis auf Störungen in Ballfarbe)
  if (best) best.rivals = list.filter((b) => b !== best && b.area >= best.area * 0.3).length;
  return best;
}

/** Alle Flecken in Ballfarbe, die wie ein Ball aussehen (kompakt, nicht zu groß), mit Füllgrad. */
export function candidates(rgba, w, h, color, mask = new Uint8Array(w * h), region = null) {
  colorMask(rgba, w, h, color, mask);
  // Nur im Spielfeld suchen: alles außerhalb (Möbel, Wände, Kleidung am Rand) zählt nicht.
  if (region) for (let i = 0; i < mask.length; i++) if (!region[i]) mask[i] = 0;
  const minArea = Math.max(6, Math.round(w * h * 0.00004));
  const maxArea = w * h * 0.15; // größere Flächen sind kein Ball (z. B. oranger Boden)
  const out = [];
  for (const b of findBlobs(mask, w, h, minArea)) {
    if (b.area > maxArea) continue;
    const fill = ballLike(b);
    if (fill) out.push({ ...b, fill });
  }
  return out;
}

/**
 * Bleibt am Ball: Von Bild zu Bild wird der Fleck genommen, der dort liegt, wo der Ball nach seiner
 * bisherigen Bewegung sein müsste, und ungefähr so groß ist wie bisher. Ein anderer Fleck in
 * Ballfarbe (Schlägerblatt, Kleidung) wird erst übernommen, wenn der Ball länger verschwunden ist
 * oder der andere Fleck mehrere Bilder hintereinander an derselben Stelle auftaucht.
 * So springt die Erkennung nicht zwischen Ball und Schläger hin und her.
 */
export class BallFollower {
  constructor(width) {
    this.w = width;
    this.reset();
  }

  reset() {
    this.last = null;     // { x, y, area }
    this.vx = 0;
    this.vy = 0;
    this.missed = 0;      // Bilder ohne passenden Fleck
    this.pending = null;  // anderer Fleck, der vielleicht der Ball ist { x, y, area, count }
  }

  /** Nächstes Kamerabild: list = Kandidaten. Liefert den Ball oder null. */
  step(list) {
    const { w } = this;
    const best = (arr) => arr.reduce((a, b) => (!a || b.area * b.fill * b.fill > a.area * a.fill * a.fill ? b : a), null);
    if (!this.last) {
      const b = best(list);
      if (b) this.take(b, false);
      return b;
    }
    const px = this.last.x + this.vx, py = this.last.y + this.vy;
    const gate = Math.max(w * 0.07, Math.hypot(this.vx, this.vy) * 1.6 + w * 0.04);
    let pick = null, pickScore = -Infinity;
    for (const b of list) {
      const d = Math.hypot(b.x - px, b.y - py);
      if (d > gate) continue;
      // viel größer oder kleiner als der Ball bisher: eher Ball und Schläger/Fuß verschmolzen oder ein Stück davon
      const ratio = b.area / this.last.area;
      if (this.last.area > 30 && (ratio > 2.5 || ratio < 0.3)) continue;
      // nah an der Vorhersage und ähnlich groß wie bisher
      const size = Math.abs(Math.log(b.area / this.last.area));
      const score = -d / gate - size * 0.5 + b.fill * 0.3;
      if (score > pickScore) { pickScore = score; pick = b; }
    }
    if (pick) {
      this.take(pick, true);
      return pick;
    }
    // Kein Fleck, wo der Ball sein müsste
    this.missed++;
    const far = best(list);
    if (far) {
      const p = this.pending;
      this.pending = p && Math.hypot(far.x - p.x, far.y - p.y) < w * 0.06 ? { ...far, count: p.count + 1 } : { ...far, count: 1 };
      // umschwenken, wenn der andere Fleck stabil da ist oder der Ball schon länger fehlt
      if (this.pending.count >= 4 || this.missed > 9) {
        this.take(far, false);
        return far;
      }
    }
    if (this.missed > 15) this.reset();
    // die Bewegung läuft gedämpft weiter, damit die Vorhersage stimmt, wenn er wieder auftaucht
    this.vx *= 0.8;
    this.vy *= 0.8;
    return null;
  }

  take(b, follow) {
    if (follow && this.last) {
      this.vx = this.vx * 0.4 + (b.x - this.last.x) * 0.6;
      this.vy = this.vy * 0.4 + (b.y - this.last.y) * 0.6;
      this.last = { x: b.x, y: b.y, area: this.last.area * 0.7 + b.area * 0.3 };
    } else {
      this.vx = 0;
      this.vy = 0;
      this.last = { x: b.x, y: b.y, area: b.area };
    }
    this.missed = 0;
    this.pending = null;
  }
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

/**
 * Baut eine Suchmaske (1 = innen) aus einem Vieleck. points sind Ecken im Kamerabild, 0..1.
 */
export function regionMask(points, w, h) {
  const out = new Uint8Array(w * h);
  const p = points.map((q) => ({ x: q.x * w, y: q.y * h }));
  for (let y = 0; y < h; y++) {
    // Schnittpunkte der Zeile mit den Kanten, dazwischen füllen
    const xs = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if ((a.y <= y + 0.5) !== (b.y <= y + 0.5)) xs.push(a.x + ((y + 0.5 - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x++) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Holt Bilder aus der Kamera (verkleinert) und sucht darin den Ball. */
export class BallTracker {
  /**
   * fullWidth: so breit wird das ganze Kamerabild ausgewertet (Einrichtung, Kalibrierung).
   * cropWidth: so breit höchstens der Ausschnitt um das Spielfeld im Spiel – dort wird in voller
   * Kameraauflösung gesucht (nie hochgerechnet), damit auch ein kleiner Ball genug Bildpunkte hat.
   */
  constructor(fullWidth = 960, cropWidth = 1280) {
    this.procWidth = fullWidth;
    this.cropWidth = cropWidth;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.frame = null; // letztes Bild (ImageData)
    this.mask = null;  // letzte Maske (0 = kein Treffer, sonst Ballfarbe)
    this.last = null;
    this.regionPoints = null; // Spielfeld im Kamerabild (Vieleck, 0..1) oder null
    this.region = null;       // daraus gebaute Suchmaske in der Größe des Auswertebilds
    this.regionKey = '';
    this.useRegion = false;
    this.view = { x: 0, y: 0, w: 1, h: 1 }; // welcher Teil des Kamerabilds im Auswertebild liegt (0..1)
  }

  /** Legt fest, wo das Spielfeld im Kamerabild liegt (Ecken 0..1) – oder null für das ganze Bild. */
  setRegion(points) {
    this.regionPoints = points;
    this.region = null;
    this.regionKey = '';
  }

  /** Punkt im ganzen Kamerabild (0..1) -> Punkt im Auswertebild (0..1). */
  toFrame(p) {
    const v = this.view;
    return { x: (p.x - v.x) / v.w, y: (p.y - v.y) / v.h };
  }

  /** Punkt im Auswertebild (0..1) -> Punkt im ganzen Kamerabild (0..1). */
  fromFrame(p) {
    const v = this.view;
    return { x: v.x + p.x * v.w, y: v.y + p.y * v.h };
  }

  /**
   * Zeichnet die Quelle ins Auswertebild und gibt die Pixel zurück (oder null).
   * crop (optional, 0..1): nur dieser Ausschnitt, in voller Auflösung (höchstens cropWidth breit).
   */
  grab(source, crop = null) {
    const W = source.videoWidth || source.width;
    const H = source.videoHeight || source.height;
    if (!W || !H) return null;
    const v = crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const sw = v.w * W, sh = v.h * H;
    const scale = Math.min(1, (crop ? this.cropWidth : this.procWidth) / sw);
    const w = Math.max(16, Math.round(sw * scale));
    const h = Math.max(16, Math.round(sh * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.mask = new Uint8Array(w * h);
      this.last = null;
      this.follow = new BallFollower(w);
      this.region = null;
    }
    this.view = v;
    this.ctx.drawImage(source, v.x * W, v.y * H, sw, sh, 0, 0, w, h);
    this.frame = this.ctx.getImageData(0, 0, w, h);
    return this.frame;
  }

  /** Ausschnitt um das Spielfeld (mit Rand), auf ganze Kamerabild-Grenzen beschnitten. */
  fieldCrop() {
    const xs = this.regionPoints.map((p) => p.x), ys = this.regionPoints.map((p) => p.y);
    const m = 0.05;
    const x0 = Math.max(0, Math.min(...xs) - m), y0 = Math.max(0, Math.min(...ys) - m);
    const x1 = Math.min(1, Math.max(...xs) + m), y1 = Math.min(1, Math.max(...ys) + m);
    // auf feste Schritte runden, damit der Ausschnitt nicht bei jedem Bild minimal anders ist
    const q = (n) => Math.round(n * 200) / 200;
    return x1 - x0 > 0.05 && y1 - y0 > 0.05 ? { x: q(x0), y: q(y0), w: q(x1 - x0), h: q(y1 - y0) } : null;
  }

  /** Liefert die Ballposition im Kamerabild, normiert auf 0..1, oder null. */
  process(source, color) {
    // Im Spiel: nur das Spielfeld, dafür in voller Kameraauflösung. In der Einrichtung: das ganze Bild.
    const crop = this.useRegion && this.regionPoints ? this.fieldCrop() : null;
    const img = this.grab(source, crop);
    if (!img) return null;
    const { width: w, height: h } = img;
    let region = null;
    if (this.useRegion && this.regionPoints) {
      const key = `${w}x${h}:${this.view.x},${this.view.y},${this.view.w},${this.view.h}`;
      if (!this.region || this.regionKey !== key) {
        this.region = regionMask(this.regionPoints.map((p) => this.toFrame(p)), w, h);
        this.regionKey = key;
      }
      region = this.region;
    }
    const list = candidates(img.data, w, h, color, this.mask, region);
    this.follow ??= new BallFollower(w);
    const b = this.follow.step(list);
    this.last = b;
    const rivals = b ? list.filter((c) => c !== b && c.area >= b.area * 0.3).length : 0;
    if (!b) return null;
    const p = this.fromFrame({ x: (b.x + 0.5) / w, y: (b.y + 0.5) / h });
    return { x: p.x, y: p.y, area: b.area, rivals };
  }


  /**
   * Lernt die Ballfarbe aus einem Klick ins Kamerabild (nx, ny von 0 bis 1).
   * Genommen wird die helle, beleuchtete Seite des Balls um den Klickpunkt. Wirkt der Ball im
   * Kamerabild blass (überbelichtet, Filzball), sucht die App nach „heller als die Umgebung und
   * leicht in Ballfarbe“ statt nach kräftiger Farbe – sonst würde ein blasser Ball nie gefunden.
   */
  learnBall(nx, ny, radius = 5) {
    if (!this.frame) return null;
    const { width: w, height: h, data } = this.frame;
    const cx = Math.round(nx * w), cy = Math.round(ny * h);
    const px = [];
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h || Math.hypot(x - cx, y - cy) > radius) continue;
        const p = (y * w + x) * 4;
        px.push(rgbToHsv(data[p], data[p + 1], data[p + 2]));
      }
    }
    if (!px.length) return null;
    // die hellsten 40 % mit etwas Farbe: die beleuchtete Seite des Balls
    const lit = px.filter(([, sat]) => sat > 0.05).sort((a, b) => b[2] - a[2]).slice(0, Math.max(3, Math.round(px.length * 0.4)));
    if (!lit.length) return null;
    const rad = Math.PI / 180;
    const hue = (Math.atan2(lit.reduce((a, q) => a + Math.sin(q[0] * rad) * q[1], 0), lit.reduce((a, q) => a + Math.cos(q[0] * rad) * q[1], 0)) / rad + 360) % 360;
    const sat = lit.reduce((a, q) => a + q[1], 0) / lit.length;
    const val = lit.reduce((a, q) => a + q[2], 0) / lit.length;
    const pale = sat < 0.35;
    return {
      h: Math.round(hue),
      hTol: pale ? 20 : 14,
      sMin: Math.max(pale ? 0.07 : 0.3, sat * (pale ? 0.5 : 0.6)),
      vMin: pale ? Math.max(0.3, val * 0.84) : Math.max(0.25, val * 0.5),
      pale,
    };
  }

  /** Der Fleck in dieser Farbe, der am Klickpunkt liegt (oder null) – um zu prüfen, ob er wie ein Ball aussieht. */
  blobAt(nx, ny, color) {
    if (!this.frame) return null;
    const { width: w, height: h, data } = this.frame;
    const m = colorMask(data, w, h, color, new Uint8Array(w * h));
    const cx = nx * w, cy = ny * h;
    let best = null;
    for (const b of findBlobs(m, w, h, 3)) {
      const d = Math.hypot(b.x - cx, b.y - cy);
      if (d < Math.max(b.bw, b.bh) + 4 && (!best || d < best.d)) best = { ...b, d };
    }
    return best && { ...best, round: ballLike(best) > 0 };
  }

  /** Anteil des Bildes (0..1), der zu einer Farbe passt – viel mehr als ein Ball heißt: Farbe nicht eindeutig. */
  share(color) {
    if (!this.frame) return 0;
    const { width: w, height: h, data } = this.frame;
    const m = colorMask(data, w, h, color, new Uint8Array(w * h));
    if (this.useRegion && this.region?.length === m.length) for (let i = 0; i < m.length; i++) if (!this.region[i]) m[i] = 0;
    return m.reduce((a, b) => a + b, 0) / (w * h);
  }

  /** Lernt die Ballfarbe aus dem letzten Bild an der normierten Stelle (nx, ny). */
  sampleColor(nx, ny, sFloor = 0.3, radius = 3) {
    if (!this.frame) return null;
    const { width: w, height: h, data } = this.frame;
    const cx = Math.round(nx * w), cy = Math.round(ny * h);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
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
