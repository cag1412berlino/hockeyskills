// Bedienung der Einrichtungsseite: Reiter umschalten und den gewählten Reiter merken.
// Alles Fachliche (Kamera, Ball, Kalibrierung, Spieler) steckt in main.js.

const KEY = 'skiller-tab';

export function initTabs() {
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  const show = (id) => {
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === id));
    for (const p of panels) p.hidden = p.dataset.panel !== id;
    try { localStorage.setItem(KEY, id); } catch { /* ohne Speicher geht es auch */ }
  };
  for (const t of tabs) t.onclick = () => show(t.dataset.tab);
  for (const b of document.querySelectorAll('[data-goto]')) b.onclick = () => show(b.dataset.goto);
  let first = 'start';
  try { first = localStorage.getItem(KEY) || 'start'; } catch { /* egal */ }
  show(tabs.some((t) => t.dataset.tab === first) ? first : 'start');
  return show;
}
