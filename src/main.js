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
import { THEMES, THEME_IDS, randomTheme, setBallHue, setClubLogo } from './themes.js';
import { VERSION } from './version.js';
import { initTabs } from './setupui.js';
import { initPlayersPanel } from './setup/players.js';
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
let detectionAt = 0;    // wann sie erkannt wurde (alte Treffer zählen nicht, z. B. wenn die Kamera hängt)
let lastVideoTime = -1;
let cancelCalibration = null;
let calibrating = false;
let fakeColor = null;   // Farbe des Test-Balls, wie die Kamera sie sieht (wird beim Einschalten gelernt)
let fakeBall = false;   // Test-Ball: Maus malt einen Ball, den die Kamera filmt
const recorder = new Recorder();
let recognition = null; // laufender Erkennungstest oder null
let lastTrackTime = 0;
const recent = [];      // die letzten Kamerabilder: Ball erkannt oder nicht (für die Erkennungsquote)
const fps = { frames: 0, tracked: 0, since: performance.now(), render: 0, camera: 0, work: 0 };

// ---------- Die App: Navigation, Abrechnung, Training (siehe app.js) ----------

const app = createApp({ engine, sound, voice, music, onPlayerChange: () => refreshSetup() });
const playersPanel = initPlayersPanel({ app, config, saveConfig, refreshSetup: () => refreshSetup(), setMessage: (m) => setMessage(m), brand: BRAND });
window.hockey = app; // zum Ausprobieren in der Browser-Konsole

// Übungsmodus: Mit der Maus als Ball, mit dem gemalten Test-Ball oder mit der simulierten Kamera
// wird nichts gewertet. Punkte, Rekorde, Abzeichen und Ranglisten gibt es nur mit echtem Ball.
/** Welt, die jetzt gezeigt wird: im Vereinsdesign Blau-Weiss, sonst die gewählte oder eine zufällige. */
const worldNow = () => (config.skin === 'club' ? 'club' : config.theme === 'auto' ? randomTheme() : config.theme);
const practiceNow = () => mode === 'mouse' || fakeBall || !!sim;
// Wer während einer Runde in den Übungsmodus wechselt (z. B. Test-Ball mit B), bekommt die ganze Runde nicht gewertet.
let tainted = false;
app.practice = () => tainted || practiceNow();
app.freshRound = () => { tainted = practiceNow(); };
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
  if (!detection || !config.calib || performance.now() - detectionAt > 400) return null;
  return { ...applyHomography(config.calib.H, detection.x, detection.y), at: detectionAt };
};

/** Sagt der Ballsuche, wo das Spielfeld im Kamerabild liegt (mit etwas Rand). */
function updateRegion() {
  const back = config.calib && invertHomography(config.calib.H);
  if (!back) return tracker.setRegion(null);
  const c = engine.fieldCorners();
  const mx = (c[0].x + c[2].x) / 2, my = (c[0].y + c[2].y) / 2;
  // mit gut 15 % Rand: Ein Ball knapp außerhalb des Felds wird weiter verfolgt
  tracker.setRegion(c.map((p) => applyHomography(back, mx + (p.x - mx) * 1.16, my + (p.y - my) * 1.16)));
}

/** Der Test-Ball wird etwas dunkler gemalt als die reine Ballfarbe, damit die Kamera ihn nicht überbelichtet. */
const fakeCss = () => `hsl(${config.ball.h} 100% 42%)`;
/** Die Farbe, nach der gerade gesucht wird. */
const searchColor = () => (fakeBall && fakeColor) || config.ball;

engine.leadOff = () => mode === 'mouse';
engine.fakeBall = () => (fakeBall && mode === 'camera' && mouse.inside && !calibrating
  ? { x: mouse.x, y: mouse.y, color: fakeCss() } : null);

/**
 * Test-Ball ein- oder ausschalten. Beim Einschalten malt die App den Ball kurz in die Mitte und
 * lernt, wie die Kamera seine Farbe sieht: Ein gemalter Ball sieht im Kamerabild oft viel blasser
 * aus als ein echter, die eingestellte Ballfarbe würde ihn dann nicht finden.
 */
async function setFakeBall(on) {
  fakeBall = on;
  if (on) tainted = true;
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

// Jedes neue Kamerabild sofort auswerten, sobald es da ist (nicht erst beim nächsten Neuzeichnen):
// spart bis zu ein Bild Wartezeit. Ältere Browser ohne diese Möglichkeit fragen bei jedem Neuzeichnen nach.
const frameCallbacks = typeof video.requestVideoFrameCallback === 'function';
let frameWaiters = [];   // für die Verzögerungsmessung: wartet auf das nächste Kamerabild
function onVideoFrame() {
  video.requestVideoFrameCallback(onVideoFrame);
  const t = performance.now();
  if (frameWaiters.length) { const w = frameWaiters; frameWaiters = []; w.forEach((fn) => fn(t)); }
  if (source === video && !calibrating) trackFrame();
}
if (frameCallbacks) video.requestVideoFrameCallback(onVideoFrame);

engine.onFrame = () => {
  countFps();
  if (!source || (calibrating && !frameWaiters.length)) return;
  if (sim) {
    sim.render();
    if (frameWaiters.length) { const w = frameWaiters; frameWaiters = []; const t = performance.now(); w.forEach((fn) => fn(t)); }
    if (calibrating) return;
  } else {
    if (calibrating) return;
    if (frameCallbacks) return; // das erledigt onVideoFrame
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
  }
  trackFrame();
};

/** Ein Kamerabild auswerten: Ball suchen, Statistik, Aufnahme, Vorschau. */
function trackFrame() {
  const started = performance.now();
  tracker.useRegion = setupEl.hidden && !recognition; // im Spiel nur im Feld suchen, in der Einrichtung überall
  detection = tracker.process(source, searchColor());
  detectionAt = performance.now();
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
  fps.work = fps.work * 0.9 + (performance.now() - started) * 0.1; // Rechenzeit je Kamerabild (geglättet)
  if (!setupEl.hidden) drawPreview(preview);
  if (!debugEl.hidden) drawPreview($('#debug-view'));
}

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
  setBallHue(config.ball.h, config.ball.hTol); // Spielfarben meiden den Farbbereich um den Ball
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
  $('#fullscreen-on').checked = config.autoFullscreen !== false;
  $('#theme').value = config.theme;
  $('#skin').value = config.skin || 'classic';
  $('#theme-field').hidden = config.skin === 'club';
  $('#skin-note').hidden = config.skin !== 'club';
  playersPanel.render();
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
      `Bild ${fps.render}/s · Kamera ${fps.camera}/s · Ball ${detection ? `${detection.area} Pixel` : 'nicht erkannt'} · erkannt in ${quality()} % der Bilder · Auswertung ${(fps.work || 0).toFixed(1)} ms · Kamera ${source?.videoWidth || source?.width || 0}×${source?.videoHeight || source?.height || 0}, ausgewertet ${tracker.frame?.width || 0}×${tracker.frame?.height || 0} · Qualität ${['voll', 'mittel', 'sparsam'][engine.quality]}`;
  }
}

/** Zeichnet das Kamerabild mit türkis markierter Ballfarbe in die Einrichtung oder die Einblendung. */
/** Kleine Übersicht ganz oben: Was ist für den Betrieb mit Kamera schon erledigt? */
function renderChecklist() {
  const calibFits = !!config.calib && config.calib.shape === config.fieldShape;
  const state = {
    camera: !!source,
    ball: !!source && quality() >= 80,
    calib: calibFits && !config.calib.missing?.length,
  };
  // kurze Statuspunkte oben rechts
  const chips = [['Kamera', state.camera], ['Ball', state.ball], ['Kalibriert', state.calib]];
  const list = $('#checklist');
  if (list.children.length !== chips.length) list.replaceChildren(...chips.map(() => document.createElement('li')));
  chips.forEach(([label, done], i) => {
    const li = list.children[i];
    li.textContent = label;
    li.className = done ? 'done' : '';
  });
  // Haken an den Schritten der Einrichtung
  const stepState = {
    'step-camera': state.camera ? 'erledigt' : '',
    'step-ball': state.ball ? 'erkannt' : '',
    'step-field': config.fieldShape === 'full' ? 'ganze Breite' : 'Quadrat',
    'step-calib': state.calib ? 'erledigt' : config.calib && !calibFits ? 'neu nötig' : config.calib?.missing?.length ? `es fehlt: ${config.calib.missing.join(', ')}` : '',
  };
  for (const [id, text] of Object.entries(stepState)) {
    const card = document.getElementById(id);
    if (!card) continue;
    card.querySelector('.state').textContent = text;
    card.classList.toggle('done', id === 'step-field' || text === 'erledigt' || text === 'erkannt');
  }
  // Startseite: wer spielt, und was noch fehlt
  $('#start-player').textContent = app.profile?.name ?? 'los';
  const missing = [!state.camera && 'Kamera starten', !state.ball && state.camera && 'Ball anklicken', !state.calib && 'kalibrieren'].filter(Boolean);
  $('#start-note').textContent = missing.length
    ? `Noch zu tun: ${missing.join(', ')}. Oder gleich ohne Kamera ausprobieren.`
    : 'Alles eingerichtet. Ball ins Feld – los geht’s!';
  $('#start-setup').hidden = !missing.length;
}

/** Liste der Spieler: aktiven wählen, umbenennen, löschen. */



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

/**
 * Verzögerung messen: Das Feld blitzt ein paar Mal hell auf; gemessen wird, wie lange es vom Befehl
 * „hell“ bis zum ersten Kamerabild dauert, in dem das Feld hell ist. Das ist genau die Zeit, um die
 * der Ring dem Ball hinterherhinkt (Zeichnen + Beamer + Kamera + Auswertung). Der Vorhalt wird passend gesetzt.
 */
async function measureLatency() {
  if (!source || !config.calib) return setMessage('Für die Messung zuerst die Kamera starten und kalibrieren.');
  if (!frameCallbacks && !sim) return setMessage('Dieser Browser kann die Verzögerung nicht messen. Den Vorhalt bitte von Hand einstellen.');
  setMessage();
  updateRegion();
  calibrating = true;
  setupEl.hidden = true;
  const crop = tracker.fieldCrop?.();
  const brightness = () => {
    const img = tracker.grab(source, crop);
    if (!img) return 0;
    let sum = 0, n = 0;
    for (let i = 0; i < img.data.length; i += 4 * 7) { sum += img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11; n++; }
    return sum / n;
  };
  // Bleibt die Kamera stehen, bricht die Messung nach einer Sekunde ab statt ewig zu warten
  const nextFrame = () => new Promise((res, rej) => {
    const timer = setTimeout(() => { frameWaiters = frameWaiters.filter((f) => f !== done); rej(new Error('Kamera liefert keine Bilder')); }, 1000);
    const done = (t) => { clearTimeout(timer); res(t); };
    frameWaiters.push(done);
  });
  const fill = (color) => (ctx, cw, ch) => { ctx.fillStyle = color; ctx.fillRect(0, 0, cw, ch); };
  const results = [];
  try {
    for (let round = 0; round < 6; round++) {
      engine.override = fill('#000');
      await wait(700);
      let ref = 0;
      for (let k = 0; k < 3; k++) { await nextFrame(); ref += brightness() / 3; }
      engine.override = fill('#fff');
      const t0 = performance.now();
      const samples = [];
      while (performance.now() - t0 < 900) {
        const t = await nextFrame();
        samples.push({ t, b: brightness() });
      }
      const white = Math.max(...samples.map((q) => q.b));
      if (white - ref < 8) continue; // Kamera sieht das Feld nicht hell werden
      const hit = samples.find((q) => q.b >= ref + (white - ref) * 0.5);
      if (hit) results.push(hit.t - t0);
    }
  } catch {
    results.length = 0; // Kamera hängt: unten kommt die Meldung, dass es nicht geklappt hat
  } finally {
    engine.override = null;
    calibrating = false;
    setupEl.hidden = false;
  }
  if (results.length < 3) return setMessage('Die Messung hat nicht geklappt: Die Kamera hat das Aufblitzen nicht gesehen. Ist das Feld im Kamerabild und der Raum nicht zu hell?');
  results.sort((a, b) => a - b);
  const median = results[Math.floor(results.length / 2)];
  // Voll vorhalten: Die Begrenzung im Engine verhindert weites Überschießen bei Richtungswechseln.
  config.latency = Math.max(0, Math.min(250, Math.round(median / 10) * 10));
  saveConfig();
  refreshSetup();
  setMessage(`Gemessene Verzögerung: ${Math.round(median)} ms (Kamera + Beamer + Rechnen). Vorhalt auf ${config.latency} ms gestellt.${median > 150 ? ' Das ist viel – am Beamer den Spielmodus (Game Mode) einschalten und Bildverbesserungen ausschalten, und den Kamera-Modus „Schnell“ probieren.' : ''}`);
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
    const settings = await camera.start(deviceId, config.cameraMode || 'sharp');
    source = video;
    config.cameraId = settings.deviceId ?? deviceId ?? null;
    saveConfig();
    // Gespeicherten Fokus wiederherstellen (Autofokus aus, gleiche Schärfe wie beim letzten Mal)
    if (config.focusLock) {
      try { await camera.setFocus(config.focusDistance ?? null); $('#focus-lock').checked = true; } catch { /* nicht unterstützt */ }
    }
    window.focusUi?.();
    const select = $('#camera-select');
    select.replaceChildren(...(await Camera.list()).map((d, i) => {
      const o = new Option(d.label || `Kamera ${i + 1}`, d.deviceId);
      o.selected = d.deviceId === config.cameraId;
      return o;
    }));
  } catch (err) {
    source = null;
    detection = null;
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
  // Fokus: Autofokus aus und Schärfe auf die Bodenebene festhalten (wenn Kamera und Browser es erlauben)
  const focusUi = () => {
    const info = camera.focusInfo();
    const can = !!source && !sim && info.manual;
    $('#focus-lock').disabled = !can;
    $('#btn-focus-once').disabled = !source || !!sim;
    $('#focus-range-label').hidden = !(can && info.range);
    if (can && info.range) {
      Object.assign($('#focus-range'), { min: info.range.min, max: info.range.max, step: info.range.step || (info.range.max - info.range.min) / 100 });
      if (info.distance != null) $('#focus-range').value = info.distance;
      $('#focus-value').textContent = info.distance != null ? String(Math.round(info.distance * 100) / 100) : '';
    }
    if (source && !sim && !info.manual) {
      $('#focus-hint').textContent = 'Diese Kamera (oder dieser Browser) lässt den Fokus nicht von der App einstellen. Viele Webcams haben ohnehin einen festen Fokus. Sonst den Fokus mit der Software des Kameraherstellers festlegen und dabei auf den Ball am Boden scharf stellen – bei der Logitech C920 mit „Logi Options+“ (Anleitung unter Hilfe).';
    }
  };
  $('#focus-lock').onchange = async (e) => {
    try {
      if (e.target.checked) await camera.setFocus(null);
      else await camera.lockAuto(false);
      config.focusLock = e.target.checked;
      saveConfig();
    } catch (err) { setMessage(`Fokus ließ sich nicht umstellen (${err.message}).`); }
    focusUi();
  };
  $('#btn-focus-once').onclick = async () => {
    setMessage('Stelle scharf … Ball bitte ruhig ins Feld legen.');
    try {
      const ok = await camera.focusOnce();
      setMessage(ok ? 'Scharf gestellt und festgehalten ✔' : 'Diese Kamera lässt sich von der App nicht scharf stellen – siehe Hinweis unter dem Kamerabild.');
      if (ok) { $('#focus-lock').checked = true; config.focusLock = true; saveConfig(); }
    } catch (err) { setMessage(`Scharfstellen ging nicht (${err.message}).`); }
    focusUi();
  };
  $('#focus-range').oninput = async (e) => {
    const d = Number(e.target.value);
    $('#focus-value').textContent = String(Math.round(d * 100) / 100);
    try { await camera.setFocus(d); $('#focus-lock').checked = true; config.focusLock = true; config.focusDistance = d; saveConfig(); } catch { /* nicht unterstützt */ }
  };
  window.focusUi = focusUi;
  focusUi();

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
  toggle('#fullscreen-on', 'autoFullscreen');
  $('#theme').replaceChildren(new Option('Automatisch (wechselt)', 'auto'), ...THEME_IDS.map((id) => new Option(THEMES[id].name, id)));
  $('#theme').onchange = (e) => {
    config.theme = e.target.value;
    saveConfig();
    engine.theme = worldNow();
  };
  // Design: bunte Themenwelten oder Blau-Weiss-Vereinsdesign
  $('#skin').onchange = (e) => {
    config.skin = e.target.value;
    saveConfig();
    engine.theme = worldNow();
    refreshSetup();
  };

  // Feinabstimmung für den Aufbau
  $('#field-meters').onchange = (e) => { config.fieldMeters = Number(e.target.value); saveConfig(); refreshSetup(); };
  $('#camera-mode').value = config.cameraMode || 'sharp';
  $('#camera-mode').onchange = (e) => { config.cameraMode = e.target.value; saveConfig(); if (source === video) startCamera(config.cameraId); };
  $('#btn-latency').onclick = measureLatency;
  $('#latency').oninput = (e) => { config.latency = Number(e.target.value); saveConfig(); refreshSetup(); };
  $('#dim').oninput = (e) => { config.dim = Number(e.target.value) / 100; saveConfig(); refreshSetup(); };

  $('#btn-camera').onclick = () => startCamera($('#camera-select').value || config.cameraId);
  $('#camera-select').onchange = (e) => startCamera(e.target.value);
  $('#btn-fullscreen').onclick = toggleFullscreen;
  $('#btn-fullscreen-top').onclick = toggleFullscreen;
  // Beschriftung folgt dem Zustand (auch wenn man mit Esc oder F11 wechselt)
  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    $('#btn-fullscreen-top').textContent = on ? '⛶ Vollbild beenden' : '⛶ Vollbild';
    $('#btn-fullscreen').textContent = on ? 'Vollbild beenden' : 'Vollbild';
  });
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
  // Ein noch laufender Erkennungstest wird abgebrochen, sonst sucht das Spiel im ganzen Kamerabild
  if (recognition) { recognition = null; $('#test-box').hidden = true; $('#btn-test').disabled = false; }
  updateRegion();
  setMessage();
  sound.resume();
  keepAwake();
  // Spielen heißt meist: Bild auf den Beamer – dann gleich Vollbild (abschaltbar in den Einstellungen)
  if (config.autoFullscreen !== false && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
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
    setClubLogo(img);
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
setBallHue(config.ball.h, config.ball.hTol);
setFieldMeters(config.fieldMeters);
engine.theme = worldNow(); // jede Sitzung beginnt in einer anderen Welt (im Vereinsdesign immer Blau-Weiss)
$('#version').textContent = `Version ${VERSION}`;
initTabs();
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
