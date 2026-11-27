# Hockey Skills

Interaktive Hockey-Übungen als Videospiel auf dem Fußboden: Ein Beamer projiziert das Spielfeld auf den Boden, eine Webcam filmt es, und die App erkennt den Hockeyball. Kinder steuern die Spiele mit Schläger und Ball.

Stand: Prototyp mit Kalibrierung, Ballerkennung und sechs Spielen im Arcade-Look.

## Spiele

| Spiel | Worum es geht |
| --- | --- |
| **Ziele** | Leuchtende Ziele treffen. Je schneller nach dem Auftauchen, desto mehr Punkte (10 bis 20). |
| **Wolke** | Ein Ziel treffen, aber um die Gewitterwolke herumdribbeln. Die Wolke pendelt (Mittel) oder stellt sich in den Weg (Schwer). |
| **Rennen** | Die Bahn läuft ununterbrochen durchs Feld und schwenkt weit nach links und rechts. Auf der Bahn bleiben, Sterne sammeln; wer lange ohne Fehler bleibt, bekommt einen Multiplikator bis x5. |
| **Linie** | Den Ball an einer geschwungenen Linie entlangführen. Ab Mittel pendeln Stachelbälle über die Linie. |
| **Slalom** | Der Reihe nach durch die Tore. Ab Mittel kosten berührte Pfosten Punkte, auf Schwer bewegen sich die Tore. |
| **Ausweichen** | Sterne sammeln und Stachelbällen ausweichen. Drei Leben. |

Für alle Spiele gilt:

- Weiße Stachelbälle und Wolken bedeuten Gefahr und kosten Punkte oder Leben.
- In „Ziele“ und „Wolke“ erscheint nach jedem Treffer kurz ein gestrichelter Kreis. Rollt der Ball in dieser Zeit aus dem Kreis heraus, gibt es 5 Minuspunkte („Zu weit“). Das belohnt Ballkontrolle.
- Im Bildschirm „Stufe wählen“ schaltet der Button unten rechts das **Tempo** um: Langsam, Normal, Schnell. Bestwerte werden pro Spiel, Stufe und Tempo getrennt gespeichert.

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

Jedes Spiel ist eine Datei in `src/games/` und wird in `src/games/index.js` eingetragen. `src/games/targets.js` dient als Vorlage, `src/games/common.js` enthält Bausteine für mehrere Spiele (Stoppzone, Explosion).

```js
export default {
  id: 'meinspiel',          // eindeutiger Name, auch für die Bestwerte
  name: 'Mein Spiel',       // Anzeige im Menü
  duration: 60,             // Rundenlänge in Sekunden
  lives: 3,                 // optional: Leben, die App zeigt dann Herzen an
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
- `env.addScore(n)` vergibt Punkte, `env.loseLife()` zieht ein Leben ab, `env.end()` beendet die Runde vorzeitig.
- Das Tempo muss ein Spiel nicht beachten: Die App lässt `dt` entsprechend schneller oder langsamer laufen.
- `env.level` ist 1 bis 3, `env.sound` spielt Töne.
- `env.palette` liefert Farben, die sich deutlich von der Ballfarbe unterscheiden. Nur diese (und Weiß/Grau) für große Flächen verwenden, sonst hält die Kamera Spielgrafik für den Ball.

Countdown, Punkteanzeige, Zeitbalken, Abbrechen-Button, Bestwerte und Ergebnisbildschirm übernimmt die App. Für den einheitlichen Look gibt es in `src/ui.js` Helfer wie `text`, `glow`, `hazard` und `star`.

Die Pixel-Schrift „Press Start 2P“ liegt unter `assets/fonts/` (SIL Open Font License).

## Tests

```bash
npm test
```

## Bekannte Grenzen des Prototyps

- Mit echter Hardware ist die Erkennung noch nicht erprobt. Farbiges Beamerlicht auf dem Ball kann dessen Farbe verfälschen; die Schwellen in `src/tracker.js` müssen dann angepasst werden.
- Verzerrungen von Weitwinkel-Objektiven werden nicht korrigiert. Die Einrichtung zeigt nach der automatischen Kalibrierung die gemessene Abweichung an.
- Steht der Beamer schräg, ist das Bild auf dem Boden ein Trapez. Die Ballposition stimmt trotzdem; für ein gerades Bild die Trapezkorrektur des Beamers nutzen.
