# Hockey Skills

Interaktive Hockey-Übungen als Videospiel auf dem Fußboden: Ein Beamer projiziert das Spielfeld auf den Boden, eine Webcam filmt es, und die App erkennt den Hockeyball. Kinder steuern die Spiele mit Schläger und Ball.

Stand: Prototyp mit Kalibrierung, Ballerkennung und dem Spiel „Ziele treffen“.

## Starten

Voraussetzung ist [Node.js](https://nodejs.org) (Version 18 oder neuer).

```bash
npm start
```

Danach in Chrome `http://localhost:8080` öffnen. Die Kamera funktioniert nur über `localhost` oder `https`, nicht beim direkten Öffnen der Datei.

## Aufbau

1. Beamer und Webcam auf dieselbe Bodenfläche richten. Die Kamera muss die ganze Projektion sehen.
2. Am einfachsten den Laptop-Bildschirm auf den Beamer **spiegeln**. Sonst das Browserfenster auf den Beamer ziehen.
3. Raum abdunkeln. Einen Ball in Neonfarbe verwenden (Orange ist voreingestellt).

## Einrichtung in der App

1. **Kamera starten** und die richtige Kamera wählen.
2. **Ballfarbe** wählen. Im Kamerabild leuchtet alles türkis, was die App für den Ball hält. Passt das nicht, im Kamerabild auf den Ball klicken; die App lernt dann dessen Farbe.
3. **Vollbild** einschalten und **kalibrieren**:
   - *Automatisch*: Die App projiziert nacheinander fünf weiße Punkte und sucht sie im Kamerabild. Währenddessen nicht durchs Bild laufen.
   - *Manuell*: Die App zeigt ein Standbild der Kamera, darin die vier Ecken des Spielfelds im Uhrzeigersinn anklicken (oben links beginnen). Das geht auch ohne Beamer, etwa mit vier Klebeband-Markierungen auf dem Boden.
4. **Spielen**. Gesteuert wird mit dem Ball: Ball etwa eine Sekunde auf einen Button legen.

Nach jedem Umstellen von Beamer, Kamera oder Fenstergröße neu kalibrieren (Taste `C`).

| Taste | Funktion |
| --- | --- |
| `F` | Vollbild an/aus |
| `C` | automatisch neu kalibrieren |
| `Esc` | zurück zum Menü, vom Menü zur Einrichtung |

## Ohne Hardware ausprobieren

- **Maus als Ball:** In der Einrichtung „Ohne Kamera testen“ wählen.
- **Simulierte Kamera:** `http://localhost:8080/?sim` öffnen. Eine künstliche Kamera filmt die Spielfläche schräg, der Ball liegt an der Mausposition. Damit lassen sich Kalibrierung und Ballerkennung ohne Beamer und Webcam testen.

## Ein neues Spiel hinzufügen

Jedes Spiel ist eine Datei in `src/games/` und wird in `src/games/index.js` eingetragen. `src/games/targets.js` dient als Vorlage.

```js
export default {
  id: 'meinspiel',          // eindeutiger Name, auch für die Bestwerte
  name: 'Mein Spiel',       // Anzeige im Menü
  duration: 60,             // Rundenlänge in Sekunden
  icon(ctx, r) { /* Symbol fürs Menü um den Punkt (0, 0) zeichnen */ },
  create(env) {
    return {
      update(dt, ball) { /* Spiellogik, dt = Sekunden seit dem letzten Bild */ },
      draw(ctx) { /* zeichnen */ },
    };
  },
};
```

- `ball` enthält `x`, `y`, `vx`, `vy` und `visible`.
- Das Spielfeld ist immer 1000 Einheiten hoch und `env.field.w` breit.
- `env.addScore(n)` vergibt Punkte, `env.end()` beendet die Runde vorzeitig.
- `env.level` ist 1 bis 3, `env.sound` spielt Töne.
- `env.palette` liefert Farben, die sich deutlich von der Ballfarbe unterscheiden. Nur diese (und Weiß/Grau) für große Flächen verwenden, sonst hält die Kamera Spielgrafik für den Ball.

Countdown, Punkteanzeige, Zeitbalken, Abbrechen-Button, Bestwerte und Ergebnisbildschirm übernimmt die App.

## Tests

```bash
npm test
```

## Bekannte Grenzen des Prototyps

- Mit echter Hardware ist die Erkennung noch nicht erprobt. Farbiges Beamerlicht auf dem Ball kann dessen Farbe verfälschen; die Schwellen in `src/tracker.js` müssen dann angepasst werden.
- Verzerrungen von Weitwinkel-Objektiven werden nicht korrigiert. Die Einrichtung zeigt nach der automatischen Kalibrierung die gemessene Abweichung an.
- Steht der Beamer schräg, ist das Bild auf dem Boden ein Trapez. Die Ballposition stimmt trotzdem; für ein gerades Bild die Trapezkorrektur des Beamers nutzen.
