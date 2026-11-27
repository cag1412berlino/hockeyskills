// Gemeinsame Grundlage aller Bildschirme: Button-Szene, Raster, Sterne-Wertung.
import { DwellButton, updateButtons, clickButtons } from './ui.js';

export const LEVEL_NAMES = ['Leicht', 'Mittel', 'Schwer'];
export const SPEEDS = [{ name: 'Langsam', factor: 0.65 }, { name: 'Normal', factor: 1 }, { name: 'Schnell', factor: 1.45 }];

/** Schlüssel für den Bestwert einer Übung: je Stufe und Tempo getrennt. */
export const scoreKey = (app, game, level) => `${game.scoreId ?? game.id}:${level}:${app.config.speed}`;

/** Die drei Sterne-Schwellen einer Übung auf einer Stufe (für die volle Rundenlänge). */
export function thresholds(game, level) {
  const m = game.medals?.[level - 1];
  return Array.isArray(m) ? m : [];
}

/** Wie viele der drei Sterne eine Punktzahl wert ist. Bei kürzeren Runden sinken die Schwellen mit. */
export function medals(game, score, level, seconds = game.duration ?? 60) {
  const k = seconds / (game.duration ?? 60);
  return thresholds(game, level).filter((m) => score >= m * k).length;
}

/** Bildschirm, der aus Buttons besteht. */
export class ButtonScene {
  constructor(app) {
    this.app = app;
    this.buttons = [];
    this.time = 0;
  }
  get field() { return this.app.engine.field; }
  update(dt, ball) {
    this.time += dt;
    this.look = ball.visible ? { x: ball.x, y: ball.y } : null;
    updateButtons(this.buttons, dt, ball);
  }
  onClick(x, y) { clickButtons(this.buttons, x, y); }
  draw(ctx) { this.buttons.forEach((b) => b.draw(ctx)); }
  /** Spielt den Auswahl-Ton und führt dann die Aktion aus. */
  act(fn) {
    return () => { this.app.sound.select(); fn(); };
  }
  /** Langsam pulsierende Deckkraft für Hinweistexte. */
  pulse() { return 0.6 + 0.4 * Math.sin(this.time * 4); }
}

/**
 * Ordnet Buttons in einem Raster an: bis vier in zwei Spalten, bis sechs in drei, sonst in vier.
 * make(item, x, y, r, index) baut den einzelnen Button. Die letzte Reihe wird mittig gesetzt.
 */
export function grid(items, w, make) {
  const n = items.length;
  const cols = w > 1400 ? n : n <= 4 ? Math.min(2, n) : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cell = w / cols;
  const step = rows > 2 ? 222 : 320;
  const r = rows > 2 ? 66 : rows > 1 ? Math.min(112, cell * 0.32) : Math.min(150, cell * 0.3);
  return items.map((item, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, n - row * cols);
    const x = w / 2 + ((i % cols) - (inRow - 1) / 2) * cell;
    const y = rows > 2 ? 325 + row * step : rows > 1 ? 355 + row * step : 520;
    return make(item, x, y, r, i);
  });
}

export { DwellButton };
