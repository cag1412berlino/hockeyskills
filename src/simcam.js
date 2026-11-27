// Simulierte Kamera zum Entwickeln ohne Beamer und Webcam (Aufruf mit ?sim).
// Sie "filmt" die Spielfläche schräg von oben und legt einen Ball an die Mausposition.
export class SimCamera {
  constructor(stage, mouse, ballCss) {
    this.stage = stage;
    this.mouse = mouse; // { x, y, inside } normiert auf die Spielfläche
    this.ballCss = ballCss;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 360;
    this.ctx = this.canvas.getContext('2d');
  }

  render() {
    const { ctx, stage } = this;
    // Lage der Projektion im Kamerabild: verschoben, verkleinert, leicht gedreht.
    const m = { a: 420, b: -25, c: 40, d: 250, e: 110, f: 50 };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#26221e';
    ctx.fillRect(0, 0, 640, 360);
    ctx.setTransform(m.a / stage.width, m.b / stage.width, m.c / stage.height, m.d / stage.height, m.e, m.f);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(stage, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.mouse.inside) {
      const { x, y } = this.mouse;
      ctx.fillStyle = this.ballCss;
      ctx.beginPath();
      ctx.arc(m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
