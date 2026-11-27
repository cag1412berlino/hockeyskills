// Der Spielbildschirm: führt eine Übung durch und kümmert sich um alles drumherum –
// Vormachen, Countdown, Zeit, Punkte, Serien, steigende und sich anpassende Schwierigkeit,
// Zufallsereignisse, Pause und die Abrechnung am Ende.
import { BALL_RADIUS } from './engine.js';
import { DwellButton, clickButtons, icons, text, title, caption, heart, star, orb, glow, noGlow, tone } from './ui.js';
import { SPEEDS, scoreKey, medals } from './scenebase.js';
import { Bot, SKILLS, goals } from './bots.js';

const STAGES = 4;                // so oft wird ein Spiel innerhalb einer Runde schwieriger
const STREAK_STEPS = [3, 6, 10]; // ab so vielen schnellen Treffern in Folge gibt es x2, x3, x4
const AWAY_PAUSE = 2.5;          // nach so vielen Sekunden ohne Ball pausiert das Spiel
const DEMO_SECONDS = 5;

// Zufallsereignisse, die eine Runde auflockern
const EVENTS = {
  double: { label: 'Doppelte Punkte!', say: 'Doppelte Punkte!', seconds: 10 },
  slow: { label: 'Zeitlupe!', say: 'Zeitlupe!', seconds: 5 },
  lucky: { label: 'Glücksstern!', say: 'Ein Glücksstern!', seconds: 7 },
};

export class PlayScene {
  /**
   * session (optional): { seconds, label, onFinish(score, stars, rewards) } – eine Übung innerhalb eines Trainings.
   * opts: { events: false } schaltet Zufallsereignisse ab, { player } bucht auf ein anderes Profil (null = Gast).
   */
  constructor(app, game, level, session = null, opts = {}) {
    Object.assign(this, { app, game, level, session, opts });
    this.score = 0;
    this.shownScore = 0;
    this.duration = session?.seconds ?? game.duration ?? 60;
    this.timeLeft = this.duration;
    this.elapsed = 0;
    this.lives = game.lives ?? null;
    this.countdown = 3.5;
    this.lastTick = 4;
    this.speed = SPEEDS[app.config.speed].factor;
    this.stage = 0;          // steigt im Lauf der Runde von 0 auf STAGES - 1
    // Ausgleichsfaktor: bringt alle Übungen auf ein vergleichbares Punkteniveau (ermittelt mit tools/balance.js)
    this.scale = opts.scale ?? game.scale ?? 1;
    this.assist = 1;         // passt das Tempo an: unter 1 nach Fehlern, über 1 bei langen Serien
    this.streak = 0;         // schnelle Treffer in Folge
    this.streakLeft = 0;     // Sekunden, bis die Serie verfällt
    this.streakWindow = 1;
    this.maxMult = 1;
    this.banner = null;      // große Einblendung in der Bildmitte
    this.away = 0;           // Sekunden, seit der Ball zuletzt gesehen wurde
    this.paused = false;     // automatisch, wenn der Ball länger fehlt
    this.userPaused = false; // per Leertaste
    this.resumeIn = 0;
    this.double = 0;         // Sekunden, die "Doppelte Punkte" noch läuft
    this.slow = 0;
    this.lucky = null;       // Glücksstern { x, y, left }

    // Ein bis zwei Zufallsereignisse je Runde, wenn sie lang genug ist
    this.events = [];
    if (opts.events !== false && this.duration >= 30) {
      const kinds = Object.keys(EVENTS);
      for (const [from, to] of [[0.22, 0.42], [0.58, 0.8]]) {
        if (Math.random() < 0.75) this.events.push({ at: this.duration * (from + Math.random() * (to - from)), kind: kinds[Math.floor(Math.random() * kinds.length)] });
      }
    }

    this.env = this.makeEnv();
    this.instance = game.create(this.env);

    // Beim ersten Mal macht ein Geisterball die Übung kurz vor.
    this.demo = null;
    const player = this.player();
    if (app.config.demos && goals[game.id] && player && !player.seen[game.id]) {
      this.demo = { instance: game.create(this.makeEnv(true)), bot: new Bot(SKILLS.medium, { x: app.engine.field.w / 2, y: 600 }), left: DEMO_SECONDS };
      app.voice.say(`So geht's. ${game.hint ?? ''}`);
    } else if (game.hint) {
      app.voice.say(game.hint);
    }
  }

  /** Das Profil, auf das diese Runde gebucht wird (null = Gast). */
  player() {
    return this.opts.player === undefined ? this.app.profile : this.opts.player;
  }

  /** Alles, was ein Spiel von der App bekommt. Für das Vormachen (demo) ohne Wirkung auf Punkte und Ton. */
  makeEnv(demo = false) {
    const scene = this;
    const { app } = this;
    const nothing = () => {};
    const env = {
      field: app.engine.field,
      level: this.level,
      duration: this.duration,
      palette: app.palette(),
      sound: demo ? new Proxy({}, { get: () => nothing }) : app.sound,
      get score() { return demo ? 0 : scene.score; },
      get timeLeft() { return scene.timeLeft; },
      get lives() { return demo ? scene.game.lives : scene.lives; },
      /** 0 bis 3: Das Spiel wird im Lauf der Runde stufenweise schwieriger. */
      get stage() { return demo ? 0 : scene.stage; },
      /** Tempo-Faktor passend zur Stufe und dazu, wie gut es gerade läuft. */
      get ramp() { return demo ? 1 : (1 + 0.2 * scene.stage) * scene.assist; },
      get mult() { return demo ? 1 : scene.multiplier(); },
      addScore: demo ? nothing : (n) => { scene.score = Math.max(0, scene.score + (n > 0 ? n * scene.scale * (scene.double > 0 ? 2 : 1) : n)); },
      /** Punkte für eine gelungene Aktion. Schnelle Treffer in Folge bauen eine Serie auf, die die Punkte vervielfacht. */
      combo: demo ? (points) => points : (points, window = 2.5) => scene.combo(points, window),
      /** Fehler: die Serie ist weg. */
      miss: demo ? nothing : () => scene.miss(),
      addTime: demo ? nothing : (sec) => { scene.timeLeft = Math.min(scene.duration, scene.timeLeft + sec); },
      shake: demo ? nothing : (amount) => app.engine.shake(amount),
      /** Sprachansage, z. B. "Stopp!" */
      say: demo ? nothing : (str) => app.voice.say(str),
      /** Große Einblendung in der Bildmitte. */
      banner: demo ? nothing : (str) => { scene.banner = { str, age: 0, color: '#fff' }; },
      loseLife: demo ? nothing : () => scene.loseLife(),
      end: demo ? nothing : () => scene.finish(),
    };
    return env;
  }

  layout() {
    this.exit = new DwellButton({
      x: this.app.engine.field.w - 72, y: 108, r: 36, dwell: 1.5, icon: icons.close,
      onActivate: () => { this.app.sound.select(); this.app.music.stop(); this.app.menu(); },
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
      this.maxMult = Math.max(this.maxMult, mult);
      this.app.sound.streak(mult);
      this.banner = { str: `Serie x${mult}!`, age: 0, color: this.env.palette[0] };
      // Läuft es richtig gut, zieht das Tempo unauffällig etwas an.
      if (mult >= 3) this.assist = Math.min(1.15, this.assist + 0.04);
    }
    const awarded = Math.max(1, Math.round(points * mult * this.scale * (this.double > 0 ? 2 : 1)));
    this.score += awarded;
    return awarded;
  }

  miss() {
    this.streak = 0;
    this.streakLeft = 0;
    // Nach Fehlern wird es unauffällig etwas langsamer.
    this.assist = Math.max(0.75, this.assist - 0.05);
  }

  loseLife() {
    if (this.lives == null) {
      // Übung ohne Leben (z. B. im Finale): stattdessen Punktabzug
      this.score = Math.max(0, this.score - 10);
      return;
    }
    this.lives -= 1;
    this.assist = Math.max(0.75, this.assist - 0.08);
    if (this.lives <= 0) this.finish();
  }

  trigger(kind) {
    const ev = EVENTS[kind];
    this.banner = { str: ev.label, age: 0, color: this.env.palette[1] };
    this.app.voice.say(ev.say);
    this.app.sound.power();
    if (kind === 'lucky') {
      const f = this.app.engine.field;
      this.lucky = { x: 120 + Math.random() * (f.w - 240), y: 260 + Math.random() * (f.h - 400), left: ev.seconds };
    } else {
      this[kind] = ev.seconds;
    }
  }

  update(dt, ball) {
    if (this.exit.update(dt, ball)) return;
    if (this.banner && (this.banner.age += dt) > 1.4) this.banner = null;
    this.shownScore += (this.score - this.shownScore) * Math.min(1, dt * 10);

    if (this.demo) {
      const d = this.demo;
      d.left -= dt;
      d.instance.update(dt, d.bot.ball);
      d.bot.step(dt, goals[this.game.id](d.instance, d.bot.ball));
      if (d.left <= 0) {
        this.demo = null;
        this.player().seen[this.game.id] = true;
        this.app.save();
      }
      return;
    }

    if (this.countdown > 0) {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - 0.5);
      if (n < this.lastTick) {
        this.lastTick = n;
        if (n > 0) this.app.sound.tick(); else { this.app.sound.go(); this.app.music.start(); }
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
    this.double = Math.max(0, this.double - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.app.music.intensity(this.multiplier());

    const stage = Math.min(STAGES - 1, Math.floor(this.elapsed / (this.duration / STAGES)));
    if (stage > this.stage) {
      this.stage = stage;
      this.app.sound.stage();
      this.banner = { str: 'Es wird schwieriger!', age: 0, color: '#fff' };
    }
    while (this.events.length && this.elapsed >= this.events[0].at) this.trigger(this.events.shift().kind);

    if (this.lucky) {
      this.lucky.left -= dt;
      if (ball.visible && Math.hypot(ball.x - this.lucky.x, ball.y - this.lucky.y) < 55 + BALL_RADIUS) {
        this.score += 25 * (this.double > 0 ? 2 : 1);
        this.app.sound.win();
        this.banner = { str: '+25', age: 0.5, color: this.env.palette[1] };
        this.lucky = null;
      } else if (this.lucky.left <= 0) {
        this.lucky = null;
      }
    }

    // Tempo und Zeitlupe lassen die Spielwelt schneller oder langsamer laufen, die Rundenzeit bleibt gleich.
    this.instance.update(dt * this.speed * (this.slow > 0 ? 0.55 : 1), ball);
    if (this.timeLeft <= 0) this.finish();
  }

  togglePause() {
    this.userPaused = !this.userPaused;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const { app, game, level } = this;
    this.score = Math.round(this.score);
    app.music.stop();
    const stars = medals(game, this.score, level, this.duration);
    const rewards = app.record(
      { game, level, score: this.score, stars, maxMult: this.maxMult, lives: game.lives ?? 0, livesLeft: this.lives ?? 0 },
      this.player(),
    );
    if (this.session) {
      // Im Training zählt die Übung für die Gesamtwertung, nicht für den Einzelrekord.
      this.session.onFinish(this.score, stars, rewards);
      return;
    }
    const key = scoreKey(app, game, level);
    const best = app.profile.highscores[key] || 0;
    const record = this.score > best;
    if (record) {
      app.profile.highscores[key] = this.score;
      app.save();
    }
    app.result({ game, level, score: this.score, best: Math.max(best, this.score), record, stars, rewards });
  }

  onClick(x, y) { clickButtons([this.exit], x, y); }

  draw(ctx) {
    const { w } = this.app.engine.field;
    const c = this.env.palette;

    if (this.demo) {
      // Vormachen: Geisterball spielt, das Kind schaut zu.
      const b = this.demo.bot.ball;
      this.demo.instance.draw(ctx);
      ctx.globalAlpha = 0.9;
      orb(ctx, b.x, b.y, BALL_RADIUS, '#fff');
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,10,0.55)';
      ctx.fillRect(0, 0, w, 150);
      caption(ctx, "So geht's", w / 2, 36, 18, 'rgba(255,255,255,0.7)', 'center');
      title(ctx, this.game.name, w / 2, 78, 52, c[1]);
      if (this.game.hint) text(ctx, this.game.hint, w / 2, 124, 26, 'rgba(255,255,255,0.9)', 'center', 0, 400);
      this.exit.draw(ctx);
      return;
    }
    this.instance.draw(ctx);

    if (this.lucky) {
      const l = this.lucky;
      ctx.globalAlpha = l.left < 2 ? 0.5 + 0.5 * Math.sin(l.left * 16) : 1;
      glow(ctx, '#fff', 30);
      star(ctx, l.x, l.y, 50 + 6 * Math.sin(this.elapsed * 7), '#fff', this.elapsed * 2);
      noGlow(ctx);
      text(ctx, '+25', l.x, l.y + 2, 26, '#0b1d4a', 'center', 0, 600);
      ctx.globalAlpha = 1;
    }

    // Zeitbalken: schmal und abgerundet, mit feinen Marken für die Schwierigkeitsstufen
    const frac = Math.max(0, this.timeLeft / this.duration);
    const bw = w - 80;
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.moveTo(40, 36); ctx.lineTo(40 + bw, 36); ctx.stroke();
    if (frac > 0) {
      const bar = frac < 0.15 ? '#fff' : tone(c[1], 68);
      ctx.strokeStyle = bar;
      glow(ctx, bar, 14);
      ctx.beginPath(); ctx.moveTo(40, 36); ctx.lineTo(40 + bw * frac, 36); ctx.stroke();
      noGlow(ctx);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 1; i < STAGES; i++) ctx.fillRect(40 + bw * (1 - i / STAGES) - 1, 46, 2, 8);

    caption(ctx, 'Punkte', 42, 76, 18);
    text(ctx, Math.round(this.shownScore), 40, 118, 66, '#fff', 'left', 8, 600);
    const mult = this.multiplier();
    if (mult > 1) {
      // Serien-Anzeige mit ablaufendem Ring
      const x = 262, y = 112;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + (this.streakLeft / this.streakWindow) * Math.PI * 2);
      ctx.strokeStyle = tone(c[0], 70);
      glow(ctx, c[0], 14);
      ctx.stroke();
      noGlow(ctx);
      text(ctx, `x${mult}`, x, y + 1, 32, '#fff', 'center', 0, 600);
    }
    if (this.double > 0) caption(ctx, 'Doppelte Punkte', 42, 172, 18, '#fff');
    if (this.slow > 0) caption(ctx, 'Zeitlupe', 42, this.double > 0 ? 200 : 172, 18, tone(c[3], 82));
    if (this.lives != null) {
      for (let i = 0; i < (this.game.lives ?? 0); i++) {
        const on = i < this.lives;
        if (on) glow(ctx, c[3], 12);
        heart(ctx, w / 2 - 44 + i * 44, 110, 32, on ? tone(c[3], 72) : 'rgba(255,255,255,0.14)');
        noGlow(ctx);
      }
    }
    this.exit.draw(ctx);
    if (this.session) caption(ctx, this.session.label, w / 2, 972, 18, 'rgba(255,255,255,0.7)', 'center');

    if (this.banner) {
      const a = this.banner.age;
      const pop = a < 0.15 ? 0.5 + (a / 0.15) * 0.6 : Math.max(1, 1.1 - (a - 0.15));
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.4 - a) * 3));
      title(ctx, this.banner.str, w / 2, 300, 64 * pop, this.banner.color);
      ctx.globalAlpha = 1;
    }
    if (this.countdown > 0) {
      const n = Math.ceil(this.countdown - 0.5);
      const beat = 1 + 0.12 * Math.max(0, 1 - ((3.5 - this.countdown) % 1) * 3);
      // feiner Ring, der sich mit jedem Zähler schließt
      const phase = (3.5 - this.countdown) % 1;
      ctx.beginPath();
      ctx.arc(w / 2, 500, 210, -Math.PI / 2, -Math.PI / 2 + phase * Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = tone(c[1], 70);
      glow(ctx, c[1], 18);
      ctx.stroke();
      noGlow(ctx);
      title(ctx, n > 0 ? String(n) : 'Los!', w / 2, 505, (n > 0 ? 250 : 150) * beat, c[1]);
      if (this.game.hint) text(ctx, this.game.hint, w / 2, 800, 34, 'rgba(255,255,255,0.9)', 'center', 0, 400);
    } else if (this.paused || this.userPaused) {
      ctx.fillStyle = 'rgba(0,0,10,0.6)';
      ctx.fillRect(0, 0, w, 1000);
      title(ctx, 'Pause', w / 2, 450, 120, c[1]);
      text(ctx, this.userPaused ? 'Weiter mit der Leertaste' : 'Leg den Ball ins Feld', w / 2, 560, 34, 'rgba(255,255,255,0.85)', 'center', 0, 400);
    }
  }
}
