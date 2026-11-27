// Training und Duell: mehrere Übungen hintereinander, mit Pausen und Gesamtwertung.
import { DwellButton, icons, text, title, star, glow, noGlow, tone, mascot, Confetti } from './ui.js';
import { ButtonScene } from './scenebase.js';
import { SESSIONS } from './games/index.js';
import { initial, rewardLines } from './scenes.js';

const BREAK = 7; // Sekunden Pause zwischen zwei Übungen

/**
 * Finale eines Trainings: mischt drei Übungen des Trainings in einer Runde.
 * Alle paar Sekunden wechselt die Übung, die Punkte laufen durch.
 */
export function makeFinale(parts) {
  class Finale {
    constructor(env) {
      this.env = env;
      this.parts = parts;
      this.i = -1;
    }
    update(dt, ball) {
      const { env } = this;
      const i = Math.min(parts.length - 1, Math.floor(((env.duration - env.timeLeft) / env.duration) * parts.length));
      if (i !== this.i) {
        this.i = i;
        this.inst = parts[i].create(env);
        env.banner(parts[i].name);
        env.say(parts[i].name);
      }
      this.inst.update(dt, ball);
    }
    draw(ctx) {
      this.inst?.draw(ctx);
    }
  }
  return {
    id: 'finale',
    name: 'Finale',
    hint: 'Alles gemischt – gib noch einmal alles!',
    finale: true,
    duration: 60,
    // Sterne-Schwellen: Mittel der beteiligten Übungen, je Stufe
    medals: [0, 1, 2].map((l) => [0, 1, 2].map((k) => Math.round(parts.reduce((sum, g) => sum + g.medals[l][k] / (g.duration ?? 60), 0) / parts.length * 60))),
    icon(ctx, r) {
      star(ctx, 0, 0, r * 0.42, '#fff');
    },
    create: (env) => new Finale(env),
  };
}

/** Auswahl der Trainingslänge. */
export class SessionSetupScene extends ButtonScene {
  layout() {
    const { app } = this;
    const { w } = this.field;
    const colors = app.palette();
    const kinds = Object.keys(SESSIONS);
    if (app.config.custom?.ids?.length) kinds.push('custom');
    this.buttons = kinds.map((kind, i) => {
      const def = app.sessionDef(kind);
      const count = app.sessionGames(kind).length + 1; // plus Finale
      return new DwellButton({
        x: (w / kinds.length) * (i + 0.5), y: 500, r: Math.min(125, (w / kinds.length) * 0.36),
        color: colors[i % colors.length], icon: kind === 'custom' ? initial('✎') : icons.stars(i + 1), label: def.name,
        sub: `${count} Übungen · ${Math.max(1, Math.round((count * (def.seconds + 10)) / 60))} Min`,
        onActivate: this.act(() => app.levelsFor({
          title: `Training ${def.name}`,
          sub: (level) => {
            const best = app.profile.highscores[`session:${kind}:${level}:${app.config.speed}`];
            return best ? `Rekord ${best}` : '';
          },
          onPick: (level) => app.startSession(kind, level),
          onBack: () => app.sessionSetup(),
        })),
      });
    });
    this.buttons.push(new DwellButton({
      x: 110, y: 870, r: 70, icon: icons.back, onActivate: this.act(() => app.menu()),
    }));
  }
  draw(ctx) {
    title(ctx, 'Training', this.field.w / 2, 140, 110, this.app.palette()[1]);
    text(ctx, 'Alle Schwerpunkte hintereinander, zum Schluss ein Finale', this.field.w / 2, 255, 34, '#fff', 'center', 6);
    super.draw(ctx);
  }
}

/** Pause zwischen zwei Übungen: zeigt, was als Nächstes kommt (und im Duell: wer dran ist). */
export class IntermissionScene extends ButtonScene {
  constructor(app, session) {
    super(app);
    this.session = session;
    this.left = BREAK;
    const entry = session.plan[session.i];
    const who = entry.who != null ? `${session.names[entry.who]} ist dran. ` : '';
    app.voice.say(`${who}${entry.game.finale ? 'Jetzt das Finale!' : `Nächste Übung: ${entry.game.name}.`}`);
  }
  layout() {
    const { w } = this.field;
    this.buttons = [
      // Ball auf "Los" überspringt die Pause
      new DwellButton({
        x: w / 2, y: 800, r: 85, dwell: 0.7, color: this.app.palette()[1], icon: icons.speed(1), label: 'Los',
        onActivate: this.act(() => this.app.playExercise()),
      }),
      new DwellButton({
        x: w - 90, y: 100, r: 46, dwell: 1.5, icon: icons.close, onActivate: this.act(() => this.app.menu()),
      }),
    ];
  }
  update(dt, ball) {
    super.update(dt, ball);
    if (this.app.engine.scene !== this) return; // ein Button hat schon weitergeschaltet
    this.left -= dt;
    if (this.left <= 0) this.app.playExercise();
  }
  draw(ctx) {
    const { w } = this.field;
    const c = this.app.palette();
    const { plan, i, results, names } = this.session;
    const { game, who } = plan[i];
    if (who != null) {
      title(ctx, `${names[who]} ist dran`, w / 2, 90, 60, c[who ? 3 : 1]);
    } else {
      text(ctx, `Übung ${i + 1} von ${plan.length}`, w / 2, 90, 44, tone(c[3], 80), 'center', 6);
      if (results.length) text(ctx, `Bisher ${results.reduce((sum, r) => sum + r.score, 0)} Punkte`, 40, 100, 30, '#fff', 'left', 0);
    }

    // Fortschritt: ein Punkt pro Übung
    plan.forEach((g, k) => {
      ctx.beginPath();
      ctx.arc(w / 2 + (k - (plan.length - 1) / 2) * Math.min(36, (w - 120) / plan.length), 150, k === i ? 11 : 7, 0, Math.PI * 2);
      ctx.fillStyle = k < i ? tone(c[1], 65) : k === i ? '#fff' : 'rgba(255,255,255,0.2)';
      ctx.fill();
    });

    // Symbol der nächsten Übung mit ablaufendem Ring
    ctx.save();
    ctx.translate(w / 2, 360);
    ctx.beginPath();
    ctx.arc(0, 0, 118, -Math.PI / 2, -Math.PI / 2 + (this.left / BREAK) * Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = c[1];
    glow(ctx, c[1], 20);
    ctx.stroke();
    noGlow(ctx);
    game.icon(ctx, 150);
    ctx.restore();
    title(ctx, game.name, w / 2, 545, 90, c[1]);
    if (game.hint) text(ctx, game.hint, w / 2, 630, 36, '#fff', 'center', 6);
    mascot(ctx, 120, 800, 56, 'happy', this.time, this.look);
    super.draw(ctx);
  }
}

/** Auswertung eines Trainings: Gesamtpunkte, Sterne und jede Übung einzeln. */
export class SessionResultScene extends ButtonScene {
  constructor(app, session, best, record, badges) {
    super(app);
    Object.assign(this, { session, best, record });
    this.total = session.results.reduce((sum, r) => sum + r.score, 0);
    this.stars = session.results.reduce((sum, r) => sum + r.stars, 0);
    this.lines = rewardLines({ xp: session.results.reduce((sum, r) => sum + (r.rewards?.xp ?? 0), 0), badges, rankUp: session.results.some((r) => r.rewards?.rankUp) }, app.profile);
    this.party = new Confetti(app.engine.field.w, [...app.palette(), '#fff']);
    app.voice.say(`Training geschafft! ${this.total} Punkte und ${this.stars} Sterne.${record ? ' Neuer Rekord!' : ''}`);
  }
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    this.buttons = [
      new DwellButton({
        x: w - 250, y: 900, r: 60, color: colors[0], icon: icons.replay,
        onActivate: this.act(() => this.app.startSession(this.session.kind, this.session.level)),
      }),
      new DwellButton({
        x: w - 100, y: 900, r: 60, color: colors[2], icon: icons.home,
        onActivate: this.act(() => this.app.menu()),
      }),
    ];
  }
  update(dt, ball) {
    super.update(dt, ball);
    this.party.update(dt);
  }
  draw(ctx) {
    const { w } = this.field;
    const c = this.app.palette();
    const { results } = this.session;
    title(ctx, this.record ? 'Neuer Rekord!' : 'Training geschafft!', w / 2, 90, 80, this.record ? c[0] : c[1]);
    text(ctx, Math.round(this.total * Math.min(1, this.time / 1.5)), w / 2, 200, 120, '#fff', 'center', 12);
    glow(ctx, c[1], 18);
    star(ctx, w / 2 - 185, 293, 20, tone(c[1], 70));
    noGlow(ctx);
    text(ctx, `${this.stars} von ${results.length * 3} Sternen`, w / 2 + 25, 295, 36, tone(c[1], 80), 'center', 6);

    // Liste der Übungen, bei vielen in zwei Spalten
    const cols = results.length > 9 ? 2 : 1;
    const perCol = Math.ceil(results.length / cols);
    const rowH = Math.min(46, 410 / perCol);
    const colW = cols > 1 ? w / 2 - 40 : 560;
    results.forEach((r, k) => {
      const x = (cols > 1 ? 40 : w / 2 - colW / 2) + Math.floor(k / perCol) * (w / 2);
      const y = 355 + (k % perCol) * rowH;
      const size = Math.min(30, rowH * 0.7);
      text(ctx, r.game.name, x, y, size, '#fff', 'left', 0);
      for (let i = 0; i < 3; i++) star(ctx, x + colW - 190 + i * (size * 0.9), y, size * 0.36, i < r.stars ? tone(c[1], 70) : 'rgba(255,255,255,0.15)');
      text(ctx, r.score, x + colW - 20, y, size, tone(c[3], 82), 'right', 0);
    });
    this.lines.forEach((line, i) => text(ctx, line, 180, 800 + i * 38, 28, i ? '#fff' : tone(c[3], 82), 'left', 0));
    mascot(ctx, 90, 880, 54, 'cheer', this.time, this.look);
    super.draw(ctx);
    this.party.draw(ctx);
  }
}

/** Duell: Gegner wählen. Zur Auswahl stehen die anderen Spielerprofile und ein Gast. */
export class DuelSetupScene extends ButtonScene {
  layout() {
    const { app } = this;
    const { w } = this.field;
    const colors = app.palette();
    const others = [...app.config.profiles.filter((p) => p.id !== app.config.current).slice(0, 5), null];
    this.buttons = others.map((p, i) => new DwellButton({
      x: (w / others.length) * (i + 0.5), y: 520, r: Math.min(110, (w / others.length) * 0.36),
      color: colors[i % colors.length], icon: initial(p ? p.name : 'G'), label: p ? p.name : 'Gast',
      onActivate: this.act(() => app.levelsFor({
        title: 'Duell',
        onPick: (level) => app.startDuel(level, p),
        onBack: () => app.duelSetup(),
      })),
    }));
    this.buttons.push(new DwellButton({
      x: 110, y: 870, r: 70, icon: icons.back, onActivate: this.act(() => app.menu()),
    }));
  }
  draw(ctx) {
    const { w } = this.field;
    title(ctx, 'Duell', w / 2, 130, 110, this.app.palette()[1]);
    text(ctx, `${this.app.profile.name} gegen …`, w / 2, 250, 40, '#fff', 'center', 6);
    text(ctx, 'Drei Übungen, jeder spielt jede. Wer mehr Punkte holt, gewinnt.', w / 2, 760, 30, 'rgba(255,255,255,0.8)', 'center', 0);
    super.draw(ctx);
  }
}

/** Ergebnis eines Duells: Übung für Übung nebeneinander, darunter der Sieger. */
export class DuelResultScene extends ButtonScene {
  constructor(app, session) {
    super(app);
    this.session = session;
    this.totals = [0, 1].map((who) => session.results.filter((r) => r.who === who).reduce((sum, r) => sum + r.score, 0));
    this.winner = this.totals[0] === this.totals[1] ? -1 : this.totals[0] > this.totals[1] ? 0 : 1;
    this.party = new Confetti(app.engine.field.w, [...app.palette(), '#fff']);
    app.voice.say(this.winner < 0 ? 'Unentschieden!' : `${session.names[this.winner]} gewinnt!`);
  }
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    this.buttons = [
      new DwellButton({
        x: w / 2 - 110, y: 890, r: 66, color: colors[0], icon: icons.replay,
        onActivate: this.act(() => this.app.startDuel(this.session.level, this.session.players[1])),
      }),
      new DwellButton({
        x: w / 2 + 110, y: 890, r: 66, color: colors[2], icon: icons.home,
        onActivate: this.act(() => this.app.menu()),
      }),
    ];
  }
  update(dt, ball) {
    super.update(dt, ball);
    this.party.update(dt);
  }
  draw(ctx) {
    const { w } = this.field;
    const c = this.app.palette();
    const { names, results } = this.session;
    title(ctx, this.winner < 0 ? 'Unentschieden!' : `${names[this.winner]} gewinnt!`, w / 2, 100, 84, c[1]);
    const xs = [w / 2 - 250, w / 2 + 250];
    names.forEach((name, who) => {
      text(ctx, name, xs[who], 215, 46, who === this.winner ? '#fff' : tone(c[3], 75), 'center', who === this.winner ? 12 : 0);
      text(ctx, Math.round(this.totals[who] * Math.min(1, this.time / 1.5)), xs[who], 310, 110, '#fff', 'center', 10);
    });
    const gamesPlayed = [...new Set(results.map((r) => r.game))];
    gamesPlayed.forEach((game, k) => {
      const y = 440 + k * 70;
      text(ctx, game.name, w / 2, y, 34, tone(c[1], 80), 'center', 0);
      [0, 1].forEach((who) => {
        const r = results.find((x) => x.game === game && x.who === who);
        const other = results.find((x) => x.game === game && x.who !== who);
        text(ctx, r?.score ?? 0, xs[who], y, 40, r && other && r.score > other.score ? '#fff' : 'rgba(255,255,255,0.6)', 'center', 0);
      });
    });
    mascot(ctx, 110, 880, 56, 'cheer', this.time, this.look);
    super.draw(ctx);
    this.party.draw(ctx);
  }
}
