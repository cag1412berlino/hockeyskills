// Spiel "Stopp": Solange das Feld blau leuchtet, Sterne sammeln. Bei "Stopp!" muss der Ball
// sofort still liegen bleiben, bis es weitergeht. Wer ihn weiterbewegt, verliert ein Leben.
// Mit jeder Stufe wird die Vorwarnung kürzer und der erlaubte Spielraum kleiner.
import { BALL_RADIUS } from '../engine.js';
import { glow, noGlow, text, title } from '../ui.js';
import { Fx, randomSpot, drawCollectible } from './common.js';

const LEVELS = {
  //   Vorwarnung, Dauer Los-Phase, Dauer Stopp-Phase, erlaubte Bewegung im Stopp
  1: { warn: 1.2, go: [4, 6], stop: [2, 2.8], move: 60 },
  2: { warn: 0.7, go: [3, 5], stop: [1.8, 2.6], move: 48 },
  3: { warn: 0.35, go: [2.5, 4.5], stop: [1.5, 2.4], move: 38 },
};
const GRACE = 0.45; // Sekunden zum Abbremsen, nachdem "Stopp!" erscheint

const between = ([a, b]) => a + Math.random() * (b - a);

class Stop {
  constructor(env) {
    this.env = env;
    this.p = LEVELS[env.level];
    this.time = 0;
    this.state = 'go';   // 'go' = dribbeln, 'warn' = gleich Stopp, 'stop' = still liegen
    this.timer = between(this.p.go);
    this.total = this.timer;
    this.anchor = null;  // wo der Ball beim Stopp liegt
    this.star = null;
    this.fx = new Fx();
  }

  enter(state, seconds) {
    this.state = state;
    this.timer = this.total = seconds;
    this.anchor = null;
  }

  update(dt, ball) {
    const { env, p, fx } = this;
    const { field } = env;
    this.time += dt;
    this.timer -= dt;
    fx.update(dt);
    if (!this.star) this.star = randomSpot(field, ball, 300);

    if (this.state !== 'stop') {
      if (ball.visible && Math.hypot(this.star.x - ball.x, this.star.y - ball.y) < 48 + BALL_RADIUS) {
        const points = env.combo(10, 4);
        env.sound.pop(env.mult);
        fx.text(this.star.x, this.star.y, `+${points}`, env.palette[1], 50 + env.mult * 8);
        fx.burst(this.star.x, this.star.y, env.palette[1], 16);
        this.star = randomSpot(field, ball, 300);
      }
      if (this.timer <= 0) {
        if (this.state === 'go') {
          this.enter('warn', p.warn / env.ramp);
          env.sound.tick();
        } else {
          this.enter('stop', between(p.stop));
          env.sound.stage();
          env.say('Stopp!');
        }
      }
      return;
    }

    // Stopp-Phase: nach kurzer Bremszeit merken, wo der Ball liegt – dort muss er bleiben.
    const braked = this.total - this.timer > GRACE;
    if (braked && !this.anchor && ball.visible) this.anchor = { x: ball.x, y: ball.y };
    const limit = p.move * (1 - 0.08 * env.stage);
    if (this.anchor && ball.visible && Math.hypot(ball.x - this.anchor.x, ball.y - this.anchor.y) > limit) {
      env.sound.bad();
      env.miss();
      env.shake(22);
      fx.flash(0.4);
      fx.text(ball.x, ball.y, 'Bewegt!');
      env.loseLife();
      this.enter('go', between(p.go) / env.ramp);
      return;
    }
    if (this.timer <= 0) {
      if (this.anchor) {
        const points = env.combo(15, 8);
        env.sound.power();
        fx.text(this.anchor.x, this.anchor.y - 60, `Gut gestoppt! +${points}`, env.palette[1]);
        fx.ring(this.anchor.x, this.anchor.y, env.palette[1], 160);
      }
      this.enter('go', between(p.go) / env.ramp);
      env.sound.go();
      env.say('Weiter!');
    }
  }

  draw(ctx) {
    const { env, p } = this;
    const { field } = env;
    const [c0, c1] = env.palette;
    const stop = this.state === 'stop';

    if (stop) {
      // heller, kühler Schleier: alles ist "eingefroren"
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, 0, field.w, field.h);
    }
    // Rahmen zeigt die Phase: blau = los, blinkend = Achtung, weiß = Stopp
    const blink = this.state === 'warn' && Math.floor(this.time * 10) % 2 === 0;
    const frame = stop || blink ? '#fff' : c0;
    // Bewusst schmal: Ein breiter weißer Rahmen würde die Kamera blenden.
    ctx.lineWidth = stop ? 12 : 8;
    ctx.strokeStyle = frame;
    glow(ctx, frame, 22);
    ctx.strokeRect(24, 160, field.w - 48, field.h - 184);
    noGlow(ctx);

    if (this.star) {
      ctx.globalAlpha = stop ? 0.25 : 1;
      drawCollectible(ctx, this.star, c1, stop ? 0 : this.time);
      ctx.globalAlpha = 1;
    }

    if (stop) {
      title(ctx, 'Stopp!', field.w / 2, 300, 150, '#fff');
      if (this.anchor) {
        // Kreis, in dem der Ball bleiben muss, mit ablaufender Zeit
        const r = p.move * (1 - 0.08 * env.stage) + BALL_RADIUS;
        ctx.beginPath();
        ctx.arc(this.anchor.x, this.anchor.y, r, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.anchor.x, this.anchor.y, r + 12, -Math.PI / 2, -Math.PI / 2 + (this.timer / this.total) * Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
    } else if (this.state === 'warn') {
      text(ctx, 'Achtung …', field.w / 2, 300, 80);
    }
    this.fx.draw(ctx, field);
  }
}

export default {
  id: 'stop',
  hint: 'Sammle Sterne – bei „Stopp!“ muss der Ball still liegen!',
  name: 'Stopp',
  duration: 60,
  lives: 3,
  scale: 0.25,
  medals: [[230, 570, 920], [240, 570, 910], [260, 600, 950]],
  icon(ctx, r) {
    // Hand-Stopp-Zeichen: Achteck
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.055;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * r * 0.46, Math.sin(a) * r * 0.46);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-r * 0.2, -r * 0.05, r * 0.4, r * 0.1);
  },
  create: (env) => new Stop(env),
};
