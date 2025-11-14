/**
 * Sistema de Audio con WebAudio API.
 * Maneja carga de buffers, loops de menú/juego y efectos (llaves, salida,
 * victoria/derrota) además de ambient aleatorio y disparadores por proximidad.
 */
export const Audio = {
  ctx: null,
  master: null,
  initialized: false,
  buffers: {},
  gameLoop: null,
  zombieAmbientTimer: 0,
  nextZombieAmbient: 0,
  lastProximityPlay: 0,
  proximityThreshold: 0.78,
  loadPromises: [],

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      return;
    }

    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    this.initialized = true;

    const coreFiles = {
      begin: 'assets/audio/begin.mp3',
      game: 'assets/audio/game.mp3',
      keys: 'assets/audio/keys.mp3',
      appearExit: 'assets/audio/appearExit.mp3',
      openExit: 'assets/audio/openExit.mp3',
      win: 'assets/audio/win.mp3',
      lose: 'assets/audio/lose.mp3',
      // efecto de disparo
      shoot: 'assets/audio/shoot.mp3',
      // efecto de daño al jugador
      playerHit: 'assets/audio/playerHit.mp3',
      // efecto de muerte de zombie (usa uno; puedes añadir más variantes luego)
      zombieDie: 'assets/audio/zombieDie.mp3',
    };

    Object.entries(coreFiles).forEach(([name, url]) => this.loadAudio(name, url));

    ['ambienceZombie1', 'ambienceZombie2', 'apZombie1', 'apZombie2', 'apZombie3']
      .forEach(name => this.loadAudio(name, `assets/audio/${name}.mp3`));
  },
  loadAudio(name, url) {
    const p = fetch(url)
      .then(r => r.arrayBuffer())
      .then(b => this.ctx.decodeAudioData(b))
      .then(buf => { this.buffers[name] = buf; })
      .catch(() => {});

    this.loadPromises.push(p);
  },

  ready() {
    return Promise.all(this.loadPromises);
  },

  play(name, { loop = false, volume = 1, fadeIn = 0, rate = 1 } = {}) {
    if (!this.initialized || !this.buffers[name]) return null;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.loop = loop;
    // permitir variar el pitch/velocidad
    try { src.playbackRate.value = rate; } catch (_) {}

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(this.master);
    src.start();

    const now = this.ctx.currentTime;
    if (fadeIn > 0) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + fadeIn / 1000);
    } else {
      gain.gain.value = volume;
    }

    src._gainNode = gain;
    return src;
  },

  fadeOut(src, ms = 600) {
    if (!src || !src._gainNode) return;
    const gain = src._gainNode;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + ms / 1000);
    setTimeout(() => { try { src.stop(); } catch (_) {} }, ms + 50);
  },

  playMenuAmbient() {
    this.ensureInit();
    this.stopGameLoop();
    this.stopSpecials();

    this.ready()
      .then(() => {
        if (!this.buffers.begin) return;
        this.begin = this.play('begin', {
          loop: true,
          volume: 0.85,
          fadeIn: 600,
        });
      })
      .catch(() => {});
  },

  playGameAmbient() {
    this.ensureInit();
    this.stopMenu();
    this.stopSpecials();
    this.stopGameLoop();
    this.gameLoop = this.play('game', { loop: true, volume: 0.32, fadeIn: 900 });
  },

  stopGameLoop() {
    if (!this.gameLoop) return;
    this.fadeOut(this.gameLoop, 800);
    this.gameLoop = null;
  },

  stopMenu() {
    if (!this.begin) return;
    this.fadeOut(this.begin, 600);
    this.begin = null;
  },

  playKeyPickup() {
    this.ensureInit();
    if (this.buffers.keys) this.play('keys', { volume: 0.85 });
  },

  playDoorSpawn() {
    this.ensureInit();
    this.appearExitNode = this.play('appearExit', { volume: 0.85 });
  },

  playExitOpen() {
    this.ensureInit();
    this.stopGameLoop();
    this.openExitNode = this.play('openExit', { volume: 1 });
  },

  playVictory() {
    this.ensureInit();
    this.stopGameLoop();
    this.winNode = this.play('win', { volume: 1 });
  },

  playDefeat() {
    this.ensureInit();
    this.stopGameLoop();
    this.loseNode = this.play('lose', { volume: 1 });
  },
  // Zombie ambient aleatorio
  updateZombieAmbient(dt) {
    if (!this.initialized) return;
    this.zombieAmbientTimer += dt;
    if (this.zombieAmbientTimer < this.nextZombieAmbient) return;

    if (Math.random() < 0.6) {
      const choice = this.pickLoaded(['ambienceZombie1', 'ambienceZombie2']);
      if (choice) this.play(choice, { volume: 0.45 });
    }

    // siguiente sonido entre 10..24s
    this.nextZombieAmbient = this.zombieAmbientTimer + (10 + Math.random() * 14);
  },

  // Proximidad extrema zombie (apZombie*)
  setThreatProximity(f) {
    if (!this.initialized) return;
    if (f < this.proximityThreshold) return;

    const now = performance.now ? performance.now() : Date.now();
    if (now - this.lastProximityPlay < 5000) return;
    if (Math.random() < 0.55) return;

    const choice = this.pickLoaded(['apZombie1', 'apZombie2', 'apZombie3']);
    if (choice) {
      this.play(choice, { volume: 0.8 });
      this.lastProximityPlay = now;
    }
  },

  stopSpecials() {
    ['winNode', 'loseNode', 'openExitNode', 'appearExitNode'].forEach(key => {
      const node = this[key];
      if (!node) return;
      this.fadeOut(node, 400);
      this[key] = null;
    });
  },

  resetGame() {
    this.zombieAmbientTimer = 0;
    this.nextZombieAmbient = 0;
    this.lastProximityPlay = 0;
    this.stopSpecials();
  },

  // Reproducir disparo con ligera aleatoriedad para evitar monotonía
  playShoot() {
    this.ensureInit();
    if (!this.buffers.shoot) return;
    const vol = 0.6 + Math.random() * 0.15;   // 0.60–0.75
    const rate = 0.96 + Math.random() * 0.12; // 0.96–1.08
    this.play('shoot', { volume: vol, rate });
  },

  // Sonido de daño al jugador
  playPlayerHit() {
    this.ensureInit();
    if (this.buffers.playerHit) {
      this.play('playerHit', { volume: 0.9 });
      return;
    }
    // Fallback suave si falta el asset específico
    const alt = this.pickLoaded(['apZombie1', 'apZombie2', 'apZombie3', 'keys']);
    if (alt) this.play(alt, { volume: 0.5 });
  },

  // Sonido al morir un zombie
  playZombieDeath() {
    this.ensureInit();
    if (this.buffers.zombieDie) {
      // pequeña variación de pitch para variedad
      const rate = 0.92 + Math.random() * 0.16; // 0.92–1.08
      this.play('zombieDie', { volume: 0.85, rate });
      return;
    }
    // Fallback si falta el asset específico
    const alt = this.pickLoaded(['ambienceZombie1', 'ambienceZombie2', 'apZombie1']);
    if (alt) this.play(alt, { volume: 0.45 });
  },

  ensureInit() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch (_) {}
    }
  },

  pickLoaded(names) {
    const loaded = names.filter(n => this.buffers[n]);
    if (!loaded.length) return null;
    return loaded[Math.floor(Math.random() * loaded.length)];
  },
};
