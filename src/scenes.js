// Die Bildschirme rund ums Spielen: Hauptmenü, Schwerpunkt, Stufenwahl, Ergebnis, Profil.
import { DwellButton, icons, text, title, caption, star, glow, noGlow, tone, mascot, bubble, Confetti } from './ui.js';
import { BRAND } from './config.js';
import { ButtonScene, grid, medals, scoreKey, thresholds, LEVEL_NAMES, SPEEDS } from './scenebase.js';
import { todaysMissions } from './quests.js';
import { nextGoals, weekLeader } from './goals.js';
import { rankOf, BADGES, badgeProgress, weekStats, weekStart, dayBefore, ageOf, ageClass } from './profile.js';

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
    // Einmal je Woche den Sieger der Vorwoche ausrufen
    const week = weekStart(app.today());
    if (app.config.weekSeen !== week) {
      this.champion = app.config.weekSeen ? weekLeader(app.config.profiles, dayBefore(week)) : null;
      app.config.weekSeen = week;
      app.save();
      if (this.champion) app.voice.say(`Sieger der letzten Woche: ${this.champion.name}!`);
    }
    // Spieler-Button oben rechts: führt zu Rang und Abzeichen
    this.buttons.push(new DwellButton({
      x: w - 82, y: 84, r: 50, color: colors[3], icon: initial(app.profile.name),
      onActivate: this.act(() => app.profileScene()),
    }));
  }

  /** Was der Trainer gerade sagt: wechselt alle paar Sekunden. */
  line() {
    const { app } = this;
    const p = app.profile;
    const today = app.today();
    const lines = [`Hallo ${p.name}!`, 'Lege den Ball auf einen Kreis'];
    // Montags (oder beim ersten Start der Woche): Wer hat die letzte Woche gewonnen?
    if (this.champion) lines.unshift(`Sieger der letzten Woche: ${this.champion.name}!`);
    const quest = todaysMissions(p, app.categories, today);
    if (quest.chest) lines.push('Alle Aufgaben geschafft – morgen gibt es neue!');
    else for (const m of quest.list) if (m.n < m.target) lines.push(`Aufgabe: ${m.text}${m.target > 1 && m.n ? ` (${m.n.toLocaleString('de-DE')} von ${m.target.toLocaleString('de-DE')})` : ''}`);
    const leader = weekLeader(app.config.profiles, today);
    if (leader === p) lines.push('Du trägst die Krone der Woche!');
    else if (leader) lines.push(`${leader.name} führt diese Woche – hol dir die Krone!`);
    if (p.daily !== today) lines.push(`Heute doppelte Punkte bei „${app.daily().name}“`);
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
    const crown = weekLeader(app.config.profiles, app.today()) === app.profile ? '♛ ' : '';
    caption(ctx, `${BRAND.club}  ·  ${crown}${app.profile.name}, ${rankOf(app.profile.xp).name}`, cx, 222, 19, tone(c[3], 82), 'center');

    // Buttons leicht versetzt schweben lassen (der Spieler-Button oben rechts bleibt ruhig)
    this.buttons.forEach((b, i) => {
      ctx.save();
      if (i < this.buttons.length - 1) ctx.translate(0, Math.sin(this.time * 1.6 + i * 1.1) * 5);
      b.draw(ctx);
      ctx.restore();
    });
    mascot(ctx, 76, 918, 62, 'happy', this.time, this.look);
    bubble(ctx, this.line(), 150, 900, 26);
    // Tagesaufgaben unten rechts: drei Punkte und die Schatzkiste
    const quest = todaysMissions(app.profile, app.categories, app.today());
    quest.list.forEach((m, i) => {
      const done = m.n >= m.target;
      ctx.beginPath();
      ctx.arc(w - 208 + i * 38, 950, 12, 0, Math.PI * 2);
      ctx.fillStyle = done ? '#7dffb0' : 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = done ? '#7dffb0' : 'rgba(255,255,255,0.5)';
      ctx.stroke();
      if (done) text(ctx, '✔', w - 208 + i * 38, 951, 15, '#0b1d4a', 'center', 0, 600);
    });
    ctx.save();
    ctx.translate(w - 70, 946);
    if (quest.chest) glow(ctx, '#ffd76a', 20);
    ctx.globalAlpha = quest.chest ? 1 : 0.7;
    icons.chest(ctx, 46);
    noGlow(ctx);
    ctx.restore();
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
  if (rewards.practice) return ['Übungsmodus: nicht gewertet'];
  const lines = [`+${rewards.xp} Punkte${rewards.dailyBonus ? ' (Tagesbonus x2)' : ''}`];
  if (rewards.rankUp) lines.push(`Aufstieg: ${rankOf(profile.xp).name}!`);
  // Das Wichtigste zuerst: Im Ergebnis ist nur Platz für vier Zeilen.
  if (rewards.chest) lines.push(`Schatzkiste! +${rewards.chest.xp} Punkte${rewards.chest.item ? ` · neu: ${rewards.chest.item.name}` : ''}`);
  for (const m of rewards.missions ?? []) lines.push(`Aufgabe geschafft: ${m}`);
  for (const b of rewards.badges ?? []) lines.push(`Neues Abzeichen: ${b.name}`);
  return lines;
}

/** Ergebnis einer einzelnen Übung. r = { game, level, score, best, record, stars, rewards } */
export class ResultScene extends ButtonScene {
  constructor(app, r) {
    super(app);
    Object.assign(this, r);
    this.lines = rewardLines(r.rewards, app.profile).slice(0, 4);
    // Was als Nächstes in Reichweite liegt, sagt der Trainer in seiner Sprechblase
    const goals = nextGoals(app.profile, app.config.profiles, { score: r.score, stars: r.stars, thresholds: thresholds(r.game, r.level) }, app.categories, app.today());
    this.goals = (app.practice() ? goals.filter((g) => g.includes('Stern')) : goals).slice(0, 3);
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
      text(ctx, line, cx, 562 + i * 40, i ? 28 : 26, i ? '#fff' : tone(c[3], 82), 'center', 0, i ? 500 : 400);
    });
    drawRank(ctx, this.app.profile, 230, 800, 300, c);
    mascot(ctx, 110, 860, 62, this.stars >= 2 || this.record ? 'cheer' : this.stars ? 'happy' : 'sad', this.time, this.look);
    if (this.goals.length && this.time > 2) bubble(ctx, this.goals[Math.floor((this.time - 2) / 3.5) % this.goals.length], 190, 738, 22);
    super.draw(ctx);
    this.party?.draw(ctx);
  }
}

/**
 * Profil: Rang, Tage in Folge und das Album mit allen Abzeichen.
 * Liegt der Ball auf einem Abzeichen, steht unten, wie man es bekommt (und wird vorgelesen).
 */
export class ProfileScene extends ButtonScene {
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    this.buttons = [new DwellButton({
      x: 90, y: 920, r: 54, icon: icons.back, onActivate: this.act(() => this.app.menu()),
    })];
    if (this.app.config.profiles.length > 1) {
      this.buttons.push(new DwellButton({
        x: w - 90, y: 920, r: 54, color: colors[3], icon: icons.people,
        onActivate: this.act(() => this.app.playerPick()),
      }));
    }
    this.buttons.push(new DwellButton({
      x: w - 70, y: 74, r: 42, color: colors[1], icon: icons.trophy,
      onActivate: this.act(() => this.app.leaderboard()),
    }));
    this.buttons.push(new DwellButton({
      x: 70, y: 74, r: 42, color: colors[0], icon: icons.chest,
      onActivate: this.act(() => this.app.collection()),
    }));
    // Album: acht Abzeichen je Reihe
    const cols = 8, cell = Math.min(150, (w - 64) / cols);
    this.spots = BADGES.map((badge, i) => ({
      badge,
      x: w / 2 + ((i % cols) - (cols - 1) / 2) * cell,
      y: 290 + Math.floor(i / cols) * 92,
    }));
    this.chosen ??= null;
  }

  update(dt, ball) {
    super.update(dt, ball);
    if (!ball.visible) return;
    const hit = this.spots.find((s) => Math.hypot(ball.x - s.x, ball.y - s.y) < 50);
    if (hit && hit !== this.chosen) {
      this.chosen = hit;
      this.app.sound.blip();
      const has = !!this.app.profile.badges[hit.badge.id];
      this.app.voice.say(`${hit.badge.name}. ${has ? 'Geschafft! ' : ''}${hit.badge.desc}`);
    }
  }

  onClick(x, y) {
    super.onClick(x, y);
    const hit = this.spots.find((s) => Math.hypot(x - s.x, y - s.y) < 50);
    if (hit) this.chosen = hit;
  }

  draw(ctx) {
    const { w } = this.field;
    const c = this.app.palette();
    const p = this.app.profile;
    title(ctx, p.name, w / 2, 74, 62, c[1]);
    drawRank(ctx, p, w / 2 - 300, 138, 600, c);
    const earned = BADGES.filter((b) => p.badges[b.id]).length;
    text(ctx, `${earned} von ${BADGES.length} Abzeichen${p.days.streak >= 2 ? ` · ${p.days.streak} Tage in Folge` : ''}`, w / 2, 226, 24, 'rgba(255,255,255,0.75)', 'center', 0, 400);

    this.spots.forEach(({ badge, x, y }, i) => {
      const has = !!p.badges[badge.id];
      const picked = this.chosen?.badge === badge;
      const r = picked ? 40 : 34;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = has ? tone(c[i % 4], 22, 70) : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.lineWidth = has ? 2.5 : 1;
      ctx.strokeStyle = has ? c[i % 4] : 'rgba(255,255,255,0.2)';
      if (has) glow(ctx, c[i % 4], 18);
      ctx.stroke();
      noGlow(ctx);
      if (picked) {
        ctx.beginPath();
        ctx.arc(x, y, r + 8, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      text(ctx, badge.sym, x, y + 2, badge.sym.length > 3 ? 16 : badge.sym.length > 2 ? 19 : 26, has ? '#fff' : `rgba(255,255,255,${picked ? 0.6 : 0.25})`, 'center', 0, 600);
      text(ctx, badge.name, x, y + 52, badge.name.length > 13 ? 12.5 : 15, has || picked ? '#fff' : 'rgba(255,255,255,0.35)', 'center', 0, 400);
    });

    // Erklärung zum gewählten Abzeichen
    const x0 = 165, x1 = w - (this.app.config.profiles.length > 1 ? 165 : 30);
    ctx.beginPath();
    ctx.roundRect(x0, 848, x1 - x0, 132, 22);
    ctx.fillStyle = 'rgba(8,14,36,0.78)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(160,195,255,0.35)';
    ctx.stroke();
    const mid = (x0 + x1) / 2;
    if (!this.chosen) {
      ctx.globalAlpha = this.pulse();
      text(ctx, 'Lege den Ball auf ein Abzeichen:', mid, 895, 26, '#fff', 'center', 0, 500);
      text(ctx, 'Dann steht hier, wie du es bekommst.', mid, 934, 23, 'rgba(255,255,255,0.75)', 'center', 0, 400);
      ctx.globalAlpha = 1;
    } else {
      const { badge } = this.chosen;
      const has = p.badges[badge.id];
      const progress = badgeProgress(badge, p, this.app.categories);
      text(ctx, has ? `${badge.name} – geschafft!` : badge.name, mid, 878, 28, has ? tone(c[1], 80) : '#fff', 'center', 0, 600);
      wrapText(ctx, badge.desc, mid, 916, x1 - x0 - 50, 23, 28);
      if (!has && progress) {
        // Fortschrittsbalken
        const bw = Math.min(260, x1 - x0 - 200), bx = mid - bw / 2, by = 964;
        ctx.lineCap = 'round';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by); ctx.stroke();
        ctx.strokeStyle = tone(c[1], 68);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.max(1, bw * (progress[0] / progress[1])), by); ctx.stroke();
        text(ctx, `${progress[0]} von ${progress[1]}`, bx + bw + 14, by + 1, 18, 'rgba(255,255,255,0.8)', 'left', 0, 500);
      }
    }
    super.draw(ctx);
  }
}

/** Text mit Zeilenumbruch, mittig; höchstens zwei Zeilen. */
function wrapText(ctx, str, x, y, maxWidth, size, lineHeight) {
  ctx.font = `400 ${size}px "Fredoka", system-ui, sans-serif`;
  const lines = [''];
  for (const word of str.split(' ')) {
    const trial = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && lines[lines.length - 1]) lines.push(word);
    else lines[lines.length - 1] = trial;
  }
  const shown = lines.slice(0, 2);
  const top = shown.length > 1 ? y - lineHeight / 2 + 6 : y;
  shown.forEach((line, i) => text(ctx, line, x, top + i * lineHeight, size, 'rgba(255,255,255,0.85)', 'center', 0, 400));
}

/** "Wer spielt?" – Auswahl des aktiven Spielers. */
const BOARDS = [
  { id: 'week', label: 'Woche', icon: 'calendar', sub: 'Meiste Spiele in dieser Woche – jeden Montag geht es von vorn los' },
  { id: 'rounds', label: 'Spiele', icon: 'stick', sub: 'Meiste Spiele insgesamt' },
  { id: 'points', label: 'Punkte', icon: 'trophy', sub: 'Meiste Punkte insgesamt' },
  { id: 'records', label: 'Rekorde', icon: 'medal', sub: 'Wer hält den Rekord in welcher Übung?' },
];

/**
 * Ranglisten aller Spieler auf diesem Gerät: meiste Spiele in dieser Woche (beginnt jeden Montag neu),
 * meiste Spiele insgesamt, meiste Punkte und die Rekordhalter je Übung.
 */
export class LeaderboardScene extends ButtonScene {
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    this.view ??= 'week';
    const step = Math.min(170, (w - 260) / (BOARDS.length - 1));
    this.buttons = [
      new DwellButton({ x: 80, y: 880, r: 46, icon: icons.back, onActivate: this.act(() => this.app.profileScene()) }),
      ...BOARDS.map((board, i) => new DwellButton({
        x: w - 90 - (BOARDS.length - 1 - i) * step, y: 872, r: 40,
        color: board.id === this.view ? '#fff' : colors[i % 4], icon: icons[board.icon], label: board.label,
        onActivate: this.act(() => { this.view = board.id; this.layout(); }),
      })),
    ];
    // Fair bleiben: nur die eigene Altersklasse zeigen (wenn ein Alter eingetragen ist)
    const mine = ageClass(ageOf(this.app.profile));
    if (mine) {
      this.buttons.push(new DwellButton({
        x: w - 80, y: 70, r: 38, color: this.own ? '#fff' : colors[2], icon: this.own ? initial(mine.replace('Erwachsene', 'E')) : icons.people,
        label: this.own ? mine : 'Alle',
        onActivate: this.act(() => { this.own = !this.own; this.layout(); }),
      }));
    } else {
      this.own = false;
    }
  }

  /** Die Spieler, die in der Liste stehen: alle oder nur die Altersklasse des aktuellen Spielers. */
  players() {
    const all = this.app.config.profiles;
    if (!this.own) return all;
    const mine = ageClass(ageOf(this.app.profile));
    return all.filter((p) => ageClass(ageOf(p)) === mine);
  }

  /** Zeilen der gewählten Rangliste: sortiert, mit großer Zahl rechts und kleiner Zeile darunter. */
  rows() {
    const { app } = this;
    const today = app.today();
    const tag = (p) => { const k = ageClass(ageOf(p)); return k ? `${k} · ` : ''; };
    const all = this.players().map((p) => {
      const week = weekStats(p, today);
      if (this.view === 'week') {
        return { p, value: week.rounds, big: `${week.rounds}`, unit: week.rounds === 1 ? 'Spiel' : 'Spiele', small: `${tag(p)}${week.points.toLocaleString('de-DE')} Punkte · ${week.stars} Sterne in dieser Woche`, tie: week.points };
      }
      if (this.view === 'rounds') {
        return { p, value: p.stats.rounds, big: `${p.stats.rounds}`, unit: p.stats.rounds === 1 ? 'Spiel' : 'Spiele', small: `${tag(p)}${rankOf(p.xp).name} · ${p.stats.stars} Sterne`, tie: p.xp };
      }
      return { p, value: p.xp, big: p.xp.toLocaleString('de-DE'), unit: 'Punkte', small: `${tag(p)}${rankOf(p.xp).name} · ${p.stats.stars} Sterne · ${Object.keys(p.badges).length} Abzeichen`, tie: p.stats.rounds };
    });
    return all.sort((a, b) => b.value - a.value || b.tie - a.tie).slice(0, 8);
  }

  draw(ctx) {
    const { app } = this;
    const { w } = this.field;
    const c = app.palette();
    const me = app.profile;
    const board = BOARDS.find((b) => b.id === this.view);
    title(ctx, 'Bestenliste', w / 2, 80, 70, c[1]);
    text(ctx, this.own ? `${board.sub.split(' – ')[0]} · nur Altersklasse ${ageClass(ageOf(me))}` : board.sub, w / 2, 142, 22, 'rgba(255,255,255,0.75)', 'center', 0, 400);
    if (this.view !== 'records') {
      let place = 0, last = null;
      this.rows().forEach((row, i) => {
        // gleiche Zahl = gleicher Platz
        if (row.value !== last) { place = i + 1; last = row.value; }
        const y = 215 + i * 74;
        const mine = row.p.id === me.id;
        ctx.beginPath();
        ctx.roundRect(70, y - 31, w - 140, 62, 18);
        ctx.fillStyle = mine ? 'rgba(255,255,255,0.14)' : 'rgba(8,14,36,0.6)';
        ctx.fill();
        if (mine) { ctx.lineWidth = 2; ctx.strokeStyle = c[1]; ctx.stroke(); }
        const lead = place === 1 && row.value > 0;
        text(ctx, lead ? '♛' : String(place), 112, y + 2, 34, lead ? '#ffd76a' : '#fff', 'center', 0, 600);
        text(ctx, row.p.name, 160, y - 8, 28, '#fff', 'left', 0, 600);
        text(ctx, row.small, 160, y + 18, 17, 'rgba(255,255,255,0.7)', 'left', 0, 400);
        text(ctx, row.big, w - 100, y - 4, 32, tone(c[i % 4], 78), 'right', 0, 600);
        text(ctx, row.unit, w - 100, y + 20, 15, 'rgba(255,255,255,0.6)', 'right', 0, 400);
      });
    } else {
      const rows = app.games.map((g) => {
        let best = null;
        for (const p of this.players()) {
          for (const [key, score] of Object.entries(p.highscores)) {
            if (key.startsWith(`${g.id}:`) && (!best || score > best.score)) best = { score, name: p.name, mine: p.id === me.id };
          }
        }
        return { g, best };
      });
      const half = Math.ceil(rows.length / 2), colW = (w - 120) / 2;
      rows.forEach(({ g, best }, i) => {
        const x = 60 + Math.floor(i / half) * (colW + 20), y = 196 + (i % half) * 66;
        ctx.beginPath();
        ctx.roundRect(x, y - 27, colW - 20, 54, 14);
        ctx.fillStyle = best?.mine ? 'rgba(255,255,255,0.14)' : 'rgba(8,14,36,0.6)';
        ctx.fill();
        text(ctx, g.name, x + 18, y - 8, 22, tone(app.accentOf(g) || c[0], 78), 'left', 0, 600);
        text(ctx, best ? best.name : 'noch niemand', x + 18, y + 14, 16, 'rgba(255,255,255,0.7)', 'left', 0, 400);
        if (best) text(ctx, Math.round(best.score).toLocaleString('de-DE'), x + colW - 38, y + 2, 26, '#fff', 'right', 0, 600);
      });
    }
    super.draw(ctx);
  }
}

export class PlayerPickScene extends ButtonScene {
  layout() {
    const { app } = this;
    const colors = app.palette();
    this.buttons = grid(app.config.profiles.slice(0, 8), this.field.w, (p, x, y, r, i) => new DwellButton({
      x, y: y - 20, r, color: p.id === app.config.current ? '#fff' : colors[i % colors.length],
      icon: initial(p.name), label: `${weekLeader(app.config.profiles, app.today()) === p ? '♛ ' : ''}${p.name}`, sub: rankOf(p.xp).name,
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
