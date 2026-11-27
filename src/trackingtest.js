/**
 * Erkennungstest: prüft in zwei Abschnitten, wie gut die Kamera den Ball (oder ersatzweise
 * ein Post-it in Ballfarbe) findet. Erst still liegen lassen, dann langsam durchs Bild bewegen.
 * Die Klasse sammelt nur Messwerte und bewertet sie; sie kennt weder Kamera noch Bildschirm.
 */

export const STILL_SECONDS = 4;
export const MOVE_SECONDS = 7;

const GRADE_TEXT = ['gut', 'geht so', 'schlecht'];

/** Note 0 (gut), 1 (geht so) oder 2 (schlecht) für einen Wert; higher = größer ist besser. */
function grade(value, good, ok, higher = true) {
  if (higher) return value >= good ? 0 : value >= ok ? 1 : 2;
  return value <= good ? 0 : value <= ok ? 1 : 2;
}

export class RecognitionTest {
  constructor() {
    this.time = 0;
    this.still = { frames: 0, hits: 0, points: [], rivals: 0, area: 0 };
    this.move = { frames: 0, hits: 0, cells: new Set(), gap: 0, longestGap: 0 };
  }

  get phase() {
    return this.time < STILL_SECONDS ? 'still' : this.time < STILL_SECONDS + MOVE_SECONDS ? 'move' : 'done';
  }

  /** Verbleibende Sekunden im laufenden Abschnitt. */
  get remaining() {
    return this.phase === 'still' ? STILL_SECONDS - this.time : Math.max(0, STILL_SECONDS + MOVE_SECONDS - this.time);
  }

  /**
   * Ein Kamerabild auswerten. detection ist {x, y, area, rivals} mit x, y von 0 bis 1 oder null,
   * dt die Zeit seit dem letzten Kamerabild in Sekunden, width die Breite des Auswertebilds.
   */
  add(detection, dt, width = 480) {
    const phase = this.phase;
    if (phase === 'done') return;
    this.time += dt;
    if (phase === 'still') {
      const s = this.still;
      s.frames++;
      if (detection) {
        s.hits++;
        s.points.push({ x: detection.x * width, y: detection.y * width });
        s.rivals += detection.rivals || 0;
        s.area += detection.area || 0;
      }
    } else {
      const m = this.move;
      m.frames++;
      if (detection) {
        m.hits++;
        m.gap = 0;
        m.cells.add(Math.min(2, Math.floor(detection.x * 3)) + 3 * Math.min(2, Math.floor(detection.y * 3)));
      } else {
        m.gap += dt;
        m.longestGap = Math.max(m.longestGap, m.gap);
      }
    }
  }

  /** Auswertung: einzelne Prüfpunkte mit Note und Tipp, dazu eine Gesamtnote. */
  result() {
    const s = this.still, m = this.move;
    const frames = s.frames + m.frames;
    const fps = this.time > 0 ? frames / this.time : 0;
    const stillRate = s.frames ? (s.hits / s.frames) * 100 : 0;
    const moveRate = m.frames ? (m.hits / m.frames) * 100 : 0;
    const n = s.points.length;
    const mx = s.points.reduce((a, p) => a + p.x, 0) / (n || 1);
    const my = s.points.reduce((a, p) => a + p.y, 0) / (n || 1);
    const jitter = n ? Math.sqrt(s.points.reduce((a, p) => a + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / n) : 0;
    const area = n ? s.area / n : 0;
    const rivals = n ? s.rivals / n : 0;

    const checks = [];
    const add = (label, value, g, tip) => checks.push({ label, value, grade: g, tip: g ? tip : '' });

    add('Kamerabilder pro Sekunde', `${Math.round(fps)}`, grade(fps, 24, 14),
      'Andere Programme schließen, die die Kamera nutzen, und für mehr Licht sorgen. Bei wenig Licht liefern Webcams weniger Bilder.');

    if (!n) {
      add('Farbe gefunden', 'nein', 2,
        'Im Kamerabild direkt auf den Ball oder das Post-it klicken, damit die App die Farbe lernt. Danach den Test wiederholen.');
      return { checks, grade: 2, verdict: verdictText(2), found: false };
    }

    add('Im Liegen erkannt', `${Math.round(stillRate)} %`, grade(stillRate, 95, 80),
      'Farbtoleranz erhöhen oder im Kamerabild noch einmal auf den Ball klicken.');
    add('Größe im Kamerabild', `${Math.round(area)} Bildpunkte`, grade(area, 20, 10),
      'Der Ball ist im Bild sehr klein. Kamera näher ans Feld bringen oder steiler von oben schauen lassen.');
    add('Ruhe im Liegen', `${jitter.toFixed(1).replace('.', ',')} Bildpunkte Zittern`, grade(jitter, 1.5, 4, false),
      '„Kamera-Automatik sperren“ einschalten und für gleichmäßiges Licht sorgen.');
    add('Nichts anderes in Ballfarbe', rivals < 0.1 ? 'ja' : 'Störungen im Bild', grade(rivals, 0.1, 0.6, false),
      'Etwas anderes im Bild hat fast dieselbe Farbe. Diese Dinge wegräumen, eine andere Ballfarbe nehmen oder die Farbtoleranz senken.');

    if (m.cells.size < 3) {
      add('In Bewegung erkannt', 'nicht gemessen', 1,
        'Im zweiten Teil den Ball langsam kreuz und quer durchs ganze Kamerabild bewegen, dann den Test wiederholen.');
    } else {
      add('In Bewegung erkannt', `${Math.round(moveRate)} %`, grade(moveRate, 90, 70),
        'Mehr Licht hilft am meisten: Dann belichtet die Kamera kürzer und der Ball verwischt weniger. Sonst die Farbtoleranz erhöhen.');
      add('Längster Aussetzer', `${m.longestGap.toFixed(1).replace('.', ',')} s`, grade(m.longestGap, 0.2, 0.6, false),
        'An manchen Stellen geht der Ball verloren, oft am Bildrand oder im Schatten. Ausleuchtung prüfen und das Feld mittig ins Kamerabild rücken.');
    }

    const worst = Math.max(...checks.map((c) => c.grade));
    return { checks, grade: worst, verdict: verdictText(worst), found: true };
  }
}

function verdictText(g) {
  return [
    'Die Erkennung ist gut. So kann gespielt werden.',
    'Die Erkennung reicht zum Spielen, lässt sich aber noch verbessern.',
    'So wird das Spielen noch nicht zuverlässig klappen.',
  ][g];
}

export { GRADE_TEXT };
