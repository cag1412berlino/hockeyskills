// Karriere: eine Karte mit 30 Stationen. Jede Station ist eine Übung auf einer festen Stufe mit
// einem Ziel (so viele Sterne). Wer es schafft, schaltet die nächste Station frei. Alle zehn
// Stationen wartet eine Prüfung im Tricktrainer, für die es drei Sterne braucht.
import { DwellButton, icons, text, title, caption, star, tone, mascot } from './ui.js';
import { ButtonScene, LEVEL_NAMES } from './scenebase.js';

export const REGIONS = [
  { name: 'Anfänger-Insel', level: 1, need: 1, hue: 140 },
  { name: 'Techniker-Tal', level: 2, need: 2, hue: 200 },
  { name: 'Meister-Gipfel', level: 3, need: 2, hue: 275 },
];
export const PER_REGION = 10;

/**
 * Die 30 Stationen. Die Übungen wechseln reihum die Schwerpunkte, damit jede Region alles abdeckt.
 * categories = die Schwerpunkte mit ihren Übungen.
 */
export function stations(categories) {
  // Reihenfolge: aus jedem Schwerpunkt abwechselnd eine Übung; die Tricks sind für die Prüfungen reserviert
  const all = categories.flatMap((c) => c.games);
  const tricks = all.find((g) => g.id === 'tricks') ?? all[all.length - 1];
  const order = [];
  const lists = categories.map((c) => c.games.filter((g) => g !== tricks));
  while (lists.some((l) => l.length)) for (const l of lists) if (l.length) order.push(l.shift());
  let n = 0;
  return REGIONS.flatMap((region, r) => Array.from({ length: PER_REGION }, (_, k) => {
    const i = r * PER_REGION + k;
    const exam = k === PER_REGION - 1;
    return {
      i, region: r, exam,
      // Prüfung: der Tricktrainer, drei Sterne nötig
      game: exam ? tricks : order[n++ % order.length],
      level: region.level,
      need: exam ? 3 : region.need,
    };
  }));
}

/** Sterne je Station (beste Runde) und welche Station als Nächstes dran ist. */
export function careerState(p, categories) {
  const list = stations(categories);
  const best = p.career?.stars ?? {};
  let current = 0;
  while (current < list.length && (best[current] || 0) >= list[current].need) current++;
  return { list, best, current, finished: current >= list.length };
}

/** Verbucht eine Runde an einer Station. Liefert { ok, first, next } (first = gerade zum ersten Mal geschafft). */
export function careerRecord(p, categories, i, stars) {
  const list = stations(categories);
  const st = list[i];
  p.career ??= { stars: {} };
  const before = p.career.stars[i] || 0;
  p.career.stars[i] = Math.max(before, stars);
  // wie viele Stationen am Stück geschafft sind (für die Abzeichen)
  let done = 0;
  while (done < list.length && (p.career.stars[done] || 0) >= list[done].need) done++;
  p.career.done = done;
  const ok = stars >= st.need;
  return { ok, first: ok && before < st.need, need: st.need, next: list[i + 1] ?? null, station: st };
}

/** Lage der Stationen auf der Karte: eine Schlange von unten nach oben, sechs je Reihe. */
function spot(i, w) {
  const cols = 6, row = Math.floor(i / cols), col = i % cols;
  const x = (row % 2 ? cols - 1 - col : col) * ((w - 160) / (cols - 1)) + 80;
  return { x, y: 860 - row * 140 };
}

export class CareerScene extends ButtonScene {
  layout() {
    const { app } = this;
    const { w } = this.field;
    this.state = careerState(app.profile, app.categories);
    const { list, current } = this.state;
    this.spots = list.map((s) => ({ ...s, ...spot(s.i, w) }));
    // Ansprechbar sind alle geschafften Stationen und die aktuelle
    this.buttons = this.spots.filter((s) => s.i <= current).map((s) => new DwellButton({
      x: s.x, y: s.y, r: s.i === current ? 44 : 36,
      color: s.i === current ? '#fff' : `hsl(${REGIONS[s.region].hue} 80% 62%)`,
      icon: s.game.icon,
      onActivate: this.act(() => app.play(s.game, s.level, { career: s.i })),
    }));
    this.buttons.push(new DwellButton({ x: 70, y: 70, r: 44, icon: icons.back, onActivate: this.act(() => app.menu()) }));
    if (!this.greeted) {
      this.greeted = true;
      const s = list[current];
      app.voice.say(s ? `Station ${current + 1}: ${s.game.name}. Du brauchst ${s.need === 1 ? 'einen Stern' : `${s.need} Sterne`}.` : 'Du hast alle Stationen geschafft!');
    }
  }

  draw(ctx) {
    const { w } = this.field;
    const { list, best, current, finished } = this.state;
    // Weg zwischen den Stationen
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < this.spots.length; i++) {
      const a = this.spots[i - 1], b = this.spots[i];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = 14;
      ctx.strokeStyle = i <= current ? `hsl(${REGIONS[b.region].hue} 70% 45% / 0.8)` : 'rgba(255,255,255,0.1)';
      ctx.stroke();
    }
    // Stationen
    for (const s of this.spots) {
      const region = REGIONS[s.region];
      const got = best[s.i] || 0;
      if (s.i > current) {
        // noch gesperrt
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.exam ? 34 : 28, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8,14,36,0.85)';
        ctx.fill();
        ctx.lineWidth = s.exam ? 3 : 2;
        ctx.strokeStyle = s.exam ? `hsl(${region.hue} 80% 65% / 0.7)` : 'rgba(255,255,255,0.25)';
        ctx.stroke();
        text(ctx, s.exam ? '★' : String(s.i + 1), s.x, s.y + 1, s.exam ? 26 : 20, 'rgba(255,255,255,0.45)', 'center', 0, 600);
      } else {
        // Sterne unter der Station: geholt / nötig
        for (let k = 0; k < 3; k++) {
          const on = k < got, needed = k < s.need;
          if (!on && !needed) continue;
          star(ctx, s.x + (k - 1) * 20, s.y + (s.i === current ? 60 : 52), 9, on ? tone(`hsl(${region.hue} 90% 60%)`, 75) : 'rgba(255,255,255,0.25)');
        }
      }
      if (s.exam && s.i <= current) text(ctx, 'Prüfung', s.x, s.y - (s.i === current ? 60 : 52), 16, '#fff', 'center', 0, 600);
    }
    super.draw(ctx);
    // Der Trainer steht an der aktuellen Station
    const here = this.spots[Math.min(current, this.spots.length - 1)];
    mascot(ctx, here.x + 64, here.y - 10, 34, finished ? 'cheer' : 'happy', this.time, this.look);

    // Kopf
    const region = REGIONS[list[Math.min(current, list.length - 1)].region];
    title(ctx, 'Karriere', w / 2, 62, 56, `hsl(${region.hue} 85% 68%)`);
    const s = list[current];
    caption(ctx, finished ? 'Alle 30 Stationen geschafft – du bist ein Meister!'
      : `${region.name} · Station ${current + 1} von ${list.length}: ${s.game.name} auf „${LEVEL_NAMES[s.level - 1]}“ · ${s.need === 1 ? '1 Stern' : `${s.need} Sterne`} nötig`,
    w / 2, 118, 20, 'rgba(255,255,255,0.8)', 'center');
  }
}
