// Spiel-Engine: Zeichenschleife, Spielfeld-Koordinaten und Ballposition.
//
// Spiele rechnen in "Feld-Einheiten": Das Spielfeld ist immer 1000 hoch und
// field.w breit (1000 beim Quadrat, breiter bei voller Projektionsfläche).
import { theme, glow, noGlow, star } from './ui.js';
import { THEMES, Floor } from './themes.js';

/**
 * Ballgröße in Feld-Einheiten, großzügig für Treffer-Abfragen. Sie hängt davon ab, wie groß
 * das projizierte Feld wirklich ist: Auf einem 3-Meter-Feld ist der Ball im Verhältnis kleiner.
 */
export let BALL_RADIUS = 35;

/** Stellt die tatsächliche Kantenlänge des Felds in Metern ein (Höhe der Projektion). */
export function setFieldMeters(meters) {
  BALL_RADIUS = Math.round(70 / Math.max(1, meters));
}

/**
 * Vorhalt: schätzt, wo der Ball jetzt wirklich ist, obwohl das Kamerabild `seconds` alt ist.
 * Die Verschiebung ist begrenzt, damit ein Ausreißer in der Geschwindigkeit nichts verreißt.
 */
export function predict(pos, vel, seconds, limit = 150) {
  const dx = vel.x * seconds, dy = vel.y * seconds;
  const d = Math.hypot(dx, dy);
  const k = d > limit ? limit / d : 1;
  return { x: pos.x + dx * k, y: pos.y + dy * k };
}
const MAX_HEIGHT = 1440;       // höchste Bildhöhe in Pixeln, mit der gerechnet wird

export class Engine {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config;
    this.field = { x: 0, y: 0, scale: 1, w: 1000, h: 1000 };
    this.ball = { x: 0, y: 0, vx: 0, vy: 0, visible: false };
    this.lostFor = Infinity;
    this.seen = { x: 0, y: 0, vx: 0, vy: 0 }; // Ball, wie ihn die Kamera zuletzt gesehen hat
    this.trail = [];            // letzte Ballpositionen für den Schweif
    this.scene = null;
    this.paused = false;        // true, solange die Einrichtung offen ist
    this.override = null;       // eigene Zeichenfunktion (Kalibrierung)
    this.clickOverride = null;
    this.ballProvider = () => null; // liefert {x, y} in Projektions-Koordinaten 0..1 oder null
    this.onFrame = null;
    this.toast = null;
    this.lastTime = 0;
    this.time = 0;
    this.shakeAmt = 0;
    this.fade = 0;             // Überblendung beim Szenenwechsel
    this.world = 'space';      // Themenwelt, siehe theme
    this.bloom = 0.3;          // 0..1: wie farbig und lebendig der Hintergrund gerade ist
    this.bloomGoal = 0.3;
    this.floor = new Floor();  // Spuren, die der Ball am Boden hinterlässt
    this.trailStyle = 0;       // Ballschweif: 0 = schlicht, 1 = Funken, 2 = Sternchen (per Rang freigeschaltet)
    this.sparks = [];
    theme.world = this.world;
    // Schwebende Teilchen des Hintergrunds: Position 0..1, Größe, Helligkeit, Tempo, Flackern
    this.dots = Array.from({ length: 60 }, () => ({
      x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.2,
      a: 0.12 + Math.random() * 0.3, v: 4 + Math.random() * 14, tw: 1 + Math.random() * 3,
    }));

    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (e) => this.pointer(e));
    this.resize();
  }

  resize() {
    // Auflösung begrenzen: Leuchteffekte kosten sonst auf 4K-Beamern zu viel Rechenzeit.
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_HEIGHT / window.innerHeight);
    const cw = (this.canvas.width = Math.round(window.innerWidth * dpr));
    const ch = (this.canvas.height = Math.round(window.innerHeight * dpr));
    const f = this.field;
    const full = this.config.fieldShape === 'full';
    const side = Math.min(cw, ch);
    f.pw = full ? cw : side; // Größe des Felds in Bildschirm-Pixeln
    f.ph = full ? ch : side;
    f.x = (cw - f.pw) / 2;
    f.y = (ch - f.ph) / 2;
    f.scale = f.ph / 1000;
    f.w = f.pw / f.scale;
    f.h = 1000;
    // Drehung, damit Schrift und Spiel zum Kind zeigen. Ein nicht quadratisches Feld
    // lässt sich nur auf den Kopf stellen, nicht um 90 Grad drehen.
    const rot = this.config.rotation || 0;
    f.rot = ((full ? Math.floor(rot / 180) * 180 : rot) * Math.PI) / 180;
    theme.px = f.scale;
    this.scene?.layout?.();
  }

  /** Ecken des Spielfelds in Projektions-Koordinaten (0..1), im Uhrzeigersinn ab oben links. */
  fieldCorners() {
    const { width: cw, height: ch } = this.canvas;
    const f = this.field;
    const x0 = f.x / cw, y0 = f.y / ch;
    const x1 = (f.x + f.pw) / cw, y1 = (f.y + f.ph) / ch;
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }

  /** Rechnet Bildschirm-Pixel in Feld-Einheiten um (berücksichtigt die Drehung). */
  toField(px, py) {
    const f = this.field;
    const dx = px - (f.x + f.pw / 2), dy = py - (f.y + f.ph / 2);
    const c = Math.cos(-f.rot), s = Math.sin(-f.rot);
    return { x: (dx * c - dy * s) / f.scale + f.w / 2, y: (dx * s + dy * c) / f.scale + f.h / 2 };
  }

  /** Themenwelt: bestimmt Hintergrund, Bodenspuren und das Aussehen der Wesen. */
  get theme() { return this.world; }
  set theme(id) {
    if (id === this.world) return;
    this.world = id;
    theme.world = id;
    this.floor.marks = [];
  }

  /** Lässt den Hintergrund aufblühen (1) oder verblassen (0); der Übergang ist weich. */
  bloomTo(level) {
    this.bloomGoal = Math.max(0, Math.min(1, level));
  }

  setScene(scene) {
    this.scene = scene;
    this.fade = 1;
    scene.layout?.();
  }

  showToast(msg, seconds = 4) {
    this.toast = { msg, until: performance.now() + seconds * 1000 };
  }

  /** Lässt das Bild kurz wackeln (z. B. bei einem Fehler). */
  shake(amount = 14) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  pointer(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * this.canvas.width;
    const py = ((e.clientY - r.top) / r.height) * this.canvas.height;
    if (this.clickOverride) return this.clickOverride(px, py);
    if (this.override || this.paused) return;
    const p = this.toField(px, py);
    this.scene?.onClick?.(p.x, p.y);
  }

  updateBall(dt) {
    const b = this.ball;
    const f = this.field;
    const p = this.ballProvider();
    let x, y, ok = false;
    if (p) {
      ({ x, y } = this.toField(p.x * this.canvas.width, p.y * this.canvas.height));
      // Erkennungen weit außerhalb des Spielfelds sind kein Ball.
      ok = x > -100 && y > -100 && x < f.w + 100 && y < f.h + 100;
    }
    if (!ok) {
      this.lostFor += dt;
      // Kurze Aussetzer (Schläger verdeckt den Ball) überbrücken.
      if (this.lostFor > 0.3) { b.visible = false; b.vx = b.vy = 0; this.trail.length = 0; }
      return;
    }
    // s = geglättete Position aus dem Kamerabild, v = beruhigte Geschwindigkeit
    const s = this.seen;
    if (!b.visible || dt <= 0) {
      s.x = x; s.y = y; s.vx = s.vy = 0;
    } else {
      const nx = s.x + (x - s.x) * 0.7; // leichte Glättung gegen Zittern
      const ny = s.y + (y - s.y) * 0.7;
      b.vx = (nx - s.x) / dt;
      b.vy = (ny - s.y) / dt;
      s.vx += (b.vx - s.vx) * 0.35;
      s.vy += (b.vy - s.vy) * 0.35;
      s.x = nx; s.y = ny;
    }
    // Vorhalt gleicht die Verzögerung von Kamera und Beamer aus (0 = aus).
    const lead = (this.config.latency || 0) / 1000;
    const at = lead ? predict(s, { x: s.vx, y: s.vy }, lead) : s;
    b.x = at.x; b.y = at.y;
    if (!b.visible) b.vx = b.vy = 0;
    b.visible = true;
    this.lostFor = 0;
    this.trail.push({ x: b.x, y: b.y });
    if (this.trail.length > 14) this.trail.shift();
  }

  start() {
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0);
      this.lastTime = now;
      requestAnimationFrame(loop); // zuerst: Ein Fehler in einem Bild hält die Schleife nicht an
      this.frame(dt, now);
    };
    requestAnimationFrame(loop);
  }

  /** Gemalter Hintergrund der Themenwelt. Bleibt dunkel, damit er den Ball nicht überstrahlt. */
  drawBackground(ctx) {
    const f = this.field;
    (THEMES[this.world] ?? THEMES.space).paint(ctx, f, this.time, this.bloom, this.dots);
    // Spuren des Balls; direkt um den Ball bleibt es frei, damit kein farbiges Licht auf ihn fällt
    this.floor.draw(ctx, this.ball, BALL_RADIUS * 2.4);
    // Ränder weich abdunkeln
    const v = ctx.createRadialGradient(f.w / 2, f.h / 2, f.h * 0.45, f.w / 2, f.h / 2, Math.hypot(f.w, f.h) / 2);
    v.addColorStop(0, 'rgba(0,0,8,0)');
    v.addColorStop(1, 'rgba(0,0,8,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, f.w, f.h);
  }

  /** Feiner Rahmen mit betonten Ecken. */
  drawFrame(ctx) {
    const f = this.field;
    const edge = 'hsl(212 100% 66%)';
    ctx.lineWidth = 2;
    ctx.strokeStyle = edge;
    glow(ctx, edge, 22);
    ctx.strokeRect(5, 5, f.w - 10, f.h - 10);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#fff';
    const L = 44;
    for (const [cx, cy, sx, sy] of [[5, 5, 1, 1], [f.w - 5, 5, -1, 1], [f.w - 5, f.h - 5, -1, -1], [5, f.h - 5, 1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * L, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * L);
      ctx.stroke();
    }
    noGlow(ctx);
  }

  /** Leuchtschweif und Ring um den Ball: zeigt, dass die Kamera ihn sieht. */
  drawBall(ctx) {
    const { ball, trail } = this;
    const color = 'hsl(200 100% 72%)';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    for (let i = 1; i < trail.length; i++) {
      // Nicht auf den Ball selbst leuchten: farbiges Licht würde seine Farbe für die Kamera verfälschen.
      if (Math.hypot(trail[i].x - ball.x, trail[i].y - ball.y) < BALL_RADIUS * 2) continue;
      const k = i / trail.length;
      ctx.globalAlpha = k * 0.4;
      ctx.lineWidth = 2 + k * BALL_RADIUS * 0.7;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Freigeschaltete Schweife: Funken oder Sternchen, die hinter dem Ball zurückbleiben
    if (this.trailStyle && Math.hypot(ball.vx, ball.vy) > 120 && Math.random() < 0.5) {
      this.sparks.push({ x: ball.x + (Math.random() - 0.5) * 50, y: ball.y + (Math.random() - 0.5) * 50, age: 0 });
    }
    this.sparks = this.sparks.filter((q) => (q.age += 1 / 60) < 0.6);
    for (const q of this.sparks) {
      if (Math.hypot(q.x - ball.x, q.y - ball.y) < BALL_RADIUS * 2) continue;
      ctx.globalAlpha = 1 - q.age / 0.6;
      if (this.trailStyle >= 2) star(ctx, q.x, q.y, 9 * (1 - q.age), '#fff');
      else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y, 4 * (1 - q.age) + 1, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    const r = BALL_RADIUS + 13;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    glow(ctx, color, 16);
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // zwei kreisende Bögen
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const o of [0, Math.PI]) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, r + 10, this.time * 3 + o, this.time * 3 + o + 0.9);
      ctx.stroke();
    }
    noGlow(ctx);
  }

  frame(dt, now) {
    const { ctx, canvas, field: f, ball } = this;
    this.time += dt;
    this.onFrame?.(dt);
    this.updateBall(dt);
    this.bloom += (this.bloomGoal - this.bloom) * Math.min(1, dt * 1.5);
    if (!this.paused) this.floor.update(dt, this.ball, this.world);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.override) {
      this.override(ctx, canvas.width, canvas.height);
    } else if (this.scene) {
      if (!this.paused) this.scene.update(dt, ball);
      this.shakeAmt *= Math.max(0, 1 - 7 * dt);
      ctx.save();
      ctx.translate(f.x + f.pw / 2, f.y + f.ph / 2);
      ctx.rotate(f.rot);
      ctx.scale(f.scale, f.scale);
      ctx.translate(-f.w / 2, -f.h / 2);
      ctx.beginPath();
      ctx.rect(0, 0, f.w, f.h);
      ctx.clip();
      this.drawBackground(ctx);
      ctx.save();
      if (this.shakeAmt > 0.5) {
        ctx.translate((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt);
      }
      this.scene.draw(ctx);
      if (ball.visible) this.drawBall(ctx);
      ctx.restore();
      this.drawFrame(ctx);
      if (this.config.dim > 0) {
        // Projektion abdunkeln: weniger Licht auf dem Ball, falls die Kamera ihn sonst schlecht erkennt
        ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, this.config.dim)})`;
        ctx.fillRect(0, 0, f.w, f.h);
      }
      if (this.fade > 0) {
        // weiche Überblendung nach einem Szenenwechsel
        ctx.fillStyle = `rgba(2,4,14,${this.fade})`;
        ctx.fillRect(0, 0, f.w, f.h);
        this.fade = Math.max(0, this.fade - dt * 4);
      }
      ctx.restore();
      // Test-Ball: ein gemalter „Ball“ an der Maus, den die Kamera wie einen echten Ball filmt
      const fake = this.fakeBall?.();
      if (fake) {
        ctx.fillStyle = fake.color;
        ctx.beginPath();
        ctx.arc(fake.x * canvas.width, fake.y * canvas.height, BALL_RADIUS * 0.8 * f.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.toast && now < this.toast.until) {
      const size = Math.round(canvas.height * 0.032);
      ctx.font = `600 ${size}px ${theme.family}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(this.toast.msg).width + size * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect((canvas.width - w) / 2, canvas.height - size * 3.2, w, size * 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(this.toast.msg, canvas.width / 2, canvas.height - size * 2.2);
    }
  }
}
