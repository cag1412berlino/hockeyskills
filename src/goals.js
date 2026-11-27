/**
 * „Was kommt als Nächstes?“ – sucht nach einer Runde die Ziele, die am nächsten liegen:
 * der nächste Stern, eine offene Tagesaufgabe, der nächste Platz in der Wochenliste,
 * ein fast erreichtes Abzeichen, der nächste Rang. Ein Ziel in Reichweite ist der beste Grund für „nochmal“.
 */
import { BADGES, RANKS, badgeProgress, rankOf, weekStats } from './profile.js';

const num = (n) => Math.round(n).toLocaleString('de-DE');

/**
 * r = { score, stars, thresholds } der gerade gespielten Runde (oder null), profiles = alle Spieler.
 * Liefert kurze Sätze, die wichtigsten zuerst.
 */
export function nextGoals(p, profiles, r, categories, day) {
  const goals = [];
  // 1. Der nächste Stern in dieser Übung
  if (r && r.stars < 3 && r.thresholds?.[r.stars] > r.score) {
    const need = r.thresholds[r.stars] - r.score;
    goals.push(`Noch ${num(need)} ${need === 1 ? 'Punkt' : 'Punkte'} bis zum ${['ersten', 'zweiten', 'dritten'][r.stars]} Stern`);
  }
  // 2. Tagesaufgaben
  const quest = p.missions?.day === day ? p.missions : null;
  if (quest && !quest.chest) {
    const open = quest.list.filter((m) => m.n < m.target);
    if (open.length === 1) goals.push(`Nur noch eine Aufgabe bis zur Schatzkiste: ${open[0].text}`);
    else if (open.length) goals.push(`Aufgabe: ${open[0].text}${open[0].target > 1 ? ` (${num(open[0].n)} von ${num(open[0].target)})` : ''}`);
  }
  // 3. Wochenliste: Wer liegt knapp vor mir?
  const mine = weekStats(p, day).rounds;
  const ahead = profiles.filter((q) => q !== p).map((q) => weekStats(q, day).rounds).filter((n) => n >= mine).sort((a, b) => a - b);
  if (ahead.length) {
    const need = ahead[0] - mine + 1;
    const place = ahead.length; // so viele liegen vorn oder gleichauf -> das wäre der neue Platz
    goals.push(`Noch ${need} ${need === 1 ? 'Spiel' : 'Spiele'} bis Platz ${place} der Woche`);
  }
  // 4. Das Abzeichen, das am nächsten liegt (mindestens zur Hälfte geschafft)
  let best = null;
  for (const b of BADGES) {
    if (p.badges[b.id]) continue;
    const pr = badgeProgress(b, p, categories);
    if (!pr || pr[1] <= 0) continue;
    const frac = pr[0] / pr[1];
    if (frac >= 0.5 && (!best || frac > best.frac)) best = { b, pr, frac };
  }
  if (best) goals.push(`Abzeichen „${best.b.name}“: ${num(best.pr[0])} von ${num(best.pr[1])}`);
  // 5. Der nächste Rang
  const rank = rankOf(p.xp);
  const next = RANKS[rank.index + 1];
  if (next) goals.push(`Noch ${num(next.xp - p.xp)} Punkte bis „${next.name}“`);
  return goals;
}

/** Wer führt die laufende Woche an? Liefert den Spieler oder null (niemand hat gespielt oder Gleichstand). */
export function weekLeader(profiles, day) {
  const rows = profiles.map((p) => ({ p, n: weekStats(p, day).rounds })).sort((a, b) => b.n - a.n);
  if (!rows.length || rows[0].n === 0 || (rows[1] && rows[1].n === rows[0].n)) return null;
  return rows[0].p;
}
