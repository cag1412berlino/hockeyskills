// Simulierte Spieler. Sie werden an zwei Stellen gebraucht:
//  - zum Vormachen: Ein Geisterball zeigt vor einer neuen Übung, was zu tun ist.
//  - zum Austarieren: tools/balance.js lässt Anfänger, mittlere und starke Spieler jede Übung
//    viele Male spielen und leitet daraus die Sterne-Schwellen ab.
//
// goals[id](spiel, ball) sagt, wo ein Spieler den Ball gerade hinhaben möchte:
// { x, y } = dorthin, null = still liegen lassen, { x, y, roll: true } = anschieben und loslassen.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ahead = (path, idx, n = 6) => path[Math.min(path.length - 1, idx + n)];

/** Weicht aus, wenn eine Gefahr näher als `near` ist; sonst zurück zum eigentlichen Ziel. */
function flee(ball, dangers, near, field, otherwise) {
  let worst = null, d = near;
  for (const q of dangers) {
    const dq = dist(q, ball);
    if (dq < d) { d = dq; worst = q; }
  }
  if (!worst) return otherwise;
  const k = 170 / (d || 1);
  return {
    x: Math.max(60, Math.min(field.w - 60, ball.x + (ball.x - worst.x) * k + (field.w / 2 - ball.x) * 0.2)),
    y: Math.max(200, Math.min(field.h - 60, ball.y + (ball.y - worst.y) * k + (580 - ball.y) * 0.2)),
  };
}

export const goals = {
  targets(g, ball) {
    if (g.stops.zones.length) return null; // nach dem Treffer kurz liegen lassen
    const t = g.targets.find((x) => x.kind === 'clock') ?? g.targets.filter((x) => x.kind !== 'bomb').sort((a, b) => dist(a, ball) - dist(b, ball))[0];
    return t ?? null;
  },
  cloud(g, ball) {
    if (g.stops.zones.length || !g.target) return null;
    const t = g.target, c = g.cloud;
    // Liegt die Wolke auf dem direkten Weg, außen herum.
    const len = dist(t, ball) || 1;
    const ux = (t.x - ball.x) / len, uy = (t.y - ball.y) / len;
    const along = (c.x - ball.x) * ux + (c.y - ball.y) * uy;
    const side = (c.x - ball.x) * -uy + (c.y - ball.y) * ux;
    if (along > 0 && along < len && Math.abs(side) < c.base * 1.6) {
      const s = side > 0 ? -1 : 1;
      return { x: c.x + -uy * s * c.base * 2.1, y: c.y + ux * s * c.base * 2.1 };
    }
    return t;
  },
  rain(g, ball) {
    // die Stelle in der Zone, die am weitesten von allem entfernt ist, was gleich ankommt
    const W = g.env.field.w;
    let best = ball.x, bestScore = -Infinity;
    for (let x = 60; x <= W - 60; x += 30) {
      let clear = 1e9;
      for (const it of g.items) {
        if (it.kind !== 'block' || it.y > 900 || it.y < 240) continue;
        clear = Math.min(clear, Math.max(0, Math.abs(x - it.x) - it.w / 2));
      }
      const score = Math.min(clear, 160) - Math.abs(x - ball.x) * 0.15;
      if (score > bestScore) { bestScore = score; best = x; }
    }
    return { x: best, y: 790 };
  },
  dodge: (g, ball) => flee(ball, g.hazards.filter((h) => h.wait <= 0), 210, g.env.field, g.power ?? g.star),
  chase: (g, ball) => flee(ball, g.safe > 0 || g.frozen > 0 ? [] : g.chasers, 230, g.env.field, g.ice ?? g.star),
  line(g, ball) {
    // Stopp-Punkt mitnehmen (Extrapunkte): dort kurz anhalten
    if (!g.stopDone && g.idx >= g.stopAt - 6 && g.idx <= g.stopAt + 4) return dist(ball, g.path[g.stopAt]) > 25 ? g.path[g.stopAt] : null;
    const next = ahead(g.path, g.idx, 7);
    if (g.obstacles.some((o) => dist(o, next) < 120)) return null; // Stachelball abwarten
    return g.stopDone || g.idx > g.stopAt ? next : g.path[Math.min(g.stopAt, g.idx + 7)];
  },
  slalom(g, ball) {
    // durch die Mitte des nächsten Tors hindurch auf die andere Seite
    const gate = g.target(ball);
    if (!gate) return null;
    const [a, b] = g.posts(gate);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const ang = g.angle(gate), dx = Math.cos(ang), dy = Math.sin(ang);
    const side = (ball.x - mx) * dx + (ball.y - my) * dy;
    return { x: mx - Math.sign(side || -1) * dx * 70, y: my - Math.sign(side || -1) * dy * 70 };
  },
  run(g, ball) {
    if (!g.screen) return null;
    // Punkt auf der Bahn, der ein Stück vor dem Ball liegt und möglichst auf Höhe 620 bleibt.
    let best = null, score = Infinity;
    for (let i = 1; i < g.screen.length; i++) {
      const a = g.screen[i - 1], b = g.screen[i];
      for (let t = 0; t <= 1; t += 0.2) {
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const s = Math.abs(p.y - 620) + dist(p, ball) * 0.3;
        if (s < score) { score = s; best = p; }
      }
    }
    // Hindernissen auf der Bahn weicht der Bot zur freien Seite aus.
    for (const it of g.items ?? []) {
      if (it.kind !== 'block' || !best) continue;
      const y = g.scroll - it.d;
      if (y > best.y - 320 && y < best.y + 60 && Math.abs(best.x - it.x) < it.w / 2 + 50) best = { x: it.gapX, y: best.y };
    }
    return best;
  },
  wire: (g) => (g.running ? ahead(g.path, g.idx, 5) : g.path[g.from]),
  eight: (g) => g.seq[g.next],
  spotlight: (g) => ({ x: g.x, y: g.y }),
  trace: (g) => (g.running ? ahead(g.path, g.idx, 6) : g.path[0]),
  pendulum: (g) => g.pads()[g.active],
  taps(g) {
    // immer auf die Seite, auf der der Ball zuletzt nicht war
    const { x, y, a, gap } = g.now;
    const s = (g.side === 1 ? -1 : 1) * (gap + 45);
    return { x: x - Math.sin(a) * s, y: y + Math.cos(a) * s };
  },
  rhythm(g) {
    const n = g.notes.reduce((a, c) => (!a || c.y > a.y ? c : a), null);
    return n ? { x: g.lanes[n.lane], y: 790 } : null;
  },
  stop: (g) => (g.state === 'stop' ? null : g.star),
  spot: (g, ball) => (g.target && dist(g.target, ball) > g.target.rings[0] * 0.5 ? g.target : null),
  roll(g, ball) {
    if (g.state === 'load') return dist(g.start, ball) > 20 ? g.start : null;
    if (g.state === 'aim') return { x: g.target.x, y: g.target.y, roll: true };
    return null;
  },
  tricks(g) {
    if (g.state === 'show') return null;
    return g.state === 'ready' ? g.path[0] : ahead(g.path, g.idx, 9);
  },
};

// Drei Könnensstufen: Höchsttempo (Einheiten/s), Reaktionszeit (s), Zielungenauigkeit (Einheiten)
export const SKILLS = {
  beginner: { speed: 330, react: 0.5, noise: 45 },
  medium: { speed: 520, react: 0.32, noise: 26 },
  strong: { speed: 760, react: 0.2, noise: 12 },
};

const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 0.58;

/** Ein simulierter Spieler, der den Ball mit begrenztem Tempo und Können zu seinen Zielen bewegt. */
export class Bot {
  constructor(skill = SKILLS.medium, start = { x: 500, y: 600 }) {
    this.skill = skill;
    this.ball = { x: start.x, y: start.y, vx: 0, vy: 0, visible: true };
    this.aim = null;      // worauf der Spieler gerade zielt (mit Reaktionsverzug und Ungenauigkeit)
    this.thinkIn = 0;
    this.rolling = false; // der Ball rollt frei aus (Zielrollen)
  }

  step(dt, goal) {
    const b = this.ball, s = this.skill;
    if (this.rolling) {
      // frei rollender Ball: bremst gleichmäßig ab
      const v = Math.hypot(b.vx, b.vy);
      const nv = Math.max(0, v - 320 * dt);
      if (nv === 0) { this.rolling = false; b.vx = b.vy = 0; this.aim = null; this.thinkIn = 0.6; return b; }
      b.vx *= nv / v; b.vy *= nv / v;
      b.x += b.vx * dt; b.y += b.vy * dt;
      return b;
    }
    this.thinkIn -= dt;
    if (this.thinkIn <= 0) {
      this.thinkIn = s.react;
      this.aim = goal && { x: goal.x + gauss() * s.noise, y: goal.y + gauss() * s.noise, roll: goal.roll };
    }
    let tx = 0, ty = 0;
    if (this.aim) {
      const d = dist(this.aim, b);
      if (this.aim.roll) {
        // Anschieben: so viel Schwung, dass der Ball ungefähr im Ziel ausrollt
        const v = Math.sqrt(2 * 320 * d) * (1 + (gauss() * s.noise) / 250);
        b.vx = ((this.aim.x - b.x) / d) * v;
        b.vy = ((this.aim.y - b.y) / d) * v;
        this.rolling = true;
        return b;
      }
      const v = Math.min(s.speed, d * 6); // kurz vor dem Ziel abbremsen
      if (d > 1) { tx = ((this.aim.x - b.x) / d) * v; ty = ((this.aim.y - b.y) / d) * v; }
    }
    const k = Math.min(1, 9 * dt);
    b.vx += (tx - b.vx) * k;
    b.vy += (ty - b.vy) * k;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    return b;
  }
}
