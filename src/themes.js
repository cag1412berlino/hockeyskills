// Themenwelten: Hintergrund und schwebende Teilchen. Alle bleiben dunkel und bläulich,
// damit die Kamera den Ball weiter sicher erkennt und der Vereinsstil erhalten bleibt.

const TAU = Math.PI * 2;

export const THEMES = {
  space: {
    name: 'Weltraum',
    inner: 'hsl(216 80% 12%)', outer: 'hsl(224 85% 3%)',
    // Sterne: fallen ganz langsam und funkeln
    draw(ctx, p, f, t) {
      ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * p.tw + p.x * 50));
      ctx.beginPath();
      ctx.arc(p.x * f.w, (p.y * f.h + t * p.v) % f.h, p.r, 0, TAU);
      ctx.fill();
    },
  },
  sea: {
    name: 'Unterwasser',
    inner: 'hsl(198 85% 14%)', outer: 'hsl(214 90% 4%)',
    // Luftblasen: steigen auf und pendeln leicht
    draw(ctx, p, f, t) {
      const y = f.h - ((p.y * f.h + t * p.v * 4) % (f.h + 40));
      ctx.globalAlpha = p.a * 1.2;
      ctx.beginPath();
      ctx.arc(p.x * f.w + Math.sin(t * p.tw * 0.5 + p.y * 9) * 14, y, p.r * 3, 0, TAU);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },
  },
  ice: {
    name: 'Eis',
    inner: 'hsl(205 60% 17%)', outer: 'hsl(216 70% 5%)',
    // Schneeflocken: fallen und treiben seitlich
    draw(ctx, p, f, t) {
      ctx.globalAlpha = p.a * 1.4;
      ctx.beginPath();
      ctx.arc((p.x * f.w + Math.sin(t * 0.6 + p.y * 12) * 30 + t * 6) % f.w, (p.y * f.h + t * p.v * 3) % f.h, p.r * 1.3, 0, TAU);
      ctx.fill();
    },
  },
  jungle: {
    name: 'Nachtwald',
    inner: 'hsl(190 70% 11%)', outer: 'hsl(212 80% 3%)',
    // Glühwürmchen: ziehen kleine Kreise und glimmen auf und ab
    draw(ctx, p, f, t) {
      ctx.globalAlpha = p.a * (0.3 + 0.9 * Math.max(0, Math.sin(t * p.tw * 0.6 + p.x * 40)));
      ctx.beginPath();
      ctx.arc(p.x * f.w + Math.cos(t * 0.4 * p.tw + p.y * 20) * 40, p.y * f.h + Math.sin(t * 0.5 * p.tw + p.x * 20) * 30, p.r * 1.6, 0, TAU);
      ctx.fill();
    },
  },
};

export const THEME_IDS = Object.keys(THEMES);

export function randomTheme() {
  return THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)];
}
