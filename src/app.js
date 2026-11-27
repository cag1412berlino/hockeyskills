// Die App als Ganzes: Wechsel zwischen den Bildschirmen, Abrechnung der Runden,
// Training und Duell. Die Bildschirme rufen nur diese Funktionen auf und kennen einander nicht.
import { config, saveConfig, paletteFor, currentProfile } from './config.js';
import { MenuScene, CategoryScene, LevelScene, PlayScene, ResultScene, ProfileScene, PlayerPickScene, LeaderboardScene, bestLabel } from './scenes.js';
import { SessionSetupScene, IntermissionScene, SessionResultScene, DuelSetupScene, DuelResultScene, makeFinale } from './session.js';
import { games, categories, SESSIONS, sessionPlan } from './games/index.js';
import { rankOf, recordRound, recordEvent, dailyGame, dateString } from './profile.js';
import { CollectionScene } from './collection.js';
import { TrickMenuScene } from './trickmenu.js';
import { topicGame } from './games/tricks.js';
import { setMascotHat } from './ui.js';
import { randomTheme, worldPalette, bright } from './themes.js';

/** Drei zufällige, verschiedene Einträge einer Liste. */
function pick3(list) {
  const pool = [...list];
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

/**
 * Baut die App. engine, sound, voice und music sind die laufenden Bausteine;
 * onPlayerChange wird aufgerufen, wenn im Spiel der aktive Spieler gewechselt wurde.
 */
export function createApp({ engine, sound, voice, music, onPlayerChange = () => {} }) {
  const app = {
    engine, config, sound, voice, music, games, categories,
    logo: null,    // Vereinslogo, sobald geladen
    session: null, // laufendes Training oder Duell
    get profile() { return currentProfile(); },
    save: saveConfig,
    /** Übungsmodus (Maus, Test-Ball, simulierte Kamera): Es wird nichts gewertet. main.js legt das fest. */
    practice: () => false,
    palette: () => paletteFor(),
    /** Die bunten Spielfarben der gerade gezeigten Themenwelt. */
    worldPalette: () => worldPalette(engine.theme),
    /** Farbe des Schwerpunkts, zu dem eine Übung (oder der Schwerpunkt selbst) gehört; sonst null. */
    accentOf: (x) => {
      // auch für Abwandlungen einer Übung (z. B. Tricks-Dauertraining), die dieselbe id tragen
      const cat = categories.find((c) => c === x || c.games.some((g) => g === x || g.id === x?.id));
      return cat ? bright(cat.hue) : null;
    },
    today: () => dateString(),
    daily: () => dailyGame(games),

    /** Wechselt den Bildschirm. Im Menü gilt die gewählte Themenwelt, bei "auto" der Weltraum. */
    show(scene) {
      // Bei fester Themenwelt gilt sie überall; bei "auto" bleibt im Menü die Welt der letzten Runde stehen.
      if (config.theme !== 'auto') engine.theme = config.theme;
      engine.trailStyle = Math.min(2, Math.floor(rankOf(app.profile.xp).index / 2));
      app.applyGear();
      engine.bloomTo(0.35);
      engine.setScene(scene);
    },
    menu: () => {
      app.session = null;
      music.stop();
      app.show(new MenuScene(app));
    },
    category: (cat) => (cat.games.length > 1 ? app.show(new CategoryScene(app, cat)) : app.levels(cat.games[0])),
    levelsFor: (opts) => app.show(new LevelScene(app, opts)),
    levels: (game) => {
      // Beim Tricktrainer kommt erst die Wahl: Runde auf Zeit oder ein Thema
      if (game.id === 'tricks') return app.show(new TrickMenuScene(app, game));
      app.trickLevels(game);
    },
    /** Stufenwahl für eine Übung (beim Tricktrainer für die Runde auf Zeit). */
    trickLevels: (game) => {
      const cat = categories.find((c) => c.games.includes(game));
      app.levelsFor({
        title: game.name,
        color: app.accentOf(game),
        sub: (level) => bestLabel(app, game, level),
        onPick: (level) => app.play(game, level),
        onBack: () => (game.id === 'tricks' ? app.levels(game) : cat.games.length > 1 ? app.category(cat) : app.menu()),
      });
    },
    /** Dauertraining der Tricks zu einem Thema: erst die Stufe (wie genau und wie schnell), dann los. */
    trickTopic: (topicId) => {
      const game = topicGame(topicId);
      const tricks = games.find((g) => g.id === 'tricks');
      app.levelsFor({
        title: game.name,
        color: app.accentOf(tricks),
        sub: (level) => bestLabel(app, game, level),
        onPick: (level) => app.play(game, level),
        onBack: () => app.levels(tricks),
      });
    },
    /**
     * Startet eine Übung. Erst wird die Themenwelt gewählt (bei "auto" zufällig), dann der
     * Spielbildschirm gebaut, damit er gleich die Farben und Wesen dieser Welt bekommt.
     */
    playScene: (make) => {
      if (config.theme === 'auto') engine.theme = randomTheme();
      engine.setScene(make());
    },
    play: (game, level) => app.playScene(() => new PlayScene(app, game, level)),
    result: (r) => {
      if (r.record) sound.win(); else sound.end();
      app.show(new ResultScene(app, r));
    },
    /**
     * Verbucht eine gespielte Runde auf ein Profil (null = Gast, dann wird nichts verbucht).
     * Liefert, was es dafür gab: Punkte, Rangaufstieg, neue Abzeichen.
     */
    record: (r, profile) => {
      if (!profile || app.practice()) return { xp: 0, badges: [], practice: app.practice() };
      const rewards = recordRound(profile, {
        gameId: r.game.id, level: r.level, score: r.score, stars: r.stars, maxMult: r.maxMult,
        lives: r.lives, livesLeft: r.livesLeft,
        daily: r.game === app.daily(), counts: !r.game.finale,
      }, categories);
      saveConfig();
      return rewards;
    },

    // ----- Profil -----
    profileScene: () => app.show(new ProfileScene(app)),
    playerPick: () => app.show(new PlayerPickScene(app)),
    leaderboard: () => app.show(new LeaderboardScene(app)),
    collection: () => app.show(new CollectionScene(app)),
    /** Legt an, was der aktuelle Spieler aus seiner Sammlung gewählt hat (Ballschweif, Mütze des Trainers). */
    applyGear() {
      const gear = app.profile.gear ?? {};
      engine.trailLook = gear.trail ? gear.trail.replace('trail_', '') : null;
      setMascotHat(gear.hat ?? null);
    },
    setPlayer: (id) => {
      config.current = id;
      saveConfig();
      onPlayerChange();
      app.menu();
    },

    // ----- Training: mehrere Übungen hintereinander, zum Schluss ein Finale -----
    sessionDef: (kind) => (kind === 'custom' ? { name: 'Eigenes', seconds: config.custom.seconds } : SESSIONS[kind]),
    sessionGames: (kind) => (kind === 'custom'
      ? config.custom.ids.map((id) => games.find((g) => g.id === id)).filter(Boolean)
      : sessionPlan(kind)),
    sessionSetup: () => app.show(new SessionSetupScene(app)),
    startSession: (kind, level) => {
      const list = app.sessionGames(kind);
      const plan = list.map((game) => ({ game }));
      plan.push({ game: makeFinale(pick3(list)) });
      app.session = { kind, level, plan, i: 0, results: [], seconds: app.sessionDef(kind).seconds, names: [] };
      app.show(new IntermissionScene(app, app.session));
    },

    // ----- Duell: zwei Spieler, drei Übungen, jeder spielt jede -----
    duelSetup: () => app.show(new DuelSetupScene(app)),
    startDuel: (level, opponent) => {
      const players = [app.profile, opponent];
      // je eine Übung aus drei verschiedenen Schwerpunkten
      const picks = pick3(categories).map((c) => c.games[Math.floor(Math.random() * c.games.length)]);
      app.session = {
        kind: 'duel', level, i: 0, results: [], seconds: 40, players,
        names: players.map((p) => (p ? p.name : 'Gast')),
        plan: picks.flatMap((game) => [{ game, who: 0 }, { game, who: 1 }]),
      };
      app.show(new IntermissionScene(app, app.session));
    },

    playExercise: () => {
      const s = app.session;
      const { game, who } = s.plan[s.i];
      const duel = s.kind === 'duel';
      app.playScene(() => new PlayScene(app, game, s.level, {
        seconds: s.seconds,
        label: duel ? `${s.names[who]} · Runde ${Math.floor(s.i / 2) + 1} von 3` : `Übung ${s.i + 1} von ${s.plan.length}`,
        onFinish: (score, stars, rewards) => {
          s.results.push({ game, who, score, stars, rewards });
          s.i++;
          if (s.i < s.plan.length) {
            sound.end();
            app.show(new IntermissionScene(app, s));
            return;
          }
          sound.win();
          if (duel) {
            const totals = [0, 1].map((w) => s.results.filter((r) => r.who === w).reduce((sum, r) => sum + r.score, 0));
            const winner = totals[0] === totals[1] ? null : s.players[totals[0] > totals[1] ? 0 : 1];
            if (winner && !app.practice()) recordEvent(winner, 'duel', categories);
            saveConfig();
            app.show(new DuelResultScene(app, s));
            return;
          }
          const total = s.results.reduce((sum, r) => sum + r.score, 0);
          const key = `session:${s.kind}:${s.level}:${config.speed}`;
          const best = app.profile.highscores[key] || 0;
          const counts = !app.practice();
          if (counts && total > best) app.profile.highscores[key] = total;
          const badges = counts ? recordEvent(app.profile, s.kind, categories) : [];
          saveConfig();
          app.show(new SessionResultScene(app, s, Math.max(best, total), counts && total > best, badges));
        },
      }, duel ? { player: s.players[who] } : {}));
    },
  };
  return app;
}
