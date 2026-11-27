import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile, completeProfile, rankOf, recordRound, recordEvent, dailyGame, summarize, badgeProgress, BADGES, RANKS } from '../src/profile.js';
import { categories, games } from '../src/games/index.js';

const round = (over = {}) => ({ gameId: 'targets', level: 1, score: 100, stars: 1, maxMult: 1, ...over });

test('Rang steigt mit den Punkten', () => {
  assert.equal(rankOf(0).name, 'Anfänger');
  assert.equal(rankOf(2999).index, 0);
  assert.equal(rankOf(3000).name, 'Dribbler');
  assert.equal(rankOf(5500).progress, 0.5);
  assert.equal(rankOf(1e9).index, RANKS.length - 1);
  assert.equal(rankOf(1e9).next, null);
});

test('Runde verbuchen: Punkte, Abzeichen, Verlauf', () => {
  const p = newProfile('Test');
  const r = recordRound(p, round({ score: 3600, stars: 3, maxMult: 4 }), categories, '2026-01-10');
  assert.equal(p.xp, 3600);
  assert.ok(r.rankUp);
  assert.deepEqual(r.badges.map((b) => b.id).sort(), ['first', 'mult4', 'score1500', 'score2500', 'star3']);
  assert.equal(p.history.length, 1);
  // dieselben Abzeichen gibt es nicht doppelt
  assert.equal(recordRound(p, round(), categories, '2026-01-10').badges.length, 0);
});

test('Übung des Tages verdoppelt die Punkte einmal am Tag', () => {
  const p = newProfile('Test');
  assert.equal(recordRound(p, round({ daily: true }), categories, '2026-01-10').xp, 200);
  assert.equal(recordRound(p, round({ daily: true }), categories, '2026-01-10').xp, 100);
  assert.equal(recordRound(p, round({ daily: true }), categories, '2026-01-11').xp, 200);
  assert.equal(dailyGame(games, '2026-01-10'), dailyGame(games, '2026-01-10'));
});

test('Tage in Folge', () => {
  const p = newProfile('Test');
  recordRound(p, round(), categories, '2026-01-30');
  recordRound(p, round(), categories, '2026-01-31');
  const r = recordRound(p, round(), categories, '2026-02-01'); // über den Monatswechsel
  assert.equal(p.days.streak, 3);
  assert.ok(r.badges.some((b) => b.id === 'days3'));
  recordRound(p, round(), categories, '2026-02-05');
  assert.equal(p.days.streak, 1);
});

test('Finale zählt für Punkte, aber nicht als eigene Übung', () => {
  const p = newProfile('Test');
  recordRound(p, round({ gameId: 'finale', counts: false }), categories, '2026-01-10');
  assert.equal(p.xp, 100);
  assert.equal(p.stats.rounds, 0);
  assert.equal(p.history.length, 0);
});

test('Trainings- und Schwerpunkt-Abzeichen', () => {
  const p = newProfile('Test');
  assert.deepEqual(recordEvent(p, 'short', categories).map((b) => b.id), ['s_short']);
  for (const g of categories.find((c) => c.id === 'wechsel').games) recordRound(p, round({ gameId: g.id, stars: 2 }), categories);
  assert.ok(p.badges.cat_wechsel);
  assert.ok(!p.badges.cat_fuehren);
});

test('Alle Abzeichen sind erreichbar und eindeutig', () => {
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
  const p = newProfile('Test');
  for (let day = 1; day <= 30; day++) {
    for (const g of games) {
      recordRound(p, round({ gameId: g.id, level: 3, score: 3000, stars: 3, maxMult: 4, lives: 3, livesLeft: 3, daily: true }), categories, `2026-03-${String(day).padStart(2, '0')}`);
    }
  }
  for (let i = 0; i < 80; i++) recordRound(p, round(), categories, '2026-03-30');
  for (const kind of ['short', 'medium', 'full', 'custom']) recordEvent(p, kind, categories);
  for (let i = 0; i < 6; i++) { recordEvent(p, 'short', categories); recordEvent(p, 'duel', categories); }
  assert.ok(p.badges.collector, 'der Sammler kommt, sobald 30 andere da sind');
  assert.deepEqual(BADGES.filter((b) => !p.badges[b.id]).map((b) => b.id), []);
});

test('Verlauf: Schnitt und Tendenz', () => {
  const p = newProfile('Test');
  for (const s of [10, 10, 10, 10, 10, 50, 50, 50, 50, 50]) recordRound(p, round({ score: s }), categories);
  const row = summarize(p, games).find((x) => x.game.id === 'targets');
  assert.deepEqual([row.rounds, row.best, row.recent, row.trend], [10, 50, 50, 1]);
  assert.equal(summarize(p, games).find((x) => x.game.id === 'cloud').rounds, 0);
});

test('Abzeichen: jedes hat eine Erklärung, zählbare zeigen den Fortschritt', () => {
  const p = newProfile('Test');
  for (const b of BADGES) assert.ok(b.desc.length > 15 && b.desc.endsWith('.'), b.id);
  for (let i = 0; i < 7; i++) recordRound(p, round({ stars: 2 }), categories, '2026-01-10');
  const of = (id) => badgeProgress(BADGES.find((b) => b.id === id), p, categories);
  assert.deepEqual(of('r10'), [7, 10]);
  assert.deepEqual(of('stars25'), [14, 25]);
  assert.deepEqual(of('all'), [1, 18]);
  assert.deepEqual(of('cat_treffen'), [1, 4]);
  assert.equal(of('mult4'), null);
  for (let i = 0; i < 300; i++) recordRound(p, round(), categories, '2026-01-10');
  assert.deepEqual(of('r10'), [10, 10], 'Fortschritt läuft nicht über das Ziel hinaus');
});

test('Alte oder unvollständige Spielstände werden ergänzt, ohne etwas zu verlieren', () => {
  const old = { id: 'abc', name: 'Mia', xp: 1200, highscores: { 'targets:1:1': 300 }, stats: { rounds: 5 } };
  const p = completeProfile(old);
  assert.deepEqual([p.id, p.name, p.xp, p.stats.rounds, p.highscores['targets:1:1']], ['abc', 'Mia', 1200, 5, 300]);
  // was fehlte, ist jetzt da – eine Runde lässt sich ohne Fehler verbuchen
  recordRound(p, round(), categories, '2026-01-10');
  assert.equal(p.stats.rounds, 6);
  assert.equal(p.days.streak, 1);
  assert.equal(completeProfile({ xp: 'kaputt', history: null }).xp, 0);
});

test('Wochenrangliste: zählt Montag bis Sonntag und beginnt jeden Montag neu', async () => {
  const { weekStart, weekStats } = await import('../src/profile.js');
  assert.equal(weekStart('2026-11-27'), '2026-11-23'); // Freitag -> Montag derselben Woche
  assert.equal(weekStart('2026-11-23'), '2026-11-23'); // Montag bleibt Montag
  assert.equal(weekStart('2026-11-29'), '2026-11-23'); // Sonntag gehört noch dazu
  assert.equal(weekStart('2026-03-01'), '2026-02-23'); // über den Monatswechsel
  const p = newProfile('Test');
  recordRound(p, round({ score: 500, stars: 2 }), categories, '2026-11-22'); // Sonntag der Vorwoche
  recordRound(p, round({ score: 300, stars: 1 }), categories, '2026-11-23');
  recordRound(p, round({ score: 700, stars: 3 }), categories, '2026-11-27');
  assert.deepEqual(weekStats(p, '2026-11-27'), { rounds: 2, points: 1000, stars: 4 });
  assert.deepEqual(weekStats(p, '2026-11-30'), { rounds: 0, points: 0, stars: 0 }, 'am nächsten Montag steht alles wieder auf null');
  assert.equal(p.stats.rounds, 3, 'die Gesamtzahl bleibt');
});

test('Alter und Altersklasse', async () => {
  const { ageOf, ageClass, completeProfile } = await import('../src/profile.js');
  const p = newProfile('Test');
  assert.equal(ageOf(p), null);
  assert.equal(ageClass(null), null);
  p.birthYear = 2017;
  assert.equal(ageOf(p, 2026), 9);
  assert.equal(ageOf(p, 2027), 10, 'zählt jedes Jahr von selbst weiter');
  assert.deepEqual([4, 5, 6, 7, 9, 10, 13, 14, 17, 18, 45].map(ageClass),
    ['U6', 'U6', 'U8', 'U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'Erwachsene', 'Erwachsene']);
  assert.equal(completeProfile({ name: 'Alt' }).birthYear, null, 'alte Spielstände ohne Alter bleiben gültig');
});

test('Rang: mit einer Million Punkten wird man Clubpräsident', () => {
  assert.equal(rankOf(999999).name, 'Legende');
  assert.equal(rankOf(1000000).name, 'Clubpräsident');
  const p = newProfile('Test');
  p.xp = 999500;
  const r = recordRound(p, round({ score: 600 }), categories, '2026-01-10');
  assert.ok(r.rankUp);
  assert.ok(p.badges.president);
});

test('Tagesaufgaben: drei am Tag, für alle gleich, morgen andere; Kiste bringt Punkte und Sammelstück', async () => {
  const { missionsFor, todaysMissions, ITEMS, CHEST_XP } = await import('../src/quests.js');
  const a = missionsFor('2026-11-27', categories), b = missionsFor('2026-11-27', categories);
  assert.equal(a.length, 3);
  assert.deepEqual(a, b, 'gleicher Tag, gleiche Aufgaben');
  assert.equal(new Set(a.map((m) => m.type)).size, 3, 'drei verschiedene Arten');
  const days = new Set();
  for (let d = 1; d <= 28; d++) days.add(missionsFor(`2026-02-${String(d).padStart(2, '0')}`, categories).map((m) => m.text).join('|'));
  assert.ok(days.size > 20, 'die Tage unterscheiden sich');

  const p = newProfile('Test');
  let chest = null, done = 0, xp = 0;
  for (const g of games) {
    const before = p.xp;
    const r = recordRound(p, round({ gameId: g.id, level: 2, score: 900, stars: 3, maxMult: 4 }), categories, '2026-11-27');
    done += r.missions.length;
    xp += p.xp - before;
    chest ??= r.chest;
  }
  assert.equal(done, 3);
  assert.equal(chest.xp, CHEST_XP);
  assert.equal(chest.item.id, ITEMS[0].id);
  assert.equal(p.gear.trail, ITEMS[0].id, 'das neue Sammelstück ist gleich angelegt');
  assert.equal(xp, games.length * 900 + CHEST_XP, 'Rundenpunkte plus Kiste');
  assert.ok(p.badges.chest1);
  assert.equal(todaysMissions(p, categories, '2026-11-27').chest, true);
  // Am nächsten Tag gibt es neue Aufgaben und die nächste Kiste
  const next = todaysMissions(p, categories, '2026-11-28');
  assert.equal(next.chest, false);
  assert.ok(next.list.every((m) => m.n === 0));
  for (const g of games) recordRound(p, round({ gameId: g.id, level: 2, score: 900, stars: 3, maxMult: 4 }), categories, '2026-11-28');
  assert.equal(Object.keys(p.items).length, 2);
  assert.equal(p.gear.hat, ITEMS[1].id);
});

test('Nächste Ziele: Stern, Aufgabe, Wochenplatz, Abzeichen, Rang', async () => {
  const { nextGoals, weekLeader } = await import('../src/goals.js');
  const a = newProfile('A'), b = newProfile('B');
  for (let i = 0; i < 3; i++) recordRound(b, round({ score: 100, stars: 0 }), categories, '2026-11-26');
  for (let i = 0; i < 6; i++) recordRound(a, round({ score: 100, stars: 0 }), categories, '2026-11-20'); // Vorwoche
  recordRound(a, round({ score: 100, stars: 1 }), categories, '2026-11-27');
  const goals = nextGoals(a, [a, b], { score: 460, stars: 1, thresholds: [200, 500, 900] }, categories, '2026-11-27');
  assert.equal(goals[0], 'Noch 40 Punkte bis zum zweiten Stern');
  assert.ok(goals.some((g) => g.startsWith('Aufgabe: ') || g.startsWith('Nur noch eine Aufgabe')), goals.join(' / '));
  assert.ok(goals.includes('Noch 3 Spiele bis Platz 1 der Woche'), goals.join(' / '));
  assert.ok(goals.includes('Abzeichen „Fleißig“: 7 von 10'), goals.join(' / '));
  assert.ok(goals.at(-1).endsWith('bis „Dribbler“'));
  assert.equal(weekLeader([a, b], '2026-11-27'), b);
  assert.equal(weekLeader([a, b], '2026-11-30'), null, 'neue Woche, noch niemand');
  assert.equal(nextGoals(a, [a], { score: 950, stars: 3, thresholds: [200, 500, 900] }, categories, '2026-11-27').some((g) => g.includes('bis zum')), false);
});

test('Trainer: Zurufe und Erinnerungen im Menü', async () => {
  const { shout, SHOUTS, memories, cheerful } = await import('../src/coach.js');
  for (const kind of Object.keys(SHOUTS)) assert.ok(SHOUTS[kind].includes(shout(kind)), kind);
  assert.equal(shout('gibtsnicht'), null);
  assert.ok(cheerful('record') && !cheerful('misses'));
  const p = newProfile('Lotta');
  assert.deepEqual(memories(p, games, categories, '2026-11-27', 9), ['Guten Morgen Lotta!']);
  recordRound(p, round({ gameId: 'slalom', score: 800, stars: 2 }), categories, '2026-11-26');
  recordRound(p, round({ gameId: 'targets', score: 300, stars: 1 }), categories, '2026-11-26');
  const m = memories(p, games, categories, '2026-11-27', 15);
  assert.equal(m[0], 'Hallo Lotta!');
  assert.equal(m[1], 'Gestern: 2 Sterne bei „Slalom“ – schaffst du heute mehr?');
  assert.ok(m.includes('Bei „Slalom“ fehlt dir nur noch ein Stern!'));
  assert.equal(memories(p, games, categories, '2026-12-05', 20)[0], 'Schön, dass du wieder da bist, Lotta!');
  for (let i = 0; i < 6; i++) recordRound(p, round({ gameId: 'targets' }), categories, '2026-11-27');
  const later = memories(p, games, categories, '2026-11-28', 12);
  assert.ok(later.some((l) => l.startsWith('Wie wäre es mal wieder mit')), later.join(' / '));
  assert.ok(later.some((l) => l.startsWith('Deine Lieblingsübung: „Ziele“')), later.join(' / '));
});
