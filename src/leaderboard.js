// Bestenliste: Ranglisten aller Spieler auf diesem Gerät (Woche, Spiele, Punkte, Rekorde),
// wahlweise nur die eigene Altersklasse.
import { DwellButton, icons, text, title, tone } from './ui.js';
import { ButtonScene, initial } from './scenebase.js';
import { rankOf, weekStats, ageOf, ageClass } from './profile.js';

const BOARDS = [
  { id: 'week', label: 'Woche', icon: 'calendar', sub: 'Meiste Spiele in dieser Woche – jeden Montag geht es von vorn los' },
  { id: 'rounds', label: 'Spiele', icon: 'stick', sub: 'Meiste Spiele insgesamt' },
  { id: 'points', label: 'Punkte', icon: 'trophy', sub: 'Meiste Punkte insgesamt' },
  { id: 'records', label: 'Rekorde', icon: 'medal', sub: 'Wer hält den Rekord in welcher Übung?' },
];

/**
 * Ranglisten aller Spieler auf diesem Gerät: meiste Spiele in dieser Woche (beginnt jeden Montag neu),
 * meiste Spiele insgesamt, meiste Punkte und die Rekordhalter je Übung.
 */
export class LeaderboardScene extends ButtonScene {
  layout() {
    const { w } = this.field;
    const colors = this.app.palette();
    this.view ??= 'week';
    const step = Math.min(170, (w - 260) / (BOARDS.length - 1));
    this.buttons = [
      new DwellButton({ x: 80, y: 880, r: 46, icon: icons.back, onActivate: this.act(() => this.app.profileScene()) }),
      ...BOARDS.map((board, i) => new DwellButton({
        x: w - 90 - (BOARDS.length - 1 - i) * step, y: 872, r: 40,
        color: board.id === this.view ? '#fff' : colors[i % 4], icon: icons[board.icon], label: board.label,
        onActivate: this.act(() => { this.view = board.id; this.layout(); }),
      })),
    ];
    // Fair bleiben: nur die eigene Altersklasse zeigen (wenn ein Alter eingetragen ist)
    const mine = ageClass(ageOf(this.app.profile));
    if (mine) {
      this.buttons.push(new DwellButton({
        x: w - 80, y: 70, r: 38, color: this.own ? '#fff' : colors[2], icon: this.own ? initial(mine.replace('Erwachsene', 'E')) : icons.people,
        label: this.own ? mine : 'Alle',
        onActivate: this.act(() => { this.own = !this.own; this.layout(); }),
      }));
    } else {
      this.own = false;
    }
  }

  /** Die Spieler, die in der Liste stehen: alle oder nur die Altersklasse des aktuellen Spielers. */
  players() {
    const all = this.app.config.profiles;
    if (!this.own) return all;
    const mine = ageClass(ageOf(this.app.profile));
    return all.filter((p) => ageClass(ageOf(p)) === mine);
  }

  /** Zeilen der gewählten Rangliste: sortiert, mit großer Zahl rechts und kleiner Zeile darunter. */
  rows() {
    const { app } = this;
    const today = app.today();
    const tag = (p) => { const k = ageClass(ageOf(p)); return k ? `${k} · ` : ''; };
    const all = this.players().map((p) => {
      const week = weekStats(p, today);
      if (this.view === 'week') {
        return { p, value: week.rounds, big: `${week.rounds}`, unit: week.rounds === 1 ? 'Spiel' : 'Spiele', small: `${tag(p)}${week.points.toLocaleString('de-DE')} Punkte · ${week.stars} Sterne in dieser Woche`, tie: week.points };
      }
      if (this.view === 'rounds') {
        return { p, value: p.stats.rounds, big: `${p.stats.rounds}`, unit: p.stats.rounds === 1 ? 'Spiel' : 'Spiele', small: `${tag(p)}${rankOf(p.xp).name} · ${p.stats.stars} Sterne`, tie: p.xp };
      }
      return { p, value: p.xp, big: p.xp.toLocaleString('de-DE'), unit: 'Punkte', small: `${tag(p)}${rankOf(p.xp).name} · ${p.stats.stars} Sterne · ${Object.keys(p.badges).length} Abzeichen`, tie: p.stats.rounds };
    });
    return all.sort((a, b) => b.value - a.value || b.tie - a.tie).slice(0, 8);
  }

  draw(ctx) {
    const { app } = this;
    const { w } = this.field;
    const c = app.palette();
    const me = app.profile;
    const board = BOARDS.find((b) => b.id === this.view);
    title(ctx, 'Bestenliste', w / 2, 80, 70, c[1]);
    text(ctx, this.own ? `${board.sub.split(' – ')[0]} · nur Altersklasse ${ageClass(ageOf(me))}` : board.sub, w / 2, 142, 22, 'rgba(255,255,255,0.75)', 'center', 0, 400);
    if (this.view !== 'records') {
      let place = 0, last = null;
      this.rows().forEach((row, i) => {
        // gleiche Zahl = gleicher Platz
        if (row.value !== last) { place = i + 1; last = row.value; }
        const y = 215 + i * 74;
        const mine = row.p.id === me.id;
        ctx.beginPath();
        ctx.roundRect(70, y - 31, w - 140, 62, 18);
        ctx.fillStyle = mine ? 'rgba(255,255,255,0.14)' : 'rgba(8,14,36,0.6)';
        ctx.fill();
        if (mine) { ctx.lineWidth = 2; ctx.strokeStyle = c[1]; ctx.stroke(); }
        const lead = place === 1 && row.value > 0;
        text(ctx, lead ? '♛' : String(place), 112, y + 2, 34, lead ? '#ffd76a' : '#fff', 'center', 0, 600);
        text(ctx, row.p.name, 160, y - 8, 28, '#fff', 'left', 0, 600);
        text(ctx, row.small, 160, y + 18, 17, 'rgba(255,255,255,0.7)', 'left', 0, 400);
        text(ctx, row.big, w - 100, y - 4, 32, tone(c[i % 4], 78), 'right', 0, 600);
        text(ctx, row.unit, w - 100, y + 20, 15, 'rgba(255,255,255,0.6)', 'right', 0, 400);
      });
    } else {
      const rows = app.games.map((g) => {
        let best = null;
        for (const p of this.players()) {
          for (const [key, score] of Object.entries(p.highscores)) {
            if (key.startsWith(`${g.id}:`) && (!best || score > best.score)) best = { score, name: p.name, mine: p.id === me.id };
          }
        }
        return { g, best };
      });
      const half = Math.ceil(rows.length / 2), colW = (w - 120) / 2;
      rows.forEach(({ g, best }, i) => {
        const x = 60 + Math.floor(i / half) * (colW + 20), y = 196 + (i % half) * 66;
        ctx.beginPath();
        ctx.roundRect(x, y - 27, colW - 20, 54, 14);
        ctx.fillStyle = best?.mine ? 'rgba(255,255,255,0.14)' : 'rgba(8,14,36,0.6)';
        ctx.fill();
        text(ctx, g.name, x + 18, y - 8, 22, tone(app.accentOf(g) || c[0], 78), 'left', 0, 600);
        text(ctx, best ? best.name : 'noch niemand', x + 18, y + 14, 16, 'rgba(255,255,255,0.7)', 'left', 0, 400);
        if (best) text(ctx, Math.round(best.score).toLocaleString('de-DE'), x + colW - 38, y + 2, 26, '#fff', 'right', 0, 600);
      });
    }
    super.draw(ctx);
  }
}

