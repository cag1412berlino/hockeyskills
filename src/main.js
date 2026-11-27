// Verbindet alles: Einrichtung, Kamera, Ballerkennung, Kalibrierung und Spiele.
import { config, saveConfig, paletteFor, BRAND } from './config.js';
import { Engine } from './engine.js';
import { BallTracker, BALL_PRESETS } from './tracker.js';
import { Camera } from './camera.js';
import { SimCamera } from './simcam.js';
import { Sound } from './sound.js';
import { applyHomography } from './homography.js';
import { autoCalibrate, manualCalibrate, toGray } from './calibration.js';
import { MenuScene, LevelScene, PlayScene, ResultScene } from './scenes.js';
import { games } from './games/index.js';

const $ = (s) => document.querySelector(s);
const SIM = new URLSearchParams(location.search).has('sim');

const stage = $('#stage');
const video = $('#cam');
const setupEl = $('#setup');
const preview = $('#preview');
const debugEl = $('#debug');

const sound = new Sound();
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
const fps = { frames: 0, tracked: 0, since: performance.now(), render: 0, camera: 0 };

// ---------- Navigation zwischen den Bildschirmen ----------

const app = {
  engine, config, sound, games,
  logo: null, // Vereinslogo, sobald geladen
  save: saveConfig,
  palette: () => paletteFor(),
  menu: () => engine.setScene(new MenuScene(app)),
  levels: (game) => engine.setScene(new LevelScene(app, game)),
  play: (game, level) => engine.setScene(new PlayScene(app, game, level)),
  result: (game, level, score, best, record) => {
    if (record) sound.win(); else sound.end();
    engine.setScene(new ResultScene(app, game, level, score, best, record));
  },
};
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
  $('#tolerance').value = config.ball.hTol;
  $('#tolerance-value').textContent = `±${config.ball.hTol}°`;
  $('#rotation').value = String(config.rotation);
  $('#sound-on').checked = !config.muted;
  const c = config.calib;
  $('#calib-status').textContent = !c
    ? 'Noch nicht kalibriert.'
    : c.error == null
      ? 'Kalibriert ✔'
      : `Kalibriert ✔ (Abweichung ${(c.error * 100).toFixed(1)} % der Fläche${c.error > 0.03 ? ' – eher ungenau, bitte wiederholen' : ''})`;
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
      `Bild ${fps.render}/s · Kamera ${fps.camera}/s · Ball ${detection ? `${detection.area} Pixel` : 'nicht erkannt'}`;
  }
}

/** Zeichnet das Kamerabild mit türkis markierter Ballfarbe in die Einrichtung oder die Einblendung. */
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
  if (target === preview) $('#track-status').textContent = detection ? 'Ball erkannt ✔' : 'Kein Ball im Bild erkannt.';
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
    if (!confirm('Alle Bestwerte löschen?')) return;
    config.highscores = {};
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
document.fonts?.load('600 20px "Fredoka"').catch(() => {});

sound.muted = config.muted;
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
