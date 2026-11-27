# Blau-Weiss Skiller Academy

Interaktive Hockey-Übungen als Videospiel auf dem Fußboden: Ein Beamer projiziert das Spielfeld auf den Boden, eine Webcam filmt es, und die App erkennt den Hockeyball. Kinder steuern die Spiele mit Schläger und Ball.

Stand: Prototyp mit Kalibrierung, Ballerkennung, 18 Übungen in fünf Schwerpunkten und einem Trainingsmodus.

## Übungen

Das Menü zeigt fünf Schwerpunkte und das Training. Insgesamt gibt es 18 Übungen.

| Schwerpunkt | Übung | Worum es geht |
| --- | --- | --- |
| **Treffen** | Ziele | Leuchtende Kugeln treffen, je schneller desto mehr Punkte. Doppel-Kugeln, Zeit-Bonus, Stachelbälle. |
| | Wolke | Ein Ziel treffen, aber um die wabernde Gewitterwolke herumdribbeln. |
| | Ausweichen | Sterne sammeln und Stachelbällen ausweichen. Schild und Zeitlupe als Extras. Drei Leben. |
| | Fangen | Zwei bis vier Fänger jagen den Ball, jeder auf seine Art. Haken schlagen hilft. Drei Leben. |
| **Führen** | Linie | Den Ball an einer geschwungenen Linie entlangführen, mit Stopp-Punkt und pendelnden Stachelbällen. |
| | Slalom | Der Reihe nach durch die Tore, später mit Bonus-Tor und beweglichen Toren. |
| | Rennen | Die Bahn läuft ununterbrochen durchs Feld: Kurven, harte Schnitte, Rückzieher. |
| | Draht | Durch einen schmalen Gang, ohne die Wand zu berühren. Fehler führen zum letzten Kontrollpunkt zurück. |
| | Achter | Den Ball in einer Acht um zwei Hütchen führen, später andersherum. |
| | Lichtkegel | Ein Lichtkreis wandert durchs Feld, der Ball muss darin bleiben. |
| | Zeichnen | Formen nachfahren (Kreis, Dreieck, Stern, Herz …), gewertet wird die Genauigkeit. |
| **Wechsel** | Pendel | Vorhand-Rückhand-Wechsel zwischen zwei Feldern, im Takt gibt es dreifache Punkte. |
| | Tippen | Den Ball so oft wie möglich über eine Linie und zurück ziehen. |
| | Rhythmus | Kugeln laufen auf Bahnen herunter; der Ball muss rechtzeitig im richtigen Kreis liegen. |
| **Stoppen** | Stopp | Sterne sammeln; bei „Stopp!“ muss der Ball sofort still liegen. Drei Leben. |
| | Punktlandung | Den Ball genau auf der Zielscheibe zum Liegen bringen. |
| | Zielrollen | Den Ball anschieben und loslassen, sodass er im Ziel ausrollt. Rückmeldung „zu kurz“ oder „zu weit“. |
| **Tricks** | Tricks | Ein Geisterball zeigt eine Umspielbewegung um einen Verteidiger, das Kind macht sie nach: Seitzieher, Umlaufen, V-Zieher, Doppelzieher, Rückzieher, Zickzack, jeweils nach rechts und links. |

### Training

„Training“ spielt Übungen aus allen Schwerpunkten hintereinander, wie ein Zirkel:

- **Kurz:** eine zufällige Übung je Schwerpunkt (5 Übungen, etwa 4 Minuten)
- **Mittel:** zwei je Schwerpunkt (9 Übungen, etwa 8 Minuten)
- **Komplett:** alle 18 Übungen (etwa 14 Minuten)

Jede Übung dauert 35 bis 40 Sekunden. Dazwischen liegen 7 Sekunden Pause, in der die nächste Übung angekündigt wird; wer den Ball auf „Los“ legt, überspringt die Pause. Am Ende gibt es Gesamtpunkte, Sterne und eine Liste aller Übungen. Rekorde werden je Länge, Stufe und Tempo gespeichert.

Die Tricks sind in `src/games/tricks.js` als einfache Punktlisten beschrieben und lassen sich dort anpassen oder ergänzen.

Für alle Spiele gilt:

- **Gefahr** ist immer weißgrau mit bösem Blick (Stachelbälle, Wolken) und kostet Punkte oder Leben.
- **Serie:** Drei schnelle Treffer hintereinander verdoppeln die Punkte (x2), sechs geben x3, zehn x4. Ein Ring neben dem Punktestand zeigt, wie lange die Serie noch hält. Ein Fehler beendet sie.
- **Es wird schwieriger:** Jede Runde hat vier Abschnitte (Striche im Zeitbalken). Mit jedem Abschnitt wird das Spiel etwas schneller, enger oder bekommt ein neues Element.
- **Stoppzone:** In „Ziele“ und „Wolke“ erscheint nach jedem Treffer kurz ein gestrichelter Kreis. Rollt der Ball in dieser Zeit hinaus, gibt es 5 Minuspunkte („Zu weit“). Das belohnt Ballkontrolle.
- **Sterne:** Am Ende gibt es je nach Punktzahl bis zu drei Sterne.
- **Tempo:** Im Bildschirm „Wähle eine Stufe“ schaltet der Button unten rechts zwischen Langsam, Normal und Schnell um. Bestwerte werden pro Spiel, Stufe und Tempo getrennt gespeichert.

## Vereinslogo

Die App zeigt im Menü und in der Einrichtung ein Logo, wenn die Datei `assets/logo.svg` oder `assets/logo.png` vorhanden ist. Am besten eignet sich ein Logo mit durchsichtigem Hintergrund; ein weißer Hintergrund erscheint auf dem Boden als heller Kasten. Name, Vereinsname und Blautöne stehen in `src/config.js` unter `BRAND`.

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
3. **Bild drehen**, bis die Schrift vom Platz des Kindes aus richtig herum steht (auch mit Taste `R`).
4. **Vollbild** einschalten und **kalibrieren**:
   - *Automatisch*: Die App projiziert nacheinander fünf weiße Punkte und sucht sie im Kamerabild. Währenddessen nicht durchs Bild laufen.
   - *Manuell*: Die App zeigt ein Standbild der Kamera, darin die vier Ecken des Spielfelds im Uhrzeigersinn anklicken (oben links beginnen). Das geht auch ohne Beamer, etwa mit vier Klebeband-Markierungen auf dem Boden.
5. **Spielen**. Gesteuert wird mit dem Ball: Ball etwa eine Sekunde auf einen Button legen.

Nach jedem Umstellen von Beamer, Kamera oder Fenstergröße neu kalibrieren (Taste `C`).

| Taste | Funktion |
| --- | --- |
| `F` | Vollbild an/aus |
| `C` | automatisch neu kalibrieren |
| `R` | Bild um 90° drehen |
| Leertaste | Pause |
| `M` | Ton an/aus |
| `D` | Kamerabild mit erkannter Ballfarbe einblenden |
| `Esc` | zurück zum Menü, vom Menü zur Einrichtung |

Fehlt der Ball länger als 2,5 Sekunden (weggerollt, verdeckt), pausiert das Spiel von selbst und läuft weiter, sobald er wieder im Feld liegt.

## Wenn der Ball nicht zuverlässig erkannt wird

1. Mit `D` das Kamerabild einblenden. Türkis markiert ist, was die App für den Ball hält; darunter steht, wie viele Kamerabilder pro Sekunde ausgewertet werden.
2. Wird der Ball nur manchmal türkis: in der Einrichtung die **Farbtoleranz** erhöhen oder im Kamerabild auf den Ball klicken, während er im projizierten Feld liegt.
3. Leuchtet anderes türkis auf (Kleidung, Möbel, Schläger): Toleranz senken oder die störenden Dinge aus dem Bild nehmen.
4. Schwankt die Erkennung, wenn das projizierte Bild heller oder dunkler wird: **Kamera-Automatik sperren** einschalten. Das geht nicht mit jeder Webcam.
5. Raum weiter abdunkeln. Farbiges Beamerlicht verfälscht die Ballfarbe weniger, wenn kein Tageslicht dazukommt.

## Offline

Nach dem ersten Laden mit Internet startet die App auch ohne Verbindung, zum Beispiel im Keller. Mit Verbindung lädt sie immer die aktuelle Fassung.

## Ohne Hardware ausprobieren

- **Maus als Ball:** In der Einrichtung „Ohne Kamera testen“ wählen.
- **Simulierte Kamera:** `http://localhost:8080/?sim` öffnen. Eine künstliche Kamera filmt die Spielfläche schräg, der Ball liegt an der Mausposition. Damit lassen sich Kalibrierung und Ballerkennung ohne Beamer und Webcam testen.

## Ein neues Spiel hinzufügen

Jedes Spiel ist eine Datei in `src/games/` und wird in `src/games/index.js` in eine Kategorie eingetragen. Es erscheint dann im Menü und im Training. `src/games/targets.js` dient als Vorlage, `src/games/common.js` enthält Bausteine für mehrere Spiele (Effekte, Stoppzone).

```js
export default {
  id: 'meinspiel',          // eindeutiger Name, auch für die Bestwerte
  name: 'Mein Spiel',       // Anzeige im Menü
  hint: 'Ein Satz, worum es geht',
  duration: 60,             // Rundenlänge in Sekunden
  lives: 3,                 // optional: Leben, die App zeigt dann Herzen an
  medals: [150, 300, 450],  // optional: Punkte für einen, zwei und drei Sterne
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
- `env.combo(n)` vergibt Punkte für eine gelungene Aktion und zählt für die Serie; es gibt die tatsächlich vergebenen Punkte zurück. `env.miss()` beendet die Serie.
- `env.addScore(n)` vergibt Punkte ohne Serie, `env.loseLife()` zieht ein Leben ab, `env.addTime(s)` schenkt Zeit, `env.end()` beendet die Runde vorzeitig.
- `env.stage` (0 bis 3) und `env.ramp` (1 bis 1,6) sagen, wie weit die Runde fortgeschritten ist. Damit wird ein Spiel nach und nach schwieriger.
- Das Tempo muss ein Spiel nicht beachten: Die App lässt `dt` entsprechend schneller oder langsamer laufen.
- `env.level` ist 1 bis 3, `env.sound` spielt Töne.
- `env.palette` liefert die vier Blautöne des Vereinsstils. Nur diese (und Weiß/Grau) für große Flächen verwenden: Orange, Gelb, Grün oder Pink könnte die Kamera für den Ball halten.

Countdown, Punkteanzeige, Zeitbalken, Abbrechen-Button, Bestwerte und Ergebnisbildschirm übernimmt die App. Für den einheitlichen Look gibt es in `src/ui.js` Helfer wie `text`, `glow`, `orb`, `hazard` und `star`, für Funken und Punktetexte die Klasse `Fx` in `src/games/common.js`.

Die Schrift „Fredoka“ liegt unter `assets/fonts/` (SIL Open Font License).

## Tests

```bash
npm test
```

Die Tests prüfen die Rechenkerne (Kalibrierung, Ballerkennung) und spielen jedes Spiel auf jeder Stufe und in jedem Tempo einmal mit einem simulierten Ball durch.

## Bekannte Grenzen des Prototyps

- Mit echter Hardware ist die Erkennung noch nicht erprobt. Farbiges Beamerlicht auf dem Ball kann dessen Farbe verfälschen; siehe „Wenn der Ball nicht zuverlässig erkannt wird“.
- Die Anzeige läuft dem Ball um die Verzögerung von Kamera und Beamer hinterher (geschätzt etwa eine Zehntelsekunde). Bei schnellen Bewegungen sitzt der Ring deshalb etwas hinter dem Ball.
- Punkte, Sterne-Schwellen und Geschwindigkeiten sind geschätzt und noch nicht mit Kindern erprobt.
- Verzerrungen von Weitwinkel-Objektiven werden nicht korrigiert. Die Einrichtung zeigt nach der automatischen Kalibrierung die gemessene Abweichung an.
- Steht der Beamer schräg, ist das Bild auf dem Boden ein Trapez. Die Ballposition stimmt trotzdem; für ein gerades Bild die Trapezkorrektur des Beamers nutzen.
