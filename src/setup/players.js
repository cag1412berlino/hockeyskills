// Reiter „Spieler“ und das eigene Training: Spielerliste, Verlauf, Spielstände sichern und laden.
// main.js übergibt, was gebraucht wird (Einstellungen, App, Rückmeldungen).
import { newProfile, completeProfile, rankOf, summarize, ageOf } from '../profile.js';
import { games, categories } from '../games/index.js';

const $ = (s) => document.querySelector(s);

/**
 * ctx = { app, config, saveConfig, refreshSetup, setMessage, brand }.
 * Verbindet die Knöpfe und liefert render(), das Liste, Verlauf und Ankreuzliste neu zeichnet.
 */
export function initPlayersPanel({ app, config, saveConfig, refreshSetup, setMessage, brand }) {
  const BRAND = brand;
  function renderPlayers() {
    $('#players').replaceChildren(...config.profiles.map((p) => {
      const row = document.createElement('div');
      row.className = 'player';
      const pick = Object.assign(document.createElement('input'), { type: 'radio', name: 'player', checked: p.id === config.current });
      pick.setAttribute('aria-label', `${p.name} auswählen`);
      pick.onchange = () => { config.current = p.id; saveConfig(); refreshSetup(); app.menu(); };
      const name = Object.assign(document.createElement('input'), { type: 'text', value: p.name, maxLength: 14 });
      name.setAttribute('aria-label', 'Name');
      name.onchange = () => { p.name = name.value.trim() || p.name; saveConfig(); refreshSetup(); app.menu(); };
      const age = Object.assign(document.createElement('input'), { type: 'number', min: 3, max: 99, placeholder: 'Alter', value: ageOf(p) ?? '' });
      age.className = 'age';
      age.setAttribute('aria-label', `Alter von ${p.name}`);
      age.onchange = () => {
        const years = Math.round(Number(age.value));
        p.birthYear = age.value && years >= 3 && years <= 99 ? new Date().getFullYear() - years : null;
        saveConfig();
        refreshSetup();
      };
      const rank = Object.assign(document.createElement('span'), { className: 'rank', textContent: `${rankOf(p.xp).name} · ${p.xp} Punkte` });
      const del = Object.assign(document.createElement('button'), { textContent: 'Löschen', disabled: config.profiles.length < 2 });
      del.onclick = () => {
        if (!confirm(`${p.name} mit allen Bestwerten und Abzeichen löschen?`)) return;
        config.profiles = config.profiles.filter((x) => x !== p);
        if (config.current === p.id) config.current = config.profiles[0].id;
        saveConfig();
        refreshSetup();
        app.menu();
      };
      const lefty = document.createElement('label');
      lefty.className = 'lefty';
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!p.lefty });
      box.onchange = () => { p.lefty = box.checked; saveConfig(); };
      lefty.append(box, ' Linkshänder');
      row.append(pick, name, age, lefty, rank, del);
      return row;
    }));
  }

  /** Ankreuzliste für das eigene Training, nach Schwerpunkten gruppiert. */
  function renderCustom() {
    const chosen = new Set(config.custom?.ids ?? []);
    $('#custom-seconds').value = String(config.custom?.seconds ?? 40);
    $('#custom-games').replaceChildren(...categories.flatMap((cat) => [
      Object.assign(document.createElement('b'), { textContent: cat.name }),
      ...cat.games.map((game) => {
        const label = document.createElement('label');
        const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: chosen.has(game.id) });
        box.onchange = () => {
          if (box.checked) chosen.add(game.id); else chosen.delete(game.id);
          // Reihenfolge wie im Menü
          config.custom = { ids: games.filter((g) => chosen.has(g.id)).map((g) => g.id), seconds: Number($('#custom-seconds').value) };
          saveConfig();
        };
        label.append(box, ` ${game.name}`);
        return label;
      }),
    ]));
  }

  /** Verlaufstabelle des aktiven Spielers: Runden, Bestwert, Schnitt der letzten fünf, Tendenz. */
  function renderHistory() {
    const p = app.profile;
    $('#history-title').textContent = `${p.name}: ${rankOf(p.xp).name}, ${p.xp} Punkte, ${p.stats.rounds} Übungen gespielt`;
    const rows = summarize(p, games).filter((r) => r.rounds);
    const cell = (tag, textContent, className = '') => Object.assign(document.createElement(tag), { textContent, className });
    const head = document.createElement('tr');
    head.append(...['Übung', 'Runden', 'Bestwert', 'Schnitt letzte 5', 'Tendenz'].map((t) => cell('th', t)));
    $('#history').replaceChildren(head, ...rows.map((r) => {
      const tr = document.createElement('tr');
      tr.append(
        cell('td', r.game.name), cell('td', r.rounds), cell('td', r.best), cell('td', r.recent),
        cell('td', r.trend > 0 ? '↑ besser' : r.trend < 0 ? '↓ schwächer' : '→ gleich', r.trend > 0 ? 'up' : r.trend < 0 ? 'down' : ''),
      );
      return tr;
    }));
    if (!rows.length) $('#history').append(Object.assign(document.createElement('tr'), { innerHTML: '<td colspan="5">Noch keine Übung gespielt.</td>' }));
  }

  $('#btn-reset-scores').onclick = () => {
    if (!confirm(`Alle Bestwerte von ${app.profile.name} löschen? Rang und Abzeichen bleiben.`)) return;
    app.profile.highscores = {};
    saveConfig();
  };

  // Spielstände sichern und laden
  $('#btn-export').onclick = () => {
    const data = JSON.stringify({ app: BRAND.name, saved: new Date().toISOString(), current: config.current, profiles: config.profiles }, null, 2);
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([data], { type: 'application/json' })),
      download: `skiller-academy-spielstaende-${new Date().toISOString().slice(0, 10)}.json`,
    });
    link.click();
    URL.revokeObjectURL(link.href);
  };
  $('#btn-import').onclick = () => $('#import-file').click();
  $('#import-file').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.profiles) || !data.profiles.length) throw new Error('keine Spieler in der Datei');
      const names = data.profiles.map((p) => p.name).join(', ');
      if (!confirm(`Sicherung laden? Die jetzigen Spieler werden ersetzt durch: ${names}`)) return;
      config.profiles = data.profiles.map(completeProfile);
      config.current = config.profiles.some((p) => p.id === data.current) ? data.current : config.profiles[0].id;
      saveConfig();
      refreshSetup();
      app.menu();
      setMessage();
    } catch (err) {
      setMessage(`Die Sicherung konnte nicht geladen werden (${err.message}).`);
    }
  };

  // Spieler
  $('#btn-add-player').onclick = () => {
    const name = $('#new-player').value.trim();
    if (!name) return;
    const p = newProfile(name);
    const years = Math.round(Number($('#new-age').value));
    if (years >= 3 && years <= 99) p.birthYear = new Date().getFullYear() - years;
    config.profiles.push(p);
    config.current = p.id;
    $('#new-player').value = '';
    $('#new-age').value = '';
    saveConfig();
    refreshSetup();
    app.menu();
  };

  // Eigenes Training
  $('#custom-seconds').onchange = (e) => {
    config.custom = { ids: config.custom?.ids ?? [], seconds: Number(e.target.value) };
    saveConfig();
  };

  return {
    render() {
      renderPlayers();
      renderCustom();
      renderHistory();
    },
  };
}
