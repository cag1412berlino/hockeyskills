// Startpunkt: verbindet Einrichtungsseite, Kamera, Ballerkennung und Kalibrierung mit der App.
import { config, saveConfig, BRAND } from './config.js';
import { Engine, setFieldMeters } from './engine.js';
import { BallTracker, BALL_PRESETS } from './tracker.js';
import { Camera } from './camera.js';
import { SimCamera } from './simcam.js';
import { Sound, Voice, Music } from './sound.js';
import { applyHomography } from './homography.js';
import { autoCalibrate, manualCalibrate, toGray } from './calibration.js';
import { createApp } from './app.js';
import { MenuScene } from './scenes.js';
import { games, categories } from './games/index.js';
import { newProfile, completeProfile, rankOf, summarize } from './profile.js';
import { THEMES, randomTheme, setBallHue } from './themes.js';
import { VERSION } from './version.js';

const $ = (s) => document.querySelector(s);
const SIM = new URLSearchParams(location.search).has('sim');

const stage = $('#stage');
const video = $('#cam');
const setupEl = $('#setup');
const preview = $('#preview');
const debugEl = $('#debug');

const sound = new Sound();
const voice = new Voice();
const music = new Music(sound);
const engine = new Engine(stage, config);
const tracker = new BallTracker();
const camera = new Camera(video);
const mouse = { x: 0, y: 0, inside: false };

let sim = null;
let source = null;      // Bildquelle für die Ballerkennung (Video oder simulierte Kamera)
let mode = 'camera';    // 'camera' oder 'mouse'
let detection = null;   // letzte Ballposition im Kamerabild
let lastVideoTime = -1;
let cancelCalibration = null;
let calibrating = false;
const recent = [];      // die letzten Kamerabilder: Ball erkannt oder nicht (für die Erkennungsquote)
const fps = { frames: 0, tracked: 0, since: performance.now(), render: 0, camera: 0 };

// ---------- Die App: Navigation, Abrechnung, Training (siehe app.js) ----------

const app = createApp({ engine, sound, voice, music, onPlayerChange: () => refreshSetup() });
window.hockey = app; // zum Ausprobieren in der Browser-Konsole

// ---------- Ballposition ----------

stage.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX / window.innerWidth;
  mouse.y = e.clientY / window.innerHeight;
  mouse.inside = true;
});
stage.addEventListener('pointerleave', () => { mouse.inside = false; });

engine.ballProvider = () => {
  if (mode === 'mouse') return mouse.inside ? mouse : null;
  if (!detection || !config.calib) return null;
  return applyHomography(config.calib.H, detection.x, detection.y);
};

engine.onFrame = () => {
  countFps();
  if (!source || calibrating) return;
  if (sim) {
    sim.render();
  } else {
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
  }
  detection = tracker.process(source, config.ball);
  fps.tracked++;
  recent.push(detection ? 1 : 0);
  if (recent.length > 90) recent.shift();
  if (!setupEl.hidden) drawPreview(preview);
  if (!debugEl.hidden) drawPreview($('#debug-view'));
};

// ---------- Einrichtung ----------

function showSetup(show) {
  setupEl.hidden = !show;
  engine.paused = show;
  if (show) refreshSetup();
}

function setMessage(msg = '') {
  $('#message').textContent = msg;
}

function refreshSetup() {
  for (const btn of $('#ball-presets').children) {
    btn.classList.toggle('active', btn.dataset.preset === config.ball.preset);
  }
  for (const radio of document.querySelectorAll('input[name=shape]')) {
    radio.checked = radio.value === config.fieldShape;
  }
  setBallHue(config.ball.h); // Spielfarben meiden den Farbbereich um den Ball
  setFieldMeters(config.fieldMeters);
  $('#field-meters').value = String(config.fieldMeters);
  $('#latency').value = config.latency;
  $('#latency-value').textContent = config.latency ? `${config.latency} ms` : 'aus';
  $('#dim').value = Math.round(config.dim * 100);
  $('#dim-value').textContent = config.dim ? `${Math.round(config.dim * 100)} %` : 'aus';
  renderChecklist();
  $('#tolerance').value = config.ball.hTol;
  $('#tolerance-value').textContent = `±${config.ball.hTol}°`;
  $('#rotation').value = String(config.rotation);
  $('#sound-on').checked = !config.muted;
  $('#voice-on').checked = config.voice;
  $('#music-on').checked = config.music;
  $('#demos-on').checked = config.demos;
  $('#theme').value = config.theme;
  renderPlayers();
  renderCustom();
  renderHistory();
  const c = config.calib;
  $('#calib-status').textContent = !c
    ? 'Noch nicht kalibriert.'
    : c.error == null
      ? 'Kalibriert ✔'
      : `Kalibriert ✔ (Abweichung ${(c.error * 100).toFixed(1)} % der Fläche${c.error > 0.03 ? ' – eher ungenau, bitte wiederholen' : ''})`;
}

/** In wie viel Prozent der letzten Kamerabilder der Ball erkannt wurde. */
function quality() {
  return recent.length ? Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 100) : 0;
}

/** Zählt einmal pro Sekunde, wie viele Bilder gezeichnet und wie viele Kamerabilder ausgewertet wurden. */
function countFps() {
  fps.frames++;
  const now = performance.now();
  if (now - fps.since < 1000) return;
  fps.render = fps.frames;
  fps.camera = fps.tracked;
  fps.frames = fps.tracked = 0;
  fps.since = now;
  if (!debugEl.hidden) {
    $('#debug-info').textContent =
      `Bild ${fps.render}/s · Kamera ${fps.camera}/s · Ball ${detection ? `${detection.area} Pixel` : 'nicht erkannt'} · erkannt in ${quality()} % der Bilder`;
  }
}

/** Zeichnet das Kamerabild mit türkis markierter Ballfarbe in die Einrichtung oder die Einblendung. */
/** Kleine Übersicht ganz oben: Was ist für den Betrieb mit Kamera schon erledigt? */
function renderChecklist() {
  const steps = [
    ['Kamera läuft', !!source],
    ['Ball erkannt', !!source && quality() >= 80],
    ['Kalibriert', !!config.calib],
  ];
  const list = $('#checklist');
  if (list.children.length !== steps.length) {
    list.replaceChildren(...steps.map(() => document.createElement('li')));
  }
  steps.forEach(([label, done], i) => {
    const li = list.children[i];
    li.textContent = `${done ? '✔' : '○'} ${label}`;
    li.className = done ? 'done' : '';
  });
}

/** Liste der Spieler: aktiven wählen, umbenennen, löschen. */
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
    row.append(pick, name, rank, del);
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

function drawPreview(target) {
  const frame = tracker.frame;
  if (!frame) return;
  const { width: w, height: h } = frame;
  if (target.width !== w || target.height !== h) {
    target.width = w;
    target.height = h;
  }
  const out = new ImageData(new Uint8ClampedArray(frame.data), w, h);
  const mask = tracker.mask;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    out.data[i * 4] = 0;
    out.data[i * 4 + 1] = 255;
    out.data[i * 4 + 2] = 255;
  }
  const ctx = target.getContext('2d');
  ctx.putImageData(out, 0, 0);
  if (detection) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(detection.x * w, detection.y * h, 14, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (target === preview) {
    $('#track-status').textContent = detection ? `Ball erkannt ✔ (in ${quality()} % der letzten Bilder)` : 'Kein Ball im Bild erkannt.';
    renderChecklist();
  }
}

async function startCamera(deviceId) {
  setMessage();
  try {
    if (SIM) {
      sim = new SimCamera(stage, mouse, BALL_PRESETS[config.ball.preset]?.css ?? `hsl(${config.ball.h} 100% 50%)`);
      source = sim.canvas;
      $('#track-status').textContent = 'Simulierte Kamera (Maus = Ball).';
      return;
    }
    const settings = await camera.start(deviceId);
    source = video;
    config.cameraId = settings.deviceId ?? deviceId ?? null;
    saveConfig();
    const select = $('#camera-select');
    select.replaceChildren(...(await Camera.list()).map((d, i) => {
      const o = new Option(d.label || `Kamera ${i + 1}`, d.deviceId);
      o.selected = d.deviceId === config.cameraId;
      return o;
    }));
  } catch (err) {
    source = null;
    setMessage(err.name === 'NotAllowedError'
      ? 'Der Browser darf die Kamera nicht benutzen. Bitte den Zugriff oben in der Adressleiste erlauben.'
      : `Kamera konnte nicht gestartet werden (${err.message}).`);
  }
}

function buildSetup() {
  for (const [id, p] of Object.entries(BALL_PRESETS)) {
    const btn = document.createElement('button');
    btn.dataset.preset = id;
    btn.innerHTML = `<span class="dot" style="background:${p.css}"></span>${p.name}`;
    btn.onclick = () => {
      config.ball = { preset: id, ...p };
      saveConfig();
      if (sim) sim.ballCss = p.css;
      refreshSetup();
    };
    $('#ball-presets').append(btn);
  }

  preview.onclick = (e) => {
    const r = preview.getBoundingClientRect();
    const learned = tracker.sampleColor((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    if (!learned) return;
    config.ball = { preset: 'custom', ...learned };
    saveConfig();
    refreshSetup();
  };

  for (const radio of document.querySelectorAll('input[name=shape]')) {
    radio.onchange = () => {
      config.fieldShape = radio.value;
      saveConfig();
      engine.resize();
    };
  }

  $('#tolerance').oninput = (e) => {
    config.ball.hTol = Number(e.target.value);
    saveConfig();
    refreshSetup();
  };
  $('#rotation').onchange = (e) => setRotation(Number(e.target.value));
  $('#sound-on').onchange = (e) => setMuted(!e.target.checked);
  $('#lock-auto').onchange = async (e) => {
    setMessage();
    try {
      const ok = await camera.lockAuto(e.target.checked);
      if (!ok) {
        e.target.checked = false;
        setMessage('Diese Kamera lässt sich nicht fest einstellen. Das ist kein Problem, die Ballfarbe kann dann nur etwas stärker schwanken.');
      }
    } catch (err) {
      e.target.checked = false;
      setMessage(`Kamera-Automatik konnte nicht umgestellt werden (${err.message}).`);
    }
  };
  $('#btn-reset-scores').onclick = () => {
    if (!confirm(`Alle Bestwerte von ${app.profile.name} löschen? Rang und Abzeichen bleiben.`)) return;
    app.profile.highscores = {};
    saveConfig();
  };

  // Ton, Stimme, Musik, Vormachen, Themenwelt
  const toggle = (id, key, apply) => {
    $(id).onchange = (e) => {
      config[key] = e.target.checked;
      apply?.(e.target.checked);
      saveConfig();
    };
  };
  toggle('#voice-on', 'voice', (on) => { voice.enabled = on; });
  toggle('#music-on', 'music', (on) => { music.enabled = on; if (!on) music.stop(); });
  toggle('#demos-on', 'demos');
  $('#theme').replaceChildren(new Option('Automatisch (wechselt)', 'auto'), ...Object.entries(THEMES).map(([id, t]) => new Option(t.name, id)));
  $('#theme').onchange = (e) => {
    config.theme = e.target.value;
    saveConfig();
    engine.theme = config.theme === 'auto' ? randomTheme() : config.theme;
  };

  // Feinabstimmung für den Aufbau
  $('#field-meters').onchange = (e) => { config.fieldMeters = Number(e.target.value); saveConfig(); refreshSetup(); };
  $('#latency').oninput = (e) => { config.latency = Number(e.target.value); saveConfig(); refreshSetup(); };
  $('#dim').oninput = (e) => { config.dim = Number(e.target.value) / 100; saveConfig(); refreshSetup(); };

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
    config.profiles.push(p);
    config.current = p.id;
    $('#new-player').value = '';
    saveConfig();
    refreshSetup();
    app.menu();
  };

  // Eigenes Training
  $('#custom-seconds').onchange = (e) => {
    config.custom = { ids: config.custom?.ids ?? [], seconds: Number(e.target.value) };
    saveConfig();
  };

  $('#btn-camera').onclick = () => startCamera($('#camera-select').value || config.cameraId);
  $('#camera-select').onchange = (e) => startCamera(e.target.value);
  $('#btn-fullscreen').onclick = toggleFullscreen;
  $('#btn-auto').onclick = () => calibrate('auto');
  $('#btn-manual').onclick = () => calibrate('manual');
  $('#btn-mouse').onclick = () => { mode = 'mouse'; startPlaying(); };
  $('#btn-play').onclick = () => {
    if (!source) return setMessage('Bitte zuerst die Kamera starten.');
    if (!config.calib) return setMessage('Bitte zuerst kalibrieren.');
    mode = 'camera';
    startPlaying();
  };
}

function setRotation(deg) {
  config.rotation = ((deg % 360) + 360) % 360;
  saveConfig();
  engine.resize();
  refreshSetup();
}

function setMuted(muted) {
  config.muted = sound.muted = muted;
  saveConfig();
  refreshSetup();
}

/** Verhindert, dass der Bildschirm (und damit der Beamer) während des Spielens abschaltet. */
async function keepAwake() {
  try {
    await navigator.wakeLock?.request('screen');
  } catch {
    // nicht unterstützt oder vom System abgelehnt – dann eben ohne
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && setupEl.hidden) keepAwake();
});

function startPlaying() {
  setMessage();
  sound.resume();
  keepAwake();
  showSetup(false);
  app.menu();
  const aspect = stage.width / stage.height;
  if (mode === 'camera' && config.calib && Math.abs(config.calib.aspect - aspect) / aspect > 0.03) {
    engine.showToast('Fenstergröße hat sich geändert – bitte neu kalibrieren (Taste C)', 8);
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

// ---------- Kalibrierung ----------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const calibrationIO = {
  wait,
  show: (fn) => { engine.override = fn; },
  onClick: (fn) => { engine.clickOverride = fn; },
  onCancel: (fn) => { cancelCalibration = fn; },
  /** Mittelt drei Kamerabilder, damit Bildrauschen nicht stört. */
  async grabGray() {
    let sum = null, w = 0, h = 0;
    for (let i = 0; i < 3; i++) {
      await wait(70);
      sim?.render();
      const img = tracker.grab(source);
      if (!img) return null;
      const g = toGray(img.data);
      ({ width: w, height: h } = img);
      if (!sum) sum = g; else for (let k = 0; k < g.length; k++) sum[k] += g[k];
    }
    for (let k = 0; k < sum.length; k++) sum[k] /= 3;
    return { data: sum, w, h };
  },
  snapshot() {
    sim?.render();
    const w = source.videoWidth || source.width;
    const h = source.videoHeight || source.height;
    if (!w) return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(source, 0, 0);
    return c;
  },
};

async function calibrate(kind) {
  if (calibrating) return;
  if (!source) return setMessage('Bitte zuerst die Kamera starten.');
  setMessage();
  sound.resume();
  calibrating = true;
  setupEl.hidden = true;
  try {
    const result = kind === 'auto'
      ? await autoCalibrate(calibrationIO)
      : await manualCalibrate(calibrationIO, engine.fieldCorners());
    config.calib = { ...result, aspect: stage.width / stage.height };
    saveConfig();
    mode = 'camera';
    engine.override = null;
    startPlaying();
    engine.showToast('Kalibrierung fertig ✔');
  } catch (err) {
    engine.override = null;
    showSetup(true);
    setMessage(err.message);
  } finally {
    engine.override = null;
    engine.clickOverride = null;
    cancelCalibration = null;
    calibrating = false;
  }
}

// ---------- Tastatur ----------

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement) return;
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  const key = e.key.toLowerCase();
  if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' && e.target.type !== 'radio') return;
  if (key === 'f') toggleFullscreen();
  else if (key === 'r') setRotation(config.rotation + 90);
  else if (key === 'm') { setMuted(!config.muted); engine.showToast(config.muted ? 'Ton aus' : 'Ton an', 1.5); }
  else if (key === 'd') debugEl.hidden = !debugEl.hidden;
  else if (key === ' ' && setupEl.hidden) { e.preventDefault(); engine.scene?.togglePause?.(); }
  else if (key === 'c' && !calibrating && source) calibrate('auto');
  else if (key === 'escape') {
    if (cancelCalibration) cancelCalibration();
    else if (calibrating || !setupEl.hidden) return;
    else if (engine.scene instanceof MenuScene) showSetup(true);
    else app.menu();
  }
});

// ---------- Fehler sichtbar machen ----------

// Geht im Spiel etwas schief, soll kein stummes schwarzes Bild stehen bleiben.
let errorShown = false;
function reportError(err) {
  console.error(err);
  if (errorShown) return;
  errorShown = true;
  engine.showToast('Da ist etwas schiefgelaufen – bitte die Seite neu laden', 30);
  setMessage(`Fehler: ${err?.message ?? err}. Bitte die Seite neu laden.`);
}
window.addEventListener('error', (e) => reportError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

// ---------- Start ----------

// Vereinslogo: assets/logo.svg oder assets/logo.png. Fehlt die Datei, bleibt der Platz leer.
(function loadLogo([src, ...rest]) {
  if (!src) return;
  const img = new Image();
  img.onload = () => {
    app.logo = img;
    $('#logo').src = src;
    $('#logo').hidden = false;
  };
  img.onerror = () => loadLogo(rest);
  img.src = src;
})(['assets/logo.svg', 'assets/logo.png']);
document.title = BRAND.name;
$('#brand').textContent = BRAND.name;

// Schrift vorab laden, damit schon das erste Bild stimmt.
for (const weight of [400, 500, 600]) document.fonts?.load(`${weight} 20px "Fredoka"`).catch(() => {});

setBallHue(config.ball.h);
setFieldMeters(config.fieldMeters);
engine.theme = config.theme === 'auto' ? randomTheme() : config.theme; // jede Sitzung beginnt in einer anderen Welt
$('#version').textContent = `Version ${VERSION}`;
sound.muted = config.muted;
voice.enabled = config.voice;
music.enabled = config.music;
buildSetup();
app.menu();
showSetup(true);
engine.start();
if (SIM) {
  startCamera();
} else if (navigator.permissions?.query) {
  // Kamera nur dann sofort starten, wenn der Zugriff schon früher erlaubt wurde.
  navigator.permissions.query({ name: 'camera' })
    .then((p) => { if (p.state === 'granted') startCamera(config.cameraId); })
    .catch(() => {});
}

// Offline-Betrieb: Einmal online geladen, startet die App danach auch ohne Internet.
if ('serviceWorker' in navigator && !SIM) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
