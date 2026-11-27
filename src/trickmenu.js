// Auswahl beim Tricktrainer: Runde auf Zeit oder Dauertraining zu einem Thema.
import { DwellButton, icons, title, text, tone } from './ui.js';
import { ButtonScene, grid } from './scenebase.js';
import { MOVES, TOPICS, variants } from './games/tricks.js';

/** Symbol eines Themas: der Weg eines typischen Tricks um einen Punkt (den Verteidiger). */
function topicIcon(topicId) {
  const v = topicId === 'runde' ? { move: MOVES.find((m) => m.name === 'V-Zieher'), mirror: 1 } : variants(3, topicId)[0];
  return (ctx, r) => {
    const k = r / 520;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.06;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const [x, y] of v.move.pts) ctx.lineTo(x * v.mirror * k, (y - 45) * k);
    ctx.stroke();
  };
}

export class TrickMenuScene extends ButtonScene {
  constructor(app, game) {
    super(app);
    this.game = game;
  }

  layout() {
    const { app } = this;
    const colors = app.palette();
    const accent = app.accentOf(this.game);
    const items = [{ id: 'runde', name: 'Runde auf Zeit' }, ...TOPICS];
    this.buttons = grid(items, this.field.w, (t, x, y, r, i) => new DwellButton({
      x, y: y + 20, r: r * 0.92, color: i === 0 ? '#fff' : accent ?? colors[i % 4],
      icon: topicIcon(t.id), label: t.name, sub: i === 0 ? 'mit Sternen' : '',
      onActivate: this.act(() => (t.id === 'runde' ? app.trickLevels(this.game) : app.trickTopic(t.id))),
    }));
    this.buttons.push(new DwellButton({ x: 90, y: 920, r: 54, icon: icons.back, onActivate: this.act(() => app.menu()) }));
  }

  draw(ctx) {
    const { w } = this.field;
    const c = this.app.accentOf(this.game) ?? this.app.palette()[1];
    title(ctx, 'Tricks', w / 2, 82, 76, c);
    text(ctx, 'Runde auf Zeit – oder ein Thema üben, so lange du magst. Aufhören: Ball aufs X.', w / 2, 148, 22, tone(c, 85), 'center', 0, 400);
    super.draw(ctx);
  }
}
