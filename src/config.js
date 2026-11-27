// Einstellungen, Kalibrierung und Bestwerte – im Browser gespeichert.
import { BALL_PRESETS } from './tracker.js';
import { newProfile } from './profile.js';

const KEY = 'hockeyskills.v1';

const defaults = () => ({
  cameraId: null,
  ball: { preset: 'orange', ...BALL_PRESETS.orange },
  fieldShape: 'square', // 'square' = Quadrat, 'full' = ganze Projektionsfläche
  speed: 1,             // Tempo: 0 = langsam, 1 = normal, 2 = schnell
  rotation: 0,          // Bild drehen: 0, 90, 180 oder 270 Grad (startet immer bei 0)
  muted: false,
  calib: null,          // { H, aspect, error }
  profiles: [],         // Spielerprofile mit Bestwerten, Rang und Abzeichen
  current: null,        // id des aktiven Profils
  voice: true,          // Sprachansagen
  music: true,          // Hintergrundmusik
  theme: 'auto',        // Themenwelt: 'auto' wechselt je Runde
  demos: true,          // neue Übungen kurz vormachen
  custom: null,         // eigenes Training: { ids: [...], seconds }
});

function load() {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return defaults();
  }
}

export const config = load();

// Die Drehung beginnt bei jedem Start bei 0 Grad. Sie gilt nur für die laufende Sitzung,
// damit ein versehentlicher Druck auf die Taste R nicht dauerhaft hängen bleibt.
config.rotation = 0;

// Mindestens ein Profil muss es geben. Bestwerte aus älteren Fassungen wandern ins erste Profil.
if (!config.profiles.length) {
  const first = newProfile('Spieler 1');
  if (config.highscores) first.highscores = config.highscores;
  config.profiles.push(first);
}
delete config.highscores;
if (!config.profiles.some((p) => p.id === config.current)) config.current = config.profiles[0].id;

/** Das aktive Spielerprofil. */
export function currentProfile() {
  return config.profiles.find((p) => p.id === config.current) ?? config.profiles[0];
}

export function saveConfig() {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Speichern nicht möglich (z. B. privates Fenster) – dann eben ohne.
  }
}

/**
 * Vereinsfarben Blau-Weiss für Menü, Rahmen und Anzeigen: vier Blautöne von Königsblau bis Hellblau.
 * Die Spielwelten bringen eigene, bunte Farben mit (siehe themes.js).
 */
export const BRAND = {
  name: 'Blau-Weiss Skiller Academy',
  club: 'TC Blau-Weiss Berlin',
  palette: ['hsl(212 90% 55%)', 'hsl(196 90% 55%)', 'hsl(226 90% 62%)', 'hsl(204 90% 72%)'],
};

export function paletteFor() {
  return BRAND.palette;
}
