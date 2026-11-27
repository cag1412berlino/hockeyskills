/**
 * Tagesaufgaben, Schatzkiste und Sammelstücke.
 * Jeden Tag gibt es drei kleine Aufgaben, für alle Spieler dieselben. Sind alle drei erledigt,
 * geht die Schatzkiste auf: Bonuspunkte und ein neues Sammelstück (Ballschweif oder Kopfbedeckung
 * für den Trainer). Danach ist für heute Schluss mit Aufgaben – morgen gibt es neue.
 * Dieses Modul kennt weder Bildschirm noch Speicher; es rechnet nur auf dem Profil.
 */

/** Sammelstücke: kind 'trail' = Ballschweif, 'hat' = Kopfbedeckung des Trainers. */
export const ITEMS = [
  { id: 'trail_rainbow', kind: 'trail', name: 'Regenbogen-Schweif' },
  { id: 'hat_cap', kind: 'hat', name: 'Kappe' },
  { id: 'trail_fire', kind: 'trail', name: 'Feuer-Schweif' },
  { id: 'hat_beanie', kind: 'hat', name: 'Bommelmütze' },
  { id: 'trail_ice', kind: 'trail', name: 'Eis-Schweif' },
  { id: 'hat_party', kind: 'hat', name: 'Partyhut' },
  { id: 'trail_stars', kind: 'trail', name: 'Sternen-Schweif' },
  { id: 'hat_wizard', kind: 'hat', name: 'Zauberhut' },
  { id: 'trail_gold', kind: 'trail', name: 'Gold-Schweif' },
  { id: 'hat_tophat', kind: 'hat', name: 'Zylinder' },
];

export const CHEST_XP = 500;

/** Einfache Zufallszahlen aus einem Text (Datum), damit alle Spieler dieselben Aufgaben haben. */
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Die Vorlagen: jede baut aus einer Zufallszahl eine Aufgabe { type, target, text, ...}. */
const TEMPLATES = [
  (r) => { const n = 3 + Math.floor(r * 3); return { type: 'rounds', target: n, text: `Spiele ${n} Übungen` }; },
  (r) => { const n = 4 + Math.floor(r * 3); return { type: 'stars', target: n, text: `Hole ${n} Sterne` }; },
  (r) => { const n = [1500, 2000, 2500][Math.floor(r * 3)]; return { type: 'points', target: n, text: `Sammle ${n.toLocaleString('de-DE')} Punkte` }; },
  (r, cats) => { const c = cats[Math.floor(r * cats.length)]; return { type: 'cat', cat: c.id, target: 1, text: `Spiele eine Übung aus „${c.name}“` }; },
  () => ({ type: 'mult', target: 1, text: 'Schaffe eine Serie x3' }),
  () => ({ type: 'two', target: 1, text: 'Hole in einer Übung zwei Sterne' }),
  () => ({ type: 'level', target: 1, text: 'Spiele eine Übung auf „Mittel“ oder „Schwer“' }),
];

/** Die drei Aufgaben eines Tages. */
export function missionsFor(day, categories) {
  const rnd = seeded(`aufgaben-${day}`);
  const pool = TEMPLATES.map((_, i) => i);
  const list = [];
  while (list.length < 3) {
    const [i] = pool.splice(Math.floor(rnd() * pool.length), 1);
    list.push({ ...TEMPLATES[i](rnd(), categories), n: 0 });
  }
  return list;
}

/** Die Aufgaben des Spielers für heute (legt sie an, wenn ein neuer Tag begonnen hat). */
export function todaysMissions(p, categories, day) {
  if (p.missions?.day !== day || !Array.isArray(p.missions.list)) {
    p.missions = { day, list: missionsFor(day, categories), chest: false };
  }
  return p.missions;
}

/** Wie viel eine Runde zu einer Aufgabe beiträgt. */
function gain(m, r, categories) {
  switch (m.type) {
    case 'rounds': return 1;
    case 'stars': return r.stars;
    case 'points': return Math.max(0, Math.round(r.score));
    case 'cat': return categories.find((c) => c.id === m.cat)?.games.some((g) => g.id === r.gameId) ? 1 : 0;
    case 'mult': return (r.maxMult || 1) >= 3 ? 1 : 0;
    case 'two': return r.stars >= 2 ? 1 : 0;
    case 'level': return r.level >= 2 ? 1 : 0;
    default: return 0;
  }
}

/**
 * Verbucht eine Runde auf die Tagesaufgaben. Liefert { done: [Texte der gerade erledigten Aufgaben],
 * chest: null | { xp, item } } – die Kiste geht auf, sobald alle drei geschafft sind.
 */
export function advanceMissions(p, r, categories, day) {
  const quest = todaysMissions(p, categories, day);
  const done = [];
  for (const m of quest.list) {
    if (m.n >= m.target) continue;
    m.n = Math.min(m.target, m.n + gain(m, r, categories));
    if (m.n >= m.target) done.push(m.text);
  }
  let chest = null;
  if (!quest.chest && quest.list.every((m) => m.n >= m.target)) {
    quest.chest = true;
    p.items ??= {};
    p.gear ??= { trail: null, hat: null };
    // Sammelstücke kommen in fester Reihenfolge, abwechselnd Schweif und Kopfbedeckung.
    const item = ITEMS.find((it) => !p.items[it.id]) ?? null;
    if (item) {
      p.items[item.id] = day;
      p.gear[item.kind] = item.id; // das Neue wird gleich angelegt
    }
    chest = { xp: item ? CHEST_XP : CHEST_XP * 2, item };
    p.stats.chests = (p.stats.chests || 0) + 1;
  }
  return { done, chest };
}
