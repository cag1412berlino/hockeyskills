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
    const video = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 },
    };
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
