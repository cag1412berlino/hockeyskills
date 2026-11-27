// Die Bildschirme rund ums Spielen: Hauptmenü, Schwerpunkt, Stufenwahl, Ergebnis, Profil.
import { DwellButton, icons, text, title, caption, star, glow, noGlow, tone, mascot, bubble, Confetti } from './ui.js';
import { BRAND } from './config.js';
import { ButtonScene, grid, medals, scoreKey, LEVEL_NAMES, SPEEDS } from './scenebase.js';
import { rankOf, BADGES } from './profile.js';

export { PlayScene } from './play.js';
export { medals } from './scenebase.js';

/** Stoppuhr als Symbol für das Training. */
function stopwatch(ctx, r) {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * 0.06, r * 0.36, 0, Math.PI * 2);
  ctx.moveTo(0, r * 0.06); ctx.lineTo(0, -r * 0.16);
  ctx.moveTo(0, r * 0.06); ctx.lineTo(r * 0.14, r * 0.14);
  ctx.moveTo(-r * 0.1, -r * 0.46); ctx.lineTo(r * 0.1, -r * 0.46);
  ctx.moveTo(0, -r * 0.46); ctx.lineTo(0, -r * 0.3);
  ctx.stroke();
}

/** Zwei Kugeln gegenüber als Symbol für das Duell. */
function versus(ctx, r) {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.06;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * r * 0.3, 0, r * 0.17, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, -r * 0.2); ctx.lineTo(r * 0.05, r * 0.2);
  ctx.stroke();
}

/** Sonne als Symbol für die Übung des Tages (um das Symbol der Übung herum). */
const sunny = (icon) => (ctx, r) => {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.05;
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
    ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
    ctx.stroke();
  }
  ctx.save();
  ctx.scale(0.8, 0.8);
  icon(ctx, r);
  ctx.restore();
};

/** Anfangsbuchstabe eines Spielers als Symbol. */
export const initial = (name) => (ctx, r) => text(ctx, (name[0] ?? '?').toUpperCase(), 0, r * 0.06, r * 1.1, '#fff', 'center', 0);

/** Rang-Leiste: Rangname, Balken bis zum nächsten Rang, Punkte. */
export function drawRank(ctx, profile, x, y, width, colors) {
  const rank = rankOf(profile.xp);
  text(ctx, rank.name, x, y, 28, tone(colors[1], 82), 'left', 0, 600);
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath(); ctx.moveTo(x, y + 36); ctx.lineTo(x + width, y + 36); ctx.stroke();
  ctx.strokeStyle = colors[1];
  glow(ctx, colors[1], 12);
  ctx.beginPath(); ctx.moveTo(x, y + 36); ctx.lineTo(x + Math.max(1, width * rank.progress), y + 36); ctx.stroke();
  noGlow(ctx);
  text(ctx, rank.next ? `${profile.xp} / ${rank.next}` : `${profile.xp} Punkte`, x + width, y, 20, 'rgba(255,255,255,0.7)', 'right', 0, 400);
}

export class MenuScene extends ButtonScene {
  layout() {
    const { app } = this;
    const { w } = this.field;
    const colors = app.palette();
    const daily = app.daily();
    const items = [
      ...app.categories.map((cat) => ({
        name: cat.name, icon: cat.games[0].icon, color: app.accentOf(cat),
        sub: cat.games.length > 1 ? `${cat.games.length} Übungen` : '',
        go: () => app.category(cat),
      })),
      { name: 'Training', icon: stopwatch, sub: 'alles am Stück', go: () => app.sessionSetup(), white: true },
      { name: 'Heute', icon: sunny(daily.icon), sub: app.profile.daily === app.today() ? daily.name : `${daily.name} · Punkte x2`, go: () => app.levels(daily), white: true },
      { name: 'Duell', icon: versus, sub: 'zu zweit', go: () => app.duelSetup(), white: true },
    ];
    this.buttons = grid(items, w, (item, x, y, r, i) => new DwellButton({
      x, y: y + 10, r,
      color: item.white ? '#fff' : item.color ?? colors[i % colors.length],
      icon: item.icon, label: item.name, sub: item.sub,
      onActivate: this.act(item.go),
    }));
    // Spieler-Button oben rechts: führt zu Rang und Abzeichen
    this.buttons.push(new DwellButton({
      x: w - 82, y: 84, r: 50, color: colors[3], icon: initial(app.profile.name),
      onActivate: this.act(() => app.profileScene()),
    }));
  }

  /** Was Skilli gerade sagt: wechselt alle paar Sekunden. */
  line() {
    const { app } = this;
    const p = app.profile;
    const lines = [`Hallo ${p.name}!`, 'Lege den Ball auf einen Kreis'];
    if (p.daily !== app.today()) lines.push(`Heute doppelte Punkte bei „${app.daily().name}“`);
    if (p.days.streak >= 2) lines.push(`${p.days.streak} Tage in Folge – stark!`);
    return lines[Math.floor(this.time / 4) % lines.length];
  }

  draw(ctx) {
    // Kopf: Vereinslogo (falls vorhanden) links, daneben der Name in zwei Zeilen
    const { app } = this;
    const logo = app.logo;
    const { w } = this.field;
    const c = app.palette();
    const size = 150;
    const cx = logo ? w / 2 + size / 2 + 10 : w / 2;
    if (logo) {
      const k = Math.min(size / logo.width, size / logo.height);
      const lw = logo.width * k, lh = logo.height * k;
      ctx.drawImage(logo, cx - 330 - size / 2 - lw / 2, 118 - lh / 2, lw, lh);
    }
    title(ctx, 'Blau-Weiss', cx, 78, 66, '#fff');
    title(ctx, 'Skiller Academy', cx, 160, 66, c[0]);
    caption(ctx, `${BRAND.club}  ·  ${app.profile.name}, ${rankOf(app.profile.xp).name}`, cx, 222, 19, tone(c[3], 82), 'center');

    // Buttons leicht versetzt schweben lassen (der Spieler-Button oben rechts bleibt ruhig)
    this.buttons.forEach((b, i) => {
      ctx.save();
      if (i < this.buttons.length - 1) ctx.translate(0, Math.sin(this.time * 1.6 + i * 1.1) * 5);
      b.draw(ctx);
      ctx.restore();
    });
    mascot(ctx, 70, 945, 36, 'happy', this.time, this.look);
    bubble(ctx, this.line(), 125, 925, 26);
  }
}

/** Die Übungen eines Schwerpunkts. */
export class CategoryScene extends ButtonScene {
  constructor(app, cat) {
    super(app);
    this.cat = cat;
  }
  layout() {
    const color = this.app.accentOf(this.cat);
    this.buttons = grid(this.cat.games, this.field.w, (game, x, y, r) => new DwellButton({
      x, y: y - 40, r,
      color,
      icon: game.icon, label: game.name,
      sub: '★'.repeat(this.app.profile.stats.best[game.id] || 0),
      onActivate: this.act(() => this.app.levels(game)),
    }));
    this.buttons.push(new DwellButton({
      x: 110, y: 890, r: 62, icon: icons.back, onActivate: this.act(() => this.app.menu()),
    }));
  }
  draw(ctx) {
    title(ctx, this.cat.name, this.field.w / 2, 130, 86, this.app.accentOf(this.cat));
    super.draw(ctx);
  }
}

/** Stufenwahl. opts: title, sub(level) = Zeile unter dem Button, onPick(level), onBack(). */
export class LevelScene extends ButtonScene {
  constructor(app, opts) {
    super(app);
    this.opts = opts;
  }
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    const r = Math.min(140, w * 0.125);
    this.buttons = [1, 2, 3].map((level) => new DwellButton({
      x: (w / 3) * (level - 0.5), y: 480, r,
      color: this.opts.color ?? colors[level - 1],
      icon: icons.stars(level), label: LEVEL_NAMES[level - 1],
      sub: this.opts.sub?.(level) ?? '',
      onActivate: this.act(() => this.opts.onPick(level)),
    }));
    this.buttons.push(new DwellButton({
      x: 110, y: 870, r: 70, icon: icons.back, onActivate: this.act(() => this.opts.onBack()),
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
    title(ctx, this.opts.title, this.field.w / 2, 140, 86, this.opts.color ?? this.app.palette()[1]);
    ctx.globalAlpha = this.pulse();
    caption(ctx, 'Wähle eine Stufe', this.field.w / 2, 240, 22, '#fff', 'center');
    ctx.globalAlpha = 1;
    super.draw(ctx);
  }
}

/** Bestwert-Zeile für die Stufenwahl eines Spiels. */
export function bestLabel(app, game, level) {
  const best = app.profile.highscores[scoreKey(app, game, level)];
  return best ? `${'★'.repeat(medals(game, best, level))} Rekord ${best}`.trim() : '';
}

/** Zeilen für das, was eine Runde eingebracht hat: Punkte fürs Profil, Rangaufstieg, neue Abzeichen. */
export function rewardLines(rewards, profile) {
  if (!rewards || !profile) return [];
  const lines = [`+${rewards.xp} Punkte${rewards.dailyBonus ? ' (Tagesbonus x2)' : ''}`];
  if (rewards.rankUp) lines.push(`Aufstieg: ${rankOf(profile.xp).name}!`);
  for (const b of rewards.badges ?? []) lines.push(`Neues Abzeichen: ${b.name}`);
  return lines;
}

/** Ergebnis einer einzelnen Übung. r = { game, level, score, best, record, stars, rewards } */
export class ResultScene extends ButtonScene {
  constructor(app, r) {
    super(app);
    Object.assign(this, r);
    this.lines = rewardLines(r.rewards, app.profile);
    this.accent = app.accentOf(r.game) ?? app.palette()[1];
    this.party = r.record || r.stars === 3 || r.rewards?.rankUp ? new Confetti(app.engine.field.w, [...app.worldPalette(), '#fff']) : null;
    const said = [r.record ? 'Neuer Rekord!' : 'Geschafft!', `${r.score} Punkte.`];
    if (r.stars) said.push(r.stars === 1 ? 'Ein Stern.' : `${r.stars} Sterne.`);
    if (r.rewards?.rankUp) said.push(`Du bist jetzt ${rankOf(app.profile.xp).name}!`);
    for (const b of r.rewards?.badges ?? []) said.push(`Neues Abzeichen: ${b.name}.`);
    app.voice.say(said.join(' '));
  }
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    this.buttons = [
      new DwellButton({
        x: w - 280, y: 835, r: 72, color: colors[0], icon: icons.replay, label: 'Nochmal',
        onActivate: this.act(() => this.app.play(this.game, this.level)),
      }),
      new DwellButton({
        x: w - 105, y: 835, r: 72, color: colors[2], icon: icons.home, label: 'Menü',
        onActivate: this.act(() => this.app.menu()),
      }),
    ];
  }
  update(dt, ball) {
    super.update(dt, ball);
    this.party?.update(dt);
  }
  draw(ctx) {
    const cx = this.field.w / 2;
    const c = this.app.palette();
    if (this.record) {
      ctx.globalAlpha = this.pulse();
      title(ctx, 'Neuer Rekord!', cx, 100, 75, c[0]);
      ctx.globalAlpha = 1;
    } else {
      title(ctx, 'Geschafft!', cx, 100, 75, c[1]);
    }
    // Drei Sterne, die nacheinander aufleuchten
    for (let i = 0; i < 3; i++) {
      const on = i < this.stars && this.time > 0.3 + i * 0.35;
      const grow = on ? Math.min(1, (this.time - 0.3 - i * 0.35) / 0.2) : 1;
      if (on) glow(ctx, this.accent, 26);
      star(ctx, cx + (i - 1) * 140, 230 - (i === 1 ? 20 : 0), 52 * (on ? 0.6 + 0.4 * grow : 1), on ? tone(this.accent, 70) : 'rgba(255,255,255,0.13)');
      noGlow(ctx);
    }
    // Die Punktzahl zählt hoch
    text(ctx, Math.round(this.score * Math.min(1, this.time / 1.2)), cx, 395, 150, '#fff', 'center', 10, 600);
    if (this.best) caption(ctx, `Rekord ${this.best}`, cx, 500, 22, tone(c[1], 80), 'center');

    // Was es fürs Profil gab, erscheint Zeile für Zeile
    this.lines.forEach((line, i) => {
      if (this.time < 1.2 + i * 0.5) return;
      text(ctx, line, cx, 575 + i * 44, i ? 30 : 26, i ? '#fff' : tone(c[3], 82), 'center', 0, i ? 500 : 400);
    });
    drawRank(ctx, this.app.profile, 230, 800, 300, c);
    mascot(ctx, 110, 860, 62, this.stars >= 2 || this.record ? 'cheer' : this.stars ? 'happy' : 'sad', this.time, this.look);
    super.draw(ctx);
    this.party?.draw(ctx);
  }
}

/** Profil: Rang, Tage in Folge und das Album mit allen Abzeichen. */
export class ProfileScene extends ButtonScene {
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    this.buttons = [new DwellButton({
      x: 100, y: 910, r: 58, icon: icons.back, onActivate: this.act(() => this.app.menu()),
    })];
    if (this.app.config.profiles.length > 1) {
      this.buttons.push(new DwellButton({
        x: w - 100, y: 910, r: 58, color: colors[3], icon: initial('↔'),
        onActivate: this.act(() => this.app.playerPick()),
      }));
    }
  }
  draw(ctx) {
    const { w } = this.field;
    const c = this.app.palette();
    const p = this.app.profile;
    title(ctx, p.name, w / 2, 80, 66, c[1]);
    drawRank(ctx, p, w / 2 - 300, 150, 600, c);
    const earned = BADGES.filter((b) => p.badges[b.id]).length;
    text(ctx, `${earned} von ${BADGES.length} Abzeichen${p.days.streak >= 2 ? ` · ${p.days.streak} Tage in Folge` : ''}`, w / 2, 240, 24, 'rgba(255,255,255,0.75)', 'center', 0, 400);

    // Album: sechs Abzeichen je Reihe
    const cols = 6, cell = Math.min(160, (w - 60) / cols);
    BADGES.forEach((b, i) => {
      const x = w / 2 + ((i % cols) - (cols - 1) / 2) * cell;
      const y = 345 + Math.floor(i / cols) * 138;
      const has = !!p.badges[b.id];
      ctx.beginPath();
      ctx.arc(x, y, 44, 0, Math.PI * 2);
      ctx.fillStyle = has ? tone(c[i % 4], 22, 70) : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.lineWidth = has ? 2.5 : 1;
      ctx.strokeStyle = has ? c[i % 4] : 'rgba(255,255,255,0.2)';
      if (has) glow(ctx, c[i % 4], 18);
      ctx.stroke();
      noGlow(ctx);
      text(ctx, b.sym, x, y + 2, b.sym.length > 2 ? 22 : 30, has ? '#fff' : 'rgba(255,255,255,0.25)', 'center', 0, 600);
      text(ctx, b.name, x, y + 64, 17, has ? '#fff' : 'rgba(255,255,255,0.35)', 'center', 0, 400);
    });
    super.draw(ctx);
  }
}

/** "Wer spielt?" – Auswahl des aktiven Spielers. */
export class PlayerPickScene extends ButtonScene {
  layout() {
    const { app } = this;
    const colors = app.palette();
    this.buttons = grid(app.config.profiles.slice(0, 8), this.field.w, (p, x, y, r, i) => new DwellButton({
      x, y: y - 20, r, color: p.id === app.config.current ? '#fff' : colors[i % colors.length],
      icon: initial(p.name), label: p.name, sub: rankOf(p.xp).name,
      onActivate: this.act(() => app.setPlayer(p.id)),
    }));
    this.buttons.push(new DwellButton({
      x: 100, y: 910, r: 58, icon: icons.back, onActivate: this.act(() => app.menu()),
    }));
  }
  draw(ctx) {
    title(ctx, 'Wer spielt?', this.field.w / 2, 130, 86, this.app.palette()[1]);
    super.draw(ctx);
  }
}
