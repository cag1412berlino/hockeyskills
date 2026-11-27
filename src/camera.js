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

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
