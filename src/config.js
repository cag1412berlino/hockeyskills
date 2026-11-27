// Einstellungen, Kalibrierung und Bestwerte – im Browser gespeichert.
import { BALL_PRESETS } from './tracker.js';

const KEY = 'hockeyskills.v1';

const defaults = () => ({
  cameraId: null,
  ball: { preset: 'orange', ...BALL_PRESETS.orange },
  fieldShape: 'square', // 'square' = Quadrat, 'full' = ganze Projektionsfläche
  calib: null,          // { H, aspect, error }
  highscores: {},       // 'spiel:level' -> Punkte
});

function load() {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return defaults();
  }
}

export const config = load();

export function saveConfig() {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Speichern nicht möglich (z. B. privates Fenster) – dann eben ohne.
  }
}

/** Spielfarben, die weit genug von der Ballfarbe entfernt sind, damit die Kamera sie nicht verwechselt. */
export function paletteFor(ballHue) {
  return [120, 160, 200, 240].map((d) => `hsl(${(ballHue + d) % 360} 90% 55%)`);
}
