/**
 * Was der Trainer sagt: kurze Zurufe während der Runde und Sätze im Menü, die sich an das
 * erinnern, was der Spieler zuletzt gemacht hat. Nur Texte, kein Bildschirm und kein Ton.
 */

/** Zurufe während der Runde, je Anlass mehrere zur Abwechslung. */
export const SHOUTS = {
  streak3: ['Stark!', 'Weiter so!', 'Läuft bei dir!'],
  streak4: ['Wahnsinn!', 'Du bist nicht zu stoppen!', 'Mega Serie!'],
  record: ['Neuer Rekord!', 'Rekord geknackt!', 'So gut warst du noch nie!'],
  ahead: ['Du liegst vor deinem Rekord!', 'Das wird ein Rekord – bleib dran!'],
  behind: ['Gib Gas, der Rekord ist noch drin!', 'Noch ist alles möglich!'],
  endspurt: ['Endspurt!', 'Die letzten Sekunden – alles geben!'],
  misses: ['Ruhig bleiben, das wird!', 'Kein Problem, weiter geht’s!', 'Schau auf den Ball!'],
  life: ['Aufpassen!', 'Kopf hoch, weiter!'],
};

/** Stimmung des Trainers zu einem Zuruf: jubelnd oder aufmunternd. */
export const cheerful = (kind) => ['streak3', 'streak4', 'record', 'ahead'].includes(kind);

export function shout(kind, rnd = Math.random) {
  const list = SHOUTS[kind] ?? [];
  return list[Math.floor(rnd() * list.length)] ?? null;
}

const dayDiff = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 86400000);

/**
 * Sätze fürs Menü, die sich auf den Spieler beziehen. games = alle Übungen, categories = Schwerpunkte,
 * day = heute, hour = Uhrzeit (0 bis 23). Die wichtigsten stehen vorn.
 */
export function memories(p, games, categories, day, hour = 12) {
  const lines = [];
  const name = (id) => games.find((g) => g.id === id)?.name;
  const hello = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const away = p.days.last ? dayDiff(p.days.last, day) : 0;
  lines.push(away >= 4 ? `Schön, dass du wieder da bist, ${p.name}!` : `${hello} ${p.name}!`);

  // Das beste Ergebnis vom letzten Trainingstag
  const earlier = p.history.filter((h) => h.d < day);
  if (earlier.length) {
    const lastDay = earlier[earlier.length - 1].d;
    const best = earlier.filter((h) => h.d === lastDay).sort((a, b) => b.st - a.st || b.s - a.s)[0];
    const when = dayDiff(lastDay, day) === 1 ? 'Gestern' : 'Letztes Mal';
    if (best && name(best.g)) {
      lines.push(best.st > 0
        ? `${when}: ${best.st === 1 ? 'ein Stern' : `${best.st} Sterne`} bei „${name(best.g)}“ – schaffst du heute mehr?`
        : `${when} hast du „${name(best.g)}“ geübt – heute klappt es besser!`);
    }
  }
  // Eine Übung, bei der nur noch ein Stern fehlt
  const almost = games.find((g) => p.stats.best[g.id] === 2);
  if (almost) lines.push(`Bei „${almost.name}“ fehlt dir nur noch ein Stern!`);
  // Ein Schwerpunkt, der lange nicht dran war
  if (p.stats.rounds >= 5) {
    const recent = new Set(p.history.slice(-12).map((h) => h.g));
    const rusty = categories.find((c) => !c.games.some((g) => recent.has(g.id)));
    if (rusty) lines.push(`Wie wäre es mal wieder mit „${rusty.name}“?`);
  }
  // Die Lieblingsübung
  const [favId, favN] = Object.entries(p.stats.played).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (favN >= 5 && name(favId)) lines.push(`Deine Lieblingsübung: „${name(favId)}“ – ${favN} Mal gespielt!`);
  return lines;
}
