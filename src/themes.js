// Themenwelten: gemalte Hintergründe, eigene Farben und ein Boden, der auf den Ball reagiert.
//
// Farbregel: Für die Kamera ist nur der Farbbereich um den Ball tabu. Jede Farbe läuft deshalb
// durch safe(): Liegt sie zu nah an der Ballfarbe, wird sie auf den nächsten erlaubten Farbton
// geschoben. Die Hintergründe bleiben dunkel; kräftige Farbe steckt in Figuren, Kanten und Effekten.

const TAU = Math.PI * 2;
let ZONE = 55; // so viele Grad um die Ballfarbe herum bleiben frei

let ballHue = 18;
let version = 0;
/** Ballfarbe (Farbton) und ihre Toleranz in der Erkennung: Je breiter die Toleranz, desto größer die Sperrzone. */
export function setBallHue(h, tol = 20) {
  ballHue = h;
  ZONE = Math.max(55, Math.min(80, tol + 35));
  version++;
}
/** Zählt jede Änderung der Sperrzone mit (für Zwischenspeicher). */
export const ballKey = () => version;

/** Abstand eines Farbtons zur Ballfarbe in Grad (0 bis 180). */
export const hueGap = (h) => Math.abs(((h - ballHue + 540) % 360) - 180);

/** Farbton h, falls nötig aus der Sperrzone um die Ballfarbe herausgeschoben. */
export function safeHue(h) {
  const d = ((h - ballHue + 540) % 360) - 180;
  if (Math.abs(d) >= ZONE) return h;
  return (ballHue + (d >= 0 ? ZONE : -ZONE) + 360) % 360;
}

/** Kräftige Spielfarbe zu einem Farbton (für Figuren und Kanten). */
export const bright = (h) => `hsl(${Math.round(safeHue(h))} 90% 58%)`;

const col = (h, s, l, a = 1) => `hsl(${Math.round(safeHue(h))} ${s}% ${l}% / ${a})`;

/** Weicher Farbfleck. */
function haze(ctx, x, y, r, h, alpha, l = 55) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col(h, 85, l, alpha));
  g.addColorStop(1, col(h, 85, l, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function base(ctx, f, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, f.h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, f.w, f.h);
}

export const THEMES = {
  // ---------------------------------------------------------------- Weltraum
  space: {
    name: 'Weltraum',
    hues: [275, 322, 188, 215], // Violett, Pink, Türkis, Blau
    step: 30,
    paint(ctx, f, t, bloom, dots) {
      base(ctx, f, 'hsl(252 60% 12%)', 'hsl(232 80% 3%)');
      // Farbnebel, treiben langsam
      const a = 0.1 + 0.16 * bloom;
      haze(ctx, f.w * 0.2 + Math.sin(t * 0.1) * 30, 260, 430, 305, a);
      haze(ctx, f.w * 0.85, 720 + Math.cos(t * 0.08) * 30, 480, 265, a);
      haze(ctx, f.w * 0.62, 140, 320, 190, a * 0.8);
      // Ringplanet am rechten Rand, Mond links
      const px = f.w * 0.93, py = 590, pr = 64;
      ctx.globalAlpha = 0.55 + 0.35 * bloom;
      let g = ctx.createRadialGradient(px - 20, py - 24, 4, px, py, pr);
      g.addColorStop(0, col(280, 70, 62));
      g.addColorStop(1, col(262, 70, 22));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
      ctx.strokeStyle = col(320, 80, 70, 0.8);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr * 0.42, -0.35, 0, TAU); ctx.stroke();
      g = ctx.createRadialGradient(f.w * 0.07 - 8, 410, 2, f.w * 0.07, 420, 30);
      g.addColorStop(0, col(190, 50, 78));
      g.addColorStop(1, col(210, 50, 28));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.w * 0.07, 420, 30, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      // Sterne
      ctx.fillStyle = '#fff';
      for (const p of dots) {
        ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * p.tw + p.x * 50)) * (1 + bloom);
        ctx.beginPath();
        ctx.arc(p.x * f.w, (p.y * f.h + t * p.v) % f.h, p.r, 0, TAU);
        ctx.fill();
      }
      // gelegentlich eine Sternschnuppe
      const s = (t % 7) / 0.7;
      if (s < 1) {
        const x = f.w * (0.15 + ((Math.floor(t / 7) * 0.37) % 0.6)) + s * 260, y = 120 + s * 150;
        ctx.globalAlpha = 1 - s;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 90, y - 52); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    // Boden: Waben leuchten auf, wo der Ball entlangrollt.
    mark(ball, n) {
      const size = 44, hgt = size * 0.866;
      const row = Math.round(ball.y / (hgt * 1.5) / 1.155), offset = row % 2 ? size * 0.866 : 0;
      const x = Math.round((ball.x - offset) / (size * 1.732)) * size * 1.732 + offset, y = row * hgt * 1.5 * 1.155;
      return { x, y, life: 1.1, key: `${x}|${y}`, hue: [275, 322, 188][n % 3] };
    },
    drawMark(ctx, m, k) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) ctx.lineTo(m.x + Math.cos((i * TAU) / 6 + TAU / 12) * 44, m.y + Math.sin((i * TAU) / 6 + TAU / 12) * 44);
      ctx.closePath();
      ctx.fillStyle = col(m.hue, 90, 55, 0.14 * (1 - k));
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = col(m.hue, 90, 68, 0.6 * (1 - k));
      ctx.stroke();
    },
  },

  // ---------------------------------------------------------------- Unterwasser
  sea: {
    name: 'Unterwasser',
    hues: [172, 140, 205, 325], // Türkis, Grün, Blau, Korallenpink
    step: 170,
    paint(ctx, f, t, bloom, dots) {
      base(ctx, f, 'hsl(186 80% 15%)', 'hsl(216 85% 4%)');
      // Lichtstrahlen von oben, schwanken leicht
      for (let i = 0; i < 4; i++) {
        const x = f.w * (0.15 + i * 0.24) + Math.sin(t * 0.3 + i) * 40;
        const g = ctx.createLinearGradient(0, 0, 0, 760);
        g.addColorStop(0, col(175, 80, 70, 0.07 + 0.08 * bloom));
        g.addColorStop(1, col(175, 80, 70, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 40, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x + 190, 760); ctx.lineTo(x - 110, 760);
        ctx.fill();
      }
      // Seegras an beiden Rändern
      ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const left = i < 6;
        const x0 = left ? 14 + (i % 6) * 22 : f.w - 14 - (i % 6) * 22;
        const hgt = 190 + ((i * 53) % 190);
        ctx.strokeStyle = col(150, 60, 15 + (i % 3) * 4 + 8 * bloom);
        ctx.lineWidth = 12 - (i % 3) * 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, f.h);
        for (let k = 1; k <= 24; k++) ctx.lineTo(x0 + Math.sin(t * 0.8 + i * 1.7 + k * 0.22) * k * 1.5, f.h - (hgt * k) / 24);
        ctx.stroke();
      }
      // Korallen in den unteren Ecken
      for (let i = 0; i < 14; i++) {
        const left = i % 2 === 0;
        const x = left ? 60 + ((i * 37) % 170) : f.w - 60 - ((i * 41) % 170);
        const r = 16 + ((i * 13) % 22);
        ctx.fillStyle = col(i % 3 ? 325 : 285, 70, 20 + 14 * bloom, 0.85);
        ctx.beginPath(); ctx.arc(x, f.h - r * 0.5 - ((i * 7) % 26), r, 0, TAU); ctx.fill();
      }
      // kleiner Fischschwarm zieht vorbei
      ctx.fillStyle = col(178, 60, 34, 0.45 + 0.3 * bloom);
      for (let i = 0; i < 6; i++) {
        const x = ((t * 26 + i * 46 + (i % 2) * 20) % (f.w + 200)) - 100, y = 235 + (i % 3) * 26 + Math.sin(t + i) * 8;
        ctx.beginPath();
        ctx.ellipse(x, y, 13, 6, 0, 0, TAU);
        ctx.moveTo(x - 11, y); ctx.lineTo(x - 22, y - 7); ctx.lineTo(x - 22, y + 7);
        ctx.fill();
      }
      // Luftblasen
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      for (const p of dots) {
        ctx.globalAlpha = p.a * 1.2;
        ctx.beginPath();
        ctx.arc(p.x * f.w + Math.sin(t * p.tw * 0.5 + p.y * 9) * 14, f.h - ((p.y * f.h + t * p.v * 4) % (f.h + 40)), p.r * 3, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    // Boden: Wellenringe breiten sich vom Ball aus.
    mark: (ball) => ({ x: ball.x, y: ball.y, life: 1.0, always: true }),
    drawMark(ctx, m, k) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, 55 + k * 110, 0, TAU);
      ctx.lineWidth = 2.5 * (1 - k) + 0.5;
      ctx.strokeStyle = col(175, 80, 75, 0.4 * (1 - k));
      ctx.stroke();
    },
  },

  // ---------------------------------------------------------------- Eis
  ice: {
    name: 'Eis',
    hues: [190, 160, 258, 212], // Eisblau, Mint, Violett, Blau
    step: 16,
    paint(ctx, f, t, bloom, dots) {
      base(ctx, f, 'hsl(206 55% 15%)', 'hsl(222 70% 5%)');
      // Polarlicht: drei wehende Bänder
      ctx.lineCap = 'round';
      [[150, 150], [190, 230], [282, 310]].forEach(([h, y0], i) => {
        for (const [wide, alpha] of [[120, 0.025], [78, 0.035], [44, 0.05], [16, 0.06]]) {
          ctx.beginPath();
          for (let x = -40; x <= f.w + 40; x += 40) ctx.lineTo(x, y0 + Math.sin(x * 0.006 + t * 0.4 + i * 2) * 46 + Math.sin(x * 0.015 - t * 0.3) * 14);
          ctx.lineWidth = wide;
          ctx.strokeStyle = col(h, 85, 62, alpha * (1 + 1.3 * bloom));
          ctx.stroke();
        }
      });
      // große, zarte Eiskristalle
      ctx.lineWidth = 2;
      [[0.14, 560, 120], [0.88, 800, 150], [0.8, 330, 80]].forEach(([fx, y, r], i) => {
        ctx.strokeStyle = col(195, 60, 80, 0.1 + 0.12 * bloom);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * TAU) / 6 + t * 0.04 * (i % 2 ? -1 : 1);
          const cx = fx * f.w, ca = Math.cos(a), sa = Math.sin(a);
          ctx.moveTo(cx, y); ctx.lineTo(cx + ca * r, y + sa * r);
          for (const q of [0.45, 0.7]) {
            for (const s of [-1, 1]) {
              ctx.moveTo(cx + ca * r * q, y + sa * r * q);
              ctx.lineTo(cx + ca * r * q + Math.cos(a + s * 1.0) * r * 0.2, y + sa * r * q + Math.sin(a + s * 1.0) * r * 0.2);
            }
          }
        }
        ctx.stroke();
      });
      // Eisschollen in den unteren Ecken
      ctx.fillStyle = col(200, 60, 70, 0.1 + 0.08 * bloom);
      for (const s of [0, 1]) {
        const x = s ? f.w : 0, d = s ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x, f.h); ctx.lineTo(x, f.h - 170); ctx.lineTo(x + d * 80, f.h - 110); ctx.lineTo(x + d * 130, f.h - 150); ctx.lineTo(x + d * 230, f.h);
        ctx.fill();
      }
      // Schnee
      ctx.fillStyle = '#fff';
      for (const p of dots) {
        ctx.globalAlpha = p.a * 1.4;
        ctx.beginPath();
        ctx.arc((p.x * f.w + Math.sin(t * 0.6 + p.y * 12) * 30 + t * 6) % f.w, (p.y * f.h + t * p.v * 3) % f.h, p.r * 1.3, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    // Boden: Der Ball hinterlässt eine Spur im Schnee.
    mark: (ball) => ({ x: ball.x + (Math.random() - 0.5) * 26, y: ball.y + (Math.random() - 0.5) * 26, life: 1.5, always: true }),
    drawMark(ctx, m, k) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3.5 * (1 - k) + 1, 0, TAU);
      ctx.fill();
    },
  },

  // ---------------------------------------------------------------- Nachtwald
  jungle: {
    name: 'Nachtwald',
    hues: [135, 322, 172, 84], // Grün, Blütenpink, Türkis, Limette
    step: 120,
    paint(ctx, f, t, bloom, dots) {
      base(ctx, f, 'hsl(166 60% 10%)', 'hsl(204 80% 3%)');
      haze(ctx, f.w * 0.5, 520, 620, 150, 0.06 + 0.08 * bloom, 40);
      // große Blätter in den vier Ecken, wiegen sich leicht
      const leaf = (x, y, len, ang, shade) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang + Math.sin(t * 0.7 + x) * 0.04);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(len * 0.3, -len * 0.34, len * 0.8, -len * 0.26, len, 0);
        ctx.bezierCurveTo(len * 0.8, len * 0.26, len * 0.3, len * 0.34, 0, 0);
        ctx.fillStyle = col(140, 55, shade + 6 * bloom);
        ctx.fill();
        ctx.strokeStyle = col(135, 50, shade + 10 + 8 * bloom);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(len * 0.95, 0);
        for (let i = 1; i <= 4; i++) {
          ctx.moveTo(len * i * 0.19, 0); ctx.lineTo(len * (i * 0.19 + 0.14), -len * 0.15);
          ctx.moveTo(len * i * 0.19, 0); ctx.lineTo(len * (i * 0.19 + 0.14), len * 0.15);
        }
        ctx.stroke();
        ctx.restore();
      };
      leaf(-20, 150, 300, 0.5, 13); leaf(-30, 60, 250, 0.15, 10);
      leaf(f.w + 20, 170, 300, Math.PI - 0.5, 12); leaf(f.w + 30, 70, 240, Math.PI - 0.1, 9);
      leaf(-20, f.h - 60, 310, -0.45, 12); leaf(f.w + 20, f.h - 70, 320, Math.PI + 0.45, 13);
      // leuchtende Blüten am Rand; je besser es läuft, desto weiter gehen sie auf
      const open = 0.45 + 0.55 * bloom;
      [[0.05, 300, 322], [0.1, 640, 285], [0.94, 420, 322], [0.9, 760, 190], [0.3, 955, 285], [0.68, 960, 322], [0.5, 70, 190]].forEach(([fx, y, h], i) => {
        const x = fx * f.w, r = 22;
        ctx.fillStyle = col(h, 85, 62, 0.5 + 0.4 * bloom);
        for (let k = 0; k < 5; k++) {
          const a = (k * TAU) / 5 + t * 0.2 + i;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * r * 0.62 * open, y + Math.sin(a) * r * 0.62 * open, r * 0.5, r * 0.3, a, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(255,255,255,${0.6 + 0.3 * bloom})`;
        ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, TAU); ctx.fill();
      });
      // Glühwürmchen
      ctx.fillStyle = col(84, 90, 72);
      for (const p of dots) {
        ctx.globalAlpha = p.a * (0.3 + 0.9 * Math.max(0, Math.sin(t * p.tw * 0.6 + p.x * 40))) * (1 + bloom);
        ctx.beginPath();
        ctx.arc(p.x * f.w + Math.cos(t * 0.4 * p.tw + p.y * 20) * 40, p.y * f.h + Math.sin(t * 0.5 * p.tw + p.x * 20) * 30, p.r * 1.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    // Boden: Hinter dem Ball gehen kleine Blüten auf.
    mark: (ball, n) => ({
      x: ball.x + (Math.random() - 0.5) * 90, y: ball.y + (Math.random() - 0.5) * 90,
      life: 1.7, hue: [322, 285, 172, 84][n % 4], rot: Math.random() * TAU,
    }),
    drawMark(ctx, m, k) {
      const open = Math.min(1, k * 7), r = 12;
      ctx.fillStyle = col(m.hue, 85, 64, 0.6 * (1 - k));
      for (let i = 0; i < 5; i++) {
        const a = m.rot + (i * TAU) / 5;
        ctx.beginPath();
        ctx.ellipse(m.x + Math.cos(a) * r * 0.6 * open, m.y + Math.sin(a) * r * 0.6 * open, r * 0.5 * open, r * 0.3 * open, a, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, 3, 0, TAU); ctx.fill();
    },
  },
  // ---------------------------------------------------------------- Blau-Weiss (Vereinsdesign)
  // Eigener Skin für den Verein: dunkles Vereinsblau, weiße Diagonale wie im Logo, großes Logo als
  // Wasserzeichen, Nadelstreifen am Rand. Alle Spielfarben in Blau und Weiß.
  club: {
    name: 'Blau-Weiss',
    brand: true,
    hues: [214, 200, 228, 190],
    palette: () => ['hsl(214 100% 62%)', '#ffffff', 'hsl(198 95% 68%)', 'hsl(228 85% 76%)'],
    step: 90,
    paint(ctx, f, t, bloom, dots) {
      base(ctx, f, 'hsl(220 72% 17%)', 'hsl(226 85% 6%)');
      // weiße Diagonale wie im Vereinslogo, mit langsamem Glanz
      ctx.save();
      ctx.translate(f.w / 2, f.h / 2);
      ctx.rotate(-0.55);
      const band = ctx.createLinearGradient(0, -170, 0, 170);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, `rgba(255,255,255,${0.05 + 0.04 * bloom})`);
      band.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = band;
      ctx.fillRect(-f.w, -170, f.w * 2, 340);
      const shine = ((t * 160) % (f.w * 2.4)) - f.w * 1.2;
      const g = ctx.createLinearGradient(shine - 160, 0, shine + 160, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(shine - 160, -170, 320, 340);
      ctx.restore();
      // Vereinslogo groß als Wasserzeichen in der Mitte
      if (clubLogo?.complete && clubLogo.naturalWidth) {
        const size = f.h * 0.62, k = size / Math.max(clubLogo.naturalWidth, clubLogo.naturalHeight);
        ctx.globalAlpha = 0.05 + 0.04 * bloom;
        ctx.drawImage(clubLogo, f.w / 2 - (clubLogo.naturalWidth * k) / 2, f.h * 0.56 - (clubLogo.naturalHeight * k) / 2, clubLogo.naturalWidth * k, clubLogo.naturalHeight * k);
        ctx.globalAlpha = 1;
      }
      // Nadelstreifen in Blau und Weiß an linkem und rechtem Rand (wie ein Vereinsschal)
      for (const side of [0, 1]) {
        for (let i = 0; i < 5; i++) {
          const x = side ? f.w - 18 - i * 14 : 18 + i * 14;
          ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.10)' : 'hsl(214 90% 50% / 0.16)';
          ctx.fillRect(x - 4, 0, 8, f.h);
        }
      }
      // Vereinsname senkrecht neben den Streifen am rechten Rand (wie auf einem Schal)
      ctx.save();
      ctx.translate(f.w - 100, f.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.font = '600 22px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillText('TC BLAU-WEISS 1899', 0, 0);
      ctx.restore();
      // funkelnde weiße Punkte
      ctx.fillStyle = '#ffffff';
      for (const p of dots) {
        ctx.globalAlpha = p.a * 0.6 * (0.4 + 0.6 * Math.max(0, Math.sin(t * p.tw + p.x * 30))) * (1 + bloom);
        ctx.beginPath();
        ctx.arc(p.x * f.w, p.y * f.h, p.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    // Boden: Hinter dem Ball bleiben weiße und blaue Ringe wie Abdrücke auf dem Platz.
    mark: (ball, n) => ({ x: ball.x, y: ball.y, life: 1.2, white: n % 2 === 0 }),
    drawMark(ctx, m, k) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, 14 + 34 * k, 0, TAU);
      ctx.lineWidth = 3;
      ctx.strokeStyle = m.white ? `rgba(255,255,255,${0.5 * (1 - k)})` : `hsl(210 100% 65% / ${0.55 * (1 - k)})`;
      ctx.stroke();
    },
  },
};

/** Bunte Themenwelten (Skin „Bunt“); die Vereinswelt gehört zum Skin „Blau-Weiss“. */
export const THEME_IDS = Object.keys(THEMES).filter((id) => !THEMES[id].brand);

// Vereinslogo für das Wasserzeichen der Vereinswelt (main.js setzt es, sobald es geladen ist)
let clubLogo = null;
export function setClubLogo(img) {
  clubLogo = img;
}

export function randomTheme() {
  return THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)];
}

/** Die vier Spielfarben einer Welt, an die Ballfarbe angepasst. */
export function worldPalette(id) {
  const world = THEMES[id] ?? THEMES.space;
  return world.palette ? world.palette() : world.hues.map(bright);
}

/** Der Boden reagiert auf den Ball: Jede Welt hinterlässt ihre eigenen Spuren. */
export class Floor {
  constructor() {
    this.marks = [];
    this.travel = 0;
    this.last = null;
    this.count = 0;
  }

  update(dt, ball, id) {
    const world = THEMES[id] ?? THEMES.space;
    for (const m of this.marks) m.age += dt;
    this.marks = this.marks.filter((m) => m.age < m.life);
    if (!ball.visible) { this.last = null; return; }
    const from = this.last ?? ball;
    const moved = Math.hypot(ball.x - from.x, ball.y - from.y);
    this.travel += moved;
    this.last = { x: ball.x, y: ball.y };
    while (this.travel >= world.step) {
      this.travel -= world.step;
      // Spur gleichmäßig entlang des Wegs setzen, auch wenn der Ball zwischen zwei Bildern weit rollt
      const k = moved ? 1 - Math.min(1, this.travel / moved) : 1;
      const at = { x: from.x + (ball.x - from.x) * k, y: from.y + (ball.y - from.y) * k };
      const m = world.mark(at, this.count++);
      // dieselbe Wabe nicht mehrfach gleichzeitig beleuchten
      if (m.key && this.marks.some((o) => o.key === m.key && o.age < 0.8)) continue;
      this.marks.push({ ...m, age: 0, world });
    }
    if (this.marks.length > 260) this.marks.splice(0, this.marks.length - 260);
  }

  /** near = Abstand um den Ball, der frei bleibt, damit kein farbiges Licht auf ihn fällt. */
  draw(ctx, ball, near) {
    for (const m of this.marks) {
      if (!m.always && ball.visible && Math.hypot(m.x - ball.x, m.y - ball.y) < near) continue;
      m.world.drawMark(ctx, m, m.age / m.life);
    }
  }
}
