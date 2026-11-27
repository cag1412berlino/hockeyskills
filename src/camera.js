// Zugriff auf die Webcam.
export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
  }

  static async list() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput');
  }

  async start(deviceId) {
    this.stop();
    // Volle Auflösung (Full HD) anfordern; was die Kamera nicht kann, gibt sie so gut es geht.
    const full = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } };
    let settings = await this.open(deviceId, full);
    // Manche Webcams schaffen Full HD nur mit wenigen Bildern pro Sekunde. Flüssig ist wichtiger:
    // dann lieber 1280 × 720 mit vollem Tempo.
    if (settings.height > 720 && settings.frameRate && settings.frameRate < 20) {
      this.stop();
      settings = await this.open(deviceId, { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } });
    }
    return settings;
  }

  async open(deviceId, video) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { ...video, deviceId: { exact: deviceId } } : video,
      });
    } catch (err) {
      // Gespeicherte Kamera nicht mehr vorhanden: irgendeine nehmen.
      if (!deviceId || err.name !== 'OverconstrainedError') throw err;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    return this.stream.getVideoTracks()[0].getSettings();
  }


  /**
   * Schaltet Belichtungs-, Weißabgleich- und Fokus-Automatik aus (oder wieder ein).
   * Ohne Automatik bleibt die Ballfarbe im Kamerabild stabil, auch wenn das projizierte Bild
   * heller oder dunkler wird. Liefert false, wenn die Kamera das nicht unterstützt.
   */
  /**
   * Was die Kamera beim Fokus erlaubt: { manual, range: {min, max, step} | null, distance }.
   * Viele Webcams (und Chrome auf dem Mac) geben das nicht frei – dann ist manual false.
   */
  focusInfo() {
    const track = this.stream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() ?? {};
    const st = track?.getSettings?.() ?? {};
    return {
      manual: !!caps.focusMode?.includes('manual'),
      range: caps.focusDistance ? { min: caps.focusDistance.min, max: caps.focusDistance.max, step: caps.focusDistance.step || 0 } : null,
      distance: st.focusDistance ?? null,
    };
  }

  /** Autofokus aus und Schärfe fest auf distance (oder auf die zuletzt gefundene Schärfe, wenn null). */
  async setFocus(distance = null) {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || !this.focusInfo().manual) return false;
    const c = { focusMode: 'manual' };
    if (distance != null) c.focusDistance = distance;
    await track.applyConstraints({ advanced: [c] });
    return true;
  }

  /** Einmal automatisch scharf stellen (auf das, was die Kamera gerade sieht), danach festhalten. */
  async focusOnce() {
    const track = this.stream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() ?? {};
    if (!track || !caps.focusMode) return false;
    const auto = caps.focusMode.includes('single-shot') ? 'single-shot' : caps.focusMode.includes('continuous') ? 'continuous' : null;
    if (!auto) return false;
    await track.applyConstraints({ advanced: [{ focusMode: auto }] });
    await new Promise((r) => setTimeout(r, 1500));
    if (caps.focusMode.includes('manual')) await track.applyConstraints({ advanced: [{ focusMode: 'manual' }] });
    return true;
  }

  async lockAuto(on) {
    const track = this.stream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() ?? {};
    const mode = on ? 'manual' : 'continuous';
    const settings = {};
    for (const key of ['exposureMode', 'whiteBalanceMode', 'focusMode']) {
      if (caps[key]?.includes(mode)) settings[key] = mode;
    }
    if (!Object.keys(settings).length) return false;
    await track.applyConstraints({ advanced: [settings] });
    return true;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
