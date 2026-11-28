// Farbschutz für das Spielfeld: Jede Farbe, die auf das Spielfeld gemalt wird, läuft hier durch.
// Liegt sie zu nah an der Ballfarbe (z. B. pinke Figuren bei einem pinken Ball), wird ihr Farbton
// aus der Sperrzone geschoben. So verwechselt die Kamera nichts auf dem Feld mit dem Ball, und der
// Ball hebt sich immer deutlich ab – ganz gleich, welche Ballfarbe eingestellt oder gelernt ist.
// Graue, weiße und schwarze Farben bleiben, wie sie sind: Sie haben keinen Farbton.
import { safeHue, ballKey } from './themes.js';

const cache = new Map();
let key = -1; // Ballfarbe, für die der Zwischenspeicher gilt

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

const num = (t) => {
  const v = parseFloat(t);
  return t.trim().endsWith('%') ? v / 100 : v;
};

/** Liest eine CSS-Farbe (#hex, rgb(), rgba(), hsl(), hsla()). Liefert { h, s, l, a } oder null. */
export function parseColor(str) {
  if (typeof str !== 'string') return null;
  const c = str.trim().toLowerCase();
  if (c[0] === '#') {
    let hex = c.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((x) => x + x).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    const a = hex.length === 8 ? n(6) / 255 : 1;
    return { ...rgbToHsl(n(0), n(2), n(4)), a };
  }
  const m = c.match(/^(rgba?|hsla?)\((.*)\)$/);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const a = parts.length > 3 ? clamp01(num(parts[3])) : 1;
  if (m[1].startsWith('rgb')) {
    const ch = (t) => (t.endsWith('%') ? parseFloat(t) * 2.55 : parseFloat(t));
    return { ...rgbToHsl(ch(parts[0]), ch(parts[1]), ch(parts[2])), a };
  }
  return { h: ((parseFloat(parts[0]) % 360) + 360) % 360, s: clamp01(num(parts[1])), l: clamp01(num(parts[2])), a };
}

/**
 * Die sichere Fassung einer Farbe: Farbton aus der Sperrzone um den Ball geschoben.
 * Farben ohne nennenswerte Sättigung (Grau, Weiß, Schwarz) kommen unverändert zurück.
 */
export function guardColor(str) {
  if (typeof str !== 'string') return str;
  if (key !== ballKey()) { cache.clear(); key = ballKey(); }
  const hit = cache.get(str);
  if (hit !== undefined) return hit;
  let out = str;
  const c = parseColor(str);
  // nur kräftige, sichtbare Farben im Farbbereich des Balls werden verschoben
  const safe = c && safeHue(c.h);
  if (c && c.a > 0.04 && c.s > 0.18 && c.l > 0.08 && c.l < 0.95 && safe !== c.h) {
    out = `hsl(${Math.round(safe)} ${Math.round(c.s * 100)}% ${Math.round(c.l * 100)}% / ${+c.a.toFixed(3)})`;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(str, out);
  return out;
}

/**
 * Schaltet den Farbschutz für einen Zeichen-Kontext ein. Alle Füll-, Linien- und Schattenfarben
 * sowie Verläufe laufen dann durch guardColor. Über das zurückgegebene Objekt lässt er sich
 * kurz ausschalten (für den Test-Ball und die Kalibrierbilder, die genau so aussehen müssen).
 */
export function guardContext(ctx) {
  const control = { on: true };
  const proto = Object.getPrototypeOf(ctx);
  for (const prop of ['fillStyle', 'strokeStyle', 'shadowColor']) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop) ?? Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, prop);
    if (!desc?.set) continue;
    Object.defineProperty(ctx, prop, {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, control.on && typeof v === 'string' ? guardColor(v) : v); },
    });
  }
  for (const make of ['createLinearGradient', 'createRadialGradient', 'createConicGradient']) {
    const orig = ctx[make];
    if (typeof orig !== 'function') continue;
    ctx[make] = function (...args) {
      const g = orig.apply(this, args);
      if (control.on) {
        const add = g.addColorStop;
        g.addColorStop = (offset, color) => add.call(g, offset, guardColor(color));
      }
      return g;
    };
  }
  return control;
}
