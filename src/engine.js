// Spiel-Engine: Zeichenschleife, Spielfeld-Koordinaten und Ballposition.
//
// Spiele rechnen in "Feld-Einheiten": Das Spielfeld ist immer 1000 hoch und
// field.w breit (1000 beim Quadrat, breiter bei voller Projektionsfläche).
import { theme, glow, noGlow } from './ui.js';

export const BALL_RADIUS = 35; // Ballgröße in Feld-Einheiten (für Treffer-Abfragen)

export class Engine {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config;
    this.field = { x: 0, y: 0, scale: 1, w: 1000, h: 1000 };
    this.ball = { x: 0, y: 0, vx: 0, vy: 0, visible: false };
    this.lostFor = Infinity;
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
    // Hintergrund-Sterne: Position 0..1, Größe, Helligkeit, Fallgeschwindigkeit
    this.stars = Array.from({ length: 60 }, () => ({
      x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.2,
      a: 0.12 + Math.random() * 0.3, v: 4 + Math.random() * 14, tw: 1 + Math.random() * 3,
    }));

    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (e) => this.pointer(e));
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = (this.canvas.width = Math.round(window.innerWidth * dpr));
    const ch = (this.canvas.height = Math.round(window.innerHeight * dpr));
    const f = this.field;
    const side = Math.min(cw, ch);
    const pw = this.config.fieldShape === 'full' ? cw : side;
    const ph = this.config.fieldShape === 'full' ? ch : side;
    f.x = (cw - pw) / 2;
    f.y = (ch - ph) / 2;
    f.scale = ph / 1000;
    f.w = pw / f.scale;
    f.h = 1000;
    theme.px = f.scale;
    this.scene?.layout?.();
  }

  /** Ecken des Spielfelds in Projektions-Koordinaten (0..1), im Uhrzeigersinn ab oben links. */
  fieldCorners() {
    const { width: cw, height: ch } = this.canvas;
    const f = this.field;
    const x0 = f.x / cw, y0 = f.y / ch;
    const x1 = (f.x + f.w * f.scale) / cw, y1 = (f.y + f.h * f.scale) / ch;
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }

  setScene(scene) {
    this.scene = scene;
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
    const f = this.field;
    this.scene?.onClick?.((px - f.x) / f.scale, (py - f.y) / f.scale);
  }

  updateBall(dt) {
    const b = this.ball;
    const f = this.field;
    const p = this.ballProvider();
    let x, y, ok = false;
    if (p) {
      x = (p.x * this.canvas.width - f.x) / f.scale;
      y = (p.y * this.canvas.height - f.y) / f.scale;
      // Erkennungen weit außerhalb des Spielfelds sind kein Ball.
      ok = x > -100 && y > -100 && x < f.w + 100 && y < f.h + 100;
    }
    if (!ok) {
      this.lostFor += dt;
      // Kurze Aussetzer (Schläger verdeckt den Ball) überbrücken.
      if (this.lostFor > 0.3) { b.visible = false; b.vx = b.vy = 0; this.trail.length = 0; }
      return;
    }
    if (!b.visible || dt <= 0) {
      b.x = x; b.y = y; b.vx = b.vy = 0;
    } else {
      const nx = b.x + (x - b.x) * 0.7; // leichte Glättung gegen Zittern
      const ny = b.y + (y - b.y) * 0.7;
      b.vx = (nx - b.x) / dt;
      b.vy = (ny - b.y) / dt;
      b.x = nx; b.y = ny;
    }
    b.visible = true;
    this.lostFor = 0;
    this.trail.push({ x: b.x, y: b.y });
    if (this.trail.length > 14) this.trail.shift();
  }

  start() {
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0);
      this.lastTime = now;
      this.frame(dt, now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Dunkler Farbverlauf mit langsam treibenden Sternen. Bewusst schwach, damit er den Ball nicht überstrahlt. */
  drawBackground(ctx) {
    const f = this.field;
    const g = ctx.createRadialGradient(f.w / 2, f.h * 0.45, 60, f.w / 2, f.h / 2, f.h * 0.85);
    g.addColorStop(0, 'hsl(216 80% 12%)');
    g.addColorStop(1, 'hsl(224 85% 3%)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, f.w, f.h);
    ctx.fillStyle = '#fff';
    for (const s of this.stars) {
      ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(this.time * s.tw + s.x * 50));
      ctx.beginPath();
      ctx.arc(s.x * f.w, (s.y * f.h + this.time * s.v) % f.h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
      ctx.globalAlpha = k * 0.5;
      ctx.lineWidth = 4 + k * BALL_RADIUS;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const r = BALL_RADIUS + 13;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    glow(ctx, color, 18);
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // zwei kreisende Bögen
    ctx.lineWidth = 5;
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.override) {
      this.override(ctx, canvas.width, canvas.height);
    } else if (this.scene) {
      if (!this.paused) this.scene.update(dt, ball);
      this.shakeAmt *= Math.max(0, 1 - 7 * dt);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(f.scale, f.scale);
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
      const edge = 'hsl(212 100% 62%)';
      ctx.lineWidth = 4;
      ctx.strokeStyle = edge;
      glow(ctx, edge, 26);
      ctx.strokeRect(2, 2, f.w - 4, f.h - 4);
      noGlow(ctx);
      ctx.restore();
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
