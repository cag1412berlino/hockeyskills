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
    this.scene = null;
    this.paused = false;        // true, solange die Einrichtung offen ist
    this.override = null;       // eigene Zeichenfunktion (Kalibrierung)
    this.clickOverride = null;
    this.ballProvider = () => null; // liefert {x, y} in Projektions-Koordinaten 0..1 oder null
    this.onFrame = null;
    this.toast = null;
    this.lastTime = 0;

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
      if (this.lostFor > 0.3) { b.visible = false; b.vx = b.vy = 0; }
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

  /** Dunkles Raster als Hintergrund. Bewusst schwach, damit es den Ball nicht überstrahlt. */
  drawGrid(ctx) {
    const f = this.field;
    ctx.strokeStyle = `hsl(${(this.config.ball.h + 220) % 360} 80% 16%)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const x0 = (f.w % 100) / 2;
    for (let x = x0; x <= f.w; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, f.h); }
    for (let y = 0; y <= f.h; y += 100) { ctx.moveTo(0, y); ctx.lineTo(f.w, y); }
    ctx.stroke();
  }

  frame(dt, now) {
    const { ctx, canvas, field: f, ball } = this;
    this.onFrame?.(dt);
    this.updateBall(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.override) {
      this.override(ctx, canvas.width, canvas.height);
    } else if (this.scene) {
      if (!this.paused) this.scene.update(dt, ball);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(f.scale, f.scale);
      ctx.beginPath();
      ctx.rect(0, 0, f.w, f.h);
      ctx.clip();
      this.drawGrid(ctx);
      this.scene.draw(ctx);
      if (ball.visible) {
        // Weißes Fadenkreuz um den Ball: zeigt, dass die Kamera ihn sieht.
        const r = BALL_RADIUS + 14;
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#fff';
        glow(ctx, '#fff', 16);
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
        for (let i = 0; i < 4; i++) {
          const c = Math.cos((i * Math.PI) / 2), s = Math.sin((i * Math.PI) / 2);
          ctx.moveTo(ball.x + c * r, ball.y + s * r);
          ctx.lineTo(ball.x + c * (r + 16), ball.y + s * (r + 16));
        }
        ctx.stroke();
        noGlow(ctx);
      }
      const edge = `hsl(${(this.config.ball.h + 200) % 360} 90% 55%)`;
      ctx.lineWidth = 8;
      ctx.strokeStyle = edge;
      glow(ctx, edge, 30);
      ctx.strokeRect(4, 4, f.w - 8, f.h - 8);
      noGlow(ctx);
      ctx.restore();
    }

    if (this.toast && now < this.toast.until) {
      const size = Math.round(canvas.height * 0.035);
      ctx.font = `${size * theme.scale}px ${theme.family}`;
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
