// Spielerprofile: Punkte über alle Übungen (XP), Rang, Abzeichen, Verlauf, Übung des Tages.
// Reine Rechenlogik ohne Browser, damit sie sich testen lässt.

export const RANKS = [
  // Eine ordentliche Runde bringt rund 500 bis 1000 Punkte.
  { xp: 0, name: 'Anfänger' },
  { xp: 3000, name: 'Dribbler' },
  { xp: 8000, name: 'Trickser' },
  { xp: 18000, name: 'Techniker' },
  { xp: 35000, name: 'Spielmacher' },
  { xp: 60000, name: 'Kapitän' },
  { xp: 100000, name: 'Profi' },
  { xp: 160000, name: 'Legende' },
];

/** Rang zu einem XP-Stand: Nummer, Name und Fortschritt (0..1) bis zum nächsten Rang. */
export function rankOf(xp) {
  let index = 0;
  while (index < RANKS.length - 1 && xp >= RANKS[index + 1].xp) index++;
  const next = RANKS[index + 1];
  return {
    index,
    name: RANKS[index].name,
    next: next ? next.xp : null,
    progress: next ? (xp - RANKS[index].xp) / (next.xp - RANKS[index].xp) : 1,
  };
}

export function newProfile(name) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name,
    xp: 0,
    highscores: {},
    badges: {},        // Abzeichen-id -> Datum
    seen: {},          // Übungen, die schon einmal vorgemacht wurden
    history: [],       // { d: Datum, g: Übung, l: Stufe, s: Punkte, st: Sterne }
    days: { last: null, streak: 0 },
    daily: null,       // Datum, an dem der Tagesbonus zuletzt geholt wurde
    stats: { rounds: 0, stars: 0, maxMult: 0, played: {}, best: {}, hard3: false, flawless: 0, sessions: {}, dailyCount: 0, duelWins: 0 },
  };
}

/** Datum als Text JJJJ-MM-TT in Ortszeit. */
export function dateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayBefore(day) {
  const [y, m, d] = day.split('-').map(Number);
  return dateString(new Date(y, m - 1, d - 1));
}

/** Übung des Tages: an einem Tag für alle gleich, jeden Tag eine andere. */
export function dailyGame(games, day = dateString()) {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return games[h % games.length];
}

// Abzeichen. test(p, categories) entscheidet, ob Profil p es verdient hat.
export const BADGES = [
  { id: 'first', sym: '1', name: 'Anpfiff', desc: 'Spiele deine erste Übung zu Ende.', test: (p) => p.stats.rounds >= 1 },
  { id: 'r10', sym: '10', name: 'Fleißig', desc: 'Spiele 10 Übungen zu Ende.', test: (p) => p.stats.rounds >= 10 },
  { id: 'r50', sym: '50', name: 'Dauerbrenner', desc: 'Spiele 50 Übungen zu Ende.', test: (p) => p.stats.rounds >= 50 },
  { id: 'r200', sym: '200', name: 'Unermüdlich', desc: 'Spiele 200 Übungen zu Ende.', test: (p) => p.stats.rounds >= 200 },
  { id: 'star3', sym: '★', name: 'Volltreffer', desc: 'Hole in einer Übung alle drei Sterne.', test: (p) => Object.values(p.stats.best).some((s) => s >= 3) },
  { id: 'stars25', sym: '25★', name: 'Sternensammler', desc: 'Sammle insgesamt 25 Sterne.', test: (p) => p.stats.stars >= 25 },
  { id: 'stars100', sym: '100★', name: 'Sternenhimmel', desc: 'Sammle insgesamt 100 Sterne.', test: (p) => p.stats.stars >= 100 },
  { id: 'mult4', sym: 'x4', name: 'Serienheld', desc: 'Schaffe zehn schnelle Treffer hintereinander, bis oben „x4“ steht.', test: (p) => p.stats.maxMult >= 4 },
  { id: 'all', sym: '18', name: 'Alleskönner', desc: 'Spiele jede der 18 Übungen mindestens einmal.', test: (p, cats) => cats.every((c) => c.games.every((g) => p.stats.played[g.id])) },
  ...[['treffen', 'Treffen'], ['fuehren', 'Führen'], ['wechsel', 'Wechsel'], ['stoppen', 'Stoppen'], ['tricks', 'Tricks']].map(([id, label]) => ({
    id: `cat_${id}`, sym: label[0], name: `${label}-Meister`, desc: `Hole in jeder Übung des Schwerpunkts „${label}“ mindestens zwei Sterne.`,
    test: (p, cats) => cats.find((c) => c.id === id)?.games.every((g) => (p.stats.best[g.id] || 0) >= 2) ?? false,
  })),
  { id: 'hard', sym: '!!!', name: 'Harter Brocken', desc: 'Hole drei Sterne in einer Übung auf der Stufe „Schwer“.', test: (p) => p.stats.hard3 },
  { id: 'flawless', sym: '♥', name: 'Unberührbar', desc: 'Beende „Ausweichen“, „Fangen“ oder „Stopp“ mit allen drei Herzen.', test: (p) => p.stats.flawless >= 1 },
  { id: 's_short', sym: 'K', name: 'Aufgewärmt', desc: 'Spiele ein Training „Kurz“ bis zum Ende durch.', test: (p) => p.stats.sessions.short >= 1 },
  { id: 's_medium', sym: 'M', name: 'Durchgezogen', desc: 'Spiele ein Training „Mittel“ bis zum Ende durch.', test: (p) => p.stats.sessions.medium >= 1 },
  { id: 's_full', sym: 'XL', name: 'Marathon', desc: 'Spiele ein Training „Komplett“ mit allen Übungen durch.', test: (p) => p.stats.sessions.full >= 1 },
  { id: 'days3', sym: '3T', name: 'Dranbleiber', desc: 'Trainiere an drei Tagen hintereinander.', test: (p) => p.days.streak >= 3 },
  { id: 'days7', sym: '7T', name: 'Wochenheld', desc: 'Trainiere an sieben Tagen hintereinander.', test: (p) => p.days.streak >= 7 },
  { id: 'daily', sym: '☀', name: 'Tagesheld', desc: 'Spiele an fünf verschiedenen Tagen die Übung unter „Heute“.', test: (p) => p.stats.dailyCount >= 5 },
  { id: 'duel', sym: 'VS', name: 'Duellant', desc: 'Gewinne ein Duell gegen einen anderen Spieler.', test: (p) => p.stats.duelWins >= 1 },
  { id: 'rank', sym: '▲', name: 'Aufsteiger', desc: 'Sammle 18.000 Punkte und erreiche den Rang „Techniker“.', test: (p) => rankOf(p.xp).index >= 3 },
];

// Bei zählbaren Abzeichen: wie weit man schon ist, als [geschafft, nötig].
const PROGRESS = {
  r10: (p) => [p.stats.rounds, 10],
  r50: (p) => [p.stats.rounds, 50],
  r200: (p) => [p.stats.rounds, 200],
  stars25: (p) => [p.stats.stars, 25],
  stars100: (p) => [p.stats.stars, 100],
  all: (p, cats) => [cats.reduce((n, c) => n + c.games.filter((g) => p.stats.played[g.id]).length, 0), cats.reduce((n, c) => n + c.games.length, 0)],
  days3: (p) => [p.days.streak, 3],
  days7: (p) => [p.days.streak, 7],
  daily: (p) => [p.stats.dailyCount, 5],
  rank: (p) => [p.xp, RANKS[3].xp],
};

/** Fortschritt zu einem Abzeichen als [geschafft, nötig] oder null, wenn es nichts zu zählen gibt. */
export function badgeProgress(badge, p, categories) {
  const cat = /^cat_(.+)$/.exec(badge.id);
  if (cat) {
    const games = categories.find((c) => c.id === cat[1])?.games ?? [];
    return [games.filter((g) => (p.stats.best[g.id] || 0) >= 2).length, games.length];
  }
  const f = PROGRESS[badge.id];
  if (!f) return null;
  const [have, need] = f(p, categories);
  return [Math.min(have, need), need];
}

/** Vergibt alle neu verdienten Abzeichen und liefert sie zurück. */
export function awardBadges(p, categories, day = dateString()) {
  const fresh = BADGES.filter((b) => !p.badges[b.id] && b.test(p, categories));
  for (const b of fresh) p.badges[b.id] = day;
  return fresh;
}

/**
 * Verbucht eine gespielte Runde. r = { gameId, level, score, stars, maxMult, lives, livesLeft, daily, counts }
 * daily: Es war die Übung des Tages. counts: zählt als eigene Übung (das Finale im Training nicht).
 * Liefert, was es dafür gab: { xp, dailyBonus, rankUp, badges }.
 */
export function recordRound(p, r, categories, day = dateString()) {
  const before = rankOf(p.xp).index;
  const dailyBonus = !!r.daily && p.daily !== day;
  const xp = Math.max(0, Math.round(r.score)) * (dailyBonus ? 2 : 1);
  p.xp += xp;
  if (dailyBonus) { p.daily = day; p.stats.dailyCount++; }

  if (p.days.last !== day) {
    p.days.streak = p.days.last === dayBefore(day) ? p.days.streak + 1 : 1;
    p.days.last = day;
  }
  const s = p.stats;
  s.maxMult = Math.max(s.maxMult, r.maxMult || 1);
  if (r.counts !== false) {
    s.rounds++;
    s.stars += r.stars;
    s.played[r.gameId] = (s.played[r.gameId] || 0) + 1;
    s.best[r.gameId] = Math.max(s.best[r.gameId] || 0, r.stars);
    if (r.level === 3 && r.stars >= 3) s.hard3 = true;
    if (r.lives && r.livesLeft === r.lives) s.flawless++;
    p.history.push({ d: day, g: r.gameId, l: r.level, s: Math.round(r.score), st: r.stars });
    if (p.history.length > 400) p.history.splice(0, p.history.length - 400);
  }
  return { xp, dailyBonus, rankUp: rankOf(p.xp).index > before, badges: awardBadges(p, categories, day) };
}

/** Verbucht ein beendetes Training ('short', 'medium', 'full', 'custom') oder einen Duellsieg ('duel'). */
export function recordEvent(p, kind, categories, day = dateString()) {
  if (kind === 'duel') p.stats.duelWins++;
  else p.stats.sessions[kind] = (p.stats.sessions[kind] || 0) + 1;
  return awardBadges(p, categories, day);
}

/** Verlauf je Übung: Runden, Bestwert, Schnitt der letzten fünf und Tendenz gegenüber den fünf davor. */
export function summarize(p, games) {
  return games.map((game) => {
    const scores = p.history.filter((h) => h.g === game.id).map((h) => h.s);
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const recent = avg(scores.slice(-5));
    const earlier = avg(scores.slice(-10, -5));
    return {
      game,
      rounds: scores.length,
      best: scores.length ? Math.max(...scores) : null,
      recent: recent == null ? null : Math.round(recent),
      trend: recent == null || earlier == null ? 0 : recent > earlier * 1.08 ? 1 : recent < earlier * 0.92 ? -1 : 0,
    };
  });
}
