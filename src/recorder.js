/**
 * Aufnahme für die Fehlersuche. Filmt nebeneinander, was die Kamera sieht (genau das Bild,
 * in dem der Ball gesucht wird) und was der Beamer zeigt, und schreibt dazu ein Protokoll
 * mit jeder Messung. Beides wird als Datei heruntergeladen und kann weitergegeben werden.
 */

export const MAX_SECONDS = 30;

function download(blob, name) {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

export class Recorder {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.media = null;
    this.chunks = [];
    this.log = null;
    this.started = 0;
  }

  get active() { return !!this.log; }
  get seconds() { return this.active ? (performance.now() - this.started) / 1000 : 0; }

  /** info: beliebige Angaben zum Aufbau (Version, Ballfarbe, Kalibrierung …) für das Protokoll. */
  start(info) {
    this.log = { info, frames: [] };
    this.chunks = [];
    this.started = performance.now();
    this.canvas.width = 960;
    this.canvas.height = 300;
    this.media = null;
    if (window.MediaRecorder && this.canvas.captureStream) {
      const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      try {
        this.media = new MediaRecorder(this.canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 });
        this.media.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
        this.media.start(1000);
      } catch {
        this.media = null; // dann nur das Protokoll
      }
    }
  }

  /**
   * Ein Bild festhalten. camera = Bild, in dem gesucht wird (Zeichenfläche, im Spiel nur der Ausschnitt ums Feld),
   * stage = Projektion, detection = Fund im ganzen Kamerabild (0..1) oder null, ball = Ball im Spielfeld,
   * mark = Fund im gezeigten Ausschnitt (0..1), text = Statuszeile.
   */
  frame(camera, stage, detection, ball, mark, text) {
    if (!this.active) return;
    const { ctx, canvas } = this;
    const t = this.seconds;
    this.log.frames.push({
      t: Math.round(t * 1000) / 1000,
      cam: detection ? [round(detection.x), round(detection.y), detection.area, detection.rivals || 0] : null,
      ball: ball.visible ? [Math.round(ball.x), Math.round(ball.y)] : null,
    });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const fit = (img, x) => {
      const w = img.videoWidth || img.width, h = img.videoHeight || img.height;
      if (!w || !h) return null;
      const k = Math.min(480 / w, 270 / h);
      const box = { x: x + (480 - w * k) / 2, y: (270 - h * k) / 2, w: w * k, h: h * k };
      ctx.drawImage(img, box.x, box.y, box.w, box.h);
      return box;
    };
    const cam = camera && fit(camera, 0);
    fit(stage, 480);
    if (cam && mark) {
      // nur kleine Eckmarken, damit die Ballfarbe im Film unverfälscht bleibt (mark: Lage im gezeigten Ausschnitt)
      const x = cam.x + mark.x * cam.w, y = cam.y + mark.y * cam.h;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(x + dx * 16, y + dy * 10); ctx.lineTo(x + dx * 16, y + dy * 16); ctx.lineTo(x + dx * 10, y + dy * 16);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(`${t.toFixed(2)} s  ${text}`, 8, 285);
  }

  /** Beendet die Aufnahme und lädt Film und Protokoll herunter. */
  async stop() {
    if (!this.active) return;
    const log = this.log, media = this.media, name = `skiller-aufnahme-${stamp()}`;
    this.log = null;
    this.media = null;
    if (media) {
      await new Promise((done) => { media.onstop = done; media.stop(); });
      const type = media.mimeType || 'video/webm';
      download(new Blob(this.chunks, { type }), `${name}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
    }
    download(new Blob([JSON.stringify(log)], { type: 'application/json' }), `${name}.json`);
  }
}

const round = (v) => Math.round(v * 10000) / 10000;

/** Speichert ein einzelnes Kamerabild in voller Auflösung als PNG. */
export function saveSnapshot(source) {
  const w = source.videoWidth || source.width, h = source.videoHeight || source.height;
  if (!w || !h) return false;
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.getContext('2d').drawImage(source, 0, 0);
  c.toBlob((blob) => download(blob, `skiller-kamerabild-${stamp()}.png`), 'image/png');
  return true;
}
