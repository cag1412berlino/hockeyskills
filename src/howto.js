/**
 * Erklär-Animation für die Einrichtung: zeigt von selbst, wie Beamer, Kamera, Laptop und Ball
 * zusammenspielen. Läuft in einer Schleife durch sechs Schritte; ein Klick springt zum nächsten.
 * Unabhängig vom Spiel, zeichnet nur auf die eigene Zeichenfläche.
 */

const W = 880, H = 500;
const FONT = 'Fredoka, system-ui, sans-serif';
const BALL = '#ffe500';

// Feld auf dem Boden (perspektivisch): hinten links, hinten rechts, vorn rechts, vorn links
const Q = [[330, 235], [690, 235], [790, 392], [230, 392]];
const MOUNT = { x: 510, y: 46 };   // Halterung an der Decke
const BEAMER = { x: 492, y: 62 };
const CAM = { x: 566, y: 66 };
const LAPTOP = { x: 96, y: 318 };

const STEPS = [
  { t: 5.5, title: 'Der Beamer wirft das Spielfeld auf den Boden', sub: 'Er hängt oben oder steht seitlich erhöht. Das Feld ist 2 bis 3 Meter groß.' },
  { t: 5.5, title: 'Die Kamera schaut auf dasselbe Feld', sub: 'Sie muss das ganze Feld sehen. Am besten sitzt sie direkt neben dem Beamer.' },
  { t: 7, title: 'Einmal kalibrieren', sub: 'Der Beamer zeigt fünf weiße Punkte, die Kamera findet sie. Jetzt weiß die App, wo das Feld liegt.' },
  { t: 6.5, title: 'Die Kamera erkennt den neonfarbenen Ball', sub: 'Sie sucht nur nach seiner Farbe, etwa 30 Mal in der Sekunde.' },
  { t: 8, title: 'Der Laptop rechnet, der Beamer zeichnet', sub: 'Kamera → Laptop → Beamer: Das Spiel reagiert sofort auf den Ball.' },
  { t: 6.5, title: 'Gesteuert wird mit dem Ball', sub: 'Ball eine Sekunde auf einen Knopf legen, fertig. Keine Maus, keine Tastatur.' },
];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;

/** Punkt im Feld (u, v von 0 bis 1) auf den Bildschirm umrechnen. */
function P(u, v) {
  const tx = lerp(Q[0][0], Q[1][0], u), ty = lerp(Q[0][1], Q[1][1], u);
  const bx = lerp(Q[3][0], Q[2][0], u), by = lerp(Q[3][1], Q[2][1], u);
  return { x: lerp(tx, bx, v), y: lerp(ty, by, v), s: lerp(0.72, 1, v) };
}

function quad(ctx) {
  ctx.beginPath();
  Q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Flache Ellipse auf dem Boden. */
function disc(ctx, u, v, r, fill, stroke, width = 3) {
  const p = P(u, v);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * p.s, r * p.s * 0.42, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function room(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#081226'); g.addColorStop(0.42, '#0b1a3a'); g.addColorStop(0.43, '#101f3f'); g.addColorStop(1, '#0a1530');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(140,175,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 200); ctx.lineTo(W, 200); ctx.stroke(); // Kante Wand/Boden
  ctx.fillStyle = 'rgba(140,175,255,0.14)';
  ctx.fillRect(0, 0, W, 10); // Decke
}

function devices(ctx, glow) {
  // Halterung
  ctx.strokeStyle = '#5b6b8c'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(MOUNT.x, 10); ctx.lineTo(MOUNT.x, MOUNT.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(458, MOUNT.y); ctx.lineTo(590, MOUNT.y); ctx.stroke();
  // Beamer
  ctx.fillStyle = '#e8eefc';
  ctx.beginPath(); ctx.roundRect(BEAMER.x - 38, BEAMER.y - 14, 76, 30, 7); ctx.fill();
  ctx.fillStyle = glow.beamer > 0 ? `rgba(255,255,255,${0.5 + glow.beamer * 0.5})` : '#33415f';
  ctx.beginPath(); ctx.arc(BEAMER.x, BEAMER.y + 15, 9, 0, Math.PI * 2); ctx.fill();
  // Kamera
  ctx.fillStyle = '#e8eefc';
  ctx.beginPath(); ctx.roundRect(CAM.x - 13, CAM.y - 12, 26, 20, 5); ctx.fill();
  ctx.fillStyle = glow.cam > 0 ? '#46e0ff' : '#33415f';
  ctx.beginPath(); ctx.arc(CAM.x, CAM.y + 8, 6, 0, Math.PI * 2); ctx.fill();
  // Tisch und Laptop
  const { x, y } = LAPTOP;
  ctx.strokeStyle = '#5b6b8c'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x - 62, y + 22); ctx.lineTo(x + 62, y + 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 50, y + 22); ctx.lineTo(x - 50, y + 84); ctx.moveTo(x + 50, y + 22); ctx.lineTo(x + 50, y + 84); ctx.stroke();
  ctx.fillStyle = '#c9d4ee';
  ctx.beginPath(); ctx.roundRect(x - 46, y + 12, 92, 8, 3); ctx.fill();
  ctx.fillStyle = '#e8eefc';
  ctx.beginPath(); ctx.roundRect(x - 38, y - 42, 76, 54, 5); ctx.fill();
  ctx.fillStyle = glow.laptop > 0.5 ? '#1a4fd0' : '#16264c';
  ctx.beginPath(); ctx.roundRect(x - 33, y - 37, 66, 44, 3); ctx.fill();
  if (glow.ball) {
    ctx.fillStyle = BALL;
    ctx.beginPath(); ctx.arc(x - 33 + 66 * glow.lu, y - 37 + 44 * glow.lv, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Kabel
  ctx.strokeStyle = 'rgba(140,165,215,0.45)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x + 40, y - 20); ctx.bezierCurveTo(260, 300, 250, 30, 458, MOUNT.y - 4); ctx.stroke();
  // Beschriftung
  ctx.font = `500 17px ${FONT}`; ctx.fillStyle = '#b9c9ec'; ctx.textAlign = 'center';
  ctx.fillText('Beamer', BEAMER.x - 78, BEAMER.y + 8);
  ctx.fillText('Kamera', CAM.x + 54, CAM.y + 6);
  ctx.fillText('Laptop', x, y + 108);
}

/** Lichtkegel von einem Gerät auf das ganze Feld. */
function cone(ctx, from, color, alpha, dashed) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y + 14); ctx.lineTo(Q[3][0], Q[3][1]); ctx.lineTo(Q[2][0], Q[2][1]); ctx.closePath();
  const g = ctx.createLinearGradient(0, from.y, 0, Q[2][1]);
  g.addColorStop(0, color.replace('A', '0.34')); g.addColorStop(1, color.replace('A', '0.05'));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = color.replace('A', '0.75'); ctx.lineWidth = 2;
  if (dashed) ctx.setLineDash([9, 8]);
  ctx.beginPath();
  for (const [x, y] of Q) { ctx.moveTo(from.x, from.y + 14); ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.restore();
}

function fieldFloor(ctx, alpha) {
  ctx.save();
  quad(ctx);
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
  ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(160,190,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.setLineDash([]);
  if (alpha > 0) {
    ctx.globalAlpha = alpha;
    quad(ctx);
    const g = ctx.createLinearGradient(0, Q[0][1], 0, Q[2][1]);
    g.addColorStop(0, '#12338f'); g.addColorStop(1, '#1d54d8');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5; ctx.stroke();
  }
  ctx.restore();
}

function ball(ctx, u, v, ring) {
  const p = P(u, v), r = 11 * p.s;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 3, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  if (ring > 0) {
    ctx.save(); ctx.globalAlpha = ring;
    disc(ctx, u, v, 30, null, '#46e0ff', 3.5);
    ctx.restore();
  }
  const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 1.2, 1, p.x, p.y - r * 0.8, r);
  g.addColorStop(0, '#ffffc0'); g.addColorStop(1, BALL);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.8, r, 0, Math.PI * 2); ctx.fill();
  // Schläger
  ctx.strokeStyle = '#f2f5ff'; ctx.lineWidth = 6 * p.s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x + 74 * p.s, p.y - 118 * p.s); ctx.lineTo(p.x + 22 * p.s, p.y - 6 * p.s);
  ctx.quadraticCurveTo(p.x + 17 * p.s, p.y + 5 * p.s, p.x + 7 * p.s, p.y + 1 * p.s);
  ctx.stroke();
  return p;
}

/** Punkt, der an einer Linie entlangläuft (Datenfluss). */
function pulse(ctx, a, b, k, color) {
  if (k < 0 || k > 1) return;
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(lerp(a.x, b.x, k), lerp(a.y, b.y, k), 6, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
}

function star(ctx, x, y, r, color) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.fill();
}

/** Weg des Balls in Schritt 5: drei Ziele nacheinander. */
const TARGETS = [[0.72, 0.3], [0.3, 0.62], [0.68, 0.78]];

function drawStep(ctx, i, t, time) {
  const glow = { beamer: 0, cam: 0, laptop: 0, lu: 0.5, lv: 0.5 };
  const beamOn = i > 0 ? 1 : ease(t / 1.6);
  const camOn = i > 1 ? 1 : i === 1 ? ease(t / 1.6) : 0;
  glow.beamer = beamOn; glow.cam = camOn; glow.laptop = beamOn;
  glow.ball = false;

  // Wo liegt der Ball?
  let bu = null, bv = null, ring = 0;
  if (i === 3) {
    const k = ease(t / 3);
    bu = lerp(1.15, 0.5, k) + Math.sin(time * 1.3) * 0.1 * k; bv = lerp(0.9, 0.55, k) + Math.cos(time * 1.7) * 0.08 * k;
    ring = clamp((t - 1.6) / 0.6);
  } else if (i === 4) {
    const seg = Math.min(TARGETS.length - 1, Math.floor(t / 2.3)), k = ease((t - seg * 2.3) / 1.7);
    const from = seg ? TARGETS[seg - 1] : [0.5, 0.55];
    bu = lerp(from[0], TARGETS[seg][0], k); bv = lerp(from[1], TARGETS[seg][1], k); ring = 1;
  } else if (i === 5) {
    const k = ease(t / 2);
    bu = lerp(TARGETS[2][0], 0.3, k); bv = lerp(TARGETS[2][1], 0.5, k); ring = 1;
  }
  if (bu !== null) { glow.lu = clamp(bu); glow.lv = clamp(bv); glow.ball = true; }

  room(ctx);
  fieldFloor(ctx, beamOn);
  cone(ctx, BEAMER, 'rgba(150,190,255,A)', beamOn * (i === 0 ? 1 : 0.45), false);
  cone(ctx, CAM, 'rgba(70,224,255,A)', camOn * (i === 1 ? 1 : 0.3), true);

  if (i === 0 && beamOn > 0.9) {
    // Maßpfeil unter dem Feld
    ctx.globalAlpha = clamp((t - 1.8) / 0.6);
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(Q[3][0], 412); ctx.lineTo(Q[2][0], 412);
    ctx.moveTo(Q[3][0], 404); ctx.lineTo(Q[3][0], 420); ctx.moveTo(Q[2][0], 404); ctx.lineTo(Q[2][0], 420); ctx.stroke();
    ctx.font = `600 19px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillStyle = '#0a1530'; ctx.fillRect(470, 402, 80, 20);
    ctx.fillStyle = '#ffffff'; ctx.fillText('2 – 3 m', 510, 418);
    ctx.globalAlpha = 1;
  }

  if (i === 2) {
    // Fünf Punkte nacheinander, die Kamera „findet“ jeden
    const dots = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]];
    dots.forEach(([u, v], n) => {
      const local = t - 0.6 - n * 1.15;
      if (local < 0) return;
      disc(ctx, u, v, 16, '#ffffff');
      const p = P(u, v);
      if (local < 1.1) {
        pulse(ctx, p, { x: CAM.x, y: CAM.y + 10 }, ease(local / 0.7), '#46e0ff');
      }
      if (local > 0.7) {
        ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x - 7, p.y - 22 * p.s); ctx.lineTo(p.x - 1, p.y - 16 * p.s); ctx.lineTo(p.x + 10, p.y - 30 * p.s); ctx.stroke();
      }
    });
  }

  if (i === 4) {
    const seg = Math.min(TARGETS.length - 1, Math.floor(t / 2.3)), local = t - seg * 2.3;
    TARGETS.forEach(([u, v], n) => {
      if (n < seg || (n === seg && local > 1.7)) return;
      const hue = ['#ff5fa2', '#7dffb0', '#ffb347'][n];
      disc(ctx, u, v, 38 + Math.sin(time * 5 + n) * 3, hue + '55', hue, 4);
      disc(ctx, u, v, 14, hue);
    });
    if (local > 1.7) {
      const p = P(...TARGETS[seg]), k = (local - 1.7) / 0.6;
      for (let n = 0; n < 7; n++) {
        const a = (n / 7) * Math.PI * 2;
        ctx.globalAlpha = clamp(1 - k);
        star(ctx, p.x + Math.cos(a) * 60 * k, p.y - 14 + Math.sin(a) * 34 * k, 9, '#fff3a0');
      }
      ctx.globalAlpha = 1;
      ctx.font = `600 24px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
      ctx.fillText('+100', p.x, p.y - 34 - k * 22);
    }
  }

  if (i === 5) {
    const fill = clamp((t - 2.2) / 2.2);
    const done = fill >= 1;
    disc(ctx, 0.3, 0.5, 78, done ? 'rgba(125,255,176,0.35)' : 'rgba(255,255,255,0.14)', '#ffffff', 3);
    const p = P(0.3, 0.5);
    ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 78 * p.s, 78 * p.s * 0.42, 0, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2); ctx.stroke();
    ctx.font = `600 22px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
    ctx.fillText(done ? 'Los geht’s!' : 'START', p.x - 0, p.y - 52);
  }

  let bp = null;
  if (bu !== null) bp = ball(ctx, bu, bv, ring);

  if (bp && i >= 3 && ring > 0) {
    // Datenfluss: Ball → Kamera → Laptop → Beamer → Feld
    ctx.strokeStyle = 'rgba(70,224,255,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(bp.x, bp.y - 10); ctx.lineTo(CAM.x, CAM.y + 12); ctx.stroke(); ctx.setLineDash([]);
    const c = (time * 0.9) % 1;
    const cam = { x: CAM.x, y: CAM.y + 10 }, lap = { x: LAPTOP.x + 40, y: LAPTOP.y - 20 }, bea = { x: BEAMER.x, y: BEAMER.y + 16 };
    pulse(ctx, { x: bp.x, y: bp.y - 10 }, cam, c * 3, '#46e0ff');
    if (i >= 4) {
      pulse(ctx, cam, lap, c * 3 - 1, '#46e0ff');
      pulse(ctx, lap, bea, c * 3 - 2, '#ffffff');
    }
  }

  devices(ctx, glow);
}

function caption(ctx, i, t) {
  const s = STEPS[i], a = clamp(t / 0.5) * clamp((s.t - t) / 0.4);
  // Textband unten: Schrittnummer, Überschrift, Erklärzeile
  ctx.fillStyle = 'rgba(6,14,34,0.9)'; ctx.fillRect(0, H - 72, W, 72);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(42, H - 36, 21, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0d2a7a'; ctx.font = `600 24px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(String(i + 1), 42, H - 28);
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; ctx.font = `600 23px ${FONT}`;
  ctx.fillText(s.title, 78, H - 42, W - 190);
  ctx.fillStyle = '#c3d3f7'; ctx.font = `400 16px ${FONT}`;
  ctx.fillText(s.sub, 78, H - 18, W - 190);
  ctx.restore();
  // Fortschritt
  STEPS.forEach((_, n) => {
    ctx.fillStyle = n === i ? '#ffffff' : 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(W - 22 - (STEPS.length - 1 - n) * 15, H - 36, n === i ? 5.5 : 3.5, 0, Math.PI * 2); ctx.fill();
  });
}

/** Ein einzelnes Bild zeichnen (auch für Tests und Standbilder). */
export function drawHowTo(ctx, step, t, time = t) {
  drawStep(ctx, step, t, time);
  caption(ctx, step, t);
}

export const HOWTO_STEPS = STEPS.length;

/** Startet die Animation auf einer Zeichenfläche. Sie pausiert von selbst, solange sie nicht zu sehen ist. */
export function startHowTo(canvas) {
  const ctx = canvas.getContext('2d');
  let step = 0, t = 0, time = 0, last = 0;
  const fit = () => {
    const scale = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * scale; canvas.height = H * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  };
  fit();
  canvas.addEventListener('click', () => { step = (step + 1) % STEPS.length; t = 0; });
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    if (!canvas.offsetParent) return; // unsichtbar (Spiel läuft oder zugeklappt)
    t += dt; time += dt;
    if (t >= STEPS[step].t) { step = (step + 1) % STEPS.length; t = 0; }
    drawHowTo(ctx, step, t, time);
  };
  requestAnimationFrame(frame);
}
