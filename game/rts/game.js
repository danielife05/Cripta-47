import { Input } from './input.js';
import { GAME_CONSTANTS, COLORS } from './level_data.js';
import { Player, Enemy } from './units.js';
import { Audio } from './audio.js';

/**
 * Núcleo del juego Cripta‑47.
 *
 * Este módulo monta el objeto global `window.Game` que concentra:
 * - Estado de la partida (player, zombies, llaves, puerta, puntuación, dificultad).
 * - Bucle de actualización de lógica (`update`) y dibujado (`render`).
 * - Gestión de laberinto procedural, colisiones, luz y cámara.
 * - Integración con audio, HUD/DOM y pantallas de menú, instrucciones, pausa y game over.
 *
 * La lógica está pensada para ser llamada desde `main.js`, que controla el
 * `requestAnimationFrame` y delega en `Game.update(dt)` y `Game.render(ctx)`.
 */

// Utilidades pequeñas
const $ = (id) => document.getElementById(id);
const nowMs = () => (performance.now ? performance.now() : Date.now());

/** Objeto principal del juego (estado, lógica y renderizado). */
window.Game = {
  canvas: null, ctx: null,
  cameraX: 0, cameraY: 0,
  currentState: 'MENU',
  player: null,
  enemies: [], bullets: [], splats: [],
  keys: [], exit: null,
    score: 0,
    highScore: 0,
  threatLevel: 1,
  spawnTimer: 0,
  spawnInterval: GAME_CONSTANTS.WAVES.INITIAL_SPAWN_INTERVAL,
  gameTime: 0,
    bonusTime: 0,
  enemyScale: 1,
  maxEnemies: 60,
    inFinalAssault: false,
    finalAssaultBurstDone: false,
        // Medición de FPS
        showFPS: true,
        fps: 0,
        _fpsAccum: 0,
        _fpsFrames: 0,
    lastEscalationMinute: 0,
    lastAlerts: {}, alertCooldownMs: 2500,
  exitSpawned: false,
    assets: {},
    spriteOffsets: { soldier: Math.PI, zombie: 0 },

    /**
     * Inicializa el juego: canvas, input, high score, assets y UI.
     * Deja el juego en estado `MENU` y arranca el ambiente de audio del menú.
     *
     * @param {string} [id='game'] id del elemento `<canvas>` principal.
     */
  init(id='game') {
        this.canvas = document.getElementById(id);
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width  = GAME_CONSTANTS.CANVAS_WIDTH;
        this.canvas.height = GAME_CONSTANTS.CANVAS_HEIGHT;
    Input.init(this.canvas, this.ctx);

        // Cargar mejor puntaje previo desde localStorage
        try {
            const stored = localStorage.getItem('cripta47_highscore');
            this.highScore = stored ? parseInt(stored, 10) || 0 : 0;
        } catch (_) {
            this.highScore = 0;
        }

        this.loadAssets(() => {
            this.createProceduralPatterns();
            this.initUIManager();
            this.setState('MENU');

            // Intento de autoplay del menú: algunos navegadores lo bloquearán
            try { Audio.init(); Audio.playMenuAmbient(); } catch (_) {}
        });
    },

    /**
     * Carga los sprites base (soldado, zombie, puerta y llaves).
     * Cuando todas las imágenes terminan (éxito o error) invoca `done`.
     * @param {() => void} done callback al finalizar la carga.
     */
    loadAssets(done) {
        const manifest = {
            soldier: 'assets/img/soldier.svg',
            zombie: 'assets/img/zombie.svg',
            exit: 'assets/img/exit.svg',
            key1: 'assets/img/key1.svg',
            key2: 'assets/img/key2.svg',
            key3: 'assets/img/key3.svg',
        };

        let pending = Object.keys(manifest).length;
        const finish = () => { if (--pending <= 0 && done) done(); };

        Object.entries(manifest).forEach(([name, url]) => {
            const img = new Image();
            img.onload = finish;
            img.onerror = finish;
            img.src = url;
            this.assets[name] = img;
        });
    },

    /**
     * Vincula todos los botones de la UI (menú, instrucciones, pausa, etc.)
     * con las acciones correspondientes del objeto `Game`.
     * También configura las teclas globales `Esc` (pausa) y `R` (mute).
     */
    initUIManager() {
        const bind = (id, fn) => {
            const el = $(id);
            if (!el || el.dataset.bound) return;

            el.dataset.bound = '1';
            el.addEventListener('click', e => {
                e.preventDefault();
                try { Audio.ensureInit(); } catch (_) {}
                fn();
            });
        };

        bind('start-button', () => this.startGame());
        bind('start-from-instructions-button', () => this.startGame());
        bind('instructions-button', () => this.setState('INSTRUCTIONS'));
        bind('back-to-menu-button', () => this.setState('MENU'));
        bind('restart-button', () => { location.reload(); });
        bind('resume-button', () => this.setState('GAME'));
        bind('pause-to-menu-button', () => { location.reload(); });

        // Tecla Esc para pausar/reanudar
        if (!this._pauseKeyBound) {
            this._pauseKeyBound = true;
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' || e.key === 'Esc') {
                    if (this.currentState === 'GAME') {
                        this.setState('PAUSE');
                    } else if (this.currentState === 'PAUSE') {
                        this.setState('GAME');
                    }
                    return;
                }

                // Tecla R para mutear/desmutear todo el sonido
                if (e.key === 'r' || e.key === 'R') {
                    try { Audio.toggleMute && Audio.toggleMute(); } catch (_) {}
                }
            });
        }
    },

    /**
     * Cambia el estado global del juego y actualiza pantallas/inputs.
     * Estados posibles: `MENU`, `INSTRUCTIONS`, `GAME`, `PAUSE`,
     * `GAMEOVER`, `VICTORY`.
     * @param {('MENU'|'INSTRUCTIONS'|'GAME'|'PAUSE'|'GAMEOVER'|'VICTORY')} st
     */
    setState(st) {
        this.currentState = st;

        const menu = document.getElementById('menu-screen');
        const instructions = document.getElementById('instructions-screen');
        const hud = document.getElementById('hud');
        const over = document.getElementById('gameover-screen');
        const pause = document.getElementById('pause-screen');
        const container = document.getElementById('game-container');
        const canvas = this.canvas;

        [menu, instructions, hud, over, pause].forEach(el => {
            if (!el) return;
            el.classList.add('hidden');
            el.classList.remove('visible');
        });

        switch (st) {
            case 'MENU':
                if (menu) {
                    menu.classList.remove('hidden');
                    menu.classList.add('visible');
                }
                if (canvas) canvas.style.pointerEvents = 'none';
                if (container) container.style.pointerEvents = 'auto';
                break;

            case 'INSTRUCTIONS':
                if (instructions) {
                    instructions.classList.remove('hidden');
                    instructions.classList.add('visible');
                }
                if (canvas) canvas.style.pointerEvents = 'none';
                if (container) container.style.pointerEvents = 'auto';
                break;

            case 'GAME':
                if (hud) {
                    hud.classList.remove('hidden');
                    hud.style.display = 'block';
                }
                if (canvas) canvas.style.pointerEvents = 'auto';
                if (container) container.style.pointerEvents = 'none';
                try { Audio.stopMenu(); Audio.playGameAmbient(); } catch (_) {}
                break;

            case 'GAMEOVER':
            case 'VICTORY':
                if (over) {
                    over.classList.remove('hidden');
                    over.classList.add('visible');
                }
                if (canvas) canvas.style.pointerEvents = 'none';
                if (container) container.style.pointerEvents = 'auto';
                if (st === 'GAMEOVER') {
                    try { Audio.stopGameLoop(); Audio.playDefeat(); } catch (_) {}
                }
                break;

            case 'PAUSE':
                if (pause) {
                    pause.classList.remove('hidden');
                }
                if (canvas) canvas.style.pointerEvents = 'none';
                if (container) container.style.pointerEvents = 'auto';
                break;
        }
    },

    /**
     * Comienza una nueva partida: resetea jugador, hordas, llaves, laberinto,
     * dificultad, puntuación y audio. Coloca al jugador en el inicio del
     * laberinto y muestra un mensaje de objetivo inicial.
     */
    startGame() {
        this.player = new Player(120, 120);
        this.enemies = [];
        this.bullets = [];
        this.splats = [];
        this.score = 0;
        this.threatLevel = 1;
        this.spawnTimer = 0;
        this.spawnInterval = GAME_CONSTANTS.WAVES.INITIAL_SPAWN_INTERVAL;
        this.gameTime = 0;
        this.bonusTime = 0;
        this.enemyScale = 1;
        this.exitSpawned = false;
        this.exit = null;
        this.bonusApplied = false;
        this.inFinalAssault = false;
        this.finalAssaultBurstDone = false;
        this.lastEscalationMinute = 0;

        // Laberinto procedural original
        this.walls = this.generateMazeWallsSeeded('SEMILLA');

        const start = this.getMazeStartPosition();
        if (start) {
            this.player.x = start.x;
            this.player.y = start.y;
        }

        // Llaves aleatorias; la salida aparecerá luego cuando se tengan las 3 llaves
        this.keys = this.spawnRandomKeys(3);
        this.ambientDecals = [];
        this.generateAmbientBloodDecals(80);
        this.updateCamera();
        this.spawnBurst(4, 650, 900);

        try { Audio.resetGame && Audio.resetGame(); } catch (_) {}
        this.setState('GAME');

        // Mensaje inicial de objetivo
        this.spawnDifficultyAlertOnce('Recolecta las 3 llaves para escapar.');
    },

    /**
     * Lógica de actualización por frame durante el estado `GAME`.
     * Avanza el tiempo, escala dificultad, genera hordas, mueve entidades,
     * resuelve colisiones, aplica daño, gestiona llaves/puerta y HUD.
     *
     * @param {number} dt tiempo transcurrido en segundos desde el frame anterior.
     */
    update(dt) {
        if (this.currentState !== 'GAME' || !this.player) return;

        // Medición sencilla de FPS (promedio cada 1 segundo)
        this._fpsAccum += dt;
        this._fpsFrames++;
        if (this._fpsAccum >= 1) {
            this.fps = this._fpsFrames;
            this._fpsAccum = 0;
            this._fpsFrames = 0;
        }

        if (!this.walls || !this.walls.length) {
            this.walls = this.generateMazeWallsSeeded('SEMILLA');
        }

        this.gameTime += dt;
        this.applyDifficultyEscalation();

        const remaining = Math.max(0, GAME_CONSTANTS.MAX_GAME_TIME + this.bonusTime - this.gameTime);
        if (remaining <= 0) {
            this.setGameOver('Tiempo agotado');
            return;
        }

        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) this.handleEnemySpawning();

        this.player.update(dt, Input, this.bullets, { x: this.cameraX, y: this.cameraY });
        this.resolveEntityVsWalls(this.player, 12);
        this.updateCamera();

        // Actualizar enemigos (movimiento + colisión con paredes)
        this.enemies.forEach(e => {
            const lit = this.isPointInLight(e.x, e.y);
            e.update(dt, this.player, lit, this.enemyScale);
            this.resolveEntityVsWalls(e, e.r);
        });

        // Separación simple entre zombies para que no se superpongan visualmente
        for (let i = 0; i < this.enemies.length; i++) {
            const a = this.enemies[i];
            if (a.state !== 'alive') continue;
            for (let j = i + 1; j < this.enemies.length; j++) {
                const b = this.enemies[j];
                if (b.state !== 'alive') continue;

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                const minDist = (a.r || 18) + (b.r || 18) - 4; // ligero solapamiento permitido

                if (dist > 0.001 && dist < minDist) {
                    const overlap = minDist - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    // Empujar a cada zombi la mitad de la superposición en direcciones opuestas
                    const push = overlap * 0.5;
                    a.x -= nx * push;
                    a.y -= ny * push;
                    b.x += nx * push;
                    b.y += ny * push;
                }
            }
        }

        this.bullets.forEach(b => b.update(dt));
        for (const b of this.bullets) {
            if (this.bulletHitsAnyWall(b)) b.life = 0;
        }
        this.bullets = this.bullets.filter(b => b.life > 0);

        for (const e of this.enemies) {
            if (e.state !== 'alive') continue;
            if (!this.isPointInLight(e.x, e.y)) continue;

            for (const b of this.bullets) {
                if (!this.lineHitsCircle(b, e)) continue;
                e.hp -= b.damage;
                b.life = 0;
                if (e.hp <= 0) {
                    e.kill();
                    this.score += 10; // Puntuación por zombie eliminado
                    this.addSplat(e.x, e.y);
                    try { Audio.playZombieDeath && Audio.playZombieDeath(); } catch (_) {}
                }
            }
        }

        this.enemies = this.enemies.filter(e => e.state !== 'dead');

        this.updateThreatAudio(dt);
        this.resolveMeleeContact(dt);
        this.updateKeys(dt);
        this.updateExit(dt);
        this.updateHUD(remaining);
    },
        // Helpers de Update
    /**
     * Escalada progresiva de dificultad en función del tiempo de partida.
     * Ajusta `spawnInterval`, `enemyScale` y dispara alertas/brotes extra.
     */
    applyDifficultyEscalation() {
        // No escalar ni mostrar alertas si la partida ya no está en curso
        if (this.currentState !== 'GAME') return;

        // Escalada cada 90 segundos (1:30)
        const elapsedSteps = Math.floor(this.gameTime / 90);
        if (elapsedSteps === this.lastEscalationMinute) return;

        this.lastEscalationMinute = elapsedSteps;
        this.threatLevel = elapsedSteps + 1;

        // Escalada más suave para que no igualen tan rápido al jugador
        this.spawnInterval = Math.max(1.4, this.spawnInterval * 0.96);
        this.enemyScale = Math.min(1.6, this.enemyScale * 1.05);

        if (elapsedSteps > 0) {
            this.spawnDifficultyAlertOnce('¡ADVERTENCIA! ¡La horda se está volviendo más rápida!');
            this.spawnBurst(3, 700, 1100);
        }
    },

    /** Genera un pequeño lote de zombis según el nivel de amenaza actual. */
    handleEnemySpawning() {
        this.spawnTimer = 0;
        let batch;

        // Si estamos en la fase final (abriendo la puerta), spawn algo más suave
        if (this.inFinalAssault) {
            batch = 2;
        } else {
            // Ligera agresividad: pequeños grupos pero algo más frecuentes
            batch = Math.min(3, 1 + Math.floor(this.threatLevel / 4));
        }

        batch = Math.min(batch, Math.max(0, this.maxEnemies - this.enemies.length));
        for (let i = 0; i < batch; i++) this.spawnEnemy();
    },

    /**
     * Actualiza el audio ambiental de amenaza en función de la distancia
     * al zombi más cercano.
     * @param {number} dt delta de tiempo en segundos.
     */
    updateThreatAudio(dt) {
        try {
            let nearest = Infinity;
            for (const e of this.enemies) {
                if (e.state !== 'alive') continue;
                const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
                if (d < nearest) nearest = d;
            }

            const RANGE = 900;
            const f = nearest < Infinity ? Math.max(0, Math.min(1, 1 - nearest / RANGE)) : 0;
            Audio.setThreatProximity(f);
            Audio.updateZombieAmbient(dt);
        } catch (_) {}
    },

    /**
     * Gestiona el contacto cuerpo a cuerpo entre el jugador y los zombis.
     * Empuja físicamente a los enemigos y aplica daño periódico mientras
     * haya colisión.
     * @param {number} dt delta de tiempo en segundos.
     */
    resolveMeleeContact(dt) {
        let touching = false;
        const PUSH_STRENGTH = 60;

        for (const e of this.enemies) {
            if (e.state !== 'alive') continue;

            const dx = this.player.x - e.x;
            const dy = this.player.y - e.y;
            const dist = Math.hypot(dx, dy);
            const minDist = e.r + 14; // radio zombie + margen del soldier

            if (dist < minDist && dist > 0.001) {
                touching = true;

                // Separar físicamente al zombie del jugador para que no se superpongan
                const overlap = minDist - dist;
                const nx = dx / dist;
                const ny = dy / dist;

                // Empujar al zombie ligeramente hacia fuera
                e.x -= nx * overlap * 0.6;
                e.y -= ny * overlap * 0.6;
            }
        }

        this.contactTimer = touching ? (this.contactTimer || 0) + dt : 0;
        const HIT_PERIOD = 0.85; // un poco más lento para compensar la colisión dura
        while (this.contactTimer >= HIT_PERIOD) {
            this.contactTimer -= HIT_PERIOD;
            this.damagePlayer(1);
            if (this.currentState !== 'GAME') break;
        }
    },
    /**
     * Gestiona la captura de llaves: progreso de captura, puntuación,
     * ajuste fino de dificultad y aparición de la puerta al conseguir 3.
     * @param {number} dt delta de tiempo en segundos.
     */
    updateKeys(dt) {
        const KEY_R = 26;
        const CAP_RATE = 0.9;

        for (const k of this.keys) {
            if (k.collected) continue;

            k.capturing = false;
            const d = Math.hypot(k.x - this.player.x, k.y - this.player.y);

            if (d < KEY_R) {
                const sp = Math.hypot(this.player.vx, this.player.vy);
                const f = sp < 25 ? 1 : 0.4;

                k.progress += CAP_RATE * f * dt;
                k.capturing = true;

                if (k.progress >= 1) {
                    k.progress = 1;
                    k.collected = true;

                    this.player.keys = (this.player.keys || 0) + 1;
                    // Puntuación por llave recogida
                    this.score += 50;
                    try { Audio.playKeyPickup(); } catch (_) {}

                    // Ajuste suave de dificultad por llave
                    this.spawnInterval = Math.max(1.0, this.spawnInterval * 0.9);
                    this.enemyScale = Math.min(1.7, this.enemyScale * 1.06);

                    // Mensajes distintos para cada llave
                    if (this.player.keys === 1) {
                        this.spawnDifficultyAlertOnce('Primera llave asegurada. La salida estará en el punto de partida.');
                    } else if (this.player.keys === 2) {
                        this.spawnDifficultyAlertOnce('Llave obtenida. Solo falta una más.');
                    }

                    this.spawnBurst(Math.min(4, 2 + this.player.keys), 650, 1000);
                }
            } else if (k.progress > 0) {
                k.progress = Math.max(0, k.progress - 0.25 * dt);
            }
        }

        this.keys = this.keys.filter(k => !k.collected);

        // Cuando el jugador consiga las 3 llaves por primera vez:
        // - Aparece la puerta en la posición de partida
        // - Se añade 1 minuto extra al contador
        if (this.player.keys === 3 && !this.bonusApplied) {
            this.bonusApplied = true;
            this.bonusTime += 60; // +1 minuto

            const start = this.getMazeStartPosition();
            if (start) {
                this.exit = {
                    x: start.x - 32,
                    y: start.y - 32,
                    w: 64,
                    h: 64,
                    progress: 0,
                    capturing: false,
                    required: 1,
                };
                this.exitSpawned = true;
                try { Audio.playDoorSpawn(); } catch (_) {}
            }
            // Mensaje específico de tercera llave (sin repetir "llave obtenida")
            this.spawnDifficultyAlertOnce('Todas las llaves conseguidas. La puerta te espera en el punto de partida. Tienes 1 minuto extra para escapar.');
        }
    },

    /**
     * Gestiona la interacción con la puerta de salida, incluyendo la
     * "fase de asedio final" mientras se intenta abrir.
     * @param {number} dt delta de tiempo en segundos.
     */
    updateExit(dt) {
        if (!this.exit) return;

        // Similar al sistema de llaves: estar encima de la puerta
        // hace que se cargue un círculo de progreso más lento.
        const RATE = 0.11; // más lento que las llaves
        const inExit = this.rectContainsPoint(this.exit, this.player.x, this.player.y);
        this.exit.capturing = false;

        if (inExit) {
            const sp = Math.hypot(this.player.vx, this.player.vy);
            const f = sp < 25 ? 1 : 0.45;
            this.exit.progress += RATE * f * dt;
            this.exit.capturing = true;

            // Activar fase final de asedio mientras se intenta abrir la puerta
            if (!this.inFinalAssault) {
                this.inFinalAssault = true;
                this.spawnDifficultyAlertOnce('¡La horda se lanza sobre ti mientras abres la puerta!');
            }

            // Ajustar parámetros de spawn para que sea intenso pero no imposible
            this.spawnInterval = 0.6; // un poco menos frenético
            this.maxEnemies = 65;     // límite menor de enemigos

            // Impulso moderado de velocidad, con tope más bajo
            this.enemyScale = Math.min(this.enemyScale * 1.05, 1.9);

            // Burst inicial de zombies al empezar a abrir la puerta (solo una vez)
            if (!this.finalAssaultBurstDone) {
                this.finalAssaultBurstDone = true;
                this.spawnBurst(6, 650, 950);
            }

            if (this.exit.progress >= this.exit.required) {
                this.exit.progress = this.exit.required;
                try { Audio.playExitOpen(); } catch (_) {}

                setTimeout(() => this.setVictory(), 900);
            }
        } else {
            if (this.exit.progress > 0) {
                this.exit.progress = Math.max(0, this.exit.progress - 0.10 * dt);
            }

            // Si el jugador se retira de la puerta, relajamos poco a poco el asedio final
            if (this.inFinalAssault) {
                // Lerp suave del spawnInterval hacia el mínimo normal (0.75)
                const targetInterval = 0.75;
                this.spawnInterval += (targetInterval - this.spawnInterval) * Math.min(1, dt * 2.5);

                // Reducir el límite de enemigos hacia el valor base
                const targetMax = 60;
                this.maxEnemies += (targetMax - this.maxEnemies) * Math.min(1, dt * 3);

                // Si se aleja lo suficiente y el progreso casi se pierde, podemos salir de la fase final
                if (this.exit.progress <= 0.01) {
                    this.inFinalAssault = false;
                }
            }
        }
    },

    /**
     * Actualiza el HUD de vidas, llaves, tiempo restante y puntuación.
     * @param {number} remaining tiempo restante en segundos.
     */
    updateHUD(remaining) {
        // Hearts
        const hearts = document.querySelectorAll('#hud .hearts .heart');
        if (hearts && hearts.length) {
            const lives = Math.max(0, Math.min(3, this.player.lives));
            hearts.forEach((el, idx) => {
                el.classList.toggle('active', idx < lives);
            });
        }

        // Keys
        const keys = document.querySelectorAll('#hud .keys .key');
        if (keys && keys.length) {
            const k = Math.max(0, Math.min(3, this.player.keys || 0));
            keys.forEach((el, idx) => {
                el.classList.toggle('active', idx < k);
            });
        }

        // Time (right-top badge)
        const timeEl = document.getElementById('hud-time');
        if (timeEl) {
            const m = Math.floor(remaining / 60);
            const s = Math.floor(remaining % 60);
            timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }

        // Score (HUD right)
        const scoreEl = document.getElementById('hud-score');
        if (scoreEl) {
            scoreEl.textContent = `PUNTOS: ${this.score}`;
        }
    },

    /** Centra la cámara en el jugador respetando los límites del mundo. */
  updateCamera() {
    if (!this.player || !this.canvas) return;

    const halfW = this.canvas.width / 2;
    const halfH = this.canvas.height / 2;
    const maxX = Math.max(0, GAME_CONSTANTS.WORLD_WIDTH - this.canvas.width);
    const maxY = Math.max(0, GAME_CONSTANTS.WORLD_HEIGHT - this.canvas.height);

    this.cameraX = Math.max(0, Math.min(maxX, this.player.x - halfW));
    this.cameraY = Math.max(0, Math.min(maxY, this.player.y - halfH));
  },

    /**
     * Dibuja un frame completo del estado actual del juego.
     * Solo hace trabajo cuando `currentState === 'GAME'`.
     * @param {CanvasRenderingContext2D} ctx contexto 2D del canvas principal.
     */
  render(ctx) {
    if (this.currentState !== 'GAME' || !ctx) return;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    try { ctx.imageSmoothingEnabled = false; } catch (_) {}

    this.drawTiledFloor(ctx);
    if (this.ambientDecals?.length) this.drawAmbientDecals(ctx, (x, y) => this.isPointInLight(x, y));

    this.drawGrid(ctx);
    this.drawWalls(ctx);
    if (this.splats.length) this.drawSplats(ctx, (x, y) => this.isPointInLight(x, y));
    this.drawExitAndKeys(ctx);
    this.drawEnemies(ctx);
    this.bullets.forEach(b => b.draw(ctx, { x: this.cameraX, y: this.cameraY }));

    this.drawFOV(ctx);
    this.postLightEnhance(ctx);
    this.drawPlayer(ctx);
    this.drawBulletsOnTop(ctx);

    // Minimapa simple (solo para pruebas: jugador, llaves y puerta)
    // this.drawDebugMiniMap(ctx);

    // Mostrar contador de FPS opcional
    if (this.showFPS) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.font = '14px monospace';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`FPS: ${this.fps}`, 8, 8);
        ctx.restore();
    }
  },

    /**
     * Minimapa muy simple para depuración: muestra la posición del jugador,
     * las llaves sin recoger y la puerta (si existe) sobre una miniatura
     * del mundo completo en la esquina superior derecha.
     */
    drawDebugMiniMap(ctx) {
        if (!this.canvas || !this.player) return;

        const worldW = GAME_CONSTANTS.WORLD_WIDTH;
        const worldH = GAME_CONSTANTS.WORLD_HEIGHT;
        const mapW = 180;
        const mapH = 120;
        const padding = 10;
        const x0 = this.canvas.width - mapW - padding;
        const y0 = padding;

        ctx.save();

        // Fondo del minimapa
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(x0, y0, mapW, mapH);

        // Borde
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, mapW - 1, mapH - 1);

        const scaleX = mapW / worldW;
        const scaleY = mapH / worldH;

        // Jugador
        const px = x0 + this.player.x * scaleX;
        const py = y0 + this.player.y * scaleY;
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();

        // Llaves sin recoger
        ctx.fillStyle = '#facc15';
        for (const k of this.keys) {
            if (k.collected) continue;
            const kx = x0 + k.x * scaleX;
            const ky = y0 + k.y * scaleY;
            ctx.fillRect(kx - 2, ky - 2, 4, 4);
        }

        // Puerta de salida
        if (this.exit) {
            const ex = x0 + (this.exit.x + this.exit.w / 2) * scaleX;
            const ey = y0 + (this.exit.y + this.exit.h / 2) * scaleY;
            ctx.fillStyle = '#60a5fa';
            ctx.beginPath();
            ctx.arc(ex, ey, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    },
    // Luz (cono) - mejora de visibilidad general
    /**
     * Dibuja el cono de luz del jugador y oscurece el resto de la escena
     * mediante una máscara radial.
     * @param {CanvasRenderingContext2D} ctx
     */
    drawFOV(ctx) {
        if (!this.player) return;

        const px = this.player.x - this.cameraX;
        const py = this.player.y - this.cameraY;
        const radius = GAME_CONSTANTS.PLAYER.FOV_RADIUS;
        const angle  = GAME_CONSTANTS.PLAYER.FOV_ANGLE;

        // calcula los puntos del cono en coords de mundo
        const points = this.computeVisibilityCone(this.player.x, this.player.y, radius, angle);

        // Si por algún bug no hay puntos, NO dibujes la textura de oscuridad
        if (!points || points.length < 2) return;

        ctx.save();

        // capa de oscuridad
        ctx.fillStyle = 'rgba(0,0,0,0.64)';  // puedes ajustar este alpha si quieres menos "tapado"
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // recorte del cono
        ctx.globalCompositeOperation = 'destination-out';
        const g = ctx.createRadialGradient(px, py, radius * 0.15, px, py, radius);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;

        ctx.beginPath();
        ctx.moveTo(points[0].x - this.cameraX, points[0].y - this.cameraY);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x - this.cameraX, points[i].y - this.cameraY);
        }
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    },


    /**
     * Indica si un punto del mundo está dentro del cono de luz del jugador
     * y sin paredes bloqueando la línea de visión.
     */
  isPointInLight(x,y){ 
      const r=GAME_CONSTANTS.PLAYER.FOV_RADIUS, ang=GAME_CONSTANTS.PLAYER.FOV_ANGLE; 
      const a=Math.atan2(y-this.player.y,x-this.player.x); 
      const da=Math.atan2(Math.sin(a-this.player.aimAngle),Math.cos(a-this.player.aimAngle)); 
      const dist=Math.hypot(x-this.player.x,y-this.player.y); 
      if(Math.abs(da)>ang/2||dist>r) return false;
      return !this.rayHitsWall(this.player.x,this.player.y,x,y); 
  },

    /** Devuelve un factor de luz [0,1] para atenuar/brillar sprites. */
  lightFactorAt(x,y){ 
      if(!this.isPointInLight(x,y)) return 0; 
      const r=GAME_CONSTANTS.PLAYER.FOV_RADIUS; 
      let f=1 - (Math.hypot(x-this.player.x,y-this.player.y)/r); 
      return Math.max(0,Math.min(1,Math.pow(f,0.6))); 
  },

    /** Punto aproximado de origen de linterna/munición en coordenadas de mundo. */
        getMuzzlePoint(){
            const offFront=24; 
            const offSide=12;
            const dirx=Math.cos(this.player.aimAngle), diry=Math.sin(this.player.aimAngle);
            const perpX=-Math.sin(this.player.aimAngle), perpY=Math.cos(this.player.aimAngle);
            return { 
                x: this.player.x - dirx*offFront + perpX*offSide, 
                y: this.player.y - diry*offFront + perpY*offSide 
            };
        },

    /**
     * Añade un bloom cálido dentro del cono de luz para reforzar el contraste
     * entre zonas iluminadas y oscuras.
     */
    postLightEnhance(ctx) {
        // Refuerzo cálido dentro del cono (bloom ligero)
        const r = GAME_CONSTANTS.PLAYER.FOV_RADIUS;
        const ang = GAME_CONSTANTS.PLAYER.FOV_ANGLE;
        const a0 = this.player.aimAngle - ang / 2;
        const a1 = this.player.aimAngle + ang / 2;
        const pts = this.computeVisibilityCone(this.player.x, this.player.y, r, a0, a1);
        if (!pts.length) return;

        const px = this.player.x - this.cameraX;
        const py = this.player.y - this.cameraY;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        const g = ctx.createRadialGradient(px, py, r * 0.05, px, py, r);
        g.addColorStop(0, 'rgba(255,240,180,0.55)');
        g.addColorStop(0.35, 'rgba(255,210,120,0.28)');
        g.addColorStop(0.65, 'rgba(255,170,70,0.10)');
        g.addColorStop(1, 'rgba(255,150,50,0)');

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (const p of pts) ctx.lineTo(p.x - this.cameraX, p.y - this.cameraY);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    },

    /** Dibuja una cuadrícula tenue sobre el suelo para dar estructura. */
    drawGrid(ctx) {
        ctx.strokeStyle = '#211014';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.10;

        const gridSize = 64;
        const sx0 = Math.floor(this.cameraX / gridSize) * gridSize;
        const sy0 = Math.floor(this.cameraY / gridSize) * gridSize;

        for (let x = sx0; x <= this.cameraX + this.canvas.width; x += gridSize) {
            const sx = x - this.cameraX;
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, this.canvas.height);
            ctx.stroke();
        }

        for (let y = sy0; y <= this.cameraY + this.canvas.height; y += gridSize) {
            const sy = y - this.cameraY;
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(this.canvas.width, sy);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    },

    /** Dibuja las paredes del laberinto usando patrones procedurales si existen. */
    drawWalls(ctx) {
        for (const w of this.getWalls()) {
            const sx = w.x - this.cameraX;
            const sy = w.y - this.cameraY;
            if (sx + w.w < 0 || sy + w.h < 0 || sx > this.canvas.width || sy > this.canvas.height) continue;

            if (this.assets.wallPattern) {
                ctx.save();
                ctx.translate(sx, sy);
                ctx.fillStyle = this.assets.wallPattern;
                ctx.fillRect(0, 0, w.w, w.h);
                ctx.restore();
            } else {
                ctx.fillStyle = '#2a0f12';
                ctx.fillRect(sx, sy, w.w, w.h);
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(sx + 2, sy + 2, w.w - 4, w.h - 4);
            }
        }
    },

    /** Dibuja la puerta de salida y las llaves con sus indicadores de progreso. */
    drawExitAndKeys(ctx) {
        if (this.exit) {
            const sx = this.exit.x - this.cameraX;
            const sy = this.exit.y - this.cameraY;
            const img = this.assets.exit;

            // Dibujar puerta siempre que exista (ya no depende de la luz)
            if (img && img.complete) {
                ctx.drawImage(img, sx, sy, this.exit.w, this.exit.h);
            } else {
                ctx.fillStyle = COLORS.EXIT;
                ctx.fillRect(sx, sy, this.exit.w, this.exit.h);
            }

            // Círculo de progreso alrededor de la puerta, similar a las llaves
            if (this.exit.progress > 0) {
                const cx = sx + this.exit.w / 2;
                const cy = sy + this.exit.h / 2;
                const prog = Math.min(1, this.exit.progress / this.exit.required);

                ctx.strokeStyle = '#4ade80'; // verde para "escape"
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(cx, cy, 32, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
                ctx.stroke();

                if (this.exit.capturing) {
                    ctx.fillStyle = 'rgba(74,222,128,0.18)';
                    ctx.beginPath();
                    ctx.arc(cx, cy, 36, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        for (let idx = 0; idx < this.keys.length; idx++) {
            const k = this.keys[idx];
            const inLight = this.isPointInLight(k.x, k.y);
            const sx = k.x - this.cameraX;
            const sy = k.y - this.cameraY;
            const pulse = 0.5 + Math.sin(Date.now() * 0.003) * 0.3;

            if (inLight) {
                ctx.save();
                ctx.globalAlpha = pulse * 0.5;
                ctx.fillStyle = 'rgba(255,140,0,0.45)';
                ctx.beginPath();
                ctx.arc(sx, sy, 18, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                const keyImg = this.assets['key' + ((idx % 3) + 1)];
                if (keyImg && keyImg.complete) {
                    ctx.drawImage(keyImg, sx - 16, sy - 16, 32, 32);
                } else {
                    ctx.fillStyle = COLORS.KEY;
                    ctx.fillRect(sx - 6, sy - 4, 12, 8);
                }
            }

            if (k.progress > 0) {
                const prog = Math.min(1, k.progress);
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(sx, sy, 22, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
                ctx.stroke();

                if (k.capturing) {
                    ctx.fillStyle = 'rgba(255,215,0,0.22)';
                    ctx.beginPath();
                    ctx.arc(sx, sy, 24, 0, Math.PI * 2);
                    ctx.fill();
                } else if (!inLight) {
                    ctx.save();
                    ctx.globalAlpha = 0.18;
                    ctx.fillStyle = 'rgba(255,180,0,0.25)';
                    ctx.beginPath();
                    ctx.arc(sx, sy, 20, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
        }
    },

    /** Dibuja zombis, aplicando efectos de luz y filtros según visibilidad. */
    drawEnemies(ctx) {
        this.enemies.forEach(e => {
            if (!this.isPointInLight(e.x, e.y)) return;

            const zx = this.assets.zombie;
            const lf = this.lightFactorAt(e.x, e.y);

            if (zx && zx.complete && zx.naturalWidth > 0) {
                const sx = e.x - this.cameraX;
                const sy = e.y - this.cameraY;
                ctx.save();
                ctx.translate(sx, sy);
                const rot = (e.angle || 0) + (this.spriteOffsets?.zombie || 0);
                ctx.rotate(rot);

                if (typeof ctx.filter === 'string') {
                    ctx.filter = `brightness(${(1 + lf * 0.85).toFixed(2)}) contrast(${(1 + lf * 0.25).toFixed(2)})`;
                }

                ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(zx, -24, -24, 48, 48);

                if (!('filter' in ctx)) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = lf * 0.35;
                    ctx.fillStyle = 'rgba(255,190,80,0.85)';
                    ctx.beginPath();
                    ctx.arc(0, 0, 26, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            } else {
                ctx.save();
                if (typeof ctx.filter === 'string') {
                    ctx.filter = `brightness(${(1 + lf * 0.8).toFixed(2)})`;
                }

                e.draw(ctx, { x: this.cameraX, y: this.cameraY });

                if (!('filter' in ctx)) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = lf * 0.3;
                    ctx.fillStyle = 'rgba(255,180,70,0.7)';
                    const sx = e.x - this.cameraX;
                    const sy = e.y - this.cameraY;
                    ctx.beginPath();
                    ctx.arc(sx, sy, 22, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            }
        });
    },

    /** Dibuja al jugador usando sprite o fallback vectorial, con brillo según luz. */
    drawPlayer(ctx) {
        const pImg = this.assets.soldier;
        const lf = this.lightFactorAt(this.player.x, this.player.y);

        if (pImg && pImg.complete && pImg.naturalWidth > 0) {
            const sx = this.player.x - this.cameraX;
            const sy = this.player.y - this.cameraY;
            ctx.save();
            ctx.translate(sx, sy);
            // ajuste de rotación para el nuevo sprite (mira hacia arriba)
            const spriteRotationFix = -Math.PI / 2;
            const rot = this.player.aimAngle + (this.spriteOffsets?.soldier || 0) + spriteRotationFix;
            ctx.rotate(rot);

            if (typeof ctx.filter === 'string') {
                ctx.filter = `brightness(${(1.15 + lf * 0.6).toFixed(2)}) contrast(${(1 + lf * 0.2).toFixed(2)})`;
            }

            ctx.globalCompositeOperation = 'source-over';

            // Escalar el sprite nuevo manteniendo tamaño razonable en pantalla
            // Aumentado para que el soldier se vea más grande
            const targetSize = 72; // tamaño aproximado deseado en px
            const maxDim = Math.max(pImg.naturalWidth, pImg.naturalHeight) || 1;
            const scale = targetSize / maxDim;
            const drawW = pImg.naturalWidth * scale;
            const drawH = pImg.naturalHeight * scale;

            // pequeños offsets por si el gráfico no está perfectamente centrado
            const offsetX = 0;
            const offsetY = 0;

            ctx.drawImage(pImg, -drawW / 2 + offsetX, -drawH / 2 + offsetY, drawW, drawH);

            if (!('filter' in ctx)) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.30 + lf * 0.35;
                ctx.fillStyle = 'rgba(255,210,120,0.9)';
                ctx.beginPath();
                ctx.arc(0, 0, 26, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        } else {
            ctx.save();
            if (typeof ctx.filter === 'string') {
                ctx.filter = `brightness(${(1.1 + lf * 0.55).toFixed(2)})`;
            }

            this.player.draw(ctx, { x: this.cameraX, y: this.cameraY });

            if (!('filter' in ctx)) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.25 + lf * 0.4;
                ctx.fillStyle = 'rgba(255,200,100,0.85)';
                const sx = this.player.x - this.cameraX;
                const sy = this.player.y - this.cameraY;
                ctx.beginPath();
                ctx.arc(sx, sy, 24, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    },

    /** Devuelve si el centro de un rectángulo cae dentro del cono de luz. */
  isRectInLight(r){ if(!r) return false; return this.isPointInLight(r.x + r.w/2, r.y + r.h/2); },

    /**
     * Genera un lote de zombis alrededor del jugador a cierta distancia.
     * @param {number} count cantidad a intentar spawnear.
     * @param {number} [minDist]
     * @param {number} [maxDist]
     */
        spawnBurst(count, minDist = 650, maxDist = 1000) {
            for (let n = 0; n < count; n++) {
                if (this.enemies.length >= this.maxEnemies) break;

                const ang = Math.random() * Math.PI * 2;
                const dist = minDist + Math.random() * (maxDist - minDist);
                const x = this.player.x + Math.cos(ang) * dist;
                const y = this.player.y + Math.sin(ang) * dist;

                if (!this.isValidEnemySpawn(x, y)) {
                    n--;
                    continue;
                }

                this.enemies.push(new Enemy(x, y, Math.floor(Math.random() * 5)));
            }
        },
    // Spawn individual
    /** Intenta spawnear un zombi en una zona válida del laberinto. */
        spawnEnemy() {
            if (this.enemies.length >= this.maxEnemies) return;

            for (let i = 0; i < 25; i++) {
                const x = 40 + Math.random() * (GAME_CONSTANTS.WORLD_WIDTH - 80);
                const y = 40 + Math.random() * (GAME_CONSTANTS.WORLD_HEIGHT - 80);
                if (!this.isValidEnemySpawn(x, y)) continue;
                this.enemies.push(new Enemy(x, y, Math.floor(Math.random() * 5)));
                break;
            }
        },

        /** Comprueba si una posición es válida para spawnear un zombi. */
        isValidEnemySpawn(x, y) {
            if (Math.hypot(x - this.player.x, y - this.player.y) < GAME_CONSTANTS.ENEMY.MIN_SPAWN_DIST) return false;
            if (this.isPointInLight(x, y)) return false;
            if (x < 60 || y < 60 || x > GAME_CONSTANTS.WORLD_WIDTH - 60 || y > GAME_CONSTANTS.WORLD_HEIGHT - 60) return false;
            for (const w of this.getWalls()) {
                if (this.rectContainsPoint(w, x, y)) return false;
            }
            return true;
        },

    /** Aplica daño al jugador y dispara el sonido correspondiente. */
    damagePlayer(a){ try{ if(Audio && Audio.playPlayerHit) Audio.playPlayerHit(); }catch(_){ } this.player.lives-=a; if(this.player.lives<=0) this.setGameOver('Derrotado'); },

    // Game Over / Victoria (con cálculo de score final y high score)
    /**
     * Calcula el score final, aplica bonus por tiempo, persiste y muestra
     * el resumen de puntuación y high score.
     * @param {boolean} isVictory indica si se llegó por victoria o derrota.
     */
    _finalizeScoreAndHighScore(isVictory){
        try {
            const msgEl = document.getElementById('gameover-message');
            const titleEl = document.querySelector('#gameover-screen h1');
            const summaryEl = document.getElementById('gameover-score-summary');

            // Si es victoria: sumar puntos por tiempo restante
            if (isVictory) {
                const remaining = Math.max(0, GAME_CONSTANTS.MAX_GAME_TIME + this.bonusTime - this.gameTime);
                const bonus = Math.floor(remaining) * 5; // 5 puntos por segundo restante
                this.score += bonus;
            }

            // Actualizar high score persistente
            let prev = this.highScore || 0;
            if (this.score > prev) {
                prev = this.score;
                this.highScore = this.score;
                try { localStorage.setItem('cripta47_highscore', String(this.highScore)); } catch (_) {}
            }

            // Construir mensaje de resumen (separado del mensaje principal)
            const summary = `Puntuación: ${this.score}  |  Mejor puntuación: ${prev}`;
            if (summaryEl) summaryEl.textContent = summary;

            // Asegurar título coherente
            if (titleEl && isVictory) titleEl.textContent = 'VICTORIA';
            if (titleEl && !isVictory) titleEl.textContent = 'GAME OVER';
        } catch (_) {}
    },

    /** Termina la partida por derrota y muestra pantalla de GAME OVER. */
    setGameOver(msg){
        const t=document.querySelector('#gameover-screen h1');
        const d=document.querySelector('#gameover-screen p');
        if(t) t.textContent='GAME OVER';
        if(d) d.textContent=msg||'Has caído.';
        try{Audio.playDefeat();}catch(_){ }
        this._finalizeScoreAndHighScore(false);
        this.setState('GAMEOVER');
    },

    /** Termina la partida por victoria y muestra pantalla de VICTORIA. */
    setVictory(){
        const t=document.querySelector('#gameover-screen h1');
        const d=document.querySelector('#gameover-screen p');
        if(t) t.textContent='VICTORIA';
        if(d) d.textContent='Escapaste.';
        try{Audio.playVictory();}catch(_){ }
        this._finalizeScoreAndHighScore(true);
        this.setState('VICTORY');
    },

    // Alertas
    /**
     * Crea un anuncio visual en la capa `#alert-layer` que se autodestruye
     * después de 6000 ms. Usado para cambios de dificultad y eventos clave.
     */
  spawnDifficultyAlert(msg){ 
      const layer=document.getElementById('alert-layer'); 
      if(!layer) return; 
      const div=document.createElement('div'); 
      div.className='game-alert'; 
      div.textContent=msg; 
      // Estilos más ligeros y sin sombras pesadas para evitar reflujo costoso
      div.style.cssText='background:rgba(180,0,0,0.85);color:#fff;padding:10px 20px;margin:6px 0;border-radius:4px;font-size:16px;font-weight:bold;text-align:center;';
      layer.appendChild(div); 
      // Tiempo de vida del anuncio: 6000 ms (6 segundos)
      setTimeout(()=>div.remove(),6000); 
  },
    spawnDifficultyAlertOnce(msg){ const now=performance.now?performance.now():Date.now(); const last=this.lastAlerts[msg]||0; if(now-last < this.alertCooldownMs) return; this.lastAlerts[msg]=now; this.spawnDifficultyAlert(msg); },

        // Laberinto
        /** Devuelve la lista actual de paredes del laberinto. */
    getWalls(){ return this.walls && this.walls.length ? this.walls : MAP.walls; },
        /** Posición de inicio del jugador dentro del laberinto procedural. */
    getMazeStartPosition(){
        // Punto de partida cerca de la esquina superior izquierda del laberinto procedural
        const cell=64, margin=40;
        return {x: margin+cell*1+cell/2, y: margin+cell*1+cell/2};
    },
    /**
     * Genera un laberinto tipo grid usando un algoritmo DFS con aperturas
     * adicionales, a partir de una semilla reproducible.
     * @param {string} seed semilla para el generador pseudoaleatorio.
     * @returns {{x:number,y:number,w:number,h:number}[]} lista de rectángulos pared.
     */
    generateMazeWallsSeeded(seed){
        const margin=40, cell=64;
        const cols=Math.floor((GAME_CONSTANTS.WORLD_WIDTH - margin*2)/cell);
        const rows=Math.floor((GAME_CONSTANTS.WORLD_HEIGHT - margin*2)/cell);
        const W= cols%2===0?cols-1:cols;
        const H= rows%2===0?rows-1:rows;
        const grid=Array.from({length:H},()=>Array(W).fill(1));
        const inBounds=(x,y)=> x>0&&y>0&&x<W-1&&y<H-1;
        const rand=this.seededRandomFactory(this.seedStringToInt(seed));
        const stack=[];
        let cx=1, cy=1; grid[cy][cx]=0; stack.push([cx,cy]);
        const baseDirs=[[2,0],[-2,0],[0,2],[0,-2]];

        // Fase 1: laberinto base tipo "árbol" (un solo camino entre celdas)
        while(stack.length){
            const top=stack[stack.length-1];
            const x=top[0], y=top[1];
            const dirs=baseDirs.slice();
            // shuffle dirs (Fisher–Yates)
            for(let i=dirs.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); const tmp=dirs[i]; dirs[i]=dirs[j]; dirs[j]=tmp; }
            let carved=false;
            for(let k=0;k<dirs.length;k++){
                const d=dirs[k];
                if(!d || d.length<2) continue;
                const dx=d[0]|0, dy=d[1]|0;
                const nx=x+dx, ny=y+dy;
                if(inBounds(nx,ny) && grid[ny][nx]===1){
                    grid[y+dy/2][x+dx/2]=0; grid[ny][nx]=0; stack.push([nx,ny]); carved=true; break;
                }
            }
            if(!carved) stack.pop();
        }

        // Fase 2: abrir "atajos" para crear más caminos que crucen el mapa
        // Recorremos algunas paredes internas y, con baja probabilidad,
        // las quitamos si conectan dos celdas abiertas diferentes.
        for(let y=2;y<H-2;y++){
            for(let x=2;x<W-2;x++){
                if(grid[y][x]!==1) continue;

                // Solo considerar paredes que separan corredores horizontales o verticales
                const upOpen    = grid[y-1][x]===0;
                const downOpen  = grid[y+1][x]===0;
                const leftOpen  = grid[y][x-1]===0;
                const rightOpen = grid[y][x+1]===0;

                let canCarve=false;
                // Pared vertical entre dos celdas horizontales
                if(leftOpen && rightOpen && !upOpen && !downOpen) canCarve=true;
                // Pared horizontal entre dos celdas verticales
                if(upOpen && downOpen && !leftOpen && !rightOpen) canCarve=true;

                if(!canCarve) continue;

                // Probabilidad moderada de abrir, para no romper demasiado el laberinto
                if(rand()<0.18){
                    grid[y][x]=0;
                }
            }
        }
        const walls=[];
        walls.push({x:0,y:0,w:GAME_CONSTANTS.WORLD_WIDTH,h:margin});
        walls.push({x:0,y:GAME_CONSTANTS.WORLD_HEIGHT-margin,w:GAME_CONSTANTS.WORLD_WIDTH,h:margin});
        walls.push({x:0,y:0,w:margin,h:GAME_CONSTANTS.WORLD_HEIGHT});
        walls.push({x:GAME_CONSTANTS.WORLD_WIDTH-margin,y:0,w:margin,h:GAME_CONSTANTS.WORLD_HEIGHT});
        for(let y=0;y<H;y++){
            for(let x=0;x<W;x++){
                if(grid[y][x]===1){ walls.push({x:margin+x*cell,y:margin+y*cell,w:cell,h:cell}); }
            }
        }
        return walls;
    },
    seedStringToInt(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h*31 + str.charCodeAt(i))>>>0; } return h; },
    seededRandomFactory(seed){ let s=seed>>>0; return ()=>{ s^=s<<13; s^=s>>>17; s^=s<<5; s=s>>>0; return (s & 0xffffffff)/0x100000000; }; },

    // Utilidades espaciales
    rectContainsPoint(r,x,y){ return x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h; },
    pointInsideAnyWall(x,y){ for(const w of this.getWalls()) if(this.rectContainsPoint(w,x,y)) return true; return false; },
    rectOverlapsAnyWall(R){ for(const w of this.getWalls()){ if(!(R.x+R.w < w.x || R.x > w.x+w.w || R.y+R.h < w.y || R.y > w.y+w.h)) return true; } return false; },
        randomClearPoint(minX=60,minY=60,maxX=GAME_CONSTANTS.WORLD_WIDTH-60,maxY=GAME_CONSTANTS.WORLD_HEIGHT-60){
                for(let i=0;i<220;i++){
                        const x=minX+Math.random()*(maxX-minX);
                        const y=minY+Math.random()*(maxY-minY);

                        // No colocar dentro de muros
                        if(this.pointInsideAnyWall(x,y)) continue;

                        // No colocar pegado al borde derecho/inferior
                        if(x>GAME_CONSTANTS.WORLD_WIDTH-96 || y>GAME_CONSTANTS.WORLD_HEIGHT-96) continue;

                        // Evitar específicamente el corredor sin salida inferior
                        // (franja horizontal pegada al borde inferior del mundo).
                        if(y>GAME_CONSTANTS.WORLD_HEIGHT-220) continue;

                        return {x,y};
                }
                return null;
        },
  spawnRandomKeys(n){ const arr=[]; const MIN_PLAYER=600, MIN_BETWEEN=700; while(arr.length<n){ const p=this.randomClearPoint(); if(!p) break; if(Math.hypot(p.x-this.player.x,p.y-this.player.y) < MIN_PLAYER) continue; let ok=true; for(const k of arr){ if(Math.hypot(p.x-k.x,p.y-k.y) < MIN_BETWEEN){ ok=false; break; } } if(!ok) continue; arr.push({x:p.x,y:p.y,collected:false,progress:0,capturing:false}); } return arr; },

    // Manchas sangre
  addSplat(x,y){ const splat={x,y,r:16+Math.random()*18,blobs:6+Math.floor(Math.random()*4),rot:Math.random()*Math.PI*2,seed:Math.random()*2,color:COLORS.ENEMY,born:performance.now?performance.now():Date.now(),life:900}; this.splats.push(splat); const now=performance.now?performance.now():Date.now(); this.splats=this.splats.filter(s=> now - s.born < s.life); if(this.splats.length>120) this.splats.shift(); },
    drawSplats(ctx, predicate){ const now=performance.now?performance.now():Date.now(); const test= predicate || (()=>true); for(const s of this.splats){ if(!test(s.x,s.y)) continue; const age=now - s.born; const alpha=0.6*(1-age/s.life); if(alpha<=0) continue; const sx=s.x-this.cameraX, sy=s.y-this.cameraY; ctx.save(); ctx.translate(sx,sy); ctx.rotate(s.rot); ctx.globalAlpha=alpha; ctx.fillStyle=s.color; for(let i=0;i<s.blobs;i++){ const ang=(Math.PI*2)*(i/s.blobs) + s.seed*i*0.25; const rx=Math.cos(ang)*s.r*(0.3+(i%2)*0.4); const ry=Math.sin(ang)*s.r*(0.3+((i+1)%2)*0.4); const rr=s.r*0.25 + Math.random()*s.r*0.25; ctx.beginPath(); ctx.arc(rx,ry,rr,0,Math.PI*2); ctx.fill(); } ctx.restore(); } this.splats=this.splats.filter(s=> now - s.born < s.life); },
  drawBulletsOnTop(ctx){ for(const b of this.bullets){ const hx=b.x-this.cameraX, hy=b.y-this.cameraY; const tx=hx - b.dx*b.length, ty=hy - b.dy*b.length; ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle='#ffdd57'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(hx,hy); ctx.stroke(); const g=ctx.createRadialGradient(hx,hy,0,hx,hy,10); g.addColorStop(0,'rgba(255,221,87,0.9)'); g.addColorStop(1,'rgba(255,221,87,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(hx,hy,10,0,Math.PI*2); ctx.fill(); ctx.restore(); } },
    // Procedural patterns & ambient blood
    createProceduralPatterns(){ this.assets.floorPattern=this.makeFloorPattern(64); this.assets.wallPattern=this.makeBrickPattern(64,64); this.assets.bloodSprites=Array.from({length:6},()=>this.makeBloodSprite(64)); },
    makeFloorPattern(size=64){ const c=document.createElement('canvas'); c.width=c.height=size; const g=c.getContext('2d'); g.fillStyle='#2a2d33'; g.fillRect(0,0,size,size); g.fillStyle='#262a30'; g.fillRect(0,0,size,size/2); g.fillStyle='rgba(255,255,255,0.03)'; for(let i=0;i<18;i++){ const x=Math.random()*size, y=Math.random()*size, r=Math.random()*1.5; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); } return g.createPattern(c,'repeat'); },
    makeBrickPattern(w=64,h=64){ const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); g.fillStyle='#555a60'; g.fillRect(0,0,w,h); const brickW=20, brickH=10; g.fillStyle='#3c4147'; for(let y=0;y<h;y+=brickH){ g.fillRect(0,y,w,1); } for(let y=0;y<h;y+=brickH){ const offset=(y/brickH)%2? brickW/2:0; for(let x=-offset;x<w;x+=brickW){ g.fillRect(x,y,1,brickH); } } g.fillStyle='rgba(0,0,0,0.08)'; g.fillRect(0,0,w,h); return g.createPattern(c,'repeat'); },
    makeBloodSprite(size=64){ const c=document.createElement('canvas'); c.width=c.height=size; const g=c.getContext('2d'); g.translate(size/2,size/2); const blobs=6+Math.floor(Math.random()*5), R=size*0.35; for(let i=0;i<blobs;i++){ const ang=(Math.PI*2)*(i/blobs)+Math.random()*0.5; const r=R*(0.5+Math.random()*0.7); const x=Math.cos(ang)*r, y=Math.sin(ang)*r, rr=6+Math.random()*10; const grad=g.createRadialGradient(x,y,0,x,y,rr); grad.addColorStop(0,'rgba(160,10,10,0.8)'); grad.addColorStop(1,'rgba(100,0,0,0)'); g.fillStyle=grad; g.beginPath(); g.arc(x,y,rr,0,Math.PI*2); g.fill(); } return c; },
    generateAmbientBloodDecals(count=80){ this.ambientDecals=[]; if(!this.assets.bloodSprites) return; for(let i=0;i<count;i++){ const p=this.randomClearPoint(); if(!p) break; this.ambientDecals.push({ x:p.x, y:p.y, rot:Math.random()*Math.PI*2, img:this.assets.bloodSprites[Math.floor(Math.random()*this.assets.bloodSprites.length)], alpha:0.7*(0.6+Math.random()*0.4)}); } },
    drawAmbientDecals(ctx, predicate){ const test= predicate || (()=>true); for(const d of this.ambientDecals){ if(!test(d.x,d.y)) continue; const sx=d.x-this.cameraX, sy=d.y-this.cameraY; if(sx<-80||sy<-80||sx>this.canvas.width+80||sy>this.canvas.height+80) continue; ctx.save(); ctx.globalAlpha=d.alpha; ctx.translate(sx,sy); ctx.rotate(d.rot); const s=56; ctx.drawImage(d.img,-s/2,-s/2,s,s); ctx.restore(); } },
    drawTiledFloor(ctx){ const tile=64; const offsetX=-(this.cameraX % tile); const offsetY=-(this.cameraY % tile); if(this.assets.floorPattern){ ctx.save(); ctx.translate(offsetX,offsetY); ctx.fillStyle=this.assets.floorPattern; ctx.fillRect(-offsetX,-offsetY,this.canvas.width+tile,this.canvas.height+tile); ctx.restore(); } else { const floorGrad=ctx.createRadialGradient(this.canvas.width/2,this.canvas.height/2,0,this.canvas.width/2,this.canvas.height/2,Math.max(this.canvas.width,this.canvas.height)); floorGrad.addColorStop(0,'#130a0c'); floorGrad.addColorStop(1,'#1b0e10'); ctx.fillStyle=floorGrad; ctx.fillRect(0,0,this.canvas.width,this.canvas.height); } },

  // Colisiones / rayos
  circleRectOverlap(cx,cy,cr,r){ const nx=Math.max(r.x,Math.min(cx,r.x+r.w)); const ny=Math.max(r.y,Math.min(cy,r.y+r.h)); const dx=cx-nx, dy=cy-ny; return (dx*dx + dy*dy) < cr*cr; },
  resolveEntityVsWalls(ent,rad){ for(const w of this.getWalls()){ if(!this.circleRectOverlap(ent.x,ent.y,rad,w)) continue; const left=ent.x - w.x; const right=(w.x+w.w) - ent.x; const top=ent.y - w.y; const bottom=(w.y+w.h) - ent.y; const minX=Math.min(left,right); const minY=Math.min(top,bottom); if(minX < minY){ if(left < right) ent.x=w.x - rad; else ent.x=w.x + w.w + rad; } else { if(top < bottom) ent.y=w.y - rad; else ent.y=w.y + w.h + rad; } } ent.x=Math.max(40,Math.min(GAME_CONSTANTS.WORLD_WIDTH-40,ent.x)); ent.y=Math.max(40,Math.min(GAME_CONSTANTS.WORLD_HEIGHT-40,ent.y)); },
  lineHitsCircle(b,e){ const hx=b.x, hy=b.y; const tx=hx - b.dx*b.length, ty=hy - b.dy*b.length; const vx=hx-tx, vy=hy-ty; const wx=e.x - tx, wy=e.y - ty; const c1=vx*wx + vy*wy; const c2=vx*vx + vy*vy; let t=c1/c2; t=Math.max(0,Math.min(1,t)); const px=tx + t*vx, py=ty + t*vy; return Math.hypot(e.x-px,e.y-py) <= e.r; },
  rayHitsWall(x0,y0,x1,y1){ for(const w of this.getWalls()) if(this.lineIntersectsRect(x0,y0,x1,y1,w)) return true; return false; },
  lineIntersectsRect(x0,y0,x1,y1,rect){ const rx=rect.x, ry=rect.y, rw=rect.w, rh=rect.h; if(this.segmentIntersectsSegment(x0,y0,x1,y1,rx,ry,rx+rw,ry)) return true; if(this.segmentIntersectsSegment(x0,y0,x1,y1,rx,ry+rh,rx+rw,ry+rh)) return true; if(this.segmentIntersectsSegment(x0,y0,x1,y1,rx,ry,rx,ry+rh)) return true; if(this.segmentIntersectsSegment(x0,y0,x1,y1,rx+rw,ry,rx+rw,ry+rh)) return true; if(x0>=rx && x0<=rx+rw && y0>=ry && y0<=ry+rh) return true; return false; },
    bulletHitsAnyWall(b){ const hx=b.x, hy=b.y; const tx=hx - b.dx*b.length, ty=hy - b.dy*b.length; for(const w of this.getWalls()){ if(this.lineIntersectsRect(hx,hy,tx,ty,w) || this.rectContainsPoint(w,hx,hy) || this.rectContainsPoint(w,tx,ty)) return true; } return false; },
  segmentIntersectsSegment(x1,y1,x2,y2,x3,y3,x4,y4){ const denom=(x1-x2)*(y3-y4) - (y1-y2)*(x3-x4); if(Math.abs(denom)<1e-10) return false; const t=((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4))/denom; const u=-((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3))/denom; return t>=0 && t<=1 && u>=0 && u<=1; },
  computeVisibilityCone(px,py,r,a0,a1){ const S=96; const pts=[]; const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)); let start=wrap(a0), end=wrap(a1); if(end<start) end+=Math.PI*2; for(let i=0;i<=S;i++){ const t=i/S; const ang=start + (end - start)*t; const a=wrap(ang); pts.push(this.castRayToWalls(px,py,a,r)); } return pts; },
  castRayToWalls(px,py,ang,maxD){ const dx=Math.cos(ang), dy=Math.sin(ang); let nearest={x:px+dx*maxD,y:py+dy*maxD,dist:maxD}; const check=(x3,y3,x4,y4)=>{ const hit=this.raySegmentIntersection(px,py,dx,dy,x3,y3,x4,y4); if(hit && hit.t>=0 && hit.t<=maxD && hit.t<nearest.dist){ const t=Math.max(0,hit.t-1.5); nearest={x:px+dx*t,y:py+dy*t,dist:t}; } }; for(const w of this.getWalls()){ check(w.x,w.y,w.x+w.w,w.y); check(w.x,w.y+w.h,w.x+w.w,w.y+w.h); check(w.x,w.y,w.x,w.y+w.h); check(w.x+w.w,w.y,w.x+w.w,w.y+w.h); } return {x:nearest.x,y:nearest.y}; },
  raySegmentIntersection(px,py,dx,dy,x3,y3,x4,y4){ const rx=dx, ry=dy, sx=x4-x3, sy=y4-y3; const rxs=rx*sy - ry*sx; if(Math.abs(rxs)<1e-8) return null; const qpx=x3-px, qpy=y3-py; const t=(qpx*sy - qpy*sx)/rxs; const u=(qpx*ry - qpy*rx)/rxs; if(t>=0 && u>=0 && u<=1) return {t}; return null; }
};