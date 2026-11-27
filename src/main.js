// Startpunkt: verbindet Einrichtungsseite, Kamera, Ballerkennung und Kalibrierung mit der App.
import { config, saveConfig, BRAND } from './config.js';
import { Engine, setFieldMeters } from './engine.js';
import { BallTracker, BALL_PRESETS, mergeColors } from './tracker.js';
import { Camera } from './camera.js';
import { SimCamera } from './simcam.js';
import { Sound, Voice, Music } from './sound.js';
import { applyHomography, invertHomography } from './homography.js';
import { autoCalibrate, manualCalibrate, toGray, calibOk } from './calibration.js';
import { createApp } from './app.js';
import { MenuScene } from './scenes.js';
import { games, categories } from './games/index.js';
import { newProfile, completeProfile, rankOf, summarize, ageOf } from './profile.js';
import { THEMES, randomTheme, setBallHue } from './themes.js';
import { VERSION } from './version.js';
import { startHowTo } from './howto.js';
import { Recorder, saveSnapshot, MAX_SECONDS } from './recorder.js';
import { RecognitionTest, STILL_SECONDS, MOVE_SECONDS } from './trackingtest.js';

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
let fakeColor = null;   // Farbe des Test-Balls, wie die Kamera sie sieht (wird beim Einschalten gelernt)
let fakeBall = false;   // Test-Ball: Maus malt einen Ball, den die Kamera filmt
const recorder = new Recorder();
let recognition = null; // laufender Erkennungstest oder null
let lastTrackTime = 0;
const recent = [];      // die letzten Kamerabilder: Ball erkannt oder nicht (für die Erkennungsquote)
const fps = { frames: 0, tracked: 0, since: performance.now(), render: 0, camera: 0 };

// ---------- Die App: Navigation, Abrechnung, Training (siehe app.js) ----------

const app = createApp({ engine, sound, voice, music, onPlayerChange: () => refreshSetup() });
window.hockey = app; // zum Ausprobieren in der Browser-Konsole

// Übungsmodus: Mit der Maus als Ball, mit dem gemalten Test-Ball oder mit der simulierten Kamera
// wird nichts gewertet. Punkte, Rekorde, Abzeichen und Ranglisten gibt es nur mit echtem Ball.
app.practice = () => mode === 'mouse' || fakeBall || !!sim;
engine.note = () => (setupEl.hidden && app.practice() ? 'Übungsmodus – Punkte zählen nicht' : null);

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

/** Sagt der Ballsuche, wo das Spielfeld im Kamerabild liegt (mit etwas Rand). */
function updateRegion() {
  const back = config.calib && invertHomography(config.calib.H);
  if (!back) return tracker.setRegion(null);
  const c = engine.fieldCorners();
  const mx = (c[0].x + c[2].x) / 2, my = (c[0].y + c[2].y) / 2;
  tracker.setRegion(c.map((p) => applyHomography(back, mx + (p.x - mx) * 1.1, my + (p.y - my) * 1.1)));
}

/** Der Test-Ball wird etwas dunkler gemalt als die reine Ballfarbe, damit die Kamera ihn nicht überbelichtet. */
const fakeCss = () => `hsl(${config.ball.h} 100% 42%)`;
/** Die Farbe, nach der gerade gesucht wird. */
const searchColor = () => (fakeBall && fakeColor) || config.ball;

engine.fakeBall = () => (fakeBall && mode === 'camera' && mouse.inside && !calibrating
  ? { x: mouse.x, y: mouse.y, color: fakeCss() } : null);

/**
 * Test-Ball ein- oder ausschalten. Beim Einschalten malt die App den Ball kurz in die Mitte und
 * lernt, wie die Kamera seine Farbe sieht: Ein gemalter Ball sieht im Kamerabild oft viel blasser
 * aus als ein echter, die eingestellte Ballfarbe würde ihn dann nicht finden.
 */
async function setFakeBall(on) {
  fakeBall = on;
  if (sim) sim.showBall = !on;
  document.body.classList.toggle('fake-ball', on);
  fakeColor = null;
  if (!on || !source || calibrating) return;
  calibrating = true;
  try {
    // An fünf Stellen des Felds malen und messen: Je nach Blickwinkel sieht die Kamera die Farbe anders.
    const [tl, tr, , bl] = engine.fieldCorners();
    const at = (u, v) => ({ x: tl.x + (tr.x - tl.x) * u + (bl.x - tl.x) * v, y: tl.y + (tr.y - tl.y) * u + (bl.y - tl.y) * v });
    const radius = Math.min(stage.width, stage.height) * 0.035;
    const dot = (p) => (ctx, cw, ch) => {
      if (!p) return;
      ctx.fillStyle = fakeCss();
      ctx.beginPath();
      ctx.arc(p.x * cw, p.y * ch, radius, 0, Math.PI * 2);
      ctx.fill();
    };
    // Aus der Kalibrierung ist bekannt, wo jeder gemalte Punkt im Kamerabild liegt und wie groß er
    // dort ist. Genau dort wird die Farbe gemessen, nur im Inneren des Punkts.
    const back = config.calib && invertHomography(config.calib.H);
    const samples = [];
    for (const [u, v] of back ? [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]] : []) {
      const p = at(u, v);
      engine.override = dot(p);
      await wait(500);
      if (!(await calibrationIO.grabGray())) break;
      const c = applyHomography(back, p.x, p.y);
      const edge = applyHomography(back, p.x + radius / stage.width, p.y);
      const w = tracker.frame.width;
      const r = Math.max(1, Math.floor(Math.hypot(edge.x - c.x, (edge.y - c.y) * (tracker.frame.height / w)) * w * 0.5));
      const color = tracker.sampleColor(c.x, c.y, 0.2, Math.min(6, r));
      // Nur übernehmen, wenn es nach der gemalten Farbe aussieht (sonst lag etwas im Weg).
      const off = color && Math.abs(((color.h - config.ball.h + 540) % 360) - 180);
      if (color && off <= 50 && color.sMin > 0.2) samples.push(color);
    }
    const learned = mergeColors(samples);
    if (learned) learned.hTol = Math.min(30, learned.hTol);
    if (learned) fakeColor = { preset: 'fake', ...learned };
    engine.showToast(learned ? 'Test-Ball an: Maus bewegen' : 'Test-Ball an (Farbe nicht gelernt, es gilt die Ballfarbe)', 2.5);
  } finally {
    engine.override = null;
    calibrating = false;
  }
}

async function toggleRecording() {
  if (recorder.active) {
    await recorder.stop();
    $('#btn-record').textContent = 'Aufnahme starten';
    engine.showToast('Aufnahme gespeichert (Download-Ordner)', 3);
    return;
  }
  if (!source) { setMessage('Für die Aufnahme zuerst die Kamera starten.'); return; }
  recorder.start({
    version: VERSION, time: new Date().toISOString(), browser: navigator.userAgent,
    ball: config.ball, searchColor: searchColor(), calib: config.calib, fieldShape: config.fieldShape, fieldMeters: config.fieldMeters,
    latency: config.latency, dim: config.dim, rotation: config.rotation, lockAuto: config.lockAuto,
    field: { w: engine.field.w, h: engine.field.h }, stage: { w: stage.width, h: stage.height },
    camera: { w: source.videoWidth || source.width, h: source.videoHeight || source.height },
    fakeBall, simulated: !!sim, columns: { cam: ['x', 'y', 'area', 'rivals'], ball: ['x', 'y'] },
  });
  $('#btn-record').textContent = 'Aufnahme beenden';
  engine.showToast(`Aufnahme läuft (höchstens ${MAX_SECONDS} s, Taste V beendet)`, 3);
}

engine.onFrame = () => {
  countFps();
  if (!source || calibrating) return;
  if (sim) {
    sim.render();
  } else {
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
  }
  tracker.useRegion = setupEl.hidden && !recognition; // im Spiel nur im Feld suchen, in der Einrichtung überall
  detection = tracker.process(source, searchColor());
  fps.tracked++;
  recent.push(detection ? 1 : 0);
  if (recent.length > 90) recent.shift();
  const now = performance.now();
  if (recognition) stepRecognition(Math.min(0.5, (now - lastTrackTime) / 1000));
  lastTrackTime = now;
  if (recorder.active) {
    recorder.frame(tracker.canvas, stage, detection, engine.ball, detection && tracker.toFrame(detection),
      `Bild ${fps.render}/s Kamera ${fps.camera}/s erkannt ${quality()} %${fakeBall ? ' Test-Ball' : ''}`);
    if (recorder.seconds >= MAX_SECONDS) toggleRecording();
  }
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
  $('#btn-test').onclick = startRecognition;

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

/** Erkennungstest: ein Kamerabild weiterreichen, Anzeige nachführen, am Ende auswerten. */
function stepRecognition(dt) {
  const t = recognition;
  t.add(detection, dt, tracker.frame?.width || 480);
  const total = STILL_SECONDS + MOVE_SECONDS;
  $('#test-bar').firstElementChild.style.width = `${Math.min(100, (t.time / total) * 100)}%`;
  if (t.phase === 'still') {
    $('#test-step').textContent = `1. Still liegen lassen … ${Math.ceil(t.remaining)}`;
  } else if (t.phase === 'move') {
    $('#test-step').textContent = `2. Jetzt langsam durchs ganze Kamerabild bewegen … ${Math.ceil(t.remaining)}`;
  } else {
    recognition = null;
    showRecognition(t.result());
  }
}

function showRecognition(r) {
  $('#test-step').textContent = 'Ergebnis';
  $('#test-verdict').textContent = r.verdict;
  $('#test-verdict').className = `g${r.grade}`;
  $('#test-result').replaceChildren(...r.checks.map((c) => {
    const li = document.createElement('li');
    li.className = `g${c.grade}`;
    const b = document.createElement('b');
    b.textContent = `${c.label}: `;
    li.append(b, c.value);
    if (c.tip) {
      const tip = document.createElement('span');
      tip.className = 'tip';
      tip.textContent = c.tip;
      li.append(tip);
    }
    return li;
  }));
  $('#btn-test').textContent = 'Test wiederholen';
  $('#btn-test').disabled = false;
}

function startRecognition() {
  if (!source) { setMessage('Für den Test zuerst die Kamera starten.'); return; }
  setMessage();
  recognition = new RecognitionTest();
  lastTrackTime = performance.now();
  $('#test-box').hidden = false;
  $('#test-verdict').textContent = '';
  $('#test-result').replaceChildren();
  $('#btn-test').disabled = true;
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
      `Bild ${fps.render}/s · Kamera ${fps.camera}/s · Ball ${detection ? `${detection.area} Pixel` : 'nicht erkannt'} · erkannt in ${quality()} % der Bilder · Kamera ${source?.videoWidth || source?.width || 0}×${source?.videoHeight || source?.height || 0}, ausgewertet ${tracker.frame?.width || 0}×${tracker.frame?.height || 0} · Qualität ${['voll', 'mittel', 'sparsam'][engine.quality]}`;
  }
}

/** Zeichnet das Kamerabild mit türkis markierter Ballfarbe in die Einrichtung oder die Einblendung. */
/** Kleine Übersicht ganz oben: Was ist für den Betrieb mit Kamera schon erledigt? */
function renderChecklist() {
  const steps = [
    ['Kamera läuft', !!source],
    ['Ball erkannt', !!source && quality() >= 80],
    [config.calib && config.calib.shape !== config.fieldShape ? 'Feldformat geändert – bitte neu kalibrieren'
      : config.calib?.missing?.length ? `Kalibriert, aber es fehlt: ${config.calib.missing.join(', ')}` : 'Kalibriert',
    !!config.calib && config.calib.shape === config.fieldShape && !config.calib.missing?.length],
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
  if (tracker.regionPoints) {
    // Spielfeld, wie es die Kalibrierung im Kamerabild gefunden hat
    ctx.strokeStyle = '#ffe14a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    tracker.regionPoints.map((q) => tracker.toFrame(q)).forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)));
    ctx.closePath();
    ctx.stroke();
  }
  if (detection) {
    const d = tracker.toFrame(detection);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(d.x * w, d.y * h, 14, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (target === preview) {
    $('#track-status').textContent = detection ? `Ball erkannt ✔ (in ${quality()} % der letzten Bilder)` : 'Kein Ball im Bild erkannt. Ball ins Bild legen und im Kamerabild direkt auf den Ball klicken – dann lernt die App seine Farbe.';
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
    const learned = tracker.learnBall((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    if (!learned) return;
    const { pale, ...color } = learned;
    config.ball = { preset: 'custom', ...color };
    saveConfig();
    refreshSetup();
    // Rückmeldung: wie eindeutig ist die gelernte Farbe?
    const share = tracker.share(config.ball);
    const blob = tracker.blobAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, config.ball);
    if (blob && !blob.round) {
      setMessage('Das sieht eher länglich aus als rund – vielleicht der Schläger? Bitte genau auf den Ball klicken, am besten wenn er allein im Feld liegt.');
      return;
    }
    setMessage(share > 0.02
      ? 'Ballfarbe gelernt – aber diese Farbe kommt auch noch woanders im Bild vor (türkis markiert). Störende Dinge wegräumen oder die Farbtoleranz senken.'
      : pale ? 'Ballfarbe gelernt. Der Ball wirkt im Kamerabild blass – die App sucht deshalb nach hellen Stellen in Ballfarbe. Weniger Licht oder „Projektion abdunkeln“ macht die Farbe kräftiger.' : 'Ballfarbe gelernt ✔');
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

  $('#btn-camera').onclick = () => startCamera($('#camera-select').value || config.cameraId);
  $('#camera-select').onchange = (e) => startCamera(e.target.value);
  $('#btn-fullscreen').onclick = toggleFullscreen;
  $('#btn-auto').onclick = () => calibrate('auto');
  $('#btn-manual').onclick = () => calibrate('manual');
  $('#btn-mouse').onclick = () => { mode = 'mouse'; setFakeBall(false); startPlaying(); };
  $('#btn-fake').onclick = () => {
    if (!source || !config.calib) { setMessage('Für den Test-Ball zuerst die Kamera starten und kalibrieren.'); return; }
    mode = 'camera';
    startPlaying();
    setFakeBall(true);
  };
  $('#btn-record').onclick = toggleRecording;
  $('#btn-snapshot').onclick = () => { if (!source || !saveSnapshot(source)) setMessage('Für das Foto zuerst die Kamera starten.'); };
  $('#btn-play').onclick = () => {
    if (!source) return setMessage('Bitte zuerst die Kamera starten.');
    if (!config.calib) return setMessage('Bitte zuerst kalibrieren.');
    mode = 'camera';
    setFakeBall(false);
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
  updateRegion();
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
      ? await autoCalibrate(calibrationIO, engine.fieldCorners())
      : await manualCalibrate(calibrationIO, engine.fieldCorners());
    config.calib = { ...result, aspect: stage.width / stage.height, shape: config.fieldShape };
    saveConfig();
    updateRegion();
    mode = 'camera';
    engine.override = null;
    startPlaying();
    const pct = Math.round((result.seen ?? 1) * 100);
    if (result.missing?.length) {
      engine.showToast(`Achtung: Kamera sieht nur ${pct} % vom Feld. Es fehlt: ${result.missing.join(', ')}`, 8);
    } else {
      engine.showToast('Kalibrierung fertig ✔ Die Kamera sieht das ganze Feld');
    }
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
  else if (key === 'v') toggleRecording();
  else if (key === 'b' && setupEl.hidden && mode === 'camera') {
    if (fakeBall) engine.showToast('Test-Ball aus', 2);
    setFakeBall(!fakeBall);
  }
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

if (config.calib && !calibOk(config.calib)) { config.calib = null; saveConfig(); } // verunglückte alte Kalibrierung verwerfen
setBallHue(config.ball.h);
setFieldMeters(config.fieldMeters);
engine.theme = config.theme === 'auto' ? randomTheme() : config.theme; // jede Sitzung beginnt in einer anderen Welt
$('#version').textContent = `Version ${VERSION}`;
sound.muted = config.muted;
voice.enabled = config.voice;
music.enabled = config.music;
buildSetup();
app.menu();
startHowTo($('#howto'));
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
