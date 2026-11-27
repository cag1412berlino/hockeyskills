// Sammlung: alle Sammelstücke aus der Schatzkiste. Was man schon hat, lässt sich hier an- und ablegen.
import { DwellButton, icons, text, title, tone, drawHat, mascot } from './ui.js';
import { ButtonScene } from './scenebase.js';
import { ITEMS, todaysMissions } from './quests.js';
import { trailColors } from './engine.js';

/** Kleines Bild eines Sammelstücks für den Knopf. */
function itemIcon(item, owned) {
  return (ctx, r) => {
    ctx.globalAlpha = owned ? 1 : 0.28;
    if (item.kind === 'hat') {
      ctx.save();
      ctx.scale(r / 82, r / 82);
      ctx.translate(-2, 62);
      drawHat(ctx, item.id);
      ctx.restore();
    } else {
      // Schweif: eine Reihe kleiner werdender Punkte in den Farben des Schweifs
      const colors = trailColors(item.id.replace('trail_', ''));
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(r * (0.42 - i * 0.2), r * (-0.12 + Math.sin(i * 1.2) * 0.14), r * (0.2 - i * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };
}

export class CollectionScene extends ButtonScene {
  layout() {
    const { app } = this;
    const { w } = this.field;
    const p = app.profile;
    const colors = app.palette();
    const cols = 5, cell = Math.min(180, (w - 80) / cols);
    this.buttons = ITEMS.map((item, i) => {
      // obere Reihe Schweife, untere Reihe Kopfbedeckungen
      const row = item.kind === 'trail' ? 0 : 1;
      const col = ITEMS.filter((it) => it.kind === item.kind).indexOf(item);
      const owned = !!p.items[item.id];
      const on = p.gear[item.kind] === item.id;
      return new DwellButton({
        x: w / 2 + (col - (cols - 1) / 2) * cell, y: 300 + row * 250, r: 58,
        color: on ? '#fff' : owned ? colors[(i + 1) % 4] : 'rgba(255,255,255,0.25)',
        icon: itemIcon(item, owned),
        label: owned ? item.name.replace(/-Schweif$/, '') : '?',
        sub: on ? 'angelegt' : '',
        onActivate: owned ? this.act(() => {
          p.gear[item.kind] = on ? null : item.id; // noch einmal wählen legt es wieder ab
          app.save();
          app.applyGear();
          this.layout();
        }) : () => app.sound.tick(),
      });
    });
    this.buttons.push(new DwellButton({ x: 90, y: 920, r: 54, icon: icons.back, onActivate: this.act(() => app.profileScene()) }));
  }

  draw(ctx) {
    const { app } = this;
    const { w } = this.field;
    const c = app.palette();
    const p = app.profile;
    const have = ITEMS.filter((it) => p.items[it.id]).length;
    title(ctx, 'Sammlung', w / 2, 80, 70, c[1]);
    text(ctx, `${have} von ${ITEMS.length} Sammelstücken · Ballschweife oben, Mützen für den Trainer unten`, w / 2, 142, 21, 'rgba(255,255,255,0.75)', 'center', 0, 400);
    super.draw(ctx);
    // Tagesaufgaben: der Weg zur nächsten Schatzkiste
    const quest = todaysMissions(p, app.categories, app.today());
    const x0 = 175;
    text(ctx, quest.chest ? 'Kiste heute geöffnet – morgen gibt es neue Aufgaben.' : 'Drei Aufgaben erledigen, dann geht die Schatzkiste auf:', x0, 800, 22, tone(c[1], 82), 'left', 0, 500);
    quest.list.forEach((m, i) => {
      const done = m.n >= m.target;
      text(ctx, `${done ? '✔' : '○'}  ${m.text}${!done && m.target > 1 ? `  (${m.n.toLocaleString('de-DE')} von ${m.target.toLocaleString('de-DE')})` : ''}`,
        x0, 842 + i * 36, 23, done ? '#b9ffd4' : '#fff', 'left', 0, 400);
    });
    mascot(ctx, w - 110, 880, 62, quest.chest ? 'cheer' : 'happy', this.time, this.look);
  }
}
