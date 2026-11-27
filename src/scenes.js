// Die Bildschirme der App: Spielauswahl, Schwierigkeit, Spiel, Ergebnis.
import { DwellButton, updateButtons, clickButtons, icons, text } from './ui.js';

const LEVEL_NAMES = ['Leicht', 'Mittel', 'Schwer'];

class ButtonScene {
  constructor(app) {
    this.app = app;
    this.buttons = [];
  }
  get field() { return this.app.engine.field; }
  update(dt, ball) { updateButtons(this.buttons, dt, ball); }
  onClick(x, y) { clickButtons(this.buttons, x, y); }
  draw(ctx) { this.buttons.forEach((b) => b.draw(ctx)); }
  /** Reicht Töne und Aktion eines Buttons zusammen weiter. */
  act(fn) {
    return () => { this.app.sound.select(); fn(); };
  }
}

export class MenuScene extends ButtonScene {
  layout() {
    const { w } = this.field;
    const games = this.app.games;
    const colors = this.app.palette();
    const gap = w / games.length;
    const r = Math.min(170, gap * 0.36);
    this.buttons = games.map((game, i) => new DwellButton({
      x: gap * (i + 0.5), y: 520, r,
      color: colors[i % colors.length],
      icon: game.icon, label: game.name,
      onActivate: this.act(() => this.app.levels(game)),
    }));
  }
  draw(ctx) {
    text(ctx, 'Hockey Skills', this.field.w / 2, 150, 90);
    text(ctx, 'Lege den Ball auf ein Spiel', this.field.w / 2, 900, 40, 'rgba(255,255,255,0.7)');
    super.draw(ctx);
  }
}

export class LevelScene extends ButtonScene {
  constructor(app, game) {
    super(app);
    this.game = game;
  }
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    const r = Math.min(140, w * 0.12);
    this.buttons = [1, 2, 3].map((level) => {
      const best = this.app.config.highscores[`${this.game.id}:${level}`];
      return new DwellButton({
        x: (w / 3) * (level - 0.5), y: 500, r,
        color: colors[level % colors.length],
        icon: icons.stars(level), label: LEVEL_NAMES[level - 1],
        sub: best ? `Rekord ${best}` : '',
        onActivate: this.act(() => this.app.play(this.game, level)),
      });
    });
    this.buttons.push(new DwellButton({
      x: 90, y: 910, r: 65, icon: icons.back, onActivate: this.act(() => this.app.menu()),
    }));
  }
  draw(ctx) {
    text(ctx, this.game.name, this.field.w / 2, 150, 80);
    super.draw(ctx);
  }
}

export class PlayScene {
  constructor(app, game, level) {
    Object.assign(this, { app, game, level });
    this.score = 0;
    this.duration = game.duration ?? 60;
    this.timeLeft = this.duration;
    this.countdown = 3.5;
    this.lastTick = 4;
    const scene = this;
    // Das ist alles, was ein Spiel von der App bekommt.
    this.env = {
      field: app.engine.field,
      level,
      palette: app.palette(),
      sound: app.sound,
      get score() { return scene.score; },
      get timeLeft() { return scene.timeLeft; },
      addScore(n) { scene.score = Math.max(0, scene.score + n); },
      end() { scene.finish(); },
    };
    this.instance = game.create(this.env);
  }
  layout() {
    this.exit = new DwellButton({
      x: this.app.engine.field.w - 70, y: 70, r: 50, dwell: 1.5, icon: icons.close,
      color: 'rgba(255,255,255,0.5)',
      onActivate: () => { this.app.sound.select(); this.app.menu(); },
    });
  }
  update(dt, ball) {
    if (this.exit.update(dt, ball)) return;
    if (this.countdown > 0) {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - 0.5);
      if (n < this.lastTick) {
        this.lastTick = n;
        if (n > 0) this.app.sound.tick(); else this.app.sound.go();
      }
      return;
    }
    this.timeLeft -= dt;
    this.instance.update(dt, ball);
    if (this.timeLeft <= 0) this.finish();
  }
  finish() {
    if (this.done) return;
    this.done = true;
    const key = `${this.game.id}:${this.level}`;
    const best = this.app.config.highscores[key] || 0;
    const record = this.score > best;
    if (record) {
      this.app.config.highscores[key] = this.score;
      this.app.save();
    }
    this.app.result(this.game, this.level, this.score, Math.max(best, this.score), record);
  }
  onClick(x, y) { clickButtons([this.exit], x, y); }
  draw(ctx) {
    const { w } = this.app.engine.field;
    this.instance.draw(ctx);
    // Zeitbalken, Punkte, Abbrechen-Button
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, 0, w, 16);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w * Math.max(0, this.timeLeft / this.duration), 16);
    text(ctx, String(this.score), 40, 80, 90, '#fff', 'left');
    this.exit.draw(ctx);
    if (this.countdown > 0) {
      const n = Math.ceil(this.countdown - 0.5);
      text(ctx, n > 0 ? String(n) : 'Los!', w / 2, 500, 300);
    }
  }
}

export class ResultScene extends ButtonScene {
  constructor(app, game, level, score, best, record) {
    super(app);
    Object.assign(this, { game, level, score, best, record });
  }
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    this.buttons = [
      new DwellButton({
        x: w / 2 - 190, y: 720, r: 110, color: colors[0], icon: icons.replay, label: 'Nochmal',
        onActivate: this.act(() => this.app.play(this.game, this.level)),
      }),
      new DwellButton({
        x: w / 2 + 190, y: 720, r: 110, color: colors[2], icon: icons.home, label: 'Menü',
        onActivate: this.act(() => this.app.menu()),
      }),
    ];
  }
  draw(ctx) {
    const cx = this.field.w / 2;
    text(ctx, this.record ? 'Neuer Rekord!' : 'Geschafft!', cx, 140, 80, this.record ? this.app.palette()[1] : '#fff');
    text(ctx, String(this.score), cx, 340, 240);
    if (this.best) text(ctx, `Rekord ${this.best}`, cx, 500, 44, 'rgba(255,255,255,0.7)');
    super.draw(ctx);
  }
}
