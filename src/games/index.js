// Alle Übungen, nach Trainingsschwerpunkt sortiert.
// Ein neues Spiel hier in eine Kategorie eintragen, dann erscheint es im Menü und im Training.
import targets from './targets.js';
import cloud from './cloud.js';
import dodge from './dodge.js';
import rain from './rain.js';
import chase from './chase.js';
import line from './line.js';
import slalom from './slalom.js';
import run from './run.js';
import wire from './wire.js';
import eight from './eight.js';
import spotlight from './spotlight.js';
import trace from './trace.js';
import pendulum from './pendulum.js';
import taps from './taps.js';
import rhythm from './rhythm.js';
import stop from './stop.js';
import spot from './spot.js';
import roll from './roll.js';
import tricks from './tricks.js';

export const categories = [
  // hue = Farbton des Schwerpunkts (wird an die Ballfarbe angepasst)
  { id: 'treffen', name: 'Treffen', hue: 325, games: [targets, cloud, dodge, chase] },
  { id: 'fuehren', name: 'Führen', hue: 140, games: [line, slalom, run, wire, eight, spotlight, trace] },
  { id: 'wechsel', name: 'Wechsel', hue: 272, games: [pendulum, taps, rhythm, rain] },
  { id: 'stoppen', name: 'Stoppen', hue: 178, games: [stop, spot, roll] },
  { id: 'tricks', name: 'Tricks', hue: 66, games: [tricks] },
];

export const games = categories.flatMap((c) => c.games);

/** Die drei Trainingslängen: Name, Übungen pro Kategorie, Sekunden pro Übung. */
export const SESSIONS = {
  short: { name: 'Kurz', perCategory: 1, seconds: 40 },
  medium: { name: 'Mittel', perCategory: 2, seconds: 40 },
  full: { name: 'Komplett', perCategory: Infinity, seconds: 35 },
};

/**
 * Stellt ein Training zusammen: aus jeder Kategorie zufällig so viele Übungen wie verlangt,
 * dann reihum gemischt, damit sich die Schwerpunkte abwechseln.
 */
export function sessionPlan(kind, random = Math.random) {
  const picks = categories.map((c) => {
    const pool = [...c.games];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, SESSIONS[kind].perCategory);
  });
  const plan = [];
  for (let i = 0; picks.some((p) => i < p.length); i++) {
    for (const p of picks) if (i < p.length) plan.push(p[i]);
  }
  return plan;
}
