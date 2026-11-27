// Einstellungen, Kalibrierung und Bestwerte – im Browser gespeichert.
import { BALL_PRESETS } from './tracker.js';

const KEY = 'hockeyskills.v1';

const defaults = () => ({
  cameraId: null,
  ball: { preset: 'orange', ...BALL_PRESETS.orange },
  fieldShape: 'square', // 'square' = Quadrat, 'full' = ganze Projektionsfläche
  speed: 1,             // Tempo: 0 = langsam, 1 = normal, 2 = schnell
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

/**
 * Spielfarben im Vereinsstil Blau-Weiss: vier Blautöne von Königsblau bis Hellblau.
 * Blau ist von allen Neon-Ballfarben (Orange, Gelb, Grün, Pink) weit entfernt,
 * die Kamera verwechselt die Spielgrafik also nicht mit dem Ball.
 */
export const BRAND = {
  name: 'Blau-Weiss Skiller Academy',
  club: 'TC Blau-Weiss Berlin',
  palette: ['hsl(212 90% 55%)', 'hsl(196 90% 55%)', 'hsl(226 90% 62%)', 'hsl(204 90% 72%)'],
};

export function paletteFor() {
  return BRAND.palette;
}
