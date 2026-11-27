// Grundbausteine fürs Zeichnen: Schrift, Leuchten, Farbtöne, Stern.
// Alles andere (Figuren, Buttons) baut darauf auf.
export const theme = {
  family: '"Fredoka", system-ui, sans-serif',
  px: 1, // Bildschirm-Pixel pro Feld-Einheit (für den Leuchteffekt)
  glow: 1, // Stärke des Leuchtens, 0 = aus (die App nimmt es zurück, wenn das Bild ruckelt)
  world: 'space', // aktuelle Themenwelt: bestimmt, wie Wesen und Sammelstücke aussehen
};

/** Sanftes Leuchten für alles, was danach gezeichnet wird. Mit noGlow wieder ausschalten. */
export function glow(ctx, color, blur = 22) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * 0.55 * theme.px * theme.glow; // bewusst zurückhaltend: ein feiner Schein, kein Nebel
}

export function noGlow(ctx) {
  ctx.shadowBlur = 0;
}

/** Hellere oder dunklere Variante einer Spielfarbe (hsl-Farben aus der Palette). */
export function tone(color, lightness, saturation = 90) {
  const m = /hsl\((\d+(?:\.\d+)?)/.exec(color);
  return m ? `hsl(${m[1]} ${saturation}% ${lightness}%)` : color;
}

/**
 * Text. blur = Stärke des Scheins (0 = keiner). weight = Schriftstärke (400 fein, 500 normal, 600 kräftig).
 */
export function text(ctx, str, x, y, size, color = '#fff', align = 'center', blur = size * 0.2, weight = 500) {
  ctx.font = `${weight} ${size}px ${theme.family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if (blur) glow(ctx, color, blur);
  ctx.fillText(String(str), x, y);
  noGlow(ctx);
}

/** Überschrift: klare, helle Schrift mit einem feinen farbigen Schein und etwas Luft zwischen den Buchstaben. */
export function title(ctx, str, x, y, size, color) {
  ctx.letterSpacing = `${(size * 0.015).toFixed(1)}px`;
  text(ctx, str, x, y, size, tone(color, 93), 'center', size * 0.45, 600);
  ctx.shadowColor = color;
  ctx.letterSpacing = '0px';
}

/** Kleine Beschriftung in Großbuchstaben mit weitem Abstand, z. B. "PUNKTE". */
export function caption(ctx, str, x, y, size = 20, color = 'rgba(255,255,255,0.6)', align = 'left') {
  ctx.letterSpacing = `${(size * 0.14).toFixed(1)}px`;
  text(ctx, String(str).toUpperCase(), x, y, size, color, align, 0, 500);
  ctx.letterSpacing = '0px';
}

export function star(ctx, x, y, r, color = '#fff', rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.5 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.14;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fill();
}
