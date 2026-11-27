// Spielerprofile: Punkte über alle Übungen (XP), Rang, Abzeichen, Verlauf, Übung des Tages.
// Reine Rechenlogik ohne Browser, damit sie sich testen lässt.

import { advanceMissions } from './quests.js';

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
  { xp: 1000000, name: 'Clubpräsident' },
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
    birthYear: null,   // Geburtsjahr (aus dem eingetragenen Alter), für faire Ranglisten nach Altersklasse
    lefty: false,      // Linkshänder: Vorhand und Rückhand im Tricktrainer gespiegelt
    career: { stars: {} }, // Karriere: beste Sterne je Station
    xp: 0,
    highscores: {},
    badges: {},        // Abzeichen-id -> Datum
    seen: {},          // Übungen, die schon einmal vorgemacht wurden
    history: [],       // { d: Datum, g: Übung, l: Stufe, s: Punkte, st: Sterne }
    days: { last: null, streak: 0 },
    daily: null,       // Datum, an dem der Tagesbonus zuletzt geholt wurde
    missions: null,    // Tagesaufgaben: { day, list, chest } (siehe quests.js)
    items: {},         // Sammelstücke aus der Schatzkiste: id -> Datum
    gear: { trail: null, hat: null }, // was davon gerade angelegt ist
    stats: { rounds: 0, stars: 0, maxMult: 0, played: {}, best: {}, hard3: false, flawless: 0, sessions: {}, dailyCount: 0, duelWins: 0, maxScore: 0, hardPlayed: {}, topSpeed: 0 },
  };
}

/**
 * Ergänzt ein gespeichertes Profil um alles, was ihm fehlt – etwa nach einer neuen Fassung
 * der App, die zusätzliche Angaben kennt. Vorhandene Werte bleiben unangetastet.
 */
export function completeProfile(saved) {
  const fresh = newProfile(saved?.name || 'Spieler');
  const p = { ...fresh, ...saved };
  p.days = { ...fresh.days, ...saved?.days };
  p.stats = { ...fresh.stats, ...saved?.stats };
  p.gear = { ...fresh.gear, ...saved?.gear };
  for (const key of ['highscores', 'badges', 'seen', 'items']) if (!p[key] || typeof p[key] !== 'object') p[key] = {};
  for (const key of ['played', 'best', 'sessions', 'hardPlayed']) if (!p.stats[key] || typeof p.stats[key] !== 'object') p.stats[key] = {};
  if (!Array.isArray(p.history)) p.history = [];
  if (!Number.isFinite(p.xp)) p.xp = 0;
  if (!Number.isFinite(p.birthYear)) p.birthYear = null;
  if (!Array.isArray(p.news)) p.news = [];
  p.lefty = !!p.lefty;
  if (!p.career || typeof p.career.stars !== 'object') p.career = { stars: {} };
  // Ältere Spielstände kannten den Rundenrekord noch nicht: aus dem Verlauf nachtragen.
  if (!p.stats.maxScore) p.stats.maxScore = Math.max(0, ...p.history.map((h) => h.s || 0));
  return p;
}

/** Datum als Text JJJJ-MM-TT in Ortszeit. */
export function dateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayBefore(day) {
  const [y, m, d] = day.split('-').map(Number);
  return dateString(new Date(y, m - 1, d - 1));
}

/** Alter eines Spielers in Jahren oder null, wenn keins eingetragen ist. */
export function ageOf(p, year = new Date().getFullYear()) {
  return Number.isFinite(p.birthYear) ? Math.max(0, year - p.birthYear) : null;
}

/** Altersklasse wie im Hockey: U6, U8, … U18, danach „Erwachsene“. Ohne Alter null. */
export function ageClass(age) {
  if (age == null) return null;
  for (const limit of [6, 8, 10, 12, 14, 16, 18]) if (age < limit) return `U${limit}`;
  return 'Erwachsene';
}

/** Der Montag der Woche, in der day liegt (als Datum 'JJJJ-MM-TT'). */
export function weekStart(day = dateString()) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return dateString(new Date(y, m - 1, d - ((date.getDay() + 6) % 7)));
}

/**
 * Was ein Spieler in der laufenden Woche (Montag bis Sonntag) geschafft hat. Jeden Montag
 * beginnt die Zählung von vorn, damit alle wieder die gleiche Chance haben.
 */
export function weekStats(p, day = dateString()) {
  const from = weekStart(day);
  const rows = p.history.filter((h) => h.d >= from && h.d <= day);
  return {
    rounds: rows.length,
    points: rows.reduce((a, h) => a + (h.s || 0), 0),
    stars: rows.reduce((a, h) => a + (h.st || 0), 0),
  };
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
  { id: 'all', sym: 'Alle', name: 'Alleskönner', desc: 'Spiele jede Übung mindestens einmal.', test: (p, cats) => cats.every((c) => c.games.every((g) => p.stats.played[g.id])) },
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
  // Zweite Albumhälfte: für alle, die länger dabei sind
  { id: 'stars250', sym: '250★', name: 'Galaxie', desc: 'Sammle insgesamt 250 Sterne.', test: (p) => p.stats.stars >= 250 },
  { id: 'all3', sym: '★★★', name: 'Perfektionist', desc: 'Hole in jeder Übung alle drei Sterne.', test: (p, cats) => cats.every((c) => c.games.every((g) => (p.stats.best[g.id] || 0) >= 3)) },
  { id: 'hardall', sym: 'Alle!', name: 'Furchtlos', desc: 'Spiele jede Übung einmal auf der Stufe „Schwer“ zu Ende.', test: (p, cats) => cats.every((c) => c.games.every((g) => p.stats.hardPlayed[g.id])) },
  { id: 'score1500', sym: '1,5k', name: 'Punktejäger', desc: 'Hole in einer einzigen Übung 1.500 Punkte.', test: (p) => p.stats.maxScore >= 1500 },
  { id: 'score2500', sym: '2,5k', name: 'Rekordjäger', desc: 'Hole in einer einzigen Übung 2.500 Punkte.', test: (p) => p.stats.maxScore >= 2500 },
  { id: 'variety', sym: '5×', name: 'Vielseitig', desc: 'Spiele an einem Tag fünf verschiedene Übungen.', test: (p) => mostGamesOnOneDay(p) >= 5 },
  { id: 'flawless5', sym: '♥♥', name: 'Eisern', desc: 'Beende fünfmal „Ausweichen“, „Fangen“ oder „Stopp“ mit allen drei Herzen.', test: (p) => p.stats.flawless >= 5 },
  { id: 'train10', sym: 'T10', name: 'Trainingsfleiß', desc: 'Spiele zehn Trainings bis zum Ende durch.', test: (p) => trainings(p) >= 10 },
  { id: 'custom', sym: '✎', name: 'Eigener Plan', desc: 'Stelle in der Einrichtung ein eigenes Training zusammen und spiele es durch.', test: (p) => (p.stats.sessions.custom || 0) >= 1 },
  { id: 'days14', sym: '14T', name: 'Zwei Wochen', desc: 'Trainiere an 14 Tagen hintereinander.', test: (p) => p.days.streak >= 14 },
  { id: 'days30', sym: '30T', name: 'Monatsheld', desc: 'Trainiere an 30 Tagen hintereinander.', test: (p) => p.days.streak >= 30 },
  { id: 'daily15', sym: '☀☀', name: 'Sonnenkind', desc: 'Spiele an 15 verschiedenen Tagen die Übung unter „Heute“.', test: (p) => p.stats.dailyCount >= 15 },
  { id: 'duel5', sym: 'VS5', name: 'Duellkönig', desc: 'Gewinne fünf Duelle.', test: (p) => p.stats.duelWins >= 5 },
  { id: 'xp100k', sym: '100k', name: 'Hunderttausend', desc: 'Sammle insgesamt 100.000 Punkte und erreiche den Rang „Profi“.', test: (p) => p.xp >= 100000 },
  { id: 'legend', sym: '♛', name: 'Legende', desc: 'Sammle 160.000 Punkte und erreiche den Rang „Legende“.', test: (p) => p.xp >= 160000 },
  { id: 'president', sym: '1M', name: 'Clubpräsident', desc: 'Sammle eine Million Punkte und werde Clubpräsident, der höchste Rang.', test: (p) => p.xp >= 1000000 },
  { id: 'speed10', sym: '10km', name: 'Flitzer', desc: 'Bring den Ball auf 10 km/h – die App misst bei jeder Übung den schnellsten Ball.', test: (p) => (p.stats.topSpeed || 0) >= 10 },
  { id: 'speed18', sym: '18km', name: 'Rakete', desc: 'Bring den Ball auf 18 km/h.', test: (p) => (p.stats.topSpeed || 0) >= 18 },
  { id: 'career10', sym: 'K10', name: 'Inselkönig', desc: 'Schaffe in der Karriere die ersten 10 Stationen.', test: (p) => careerDone(p) >= 10 },
  { id: 'career30', sym: 'K30', name: 'Gipfelstürmer', desc: 'Schaffe alle 30 Stationen der Karriere.', test: (p) => careerDone(p) >= 30 },
  { id: 'chest1', sym: '▣', name: 'Schatzsucher', desc: 'Erledige an einem Tag alle drei Tagesaufgaben und öffne die Schatzkiste.', test: (p) => (p.stats.chests || 0) >= 1 },
  { id: 'chest10', sym: '▣10', name: 'Schatzmeister', desc: 'Öffne zehn Schatzkisten.', test: (p) => (p.stats.chests || 0) >= 10 },
  { id: 'collector', sym: '30', name: 'Sammler', desc: 'Hole 30 andere Abzeichen.', test: (p) => Object.keys(p.badges).filter((id) => id !== 'collector').length >= 30 },
];

/** Wie viele Karriere-Stationen am Stück geschafft sind (das Ziel steht in career.js; hier reicht der Zähler). */
const careerDone = (p) => p.career?.done ?? 0;

const trainings = (p) => Object.values(p.stats.sessions).reduce((a, b) => a + b, 0);

/** Wie viele verschiedene Übungen an einem einzigen Tag gespielt wurden (höchster Wert im Verlauf). */
function mostGamesOnOneDay(p) {
  const days = {};
  for (const h of p.history) (days[h.d] ??= new Set()).add(h.g);
  return Math.max(0, ...Object.values(days).map((s) => s.size));
}

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
  stars250: (p) => [p.stats.stars, 250],
  all3: (p, cats) => [cats.reduce((n, c) => n + c.games.filter((g) => (p.stats.best[g.id] || 0) >= 3).length, 0), cats.reduce((n, c) => n + c.games.length, 0)],
  hardall: (p, cats) => [cats.reduce((n, c) => n + c.games.filter((g) => p.stats.hardPlayed[g.id]).length, 0), cats.reduce((n, c) => n + c.games.length, 0)],
  score1500: (p) => [p.stats.maxScore, 1500],
  score2500: (p) => [p.stats.maxScore, 2500],
  variety: (p) => [mostGamesOnOneDay(p), 5],
  flawless5: (p) => [p.stats.flawless, 5],
  train10: (p) => [trainings(p), 10],
  days14: (p) => [p.days.streak, 14],
  days30: (p) => [p.days.streak, 30],
  daily15: (p) => [p.stats.dailyCount, 15],
  duel5: (p) => [p.stats.duelWins, 5],
  xp100k: (p) => [p.xp, 100000],
  legend: (p) => [p.xp, 160000],
  president: (p) => [p.xp, 1000000],
  speed10: (p) => [Math.floor(p.stats.topSpeed || 0), 10],
  speed18: (p) => [Math.floor(p.stats.topSpeed || 0), 18],
  career10: (p) => [Math.min(10, careerDone(p)), 10],
  career30: (p) => [careerDone(p), 30],
  chest10: (p) => [p.stats.chests || 0, 10],
  collector: (p) => [Object.keys(p.badges).filter((id) => id !== 'collector').length, 30],
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
  s.topSpeed = Math.max(s.topSpeed || 0, Math.round((r.topSpeed || 0) * 10) / 10);
  if (r.counts !== false) {
    s.rounds++;
    s.stars += r.stars;
    s.played[r.gameId] = (s.played[r.gameId] || 0) + 1;
    s.best[r.gameId] = Math.max(s.best[r.gameId] || 0, r.stars);
    if (r.level === 3 && r.stars >= 3) s.hard3 = true;
    if (r.level === 3) s.hardPlayed[r.gameId] = 1;
    s.maxScore = Math.max(s.maxScore, Math.round(r.score));
    if (r.lives && r.livesLeft === r.lives) s.flawless++;
    p.history.push({ d: day, g: r.gameId, l: r.level, s: Math.round(r.score), st: r.stars });
    if (p.history.length > 400) p.history.splice(0, p.history.length - 400);
  }
  // Tagesaufgaben: erledigte melden, bei allen dreien geht die Schatzkiste auf
  const quest = r.counts !== false ? advanceMissions(p, r, categories, day) : { done: [], chest: null };
  if (quest.chest) p.xp += quest.chest.xp;
  return {
    xp, dailyBonus, missions: quest.done, chest: quest.chest,
    rankUp: rankOf(p.xp).index > before, badges: awardBadges(p, categories, day),
  };
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
