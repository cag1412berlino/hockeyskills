// Der Spielbildschirm: führt eine Übung durch und kümmert sich um alles drumherum –
// Vormachen, Countdown, Zeit, Punkte, Serien, steigende und sich anpassende Schwierigkeit,
// Zufallsereignisse, Pause und die Abrechnung am Ende.
import { BALL_RADIUS } from './engine.js';
import { DwellButton, clickButtons, icons, text, title, caption, heart, star, orb, glow, noGlow, tone, mascot, bubble, Confetti } from './ui.js';
import { shout, cheerful } from './coach.js';
import { Show } from './games/spectacle.js';
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
  gold: { label: 'Goldregen! Punkte x3', say: 'Goldregen! Dreifache Punkte!', seconds: 6, rare: true },
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
    // Endlos (nur als einzelne Übung, nicht im Training oder Duell): keine Zeitgrenze, nur Herzen.
    // Es wird immer schneller, bis alle Herzen weg sind.
    // Freies Spiel: ohne Punkte, ohne Herzen, ohne Zeit – einfach weiterspielen, gleichbleibend schwer
    this.free = !!opts.free && !session;
    this.endless = this.free || (!!game.endless && !session && opts.career == null); // Karriere: feste Runde
    if (!session) app.freshRound?.(); // Übungsmodus gilt für die ganze Runde
    this.duration = this.endless ? game.duration ?? 60 : session?.seconds ?? game.duration ?? 60;
    this.timeLeft = this.endless ? Infinity : this.duration;
    this.elapsed = 0;
    this.lives = this.free ? null : this.endless ? game.endless.lives : game.lives ?? null;
    this.pace = 0;           // Endlos: so oft wurde es schon schneller
    this.steady = this.free || (this.endless && !!game.endless.steady); // Dauertraining: endlos, aber gleichbleibend
    // „Nochmal“ startet schneller: kurzer Countdown
    this.countdown = opts.quick ? 1.6 : 3.5;
    this.lastTick = opts.quick ? 2 : 4;
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
    this.lastScore = 0;
    // Jagd auf den eigenen Rekord (nur in der einzelnen Übung, nicht im Training oder Übungsmodus)
    this.best = !session && !this.free && !app.practice?.() ? app.profile?.highscores?.[scoreKey(app, game, level)] || 0 : 0;
    this.beaten = false;
    this.coach = null;       // Zuruf des Trainers: { kind, str, age }
    this.shouted = new Set(); // jeder Anlass höchstens einmal je Runde
    this.lastShout = -10;
    this.misses = 0;         // Fehler in Folge
    this.slowmo = 0;         // Sekunden Zeitlupe nach einem neuen Rekord
    this.tempoFrom = 0;      // seit wann die aktuelle Aufgabe läuft (Spielzeit in Sekunden)
    this.tempo = null;       // letzte Tempo-Wertung { secs, f, age } für die Anzeige
    this.flash = 0;
    this.party = null;       // Konfetti bei Serie x4 und neuem Rekord
    this.show = new Show();  // Goldregen
    this.gold = 0;
    this.lastSecond = 99;
    this.topSpeed = 0;       // schnellster Ball dieser Runde in km/h
    this.speeds = [];
    this.lastLives = this.lives;

    // Ein bis zwei Zufallsereignisse je Runde, wenn sie lang genug ist
    this.events = [];
    if (opts.events !== false && this.duration >= 30) {
      const kinds = Object.keys(EVENTS).filter((k) => !EVENTS[k].rare);
      for (const [from, to] of [[0.22, 0.42], [0.58, 0.8]]) {
        // selten (etwa jede zehnte Runde) kommt der Goldregen
        const kind = Math.random() < 0.06 ? 'gold' : kinds[Math.floor(Math.random() * kinds.length)];
        if (Math.random() < 0.75) this.events.push({ at: this.duration * (from + Math.random() * (to - from)), kind });
      }
    }

    // Spielfarben kommen aus der Themenwelt, die Leitfarbe der Anzeigen vom Schwerpunkt der Übung.
    this.colors = app.worldPalette?.() ?? app.palette();
    this.accent = app.accentOf?.(game) ?? this.colors[1];

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
      topic: this.game.topic ?? null,
      /** Linkshänder: Vorhand und Rückhand gespiegelt. */
      lefty: !!this.player()?.lefty,
      duration: this.duration,
      palette: this.colors,
      sound: demo ? new Proxy({}, { get: () => nothing }) : app.sound,
      get score() { return demo ? 0 : scene.score; },
      get timeLeft() { return scene.timeLeft; },
      get lives() { return demo ? scene.game.lives : scene.lives; },
      /** Endlos: Die Übung läuft, bis alle Herzen weg sind, und wird ständig schneller. */
      get endless() { return !demo && scene.endless; },
      /** 0 bis 3: Das Spiel wird im Lauf der Runde stufenweise schwieriger. */
      get stage() { return demo ? 0 : scene.stage; },
      /** Tempo-Faktor passend zur Stufe und dazu, wie gut es gerade läuft. */
      get ramp() { return demo ? 1 : (scene.endless && !scene.steady ? 1 + 0.011 * scene.elapsed : 1 + 0.2 * scene.stage) * scene.assist; },
      get mult() { return demo ? 1 : scene.multiplier(); },
      addScore: demo ? nothing : (n) => { scene.score = Math.max(0, scene.score + (n > 0 ? n * scene.scale * scene.bonus() : n)); },
      /** Punkte für eine gelungene Aktion. Schnelle Treffer in Folge bauen eine Serie auf, die die Punkte vervielfacht. */
      // tempo = { par, took }: par = Sekunden für eine gute Ausführung, took = gebrauchte Zeit
      // (ohne took: seit der letzten gewerteten Aufgabe). Schneller gibt mehr, langsamer deutlich weniger.
      combo: demo ? (points) => points : (points, window = 2.5, tempo = null) => scene.combo(points, window, tempo),
      /** Fehler: die Serie ist weg. */
      miss: demo ? nothing : () => scene.miss(),
      addTime: demo ? nothing : (sec) => { if (Number.isFinite(scene.timeLeft)) scene.timeLeft = Math.min(scene.duration, scene.timeLeft + sec); }, // endlos: keine Zeit
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
      // Im Dauertraining heißt „X“: fertig für heute – dann wird abgerechnet.
      onActivate: () => {
        this.app.sound.select();
        if (this.free) { this.app.music.stop(); return this.opts.back ? this.opts.back() : this.app.menu(); }
        if (this.steady && this.elapsed > 10 && !this.demo) return this.finish();
        this.app.music.stop();
        this.app.menu();
      },
    });
  }

  /** Ereignis-Bonus: Goldregen x3, doppelte Punkte x2. */
  bonus() {
    return this.gold > 0 ? 3 : this.double > 0 ? 2 : 1;
  }

  multiplier() {
    return 1 + STREAK_STEPS.filter((s) => this.streak >= s).length;
  }

  combo(points, window, tempo = null) {
    const speed = tempo ? this.tempoFactor(tempo) : 1;
    const before = this.multiplier();
    this.streak = this.streakLeft > 0 ? this.streak + 1 : 1;
    this.streakLeft = this.streakWindow = window;
    const mult = this.multiplier();
    this.misses = 0;
    // Jeder Treffer einer Serie klingt einen Halbton höher – man hört, wie die Serie wächst.
    if (this.streak > 1) this.app.sound.tone(392 * 2 ** (Math.min(this.streak, 14) / 12), 0.08, { type: 'triangle', vol: 0.1 });
    if (mult > before) {
      this.maxMult = Math.max(this.maxMult, mult);
      this.app.sound.streak(mult);
      if (mult === 3) this.shoutOnce('streak3');
      if (mult >= 4) {
        this.shoutOnce('streak4');
        this.celebrate();
      }
      this.banner = { str: `Serie x${mult}!`, age: 0, color: this.env.palette[0] };
      // Läuft es richtig gut, zieht das Tempo unauffällig etwas an.
      if (mult >= 3) this.assist = Math.min(1.15, this.assist + 0.04);
    }
    const awarded = Math.max(1, Math.round(points * speed * mult * this.scale * this.bonus()));
    this.score += awarded;
    return awarded;
  }

  /**
   * Tempo-Faktor nach Sekunden: in der Richtzeit x1, doppelt so schnell x2, halb so schnell x0,5,
   * höchstens x2,5 und mindestens x0,25. Wird kurz unter der Punktzahl angezeigt.
   */
  tempoFactor({ par, took }) {
    const secs = Math.max(0.05, took ?? this.elapsed - this.tempoFrom);
    this.tempoFrom = this.elapsed;
    const f = Math.max(0.25, Math.min(2.5, par / secs));
    this.tempo = { secs, f, age: 0 };
    return f;
  }

  /** Der Trainer ruft etwas herein: höchstens einmal je Anlass und Runde, nicht zu dicht hintereinander. */
  shoutOnce(kind) {
    if (this.demo || this.shouted.has(kind) || this.elapsed - this.lastShout < 5) return;
    const str = shout(kind);
    if (!str) return;
    this.shouted.add(kind);
    this.lastShout = this.elapsed;
    this.coach = { kind, str, age: 0 };
    this.app.voice?.say?.(str);
  }

  /** Konfetti und ein kurzer Ruck: für die ganz großen Momente. */
  celebrate() {
    const { w } = this.app.engine.field;
    this.party = new Confetti(w, [...this.colors, '#fff'], 70);
    this.partyLeft = 3;
    this.app.engine.shake?.(14);
  }

  miss() {
    if (++this.misses === 3) this.shoutOnce('misses');
    this.streak = 0;
    this.streakLeft = 0;
    // Nach Fehlern wird es unauffällig etwas langsamer.
    this.assist = Math.max(0.75, this.assist - 0.05);
  }

  loseLife() {
    if (this.free) return; // freies Spiel: keine Herzen, kein Abzug
    if (this.lives == null) {
      // Übung ohne Leben (z. B. im Finale): stattdessen Punktabzug
      this.score = Math.max(0, this.score - 10);
      return;
    }
    this.lives -= 1;
    if (this.lives > 0) this.shoutOnce('life');
    this.assist = Math.max(0.75, this.assist - 0.08);
    if (this.lives <= 0) this.finish();
  }

  trigger(kind) {
    const ev = EVENTS[kind];
    this.banner = { str: ev.label, age: 0, color: this.env.palette[1] };
    this.app.voice.say(ev.say);
    this.app.sound.power();
    if (kind === 'gold') this.show.coins(this.app.engine.field, 70);
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
    if (this.best > 0 && !this.beaten && this.score > this.best) {
      this.beaten = true;
      this.banner = { str: 'Neuer Rekord!', age: 0, color: '#7dffb0' };
      this.app.sound.power?.();
      // Der große Moment: kurze Zeitlupe, heller Blitz, Konfetti
      this.slowmo = 0.7;
      this.flash = 1;
      this.celebrate();
      this.shoutOnce('record');
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.slowmo = Math.max(0, this.slowmo - dt);
    if (this.coach && (this.coach.age += dt) > 2.6) this.coach = null;
    this.show.update(dt);
    if (this.party) {
      this.party.update(dt);
      if ((this.partyLeft -= dt) <= 0) this.party = null;
    }
    // Punktzahl federt kurz auf, wenn Punkte dazukommen; ein verlorenes Herz zuckt.
    if (this.score > this.lastScore) this.bump = 1;
    this.lastScore = this.score;
    this.bump = Math.max(0, (this.bump || 0) - dt * 5);
    if (this.lives != null && this.lives < this.lastLives) this.heartHit = 1;
    this.lastLives = this.lives;
    this.heartHit = Math.max(0, (this.heartHit || 0) - dt * 2.5);
    this.shownScore += (this.score - this.shownScore) * Math.min(1, dt * 10);
    if (this.tempo && (this.tempo.age += dt) > 1.8) this.tempo = null;

    if (this.demo) {
      const d = this.demo;
      d.left -= dt;
      d.instance.update(dt, d.bot.ball);
      d.bot.step(dt, goals[this.game.id](d.instance, d.bot.ball));
      if (d.left <= 0) {
        this.demo = null;
        if (!this.app.practice?.()) { this.player().seen[this.game.id] = true; this.app.save(); }
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
    this.measure(ball);
    if (this.streakLeft > 0 && (this.streakLeft -= dt) <= 0) this.streak = 0;
    this.double = Math.max(0, this.double - dt);
    this.gold = Math.max(0, (this.gold || 0) - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.app.music.intensity(this.multiplier());
    // Je höher die Serie, desto farbiger und lebendiger wird die Welt.
    this.app.engine.bloomTo?.(0.25 + 0.25 * (this.multiplier() - 1));

    if (this.endless && !this.steady) {
      // Alle 20 Sekunden wird es schneller – ohne Ende
      const pace = Math.floor(this.elapsed / 20);
      if (pace > this.pace) {
        this.pace = pace;
        this.app.sound.stage();
        this.banner = { str: pace === 1 ? 'Schneller!' : pace < 4 ? 'Noch schneller!' : `Tempo ${pace + 1}!`, age: 0, color: '#fff' };
      }
    }
    const stage = this.steady ? 0 : Math.min(STAGES - 1, Math.floor(this.elapsed / ((this.endless ? 60 : this.duration) / STAGES)));
    if (stage > this.stage) {
      this.stage = stage;
      this.app.sound.stage();
      this.banner = { str: 'Es wird schwieriger!', age: 0, color: '#fff' };
    }
    // Zur Halbzeit sagt der Trainer, wie man zum eigenen Rekord steht; am Ende feuert er an.
    if (this.best > 0 && !this.beaten && this.elapsed >= this.duration / 2) {
      this.shoutOnce(this.score >= this.best / 2 ? 'ahead' : 'behind');
    }
    if (this.duration >= 30 && this.timeLeft <= 10) this.shoutOnce('endspurt');
    // Die letzten fünf Sekunden ticken hörbar herunter.
    const second = Math.ceil(this.timeLeft);
    if (second < this.lastSecond) {
      this.lastSecond = second;
      if (second >= 1 && second <= 5) this.app.sound.tick();
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
    this.instance.update(dt * this.speed * (this.slow > 0 ? 0.55 : 1) * (this.slowmo > 0 ? 0.3 : 1), ball);
    if (this.timeLeft <= 0) this.finish();
  }

  /**
   * Tempo messen: Ballgeschwindigkeit in km/h, umgerechnet mit der eingestellten Feldgröße.
   * Gezählt wird nur, was mehrere Bilder am Stück so schnell war – ein Zucken der Kamera zählt nicht.
   */
  measure(ball) {
    if (!ball.visible) { this.speeds.length = 0; return; }
    const meters = this.app.config.fieldMeters || 2;
    const kmh = Math.hypot(ball.vx || 0, ball.vy || 0) * (meters / 1000) * 3.6;
    this.speeds.push(kmh);
    if (this.speeds.length > 4) this.speeds.shift();
    if (this.speeds.length === 4) {
      const steady = Math.min(...this.speeds);
      if (steady < 60) this.topSpeed = Math.max(this.topSpeed, steady);
    }
  }

  togglePause() {
    this.userPaused = !this.userPaused;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    if (this.free) {
      // freies Spiel: nichts wird gewertet, zurück zur Stufenwahl
      this.app.music.stop();
      if (this.opts.back) this.opts.back(); else this.app.menu();
      return;
    }
    const { app, game, level } = this;
    this.score = Math.round(this.score);
    app.music.stop();
    // Dauertraining: Sterne nach der geübten Zeit, so zählt fleißiges Üben genauso wie eine Runde
    const speedRecord = !app.practice?.() && this.topSpeed > 3 && this.topSpeed > (this.player()?.stats?.topSpeed || 0);
    const stars = this.steady ? (this.elapsed < 20 ? 0 : medals(game, this.score, level, this.elapsed)) : medals(game, this.score, level, this.endless ? Math.max(game.duration ?? 60, this.elapsed) : this.duration);
    // Karriere zuerst verbuchen, damit ein Karriere-Abzeichen gleich mit dieser Runde kommt
    const career = this.opts.career != null && !this.session ? app.careerRecord?.(this.opts.career, stars) ?? null : null;
    const rewards = app.record(
      { game, level, score: this.score, stars, maxMult: this.maxMult, lives: this.endless ? 0 : game.lives ?? 0, livesLeft: this.lives ?? 0, topSpeed: this.topSpeed },
      this.player(),
    );
    if (this.session) {
      // Im Training zählt die Übung für die Gesamtwertung, nicht für den Einzelrekord.
      this.session.onFinish(this.score, stars, rewards);
      return;
    }
    const key = scoreKey(app, game, level);
    const best = app.profile.highscores[key] || 0;
    const record = this.score > best && !app.practice?.();
    if (record) {
      // Hielt jemand anderes bisher den Rekord dieser Übung? Dann erfährt er es beim nächsten Start.
      const others = (app.config.profiles ?? []).filter((q) => q !== app.profile);
      const top = Math.max(0, ...others.map((q) => q.highscores?.[key] || 0));
      if (top > best && this.score > top) {
        for (const q of others.filter((x) => x.highscores[key] === top)) {
          q.news = [...(q.news ?? []), `${app.profile.name} hat deinen Rekord bei „${game.name}“ geknackt – hol ihn dir zurück!`].slice(-5);
        }
      }
      app.profile.highscores[key] = this.score;
      app.save();
    }
    app.result({ game, level, score: this.score, best: record ? this.score : best, record, stars, rewards, career, held: this.endless ? this.elapsed : null, heldLabel: this.steady ? 'Geübt' : 'Durchgehalten', topSpeed: this.topSpeed, speedRecord });
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
      title(ctx, this.game.name, w / 2, 78, 52, this.accent);
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

    if (this.endless) {
      // Endlos: statt Zeitbalken die Zeit, die man schon durchhält
      const sec = Math.floor(this.elapsed);
      text(ctx, `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, w / 2, 40, 34, '#fff', 'center', 8, 600);
    }
    // Zeitbalken: schmal und abgerundet, mit feinen Marken für die Schwierigkeitsstufen
    const frac = this.endless ? 0 : Math.max(0, this.timeLeft / this.duration);
    const bw = w - 80;
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    if (!this.endless) { ctx.beginPath(); ctx.moveTo(40, 36); ctx.lineTo(40 + bw, 36); ctx.stroke(); }
    if (frac > 0) {
      const bar = frac < 0.15 ? '#fff' : tone(this.accent, 68);
      ctx.strokeStyle = bar;
      glow(ctx, bar, 14);
      ctx.beginPath(); ctx.moveTo(40, 36); ctx.lineTo(40 + bw * frac, 36); ctx.stroke();
      noGlow(ctx);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    if (!this.endless) for (let i = 1; i < STAGES; i++) ctx.fillRect(40 + bw * (1 - i / STAGES) - 1, 46, 2, 8);

    if (this.free) {
      caption(ctx, 'Freies Spiel', 42, 76, 18);
      text(ctx, 'ohne Punkte', 40, 112, 30, 'rgba(255,255,255,0.75)', 'left', 6, 600);
    } else {
      caption(ctx, 'Punkte', 42, 76, 18);
      if (this.best > 0) {
        // Liegt man gerade vor oder hinter dem Tempo des eigenen Rekords?
        const pace = this.endless ? this.best : this.best * Math.min(1, this.elapsed / this.duration);
        const ahead = this.score >= pace;
        caption(ctx, this.beaten ? `Rekord ${Math.round(this.best)} geknackt!` : `Rekord ${Math.round(this.best)} · ${ahead ? '▲ du liegst vorn' : '▼ du liegst zurück'}`,
          w / 2, this.endless ? 78 : 76, 18, this.beaten || ahead ? '#7dffb0' : 'rgba(255,255,255,0.65)', 'center');
      }
      text(ctx, Math.round(this.shownScore), 40, 118, 66 * (1 + 0.14 * (this.bump || 0)), '#fff', 'left', 8, 600);
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
        ctx.strokeStyle = tone(this.accent, 70);
        glow(ctx, this.accent, 14);
        ctx.stroke();
        noGlow(ctx);
        text(ctx, `x${mult}`, x, y + 1, 32, '#fff', 'center', 0, 600);
      }
      if (this.tempo) {
        // Tempo der letzten Aufgabe: Sekunden und was sie gebracht haben
        const { secs, f, age } = this.tempo;
        ctx.globalAlpha = Math.min(1, (1.8 - age) * 3);
        const color = f >= 1.2 ? '#7dffb0' : f <= 0.8 ? '#ff9a8a' : '#fff';
        const label = `${secs.toFixed(1).replace('.', ',')} s · ${f >= 1.2 ? 'Tempo' : f <= 0.8 ? 'zu langsam' : 'okay'} x${f.toFixed(1).replace('.', ',')}`;
        text(ctx, label, w / 2, 118, 30 * (1 + 0.15 * Math.max(0, 1 - age * 4)), color, 'center', 6, 600);
        ctx.globalAlpha = 1;
      }
    }
    if (this.gold > 0) caption(ctx, 'Goldregen x3', 42, 172, 18, '#ffd76a');
    else if (this.double > 0) caption(ctx, 'Doppelte Punkte', 42, 172, 18, '#fff');
    if (this.slow > 0) caption(ctx, 'Zeitlupe', 42, this.double > 0 ? 200 : 172, 18, tone(c[3], 82));
    if (this.lives != null) {
      for (let i = 0; i < (this.endless ? this.game.endless.lives : this.game.lives ?? 0); i++) {
        const on = i < this.lives;
        // das gerade verlorene Herz zuckt und verblasst
        const lost = i === this.lives && this.heartHit > 0;
        const wobble = lost ? Math.sin(this.heartHit * 30) * 6 * this.heartHit : 0;
        if (on) glow(ctx, '#fff', 10);
        heart(ctx, w / 2 - 44 + i * 44 + wobble, 110, lost ? 32 + 14 * this.heartHit : 32, on ? '#fff' : lost ? `rgba(255,255,255,${0.14 + 0.8 * this.heartHit})` : 'rgba(255,255,255,0.14)');
        noGlow(ctx);
      }
    }
    this.exit.draw(ctx);
    if (this.session) caption(ctx, this.session.label, w / 2, 972, 18, 'rgba(255,255,255,0.7)', 'center');

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(190,255,220,${0.3 * this.flash})`;
      ctx.fillRect(0, 0, w, 1000);
    }
    this.party?.draw(ctx);
    this.show.draw(ctx, this.app.engine.field, this.app.engine.ball);
    if (this.coach) {
      // Der Trainer schaut kurz unten links herein und ruft etwas zu
      const a = this.coach.age;
      const slide = Math.min(1, a / 0.2) * Math.min(1, (2.6 - a) / 0.3);
      ctx.save();
      ctx.globalAlpha = Math.max(0, slide);
      ctx.translate(0, (1 - slide) * 90);
      mascot(ctx, 62, 925, 44, cheerful(this.coach.kind) ? 'cheer' : 'happy', this.elapsed, null);
      bubble(ctx, this.coach.str, 122, 905, 24);
      ctx.restore();
    }
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
      ctx.strokeStyle = tone(this.accent, 70);
      glow(ctx, this.accent, 18);
      ctx.stroke();
      noGlow(ctx);
      title(ctx, n > 0 ? String(n) : 'Los!', w / 2, 505, (n > 0 ? 250 : 150) * beat, this.accent);
      if (this.game.hint) text(ctx, this.game.hint, w / 2, 800, 34, 'rgba(255,255,255,0.9)', 'center', 0, 400);
    } else if (this.paused || this.userPaused) {
      ctx.fillStyle = 'rgba(0,0,10,0.6)';
      ctx.fillRect(0, 0, w, 1000);
      title(ctx, 'Pause', w / 2, 450, 120, c[1]);
      text(ctx, this.userPaused ? 'Weiter mit der Leertaste' : 'Leg den Ball ins Feld', w / 2, 560, 34, 'rgba(255,255,255,0.85)', 'center', 0, 400);
    }
  }
}
