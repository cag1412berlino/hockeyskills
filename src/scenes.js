// Die Bildschirme der App: Spielauswahl, Schwierigkeit, Spiel, Ergebnis.
import { DwellButton, updateButtons, clickButtons, icons, text, title, heart, star, glow, noGlow, tone } from './ui.js';
import { BRAND } from './config.js';

const LEVEL_NAMES = ['Leicht', 'Mittel', 'Schwer'];
const SPEEDS = [{ name: 'Langsam', factor: 0.65 }, { name: 'Normal', factor: 1 }, { name: 'Schnell', factor: 1.45 }];
const STAGES = 4;            // so oft wird ein Spiel innerhalb einer Runde schwieriger
const STREAK_STEPS = [3, 6, 10]; // ab so vielen schnellen Treffern in Folge gibt es x2, x3, x4
const AWAY_PAUSE = 2.5;      // nach so vielen Sekunden ohne Ball pausiert das Spiel
const scoreKey = (app, game, level) => `${game.id}:${level}:${app.config.speed}`;

/** Wie viele der drei Sterne eine Punktzahl wert ist. */
function medals(game, score) {
  return (game.medals ?? []).filter((m) => score >= m).length;
}

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
    const cols = w > 1400 ? n : n <= 4 ? Math.min(2, n) : n <= 6 ? 3 : 4;
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
    // Kopf: Vereinslogo (falls vorhanden) links, daneben der Name in zwei Zeilen
    const logo = this.app.logo;
    const { w } = this.field;
    const size = 150;
    const cx = logo ? w / 2 + size / 2 + 10 : w / 2;
    if (logo) {
      const k = Math.min(size / logo.width, size / logo.height);
      const lw = logo.width * k, lh = logo.height * k;
      ctx.drawImage(logo, cx - 330 - size / 2 - lw / 2, 118 - lh / 2, lw, lh);
    }
    title(ctx, 'Blau-Weiss', cx, 78, 84, '#fff');
    title(ctx, 'Skiller Academy', cx, 160, 84, this.app.palette()[0]);
    text(ctx, BRAND.club, cx, 228, 28, tone(this.app.palette()[3], 80), 'center', 0);
    ctx.globalAlpha = this.pulse();
    text(ctx, 'Lege den Ball auf ein Spiel', this.field.w / 2, 945, 36, '#fff', 'center', 6);
    ctx.globalAlpha = 1;
    // Buttons leicht versetzt schweben lassen
    this.buttons.forEach((b, i) => {
      ctx.save();
      ctx.translate(0, Math.sin(this.time * 1.6 + i * 1.1) * 5);
      b.draw(ctx);
      ctx.restore();
    });
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
        sub: best ? `${'★'.repeat(medals(this.game, best))} Rekord ${best}`.trim() : '',
        onActivate: this.act(() => this.app.play(this.game, level)),
      });
    });
    this.buttons.push(new DwellButton({
      x: 110, y: 870, r: 70, icon: icons.back, onActivate: this.act(() => this.app.menu()),
    }));
    // Tempo-Button: schaltet reihum Langsam, Normal, Schnell.
    const speed = this.app.config.speed;
    this.buttons.push(new DwellButton({
      x: w - 130, y: 830, r: 70, color: colors[3], icon: icons.speed(speed + 1),
      label: SPEEDS[speed].name,
      onActivate: this.act(() => {
        this.app.config.speed = (speed + 1) % SPEEDS.length;
        this.app.save();
        this.layout();
      }),
    }));
  }
  draw(ctx) {
    title(ctx, this.game.name, this.field.w / 2, 140, 120, this.app.palette()[1]);
    ctx.globalAlpha = this.pulse();
    text(ctx, 'Wähle eine Stufe', this.field.w / 2, 255, 36, '#fff', 'center', 6);
    ctx.globalAlpha = 1;
    super.draw(ctx);
  }
}

export class PlayScene {
  constructor(app, game, level) {
    Object.assign(this, { app, game, level });
    this.score = 0;
    this.shownScore = 0;
    this.duration = game.duration ?? 60;
    this.timeLeft = this.duration;
    this.elapsed = 0;
    this.lives = game.lives ?? null;
    this.countdown = 3.5;
    this.lastTick = 4;
    this.speed = SPEEDS[app.config.speed].factor;
    this.stage = 0;          // steigt im Lauf der Runde von 0 auf STAGES - 1
    this.streak = 0;         // schnelle Treffer in Folge
    this.streakLeft = 0;     // Sekunden, bis die Serie verfällt
    this.streakWindow = 1;
    this.banner = null;      // große Einblendung in der Bildmitte
    this.away = 0;           // Sekunden, seit der Ball zuletzt gesehen wurde
    this.paused = false;     // automatisch, wenn der Ball länger fehlt
    this.userPaused = false; // per Leertaste
    this.resumeIn = 0;
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
      /** 0 bis 3: Das Spiel wird im Lauf der Runde stufenweise schwieriger. */
      get stage() { return scene.stage; },
      /** Faktor 1 bis 1,6 passend zur Stufe, für Tempo und Ähnliches. */
      get ramp() { return 1 + 0.2 * scene.stage; },
      get mult() { return scene.multiplier(); },
      addScore(n) { scene.score = Math.max(0, scene.score + n); },
      /** Punkte für eine gelungene Aktion. Schnelle Treffer in Folge bauen eine Serie auf, die die Punkte vervielfacht. */
      combo(points, window = 2.5) { return scene.combo(points, window); },
      /** Fehler: die Serie ist weg. */
      miss() { scene.streak = 0; scene.streakLeft = 0; },
      addTime(sec) { scene.timeLeft = Math.min(scene.duration, scene.timeLeft + sec); },
      shake(amount) { app.engine.shake(amount); },
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
      x: this.app.engine.field.w - 70, y: 100, r: 42, dwell: 1.5, icon: icons.close,
      onActivate: () => { this.app.sound.select(); this.app.menu(); },
    });
  }
  multiplier() {
    return 1 + STREAK_STEPS.filter((s) => this.streak >= s).length;
  }
  combo(points, window) {
    const before = this.multiplier();
    this.streak = this.streakLeft > 0 ? this.streak + 1 : 1;
    this.streakLeft = this.streakWindow = window;
    const mult = this.multiplier();
    if (mult > before) {
      this.app.sound.streak(mult);
      this.banner = { str: `Serie x${mult}!`, age: 0, color: this.env.palette[0] };
    }
    const awarded = points * mult;
    this.score += awarded;
    return awarded;
  }
  update(dt, ball) {
    if (this.exit.update(dt, ball)) return;
    if (this.banner && (this.banner.age += dt) > 1.4) this.banner = null;
    this.shownScore += (this.score - this.shownScore) * Math.min(1, dt * 10);
    if (this.countdown > 0) {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - 0.5);
      if (n < this.lastTick) {
        this.lastTick = n;
        if (n > 0) this.app.sound.tick(); else this.app.sound.go();
      }
      return;
    }
    // Fehlt der Ball länger (weggerollt, verdeckt), hält das Spiel an, bis er wieder da ist.
    this.away = ball.visible ? 0 : this.away + dt;
    if (!this.paused && this.away > AWAY_PAUSE) {
      this.paused = true;
      this.resumeIn = 1;
    }
    if (this.paused) {
      this.resumeIn = ball.visible ? this.resumeIn - dt : 1;
      if (this.resumeIn <= 0) this.paused = false;
    }
    if (this.paused || this.userPaused) return;

    this.timeLeft -= dt;
    this.elapsed += dt;
    if (this.streakLeft > 0 && (this.streakLeft -= dt) <= 0) this.streak = 0;

    const stage = Math.min(STAGES - 1, Math.floor(this.elapsed / (this.duration / STAGES)));
    if (stage > this.stage) {
      this.stage = stage;
      this.app.sound.stage();
      this.banner = { str: 'Es wird schwieriger!', age: 0, color: '#fff' };
    }

    // Das Tempo lässt die Spielwelt schneller oder langsamer laufen, die Rundenzeit bleibt gleich.
    this.instance.update(dt * this.speed, ball);
    if (this.timeLeft <= 0) this.finish();
  }
  togglePause() {
    this.userPaused = !this.userPaused;
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

    // Zeitbalken: abgerundet, mit Markierungen für die Schwierigkeitsstufen
    const frac = Math.max(0, this.timeLeft / this.duration);
    const bw = w - 60;
    ctx.lineCap = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.moveTo(30, 34); ctx.lineTo(30 + bw, 34); ctx.stroke();
    if (frac > 0) {
      const bar = frac < 0.15 ? '#fff' : c[1];
      ctx.strokeStyle = bar;
      glow(ctx, bar, 14);
      ctx.beginPath(); ctx.moveTo(30, 34); ctx.lineTo(30 + bw * frac, 34); ctx.stroke();
      noGlow(ctx);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (let i = 1; i < STAGES; i++) ctx.fillRect(30 + bw * (1 - i / STAGES) - 2, 26, 4, 16);

    text(ctx, Math.round(this.shownScore), 34, 100, 84, '#fff', 'left', 10);
    const mult = this.multiplier();
    if (mult > 1) {
      // Serien-Anzeige mit ablaufendem Ring
      const x = 290, y = 100;
      ctx.beginPath();
      ctx.arc(x, y, 44, -Math.PI / 2, -Math.PI / 2 + (this.streakLeft / this.streakWindow) * Math.PI * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = c[0];
      glow(ctx, c[0], 14);
      ctx.stroke();
      noGlow(ctx);
      text(ctx, `x${mult}`, x, y + 2, 44, tone(c[0], 75), 'center', 8);
    }
    if (this.lives != null) {
      for (let i = 0; i < (this.game.lives ?? 0); i++) {
        const on = i < this.lives;
        if (on) glow(ctx, c[3], 14);
        heart(ctx, w / 2 - 55 + i * 55, 100, 46, on ? tone(c[3], 68) : 'rgba(255,255,255,0.15)');
        noGlow(ctx);
      }
    }
    this.exit.draw(ctx);

    if (this.banner) {
      const a = this.banner.age;
      const pop = a < 0.15 ? 0.5 + (a / 0.15) * 0.6 : Math.max(1, 1.1 - (a - 0.15));
      ctx.globalAlpha = Math.min(1, (1.4 - a) * 3);
      title(ctx, this.banner.str, w / 2, 300, 80 * pop, this.banner.color);
      ctx.globalAlpha = 1;
    }
    if (this.countdown > 0) {
      const n = Math.ceil(this.countdown - 0.5);
      const beat = 1 + 0.25 * Math.max(0, 1 - ((3.5 - this.countdown) % 1) * 3);
      title(ctx, n > 0 ? String(n) : 'Los!', w / 2, 500, (n > 0 ? 360 : 240) * beat, c[1]);
      if (this.game.hint) text(ctx, this.game.hint, w / 2, 800, 40, '#fff', 'center', 6);
    } else if (this.paused || this.userPaused) {
      ctx.fillStyle = 'rgba(0,0,10,0.6)';
      ctx.fillRect(0, 0, w, 1000);
      title(ctx, 'Pause', w / 2, 440, 160, c[1]);
      text(ctx, this.userPaused ? 'Weiter mit der Leertaste' : 'Leg den Ball ins Feld', w / 2, 580, 44, '#fff', 'center', 6);
    }
  }
}

export class ResultScene extends ButtonScene {
  constructor(app, game, level, score, best, record) {
    super(app);
    Object.assign(this, { game, level, score, best, record });
    this.medals = medals(game, score);
  }
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    this.buttons = [
      new DwellButton({
        x: w / 2 - 200, y: 760, r: 100, color: colors[0], icon: icons.replay, label: 'Nochmal',
        onActivate: this.act(() => this.app.play(this.game, this.level)),
      }),
      new DwellButton({
        x: w / 2 + 200, y: 760, r: 100, color: colors[2], icon: icons.home, label: 'Menü',
        onActivate: this.act(() => this.app.menu()),
      }),
    ];
  }
  draw(ctx) {
    const cx = this.field.w / 2;
    const c = this.app.palette();
    if (this.record) {
      ctx.globalAlpha = this.pulse();
      title(ctx, 'Neuer Rekord!', cx, 110, 100, c[0]);
      ctx.globalAlpha = 1;
    } else {
      title(ctx, 'Geschafft!', cx, 110, 100, c[1]);
    }
    // Drei Sterne, die nacheinander aufleuchten
    for (let i = 0; i < 3; i++) {
      const on = i < this.medals && this.time > 0.3 + i * 0.35;
      const grow = on ? Math.min(1, (this.time - 0.3 - i * 0.35) / 0.2) : 1;
      if (on) glow(ctx, c[1], 26);
      star(ctx, cx + (i - 1) * 150, 255 - (i === 1 ? 22 : 0), 56 * (on ? 0.6 + 0.4 * grow : 1), on ? tone(c[1], 70) : 'rgba(255,255,255,0.13)');
      noGlow(ctx);
    }
    // Die Punktzahl zählt hoch
    const shown = Math.round(this.score * Math.min(1, this.time / 1.2));
    text(ctx, shown, cx, 440, 190, '#fff', 'center', 14);
    if (this.best) text(ctx, `Rekord ${this.best}`, cx, 565, 44, tone(c[1], 75), 'center', 6);
    super.draw(ctx);
  }
}
