/**
 * Sistema de audio global del juego.
 *
 * Responsabilidades principales:
 * - Inicializar Web Audio API y un master gain común.
 * - Cargar todos los buffers de sonido (música, SFX, ambiente).
 * - Gestionar loops de menú / partida y efectos puntuales.
 * - Ofrecer un único punto de muteo global (tecla R).
 * - Disparar sonidos contextuales (proximidad de zombies, daño, llaves, etc.).
 *
 * Nota: expone un objeto singleton `Audio` que se importa desde el módulo
 *       de juego y unidades. Toda la lógica de sonido debe pasar por aquí.
 */
export const Audio = {
  ctx: null,
  master: null,
  initialized: false,
  muted: false,
  buffers: {},
  gameLoop: null,
  zombieAmbientTimer: 0,
  nextZombieAmbient: 0,
  lastProximityPlay: 0,
  proximityThreshold: 0.78,
  loadPromises: [],

  /**
   * Inicializa el contexto de audio y programa la carga de todos los clips.
   * Debe llamarse una vez; llamadas posteriores son no-op.
   */
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
      shoot: 'assets/audio/shoot.mp3',
      playerHit: 'assets/audio/playerHit.mp3',
      zombieDie: 'assets/audio/zombieDie.mp3',
    };

    Object.entries(coreFiles).forEach(([name, url]) => this.loadAudio(name, url));

    ['ambienceZombie1', 'ambienceZombie2', 'apZombie1', 'apZombie2', 'apZombie3']
      .forEach(name => this.loadAudio(name, `assets/audio/${name}.mp3`));
  },
  /**
   * Registra la carga de un archivo de audio y almacena su buffer cuando termina.
   * @param {string} name  nombre lógico del clip (clave en `buffers`).
   * @param {string} url   ruta relativa al asset de audio.
   */
  loadAudio(name, url) {
    const p = fetch(url)
      .then(r => r.arrayBuffer())
      .then(b => this.ctx.decodeAudioData(b))
      .then(buf => { this.buffers[name] = buf; })
      .catch(() => {});

    this.loadPromises.push(p);
  },

  /**
   * Devuelve una promesa que se resuelve cuando todos los clips registrados
   * han terminado de intentar cargarse (con o sin éxito).
   */
  ready() {
    return Promise.all(this.loadPromises);
  },

  /**
   * Reproduce un clip ya cargado.
   * @param {string} name              clave del buffer en `buffers`.
   * @param {Object} [opts]
   * @param {boolean} [opts.loop=false] si debe repetir en bucle.
   * @param {number} [opts.volume=1]    volumen lineal (0..1) relativo al master.
   * @param {number} [opts.fadeIn=0]    tiempo de fade-in en ms.
   * @param {number} [opts.rate=1]      factor de pitch / velocidad.
   * @returns {AudioBufferSourceNode|null} la fuente creada o null si no se pudo.
   */
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

  /**
   * Aplica un fade-out lineal al nodo de audio dado y lo detiene al final.
   * @param {AudioBufferSourceNode} src
   * @param {number} [ms=600] duración del fade en milisegundos.
   */
  fadeOut(src, ms = 600) {
    if (!src || !src._gainNode) return;
    const gain = src._gainNode;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + ms / 1000);
    setTimeout(() => { try { src.stop(); } catch (_) {} }, ms + 50);
  },

  /**
   * Alterna el mute global del juego.
   * Actualiza tanto la ganancia master como el icono visual del HUD.
   */
  toggleMute() {
    if (!this.initialized || !this.master) return;
    this.muted = !this.muted;
    // Mutear todo el audio bajando la ganancia del master
    this.master.gain.value = this.muted ? 0 : 1;
    try {
      const el = document.getElementById('hud-mute');
      if (el) el.classList.toggle('hidden', !this.muted);
    } catch (_) {}
  },

  /**
   * Inicia la música de menú en bucle.
   * Detiene cualquier loop de juego o efectos especiales activos.
   */
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

  /**
   * Inicia la música de partida en bucle.
   * Detiene música de menú y efectos especiales anteriores.
   */
  playGameAmbient() {
    this.ensureInit();
    this.stopMenu();
    this.stopSpecials();
    this.stopGameLoop();
    this.gameLoop = this.play('game', { loop: true, volume: 0.32, fadeIn: 900 });
  },

  /**
   * Aplica un fade y detiene el loop de música de juego si existe.
   */
  stopGameLoop() {
    if (!this.gameLoop) return;
    this.fadeOut(this.gameLoop, 800);
    this.gameLoop = null;
  },

  /**
   * Aplica un fade y detiene el loop de música de menú si existe.
   */
  stopMenu() {
    if (!this.begin) return;
    this.fadeOut(this.begin, 600);
    this.begin = null;
  },

  /**
   * Efecto al recoger una llave.
   */
  playKeyPickup() {
    this.ensureInit();
    if (this.buffers.keys) this.play('keys', { volume: 0.85 });
  },

  /**
   * Efecto cuando aparece la puerta de salida.
   */
  playDoorSpawn() {
    this.ensureInit();
    this.appearExitNode = this.play('appearExit', { volume: 0.85 });
  },

  /**
   * Efecto cuando se abre completamente la puerta de salida.
   * También detiene el loop de juego actual.
   */
  playExitOpen() {
    this.ensureInit();
    this.stopGameLoop();
    this.openExitNode = this.play('openExit', { volume: 1 });
  },

  /**
   * Música de victoria al escapar con éxito.
   */
  playVictory() {
    this.ensureInit();
    this.stopGameLoop();
    this.winNode = this.play('win', { volume: 1 });
  },

  /**
   * Música de derrota al morir o agotar el tiempo.
   */
  playDefeat() {
    this.ensureInit();
    this.stopGameLoop();
    this.loseNode = this.play('lose', { volume: 1 });
  },
  /**
   * Reproduce de forma pseudoaleatoria gruñidos/zumbidos de zombies
   * a intervalos amplios, para dar ambiente sonoro.
   */
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

  /**
   * Dispara un gruñido intenso cuando la proximidad de zombies al jugador
   * supera cierto umbral.
   * @param {number} f factor de proximidad normalizado 0..1.
   */
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

  /**
   * Detiene con fade todos los sonidos especiales (victoria, derrota,
   * puerta, aparición de salida) que puedan estar activos.
   */
  stopSpecials() {
    ['winNode', 'loseNode', 'openExitNode', 'appearExitNode'].forEach(key => {
      const node = this[key];
      if (!node) return;
      this.fadeOut(node, 400);
      this[key] = null;
    });
  },

  /**
   * Resetea el estado interno del sistema de audio asociado a una partida
   * (timers de ambiente y efectos especiales), sin cerrar el contexto.
   */
  resetGame() {
    this.zombieAmbientTimer = 0;
    this.nextZombieAmbient = 0;
    this.lastProximityPlay = 0;
    this.stopSpecials();
  },

  /**
   * Disparo del jugador con ligera variación de volumen y pitch para
   * evitar que suene exactamente igual en todos los tiros.
   */
  playShoot() {
    this.ensureInit();
    if (!this.buffers.shoot) return;
    const vol = 0.6 + Math.random() * 0.15;   // 0.60–0.75
    const rate = 0.96 + Math.random() * 0.12; // 0.96–1.08
    this.play('shoot', { volume: vol, rate });
  },

  /**
   * Sonido de impacto cuando el jugador recibe daño.
   * Si falta el clip dedicado, usa un conjunto de alternativos suaves.
   */
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

  /**
   * Sonido de muerte de zombie. Si el clip dedicado no está disponible
   * recurre a un conjunto de efectos alternativos.
   */
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

  /**
   * Garantiza que el contexto de audio esté inicializado y, si está
   * suspendido por el navegador, intenta reanudarlo.
   */
  ensureInit() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch (_) {}
    }
  },

  /**
   * Devuelve aleatoriamente uno de los nombres cuyo buffer esté cargado.
   * Si ninguno existe, devuelve null.
   */
  pickLoaded(names) {
    const loaded = names.filter(n => this.buffers[n]);
    if (!loaded.length) return null;
    return loaded[Math.floor(Math.random() * loaded.length)];
  },
};
