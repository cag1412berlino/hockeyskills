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
  assert.deepEqual(r.badges.map((b) => b.id).sort(), ['first', 'mult4', 'star3']);
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
  for (let day = 1; day <= 8; day++) {
    for (const g of games) {
      recordRound(p, round({ gameId: g.id, level: 3, score: 3000, stars: 3, maxMult: 4, lives: 3, livesLeft: 3, daily: true }), categories, `2026-03-0${day}`);
    }
  }
  for (let i = 0; i < 80; i++) recordRound(p, round(), categories, '2026-03-08');
  for (const kind of ['short', 'medium', 'full', 'duel']) recordEvent(p, kind, categories);
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
