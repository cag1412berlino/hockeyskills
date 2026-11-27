// Die Bildschirme der App: Spielauswahl, Schwierigkeit, Spiel, Ergebnis.
import { DwellButton, updateButtons, clickButtons, icons, text, title, heart, glow, noGlow } from './ui.js';

const LEVEL_NAMES = ['Leicht', 'Mittel', 'Schwer'];
const SPEEDS = [{ name: 'Langsam', factor: 0.65 }, { name: 'Normal', factor: 1 }, { name: 'Schnell', factor: 1.45 }];
const scoreKey = (app, game, level) => `${game.id}:${level}:${app.config.speed}`;
const pad = (n) => String(n).padStart(5, '0');

class ButtonScene {
  constructor(app) {
    this.app = app;
    this.buttons = [];
    this.time = 0;
  }
  get field() { return this.app.engine.field; }
  update(dt, ball) {
    this.time += dt;
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

export class MenuScene extends ButtonScene {
  layout() {
    const { w } = this.field;
    const games = this.app.games;
    const colors = this.app.palette();
    const n = games.length;
    const cols = w > 1400 ? n : n <= 4 ? Math.min(2, n) : 3;
    const rows = Math.ceil(n / cols);
    const cell = w / cols;
    const r = rows > 1 ? Math.min(112, cell * 0.32) : 150;
    this.buttons = games.map((game, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols); // letzte Reihe mittig setzen
      return new DwellButton({
        x: w / 2 + ((i % cols) - (inRow - 1) / 2) * cell,
        y: rows > 1 ? 355 + row * 320 : 520,
        r,
        color: colors[i % colors.length],
        icon: game.icon, label: game.name,
        onActivate: this.act(() => this.app.levels(game)),
      });
    });
  }
  draw(ctx) {
    const c = this.app.palette();
    title(ctx, 'Hockey Skills', this.field.w / 2, 120, 104, c[1], c[3]);
    ctx.globalAlpha = this.pulse();
    text(ctx, 'Ball auf ein Spiel legen', this.field.w / 2, 945, 32);
    ctx.globalAlpha = 1;
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
    const r = Math.min(140, w * 0.125);
    this.buttons = [1, 2, 3].map((level) => {
      const best = this.app.config.highscores[scoreKey(this.app, this.game, level)];
      return new DwellButton({
        x: (w / 3) * (level - 0.5), y: 480, r,
        color: colors[level - 1],
        icon: icons.stars(level), label: LEVEL_NAMES[level - 1],
        sub: best ? `Hi ${best}` : '',
        onActivate: this.act(() => this.app.play(this.game, level)),
      });
    });
    this.buttons.push(new DwellButton({
      x: 100, y: 890, r: 70, icon: icons.back, onActivate: this.act(() => this.app.menu()),
    }));
    // Tempo-Button: schaltet reihum Langsam, Normal, Schnell.
    const speed = this.app.config.speed;
    this.buttons.push(new DwellButton({
      x: w - 130, y: 820, r: 70, color: colors[3], icon: icons.speed(speed + 1),
      label: SPEEDS[speed].name,
      onActivate: this.act(() => {
        this.app.config.speed = (speed + 1) % SPEEDS.length;
        this.app.save();
        this.layout();
      }),
    }));
  }
  draw(ctx) {
    const c = this.app.palette();
    title(ctx, this.game.name, this.field.w / 2, 140, 110, c[1], c[3]);
    ctx.globalAlpha = this.pulse();
    text(ctx, 'Stufe wählen', this.field.w / 2, 250, 32);
    ctx.globalAlpha = 1;
    super.draw(ctx);
  }
}

export class PlayScene {
  constructor(app, game, level) {
    Object.assign(this, { app, game, level });
    this.score = 0;
    this.duration = game.duration ?? 60;
    this.timeLeft = this.duration;
    this.lives = game.lives ?? null;
    this.countdown = 3.5;
    this.speed = SPEEDS[app.config.speed].factor;
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
      get lives() { return scene.lives; },
      addScore(n) { scene.score = Math.max(0, scene.score + n); },
      loseLife() {
        scene.lives -= 1;
        if (scene.lives <= 0) scene.finish();
      },
      end() { scene.finish(); },
    };
    this.instance = game.create(this.env);
  }
  layout() {
    this.exit = new DwellButton({
      x: this.app.engine.field.w - 70, y: 95, r: 42, dwell: 1.5, icon: icons.close,
      color: 'rgba(255,255,255,0.6)',
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
    // Das Tempo lässt die Spielwelt schneller oder langsamer laufen, die Rundenzeit bleibt gleich.
    this.instance.update(dt * this.speed, ball);
    if (this.timeLeft <= 0) this.finish();
  }
  finish() {
    if (this.done) return;
    this.done = true;
    const key = scoreKey(this.app, this.game, this.level);
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
    const c = this.env.palette;
    this.instance.draw(ctx);

    // Zeitbalken aus einzelnen Segmenten
    const segments = 48;
    const sw = (w - 40) / segments;
    const lit = Math.ceil(segments * Math.max(0, this.timeLeft / this.duration));
    for (let i = 0; i < segments; i++) {
      ctx.fillStyle = i < lit ? (lit <= 5 ? '#fff' : c[1]) : 'rgba(255,255,255,0.12)';
      ctx.fillRect(20 + i * sw, 26, sw - 4, 10);
    }
    text(ctx, pad(this.score), 30, 92, 64, '#fff', 'left');
    if (this.lives != null) {
      for (let i = 0; i < (this.game.lives ?? 0); i++) {
        const on = i < this.lives;
        if (on) glow(ctx, c[3], 14);
        heart(ctx, w / 2 - 50 + i * 50, 92, 36, on ? c[3] : 'rgba(255,255,255,0.15)');
        noGlow(ctx);
      }
    }
    this.exit.draw(ctx);
    if (this.countdown > 0) {
      const n = Math.ceil(this.countdown - 0.5);
      title(ctx, n > 0 ? String(n) : 'Los!', w / 2, 500, n > 0 ? 420 : 260, c[1], c[3]);
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
        x: w / 2 - 200, y: 720, r: 110, color: colors[0], icon: icons.replay, label: 'Nochmal',
        onActivate: this.act(() => this.app.play(this.game, this.level)),
      }),
      new DwellButton({
        x: w / 2 + 200, y: 720, r: 110, color: colors[2], icon: icons.home, label: 'Menü',
        onActivate: this.act(() => this.app.menu()),
      }),
    ];
  }
  draw(ctx) {
    const cx = this.field.w / 2;
    const c = this.app.palette();
    if (this.record) {
      ctx.globalAlpha = this.pulse();
      title(ctx, 'Neuer Rekord!', cx, 130, 105, c[0], c[3]);
      ctx.globalAlpha = 1;
    } else {
      title(ctx, 'Geschafft!', cx, 130, 110, c[1], c[3]);
    }
    text(ctx, pad(this.score), cx, 330, 220);
    if (this.best) text(ctx, `Hi ${pad(this.best)}`, cx, 470, 50, c[1]);
    super.draw(ctx);
  }
}
