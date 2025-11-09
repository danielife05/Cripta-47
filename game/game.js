import { Input } from './input.js';
import { GAME_CONSTANTS, LEVELS, COLORS, MAP } from './level_data.js';
import { Player, Enemy, Bullet } from './units.js';

// Objeto Global del Juego (Global para fácil acceso en módulos)
window.Game = {
    // Propiedades del motor
    canvas: null,
    ctx: null,
    lastTime: 0,
    // cámara
    cameraX: 0,
    cameraY: 0,
    
    // Propiedades de estado
    currentState: 'LOADING',
    player: null,
    enemies: [],
    bullets: [],
    score: 0,
    waveCounter: 1,
    keys: [],
    exit: null,
    
    // Propiedades de nivel
    level: null,
    
    // Métodos de Inicialización
    init(canvasId = 'game') {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = GAME_CONSTANTS.CANVAS_WIDTH;
        this.canvas.height = GAME_CONSTANTS.CANVAS_HEIGHT;

        Input.init(this.canvas, this.ctx);
        this.setState('LOADING');
        this.loadAssets().then(() => {
            this.level = LEVELS[0];
            this.initUIManager();
            this.setState('MENU');
        }).catch(() => {
            // Si fallan los assets, continuar sin sprites
            this.level = LEVELS[0];
            this.initUIManager();
            this.setState('MENU');
        });
    },
    assets: {},
    loadAssets(){
        const manifest = {
            player: 'assets/player.svg',
            zombie: 'assets/zombie.svg',
            key: 'assets/key.svg',
            exit: 'assets/exit.svg',
        };
        const entries = Object.entries(manifest);
        return Promise.all(entries.map(([k, url]) => new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => { this.assets[k] = img; res(); };
            img.onerror = rej;
            img.src = url;
        })));
    },
    
    initUIManager() {
        const btnPause = document.getElementById('btn-pause');
        if (btnPause) btnPause.onclick = () => this.paused = !this.paused;
        // Asegurar que el botón INICIAR funciona aunque falle el inline onclick
        const startBtn = document.querySelector('#menu-screen button');
        if (startBtn) {
            startBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.startGame();
            }, { once: false });
        }
    },

    startGame() {
        // Reiniciar entidades y estado
        this.player = new Player(120, 120);
        this.enemies = [];
        this.bullets = [];
        this.splats = [];
        this.score = 0;
        this.threatLevel = 1;
        this.spawnTimer = 0;
        this.spawnInterval = GAME_CONSTANTS.WAVES.INITIAL_SPAWN_INTERVAL;
        this.gameTime = 0;
        this.enemyScale = 1;
        this.isHardMode = false;
        this.alertShown = false;
        this.alertTimer = 0;
        this.maxEnemies = 60;
        this.lastAlerts = {}; // deduplicación
        this.alertCooldownMs = 2500;
        this.exitSpawned = false;

        // Generar laberinto determinístico (semilla fija)
        this.walls = this.generateMazeWallsSeeded('LABERINTO_SEMILLA_1');
        const startPos = this.getMazeStartPosition();
        if (startPos){ this.player.x = startPos.x; this.player.y = startPos.y; }

        // Llaves aleatorias
        this.keys = this.spawnRandomKeys(3);
        // Salida se spawnea luego
        this.exit = null; this.exitSpawned = false;

        this.updateCamera();
        this.spawnBurst(4, 650, 900);
        this.setState('GAME');
    },
    // Eliminar duplicado anterior roto de startGame si existiera (asegurado por parche)

    initLevel(levelIndex) {
        this.units = [];
        this.selectedUnits = [];
        this.credits = GAME_CONSTANTS.BASE_START_CREDITS;
        this.waveCounter = 1;

        this.level = LEVELS[levelIndex];
        
        // 1. Crear cuadrícula de Pathfinding inicial (sin obstáculos por ahora)
        this.tileGrid = Array(GAME_CONSTANTS.MAP_HEIGHT).fill(0).map(() => 
          Array(GAME_CONSTANTS.MAP_WIDTH).fill(0)); 
        
        // 2. Añadir unidades iniciales
        this.level.initialItems.forEach(item => {
             this.addUnit(item.name, item.team, item.x, item.y);
        });
        
        this.setState('GAME');
    },
    
    // --- ESTADOS Y CONTROL DE FLUJO ---
    setState(newState) {
        console.log('Changing state to:', newState);
        
        // Ocultar todas las pantallas
        document.querySelectorAll('.game-screen').forEach(el => {
            el.classList.remove('visible');
            el.classList.add('hidden');
        });
        
        // Actualizar estado actual
        this.currentState = newState;
        
        // Mostrar solo la pantalla actual
        switch(newState) {
            case 'LOADING':
                document.getElementById('loader-screen').classList.remove('hidden');
                document.getElementById('loader-screen').classList.add('visible');
                document.getElementById('hud').style.display = 'none';
                break;
            case 'MENU':
                document.getElementById('menu-screen').classList.remove('hidden');
                document.getElementById('menu-screen').classList.add('visible');
                document.getElementById('hud').style.display = 'none';
                break;
            case 'GAME':
                // Mostrar el HUD durante el juego
                document.getElementById('hud').style.display = 'block';
                break;
            case 'GAMEOVER':
                document.getElementById('gameover-screen').classList.remove('hidden');
                document.getElementById('gameover-screen').classList.add('visible');
                document.getElementById('hud').style.display = 'none';
                break;
            case 'VICTORY':
                document.getElementById('gameover-screen').classList.remove('hidden');
                document.getElementById('gameover-screen').classList.add('visible');
                document.getElementById('hud').style.display = 'none';
                break;
        }
    },
    
    // --- LÓGICA DEL JUEGO ---
    update(dt) {
        if (this.currentState !== 'GAME' || this.paused) return;
        // Protección: asegurar que walls y player existen (si startGame no terminó)
        if (!this.player) return;
        if (!this.walls || !this.walls.length) {
            // fallback: generar laberinto determinístico si faltara
            this.walls = this.generateMazeWallsSeeded('LABERINTO_SEMILLA_1');
        }

        // Tiempo de juego y escalado por minuto (amenaza) + cuenta atrás hasta fin (5 min)
        this.gameTime += dt;
        const elapsedMinutes = Math.floor(this.gameTime / 60);
        if (!this.lastEscalationMinute && this.lastEscalationMinute !== 0) this.lastEscalationMinute = 0;
        if (elapsedMinutes > this.lastEscalationMinute) {
            this.lastEscalationMinute = elapsedMinutes;
            this.threatLevel = elapsedMinutes + 1; // nivel visible inicia en 1
            // Escalado: más zombies y más velocidad
            this.spawnInterval = Math.max(1.2, this.spawnInterval * 0.95);
            this.enemyScale = Math.min(1.8, this.enemyScale * 1.06);
            if (elapsedMinutes > 0) {
                this.spawnDifficultyAlertOnce('¡ALERTA! Incremento de amenaza: el enjambre se intensifica');
                this.spawnBurst(3, 700, 1100);
            }
        }
        // Cuenta regresiva y fin de partida por tiempo
        const remaining = Math.max(0, GAME_CONSTANTS.MAX_GAME_TIME - this.gameTime);
        const timerEl = document.getElementById('timer');
        if (timerEl){
            const m = Math.floor(remaining / 60); const s = Math.floor(remaining % 60);
            timerEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }
        if (remaining <= 0) {
            this.setGameOver('El tiempo se agotó. La cripta se oscurece para siempre.');
            return;
        }

        // Spawning de enemigos por oleadas
        // Spawning continuo escalado por amenaza
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            let batch = Math.min(3, 1 + Math.floor(this.threatLevel/3));
            const capacity = Math.max(0, this.maxEnemies - this.enemies.length);
            batch = Math.min(batch, capacity);
            for (let i=0;i<batch;i++) this.spawnEnemy();
        }

        // Actualizar jugador y cámara
        this.player.update(dt, Input, this.bullets, { x: this.cameraX, y: this.cameraY });
        this.resolveEntityVsWalls(this.player, 12);
        this.updateCamera();

        // Enemigos
        this.enemies.forEach(e => {
            const lit = this.isPointInLight(e.x, e.y);
            e.update(dt, this.player, lit, this.enemyScale);
            this.resolveEntityVsWalls(e, e.r);
        });

        // Balas
        this.bullets.forEach(b => b.update(dt));
        this.bullets = this.bullets.filter(b => b.life > 0);

        // Colisiones bala-enemigo (solo enemigos dentro del cono de luz)
        for (const e of this.enemies) {
            if (!this.isPointInLight(e.x, e.y)) continue;
            for (const b of this.bullets) {
                if (this.lineHitsCircle(b, e)) {
                    e.hp -= b.damage; b.life = 0; if (e.hp <= 0) { e.alive = false; this.score += 10; this.addSplat(e.x, e.y); }
                }
            }
        }
        this.enemies = this.enemies.filter(e => e.alive);

        // Colisión enemigo-jugador: drenaje de vidas mientras haya contacto
        let touching = false;
        for (const e of this.enemies) {
            const dist = Math.hypot(e.x - this.player.x, e.y - this.player.y);
            if (dist < e.r + 10) { touching = true; break; }
        }
        if (!this.contactTimer) this.contactTimer = 0;
        if (touching) {
            this.contactTimer += dt;
            const HIT_PERIOD = 0.4; // cada 0.4s pierde una vida si sigue en contacto
            while (this.contactTimer >= HIT_PERIOD) {
                this.contactTimer -= HIT_PERIOD;
                this.damagePlayer(1);
                if (this.currentState !== 'GAME') break; // por si game over
            }
        } else {
            this.contactTimer = 0;
        }

        // Captura de llaves: requiere permanecer cerca y en luz acumulando progreso
        const KEY_RADIUS = 26; // distancia para empezar captura
        const CAPTURE_RATE = 0.9; // progreso por segundo
        for (const k of this.keys) {
            if (k.collected) continue;
            // Reinicia estado de captura cada frame
            k.capturing = false;
            if (!this.isPointInLight(k.x, k.y)) continue;
            const d = Math.hypot(k.x - this.player.x, k.y - this.player.y);
            if (d < KEY_RADIUS) {
                // Si el jugador se mueve rápido, captura más lenta (incentivar quedarse quieto / defenderse)
                const speedPlayer = Math.hypot(this.player.vx, this.player.vy);
                const speedFactor = speedPlayer < 25 ? 1 : 0.4; // moverse reduce eficacia
                k.progress += CAPTURE_RATE * speedFactor * dt;
                k.capturing = true;
                if (k.progress >= 1) {
                    k.collected = true; this.player.keys += 1; k.progress = 1;
                    // Escalar dificultad inmediata al capturar llave
                    this.spawnInterval = Math.max(0.75, this.spawnInterval * 0.85);
                    this.spawnInterval = Math.max(1.0, this.spawnInterval * 0.92);
                    this.enemyScale = Math.min(2.0, this.enemyScale * 1.08);
                    this.spawnDifficultyAlertOnce('¡ALERTA! Llave capturada: más zombis acechan');
                    this.spawnBurst(Math.min(4, 2 + this.player.keys), 650, 1000);
                }
            } else {
                // Leve regresión si se aleja (no en luz cercana)
                if (k.progress > 0) k.progress = Math.max(0, k.progress - 0.25 * dt);
            }
        }
        // Aparece la salida al recoger 3 llaves (alejada del jugador)
        if (!this.exitSpawned && this.player.keys >= 3){
            const ex = this.spawnRandomExit();
            if (ex){ this.exit = {...ex, progress:0, capturing:false, required:1}; this.exitSpawned = true; this.spawnDifficultyAlertOnce('¡LA SALIDA HA APARECIDO! Captúrala bajo la luz.'); }
        }
        // Captura de la salida si existe
        if (this.exit){
            const EXIT_CAPTURE_RATE = 0.9 / 5; // 5× más lento que una llave
            const ex = this.exit; ex.capturing = false;
            const inExit = this.rectContainsPoint(ex, this.player.x, this.player.y);
            if (inExit && this.isRectInLight(ex)){
                const speedPlayer = Math.hypot(this.player.vx, this.player.vy);
                const speedFactor = speedPlayer < 25 ? 1 : 0.45;
                ex.progress += EXIT_CAPTURE_RATE * speedFactor * dt;
                ex.capturing = true;
                if (ex.progress >= ex.required){ ex.progress = ex.required; this.setVictory(); }
            } else {
                if (ex.progress > 0) ex.progress = Math.max(0, ex.progress - 0.15 * dt);
            }
        }

        // HUD
        const livesEl = document.getElementById('lives'); if (livesEl) livesEl.textContent = this.player.lives;
        const keysEl = document.getElementById('keys'); if (keysEl) keysEl.textContent = `${this.player.keys}/3`;
        const scoreEl = document.getElementById('score'); if (scoreEl) scoreEl.textContent = this.score;
    const threatEl = document.getElementById('threat'); if (threatEl) threatEl.textContent = this.threatLevel;
    },

    // Mantiene la cámara centrada en el jugador dentro de los límites del mundo
    updateCamera() {
        if (!this.player || !this.canvas) return;
        const halfW = this.canvas.width / 2;
        const halfH = this.canvas.height / 2;
        const maxX = Math.max(0, GAME_CONSTANTS.WORLD_WIDTH - this.canvas.width);
        const maxY = Math.max(0, GAME_CONSTANTS.WORLD_HEIGHT - this.canvas.height);
        const desiredX = this.player.x - halfW;
        const desiredY = this.player.y - halfH;
        this.cameraX = Math.max(0, Math.min(maxX, desiredX));
        this.cameraY = Math.max(0, Math.min(maxY, desiredY));
    },
    // --- RENDERIZADO (llamado por main.js/render) ---
    render(ctx) {
        if (this.currentState !== 'GAME') return;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Suelo con gradiente sutil para profundidad
        const floorGrad = ctx.createRadialGradient(this.canvas.width/2, this.canvas.height/2, 0, this.canvas.width/2, this.canvas.height/2, Math.max(this.canvas.width, this.canvas.height));
        floorGrad.addColorStop(0, '#161b22');
        floorGrad.addColorStop(1, COLORS.FLOOR);
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // Grid tenue del mundo (solo en pantalla)
        ctx.strokeStyle = COLORS.GRID; ctx.lineWidth = 1; ctx.globalAlpha = 0.12;
        const gridSize = 64;
        const startX = Math.floor(this.cameraX / gridSize) * gridSize;
        const startY = Math.floor(this.cameraY / gridSize) * gridSize;
        for (let x = startX; x <= this.cameraX + this.canvas.width; x += gridSize) {
            const sx = x - this.cameraX; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, this.canvas.height); ctx.stroke();
        }
        for (let y = startY; y <= this.cameraY + this.canvas.height; y += gridSize) {
            const sy = y - this.cameraY; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(this.canvas.width, sy); ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Paredes con textura
        for (const w of this.getWalls()) {
            const sx = w.x - this.cameraX, sy = w.y - this.cameraY;
            if (sx + w.w < 0 || sy + w.h < 0 || sx > this.canvas.width || sy > this.canvas.height) continue;
            // Base de la pared
            ctx.fillStyle = COLORS.WALL;
            ctx.fillRect(sx, sy, w.w, w.h);
            // Efecto de iluminación en bordes (simular relieve)
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(sx + 2, sy + 2, w.w - 4, w.h - 4);
            // Borde superior más claro
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(sx, sy, w.w, 3);
            // Líneas de textura (grietas/bloques)
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 1;
            const step = 32;
            for (let i = step; i < w.w; i += step) {
                ctx.beginPath();
                ctx.moveTo(sx + i, sy);
                ctx.lineTo(sx + i, sy + w.h);
                ctx.stroke();
            }
            for (let j = step; j < w.h; j += step) {
                ctx.beginPath();
                ctx.moveTo(sx, sy + j);
                ctx.lineTo(sx + w.w, sy + j);
                ctx.stroke();
            }
        }

        // Mancha/sangre de zombis muertos (sobre el suelo, bajo todo)
        if (this.splats && this.splats.length){
            this.drawSplats(ctx);
        }

        // Salida (visible al estar en luz) con efecto brillante
        if (this.exit && this.isRectInLight(this.exit)) {
            const sx = this.exit.x - this.cameraX, sy = this.exit.y - this.cameraY;
            const img = this.assets.exit;
            if (img) {
                // Brillo verde si tiene las 3 llaves
                if (this.player.keys >= 3) {
                    ctx.save();
                    const glow = 0.6 + Math.sin(Date.now() * 0.004) * 0.4;
                    ctx.globalAlpha = glow * 0.5;
                    ctx.fillStyle = '#48bb78';
                    ctx.fillRect(sx - 10, sy - 10, this.exit.w + 20, this.exit.h + 20);
                    ctx.restore();
                }
                ctx.drawImage(img, sx, sy, this.exit.w, this.exit.h);
            }
            else { ctx.fillStyle = COLORS.EXIT; ctx.fillRect(sx, sy, this.exit.w, this.exit.h); ctx.strokeStyle = COLORS.EXIT_STROKE; ctx.strokeRect(sx, sy, this.exit.w, this.exit.h); }
        }

        // Llaves (solo visibles en luz) con efecto de brillo
        for (const k of this.keys) {
            if (k.collected) continue;
            if (!this.isPointInLight(k.x, k.y)) continue;
            const sx = k.x - this.cameraX - 12, sy = k.y - this.cameraY - 12;
            // Aura dorada pulsante
            const pulse = 0.5 + Math.sin(Date.now() * 0.003) * 0.3;
            ctx.save();
            ctx.globalAlpha = pulse * 0.4;
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(k.x - this.cameraX, k.y - this.cameraY, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            // Sprite de la llave
            const img = this.assets.key;
            if (img) ctx.drawImage(img, sx, sy, 24, 24);
            else { ctx.fillStyle = COLORS.KEY; ctx.fillRect(sx + 12 - 4, sy + 12 - 2, 8, 4); ctx.fillRect(sx + 12, sy + 12 - 6, 10, 3); }
            // Anillo de progreso de captura
            if (k.progress > 0) {
                const cx = k.x - this.cameraX, cy = k.y - this.cameraY;
                const prog = Math.min(1, k.progress);
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(cx, cy, 20, -Math.PI/2, -Math.PI/2 + prog * Math.PI * 2);
                ctx.stroke();
                if (k.capturing) {
                    ctx.fillStyle = 'rgba(255,215,0,0.25)';
                    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI*2); ctx.fill();
                }
            }
        }

        // Entidades (enemigos solo en luz)
        this.enemies.forEach(e => {
            if (!this.isPointInLight(e.x, e.y)) return;
            const sx = e.x - this.cameraX, sy = e.y - this.cameraY;
            if (this.assets.zombie){
                const angle = Math.atan2(this.player.y - e.y, this.player.x - e.x);
                ctx.save(); ctx.translate(sx, sy); ctx.rotate(angle);
                ctx.drawImage(this.assets.zombie, -20, -20, 40, 40);
                ctx.restore();
            } else {
                e.draw(ctx, {x:this.cameraX, y:this.cameraY});
            }
        });
        this.bullets.forEach(b => b.draw(ctx, {x:this.cameraX, y:this.cameraY}));

        // Oscuridad con cono de luz bloqueado por paredes (destination-out)
        this.drawFOV(ctx);
        // Realce de visibilidad (sin jugador) según proximidad al origen de luz
        this.postLightEnhance(ctx);
        // Dibujar jugador ENCIMA de la luz siempre (evitar que la linterna lo tape)
        if (this.assets.player){
            const px = this.player.x - this.cameraX, py = this.player.y - this.cameraY;
            ctx.save(); ctx.translate(px, py); ctx.rotate(this.player.angle);
            ctx.drawImage(this.assets.player, -20, -20, 40, 40);
            ctx.restore();
        } else {
            this.player.draw(ctx, {x:this.cameraX, y:this.cameraY});
        }
        // Dibujar balas encima de la luz para máxima visibilidad (glow)
        this.drawBulletsOnTop(ctx);
    },

    drawFOV(ctx) {
        // Parámetros en mundo
        const pxW = this.player.x;
        const pyW = this.player.y;
        const r = GAME_CONSTANTS.PLAYER.FOV_RADIUS;
        const ang = GAME_CONSTANTS.PLAYER.FOV_ANGLE;
        const a0 = this.player.aimAngle - ang/2;
        const a1 = this.player.aimAngle + ang/2;

        // 1) Pintar oscuridad ligeramente más clara para mejor visibilidad
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalCompositeOperation = 'destination-out';

        // 2) Calcular polígono de visibilidad recortado por paredes usando raycasting
    const points = this.computeVisibilityCone(pxW, pyW, r, a0, a1);
    // Insertar el punto del jugador al inicio para evitar hueco
    if (points.length) points.unshift({x:pxW, y:pyW});
        if (points.length >= 2) {
            const px = pxW - this.cameraX;
            const py = pyW - this.cameraY;
            // Gradiente de la linterna (blanco puro cerca, desvanecido al final del radio)
            const grad = ctx.createRadialGradient(px, py, r*0.04, px, py, r);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
            grad.addColorStop(0.8, 'rgba(255,255,255,0.28)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;

            ctx.beginPath();
            ctx.moveTo(points[0].x - this.cameraX, points[0].y - this.cameraY);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x - this.cameraX, points[i].y - this.cameraY);
            }
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // 3) Re-oscurecer solo las paredes para que se vean inmutables (no se iluminan)
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        for (const w of this.getWalls()) {
            const sx = w.x - this.cameraX, sy = w.y - this.cameraY;
            if (sx + w.w < 0 || sy + w.h < 0 || sx > this.canvas.width || sy > this.canvas.height) continue;
            ctx.fillRect(sx, sy, w.w, w.h);
        }
        ctx.restore();
    },
    isPointInLight(x,y){
        const r = GAME_CONSTANTS.PLAYER.FOV_RADIUS;
        const ang = GAME_CONSTANTS.PLAYER.FOV_ANGLE;
        const a = Math.atan2(y - this.player.y, x - this.player.x);
        const da = Math.atan2(Math.sin(a - this.player.aimAngle), Math.cos(a - this.player.aimAngle));
        const dist = Math.hypot(x - this.player.x, y - this.player.y);
        if (Math.abs(da) > ang/2 || dist > r) return false;
        
        // Raycast para oclusión de paredes
        return !this.rayHitsWall(this.player.x, this.player.y, x, y);
    },

    // Factor [0..1] de visibilidad en luz según distancia al jugador
    lightFactorAt(x,y){
        if (!this.isPointInLight(x,y)) return 0;
        const r = GAME_CONSTANTS.PLAYER.FOV_RADIUS;
        const dist = Math.hypot(x - this.player.x, y - this.player.y);
        let f = 1 - (dist / r); // cerca -> 1, lejos -> 0
        f = Math.max(0, Math.min(1, Math.pow(f, 0.6))); // curva suave
        return f;
    },

    // Segunda pasada: acentuar enemigos en luz en función de la cercanía a la linterna
    postLightEnhance(ctx){
        ctx.save();
        // usar composición normal; el brillo se consigue con filter y alpha
        for (const e of this.enemies){
            const f = this.lightFactorAt(e.x, e.y);
            if (f <= 0) continue;
            const sx = e.x - this.cameraX, sy = e.y - this.cameraY;
            if (this.assets.zombie){
                const angle = Math.atan2(this.player.y - e.y, this.player.x - e.x);
                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(angle);
                ctx.globalAlpha = 0.25 + 0.55 * f;
                ctx.filter = `brightness(${1 + 1.2*f}) saturate(${1 + 0.8*f})`;
                ctx.drawImage(this.assets.zombie, -20, -20, 40, 40);
                ctx.restore();
            } else {
                // fallback: un halo suave sobre el enemigo
                const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, e.r*2);
                g.addColorStop(0, `rgba(255,255,255,${0.35+0.45*f})`);
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(sx, sy, e.r*2.2, 0, Math.PI*2); ctx.fill();
            }
        }
        // (Jugador sin realce: eliminado)
        // Keys realce
        for (const k of this.keys){
            if (k.collected) continue;
            const kf = this.lightFactorAt(k.x, k.y);
            if (kf <= 0) continue;
            const cx = k.x - this.cameraX, cy = k.y - this.cameraY;
            if (this.assets.key){
                ctx.save();
                ctx.globalAlpha = 0.35 + 0.55*kf;
                ctx.filter = `brightness(${1 + 1.1*kf}) saturate(${1 + 0.6*kf})`;
                ctx.drawImage(this.assets.key, cx-12, cy-12, 24, 24);
                ctx.restore();
            } else {
                const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 24);
                g.addColorStop(0, `rgba(255,215,0,${0.4+0.5*kf})`);
                g.addColorStop(1, 'rgba(255,215,0,0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI*2); ctx.fill();
            }
        }
        // Exit realce (solo si está iluminada). Si captura en progreso, anillo de progreso.
        if (this.isRectInLight(this.exit)){
            const exf = this.lightFactorAt(this.exit.x + this.exit.w/2, this.exit.y + this.exit.h/2);
            if (exf > 0){
                const sx = this.exit.x - this.cameraX, sy = this.exit.y - this.cameraY;
                if (this.assets.exit){
                    ctx.save();
                    ctx.globalAlpha = 0.3 + 0.5*exf;
                    ctx.filter = `brightness(${1 + 0.8*exf}) saturate(${1 + 0.4*exf})`;
                    ctx.drawImage(this.assets.exit, sx, sy, this.exit.w, this.exit.h);
                    ctx.restore();
                } else {
                    const cx = sx + this.exit.w/2, cy = sy + this.exit.h/2;
                    const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(this.exit.w, this.exit.h));
                    g.addColorStop(0, `rgba(72,187,120,${0.35+0.4*exf})`);
                    g.addColorStop(1, 'rgba(72,187,120,0)');
                    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, this.exit.w*0.7, 0, Math.PI*2); ctx.fill();
                }
                // Anillo de captura de salida si las llaves están completas
                if (this.player.keys >= 3 && this.exit.progress > 0){
                    const cx = this.exit.x + this.exit.w/2 - this.cameraX;
                    const cy = this.exit.y + this.exit.h/2 - this.cameraY;
                    const prog = Math.min(1, this.exit.progress / this.exit.required);
                    ctx.save();
                    ctx.lineWidth = 6;
                    ctx.strokeStyle = '#48bb78';
                    ctx.beginPath();
                    ctx.arc(cx, cy, Math.max(this.exit.w, this.exit.h)*0.65, -Math.PI/2, -Math.PI/2 + prog * Math.PI * 2);
                    ctx.stroke();
                    if (this.exit.capturing){
                        ctx.globalAlpha = 0.20;
                        ctx.fillStyle = '#48bb78';
                        ctx.beginPath(); ctx.arc(cx, cy, Math.max(this.exit.w, this.exit.h)*0.68, 0, Math.PI*2); ctx.fill();
                    }
                    ctx.restore();
                }
            }
        }
        ctx.filter = 'none';
        ctx.restore();
    },

    isRectInLight(rect){
        // usa el centro del rectángulo como referencia
        const cx = rect.x + rect.w/2, cy = rect.y + rect.h/2;
        return this.isPointInLight(cx, cy);
    },
    
    // Dibuja el mapa base (simulación)
    drawMap(ctx) {
        const TILE = GAME_CONSTANTS.TILE_SIZE;
        const MAP_W = GAME_CONSTANTS.MAP_WIDTH * TILE;
        const MAP_H = GAME_CONSTANTS.MAP_HEIGHT * TILE;
        
        // Fondo general (lo que se vería a través de la cuadrícula)
        ctx.fillStyle = '#111'; 
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Dibujar el mapa del juego (cuadrícula de tiles)
        for (let y = 0; y < GAME_CONSTANTS.MAP_HEIGHT; y++) {
            for (let x = 0; x < GAME_CONSTANTS.MAP_WIDTH; x++) {
                const screenX = (x * TILE) - this.offsetX;
                const screenY = (y * TILE) - this.offsetY;
                
                // Si el tile está en pantalla
                if (screenX + TILE > 0 && screenX < this.canvas.width &&
                    screenY + TILE > 0 && screenY < this.canvas.height) {
                    
                    const isObstacle = this.tileGrid[y][x] === 1;
                    
                    ctx.fillStyle = isObstacle ? '#444' : '#283'; // Gris oscuro para obstáculos/Negro para libre
                    ctx.fillRect(screenX, screenY, TILE, TILE);
                    ctx.strokeStyle = '#333';
                    ctx.strokeRect(screenX, screenY, TILE, TILE);
                }
            }
        }
    },

    // Spawn múltiple en anillo alrededor del jugador, fuera de la luz
    spawnBurst(count, minDist=650, maxDist=1000) {
        for (let n = 0; n < count; n++) {
            if (this.enemies.length >= this.maxEnemies) break;
            const ang = Math.random() * Math.PI * 2;
            const dist = minDist + Math.random() * (maxDist - minDist);
            const x = this.player.x + Math.cos(ang) * dist;
            const y = this.player.y + Math.sin(ang) * dist;
            if (x < 60 || y < 60 || x > GAME_CONSTANTS.WORLD_WIDTH - 60 || y > GAME_CONSTANTS.WORLD_HEIGHT - 60) { n--; continue; }
            if (this.isPointInLight(x, y)) { n--; continue; }
            let insideWall = false;
            for (const w of this.getWalls()) { if (this.rectContainsPoint(w, x, y)) { insideWall = true; break; } }
            if (insideWall) { n--; continue; }
            this.enemies.push(new Enemy(x, y));
        }
    },

    spawnEnemy() {
        if (this.enemies.length >= this.maxEnemies) return;
        // Spawnear lejos y fuera del cono de luz
        const attempts = 25;
        for (let i=0;i<attempts;i++){
            const x = 40 + Math.random()*(GAME_CONSTANTS.WORLD_WIDTH-80);
            const y = 40 + Math.random()*(GAME_CONSTANTS.WORLD_HEIGHT-80);
            const dist = Math.hypot(x - this.player.x, y - this.player.y);
            if (dist < GAME_CONSTANTS.ENEMY.MIN_SPAWN_DIST) continue;
            if (this.isPointInLight(x,y)) continue; // evitar luz
            // evitar spawnear dentro de pared
            let insideWall = false;
            for (const w of this.getWalls()){ if (this.rectContainsPoint(w, x, y)) { insideWall = true; break; } }
            if (insideWall) continue;
            this.enemies.push(new Enemy(x, y));
            break;
        }
    },

    damagePlayer(amount){
        // Quitar vidas directamente; la cadencia de contacto se controla con contactTimer
        this.player.lives -= amount;
        if (this.player.lives <= 0){
            this.setGameOver('HAS SIDO DEVORADO EN LA CRIPTA');
        }
    },

    setGameOver(message){
        const title = document.querySelector('#gameover-screen h1');
        const desc = document.querySelector('#gameover-screen p');
        if (title) title.textContent = 'PROTOCOLO FALLIDO';
        if (desc) desc.textContent = message || 'Has sucumbido en la cripta. ¿Intentar de nuevo?';
        this.setState('GAMEOVER');
    },

    setVictory(){
        const title = document.querySelector('#gameover-screen h1');
        const desc = document.querySelector('#gameover-screen p');
        if (title) title.textContent = 'VICTORIA: AMANECER ENTRE SOMBRAS';
        if (desc) desc.textContent = 'Has encontrado las 3 llaves y escapado de la instalación.';
        this.setState('VICTORY');
    },

    // Crear alerta visual (capa superior)
    spawnDifficultyAlert(message){
        const layer = document.getElementById('alert-layer');
        if (!layer) return;
        const div = document.createElement('div');
        div.className = 'game-alert';
        div.textContent = message;
        layer.appendChild(div);
        setTimeout(()=>{div.remove();}, 2500);
    },

    // Utilidades de colisiones y geometría
    rectContainsPoint(r, x, y){ return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; },
    circleRectOverlap(cx, cy, cr, r){
        const nx = Math.max(r.x, Math.min(cx, r.x + r.w));
        const ny = Math.max(r.y, Math.min(cy, r.y + r.h));
        const dx = cx - nx, dy = cy - ny;
        return (dx*dx + dy*dy) < (cr*cr);
    },
    resolveEntityVsWalls(ent, radius){
        for (const w of this.getWalls()){
            if (!this.circleRectOverlap(ent.x, ent.y, radius, w)) continue;
            // empujar fuera por el eje mínimo
            const left = ent.x - (w.x);
            const right = (w.x + w.w) - ent.x;
            const top = ent.y - (w.y);
            const bottom = (w.y + w.h) - ent.y;
            const minX = Math.min(left, right);
            const minY = Math.min(top, bottom);
            if (minX < minY){ // resolver por X
                if (left < right) ent.x = w.x - radius; else ent.x = w.x + w.w + radius;
            } else {
                if (top < bottom) ent.y = w.y - radius; else ent.y = w.y + w.h + radius;
            }
        }
        // clamp mundo
        ent.x = Math.max(40, Math.min(GAME_CONSTANTS.WORLD_WIDTH-40, ent.x));
        ent.y = Math.max(40, Math.min(GAME_CONSTANTS.WORLD_HEIGHT-40, ent.y));
    },
    // línea (bala) vs círculo (enemigo)
    lineHitsCircle(bullet, enemy){
        // segmento desde cola a cabeza
        const hx = bullet.x, hy = bullet.y;
        const tx = hx - bullet.dx * bullet.length;
        const ty = hy - bullet.dy * bullet.length;
        // proyección del centro del círculo en la línea
        const vx = hx - tx, vy = hy - ty;
        const wx = enemy.x - tx, wy = enemy.y - ty;
        const c1 = vx * wx + vy * wy;
        const c2 = vx * vx + vy * vy;
        let t = c1 / c2; t = Math.max(0, Math.min(1, t));
        const px = tx + t * vx, py = ty + t * vy;
        const dist = Math.hypot(enemy.x - px, enemy.y - py);
        return dist <= enemy.r;
    },
    
    // Raycast simple para detectar si un segmento de jugador a punto intersecta paredes
    rayHitsWall(x0, y0, x1, y1) {
        for (const w of this.getWalls()) {
            if (this.lineIntersectsRect(x0, y0, x1, y1, w)) return true;
        }
        return false;
    },
    
    // Intersección segmento-rectángulo (algoritmo de Liang-Barsky simplificado)
    lineIntersectsRect(x0, y0, x1, y1, rect) {
        const dx = x1 - x0, dy = y1 - y0;
        const rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
        // Comprobar cada borde del rectángulo
        if (this.segmentIntersectsSegment(x0, y0, x1, y1, rx, ry, rx+rw, ry)) return true; // top
        if (this.segmentIntersectsSegment(x0, y0, x1, y1, rx, ry+rh, rx+rw, ry+rh)) return true; // bottom
        if (this.segmentIntersectsSegment(x0, y0, x1, y1, rx, ry, rx, ry+rh)) return true; // left
        if (this.segmentIntersectsSegment(x0, y0, x1, y1, rx+rw, ry, rx+rw, ry+rh)) return true; // right
        // Comprobar si el inicio está dentro del rectángulo
        if (x0 >= rx && x0 <= rx+rw && y0 >= ry && y0 <= ry+rh) return true;
        return false;
    },
    
    // Intersección segmento-segmento
    segmentIntersectsSegment(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
        if (Math.abs(denom) < 1e-10) return false;
        const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom;
        const u = -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / denom;
        return (t >= 0 && t <= 1 && u >= 0 && u <= 1);
    },

    // --- VISIBILIDAD DE LUZ: polígono recortado por paredes ---
    computeVisibilityCone(px, py, radius, a0, a1) {
        // Muestras de rayos a lo largo del ángulo [a0,a1]
        const SAMPLES = 96; // rendimiento/calidad
        const points = [];
        // Asegurar orden a0->a1 manejando wrap
        const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
        let start = wrap(a0), end = wrap(a1);
        // Si cruza el -PI/PI, ajustar para iterar correctamente
        if (end < start) end += Math.PI * 2;
        for (let i = 0; i <= SAMPLES; i++) {
            const t = i / SAMPLES;
            const ang = start + (end - start) * t;
            const a = wrap(ang);
            const p = this.castRayToWalls(px, py, a, radius);
            points.push(p);
        }
        return points;
    },

    castRayToWalls(px, py, angle, maxDist) {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const endX = px + dx * maxDist;
        const endY = py + dy * maxDist;
        let nearest = { x: endX, y: endY, dist: maxDist };
        // Probar con cada pared y cada borde
        const checkSeg = (x3,y3,x4,y4) => {
            const hit = this.raySegmentIntersection(px, py, dx, dy, x3, y3, x4, y4);
            if (hit && hit.t >= 0 && hit.t <= maxDist && hit.t < nearest.dist) {
                // retroceder un poco antes del borde para que la luz no "forre" la pared
                const EPS = 1.5;
                const tClamped = Math.max(0, hit.t - EPS);
                nearest = { x: px + dx * tClamped, y: py + dy * tClamped, dist: tClamped };
            }
        };
        for (const w of this.getWalls()) {
            checkSeg(w.x, w.y, w.x + w.w, w.y); // top
            checkSeg(w.x, w.y + w.h, w.x + w.w, w.y + w.h); // bottom
            checkSeg(w.x, w.y, w.x, w.y + w.h); // left
            checkSeg(w.x + w.w, w.y, w.x + w.w, w.y + w.h); // right
        }
        return { x: nearest.x, y: nearest.y };
    },

    // --- Alertas con deduplicación ---
    spawnDifficultyAlertOnce(message){
        const now = performance.now ? performance.now() : Date.now();
        const last = this.lastAlerts[message] || 0;
        if (now - last < this.alertCooldownMs) return;
        this.lastAlerts[message] = now;
        this.spawnDifficultyAlert(message);
    },

    // --- Laberinto y posiciones aleatorias ---
    getWalls(){ return this.walls && this.walls.length ? this.walls : MAP.walls; },

    getMazeStartPosition(){
        // Centro de la segunda celda para evitar bordes
        const cell = 64; const margin = 40;
        return { x: margin + cell*1 + cell/2, y: margin + cell*1 + cell/2 };
    },

    generateMazeWalls(){
        const margin = 40; // borde exterior coherente con colisiones
        const cell = 64; // tamaño de celda (pasillo)
        const cols = Math.floor((GAME_CONSTANTS.WORLD_WIDTH - margin*2) / cell);
        const rows = Math.floor((GAME_CONSTANTS.WORLD_HEIGHT - margin*2) / cell);
        // Asegurar impares para algoritmo
        const W = cols % 2 === 0 ? cols-1 : cols;
        const H = rows % 2 === 0 ? rows-1 : rows;
        const grid = Array.from({length:H}, ()=> Array(W).fill(1)); // 1=pared, 0=pasillo
        const inBounds = (x,y)=> x>0 && y>0 && x<W-1 && y<H-1;
        // Carvar con DFS
        const stack = [];
        let cx = 1, cy = 1; grid[cy][cx]=0; stack.push([cx,cy]);
        const dirs = [[2,0],[-2,0],[0,2],[0,-2]];
        while (stack.length){
            const [x,y] = stack[stack.length-1];
            // barajar dirs
            for (let i=dirs.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [dirs[i],dirs[j]]=[dirs[j],dirs[i]]; }
            let carved=false;
            for (const [dx,dy] of dirs){
                const nx = x+dx, ny=y+dy;
                if (inBounds(nx,ny) && grid[ny][nx]===1){
                    grid[y+dy/2][x+dx/2]=0; grid[ny][nx]=0; stack.push([nx,ny]); carved=true; break;
                }
            }
            if (!carved) stack.pop();
        }
        // Convertir celdas de pared a rectángulos
        const walls=[];
        // Borde exterior grueso
        walls.push({x:0,y:0,w:GAME_CONSTANTS.WORLD_WIDTH,h:margin});
        walls.push({x:0,y:GAME_CONSTANTS.WORLD_HEIGHT-margin,w:GAME_CONSTANTS.WORLD_WIDTH,h:margin});
        walls.push({x:0,y:0,w:margin,h:GAME_CONSTANTS.WORLD_HEIGHT});
        walls.push({x:GAME_CONSTANTS.WORLD_WIDTH-margin,y:0,w:margin,h:GAME_CONSTANTS.WORLD_HEIGHT});
        for (let y=0;y<H;y++){
            for (let x=0;x<W;x++){
                if (grid[y][x]===1){
                    walls.push({
                        x: margin + x*cell,
                        y: margin + y*cell,
                        w: cell,
                        h: cell
                    });
                }
            }
        }
        return walls;
    },

    // Utilidades de ubicación aleatoria seguras
    pointInsideAnyWall(x,y){
        for (const w of this.getWalls()){
            if (this.rectContainsPoint(w,x,y)) return true;
        }
        return false;
    },
    rectOverlapsAnyWall(rect){
        for (const w of this.getWalls()){
            if (!(rect.x+rect.w < w.x || rect.x > w.x+w.w || rect.y+rect.h < w.y || rect.y > w.y+w.h)) return true;
        }
        return false;
    },
    randomClearPoint(minX=60,minY=60,maxX=GAME_CONSTANTS.WORLD_WIDTH-60,maxY=GAME_CONSTANTS.WORLD_HEIGHT-60){
        for (let i=0;i<200;i++){
            const x = minX + Math.random()*(maxX-minX);
            const y = minY + Math.random()*(maxY-minY);
            if (this.pointInsideAnyWall(x,y)) continue;
            return {x,y};
        }
        return null;
    },
    spawnRandomKeys(n){
        const keys=[];
        const MIN_DIST_PLAYER = 600;
        const MIN_DIST_BETWEEN = 700;
        while (keys.length < n){
            const p = this.randomClearPoint();
            if (!p) break;
            const dPlayer = Math.hypot(p.x - this.player.x, p.y - this.player.y);
            if (dPlayer < MIN_DIST_PLAYER) continue;
            let ok = true;
            for (const k of keys){ if (Math.hypot(p.x-k.x, p.y-k.y) < MIN_DIST_BETWEEN) { ok=false; break; } }
            if (!ok) continue;
            keys.push({x:p.x, y:p.y, collected:false, progress:0, capturing:false});
        }
        return keys;
    },
    spawnRandomExit(){
        const EXIT_W=100, EXIT_H=80;
        for (let i=0;i<200;i++){
            const p = this.randomClearPoint();
            if (!p) break;
            const rect = { x: p.x-EXIT_W/2, y: p.y-EXIT_H/2, w: EXIT_W, h: EXIT_H };
            if (this.rectOverlapsAnyWall(rect)) continue;
            const dPlayer = Math.hypot((rect.x+rect.w/2)-this.player.x, (rect.y+rect.h/2)-this.player.y);
            if (dPlayer < 1000) continue; // no cerca del jugador
            return rect;
        }
        return null;
    },

    // Capa de manchas de muerte
    drawSplats(ctx){
        for (const s of this.splats){
            const sx = s.x - this.cameraX, sy = s.y - this.cameraY;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(s.rot);
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = 'rgba(110, 20, 20, 0.6)';
            // Dibujar varios círculos irregulares
            for (let i=0;i<s.blobs;i++){
                const ang = (Math.PI*2) * (i/s.blobs) + s.seed*i*0.3;
                const rx = Math.cos(ang) * s.r * (0.3 + Math.random()*0.7);
                const ry = Math.sin(ang) * s.r * (0.3 + Math.random()*0.7);
                const rr = s.r*0.3 + Math.random()*s.r*0.4;
                ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI*2); ctx.fill();
            }
            ctx.restore();
        }
    },

    // Intersección RAYO (px,py + t*(dx,dy)) con segmento (x3,y3)-(x4,y4)
    raySegmentIntersection(px, py, dx, dy, x3, y3, x4, y4) {
        // r = (dx,dy); s = (x4-x3, y4-y3)
        const rx = dx, ry = dy;
        const sx = x4 - x3, sy = y4 - y3;
        const rxs = rx * sy - ry * sx;
        if (Math.abs(rxs) < 1e-8) return null; // paralelos
        const qpx = x3 - px, qpy = y3 - py;
        const t = (qpx * sy - qpy * sx) / rxs; // distancia sobre rayo
        const u = (qpx * ry - qpy * rx) / rxs; // parámetro del segmento
        if (t >= 0 && u >= 0 && u <= 1) return { t };
        return null;
    },
    
    // Añadir una mancha de muerte persistente
    addSplat(x,y){
        if (!this.splats) this.splats = [];
        const enemyColor = COLORS.ENEMY;
        const splat = {
            x, y,
            r: 16 + Math.random()*18,
            blobs: 6 + Math.floor(Math.random()*4),
            rot: Math.random()*Math.PI*2,
            seed: Math.random()*2,
            color: enemyColor,
            born: performance.now ? performance.now() : Date.now(),
            life: 900 // ms
        };
        this.splats.push(splat);
        // limpiar los expirados
        const now = performance.now ? performance.now() : Date.now();
        this.splats = this.splats.filter(s => now - s.born < s.life);
        if (this.splats.length > 120) this.splats.shift();
    },
    drawBulletsOnTop(ctx){
        for (const b of this.bullets){
            const hx = b.x - this.cameraX;
            const hy = b.y - this.cameraY;
            const tx = hx - b.dx * b.length;
            const ty = hy - b.dy * b.length;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = '#ffdd57';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
            // pequeño destello frontal
            const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 10);
            g.addColorStop(0,'rgba(255,221,87,0.9)');
            g.addColorStop(1,'rgba(255,221,87,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, 10, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    },
    
    drawSplats(ctx){
        const now = performance.now ? performance.now() : Date.now();
        for (const s of this.splats){
            const age = now - s.born;
            const alpha = 0.6 * (1 - age / s.life);
            if (alpha <= 0) continue;
            const sx = s.x - this.cameraX, sy = s.y - this.cameraY;
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.rot);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = s.color;
            for (let i=0;i<s.blobs;i++){
                const ang = (Math.PI*2) * (i/s.blobs) + s.seed*i*0.25;
                const rx = Math.cos(ang) * s.r * (0.3 + (i%2)*0.4);
                const ry = Math.sin(ang) * s.r * (0.3 + ((i+1)%2)*0.4);
                const rr = s.r*0.25 + Math.random()*s.r*0.25;
                ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI*2); ctx.fill();
            }
            ctx.restore();
        }
        // retirar expirados
        this.splats = this.splats.filter(s => now - s.born < s.life);
    },

    // --- PRNG determinístico para laberinto ---
    seedStringToInt(str){ let h=0; for (let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; } return h; },
    seededRandomFactory(seed){
        let s = seed >>> 0;
        return () => { // xorshift32
            s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s = s >>> 0; return (s & 0xffffffff) / 0x100000000; };
    },
    generateMazeWallsSeeded(seedStr){
        const margin = 40; const cell = 64;
        const cols = Math.floor((GAME_CONSTANTS.WORLD_WIDTH - margin*2) / cell);
        const rows = Math.floor((GAME_CONSTANTS.WORLD_HEIGHT - margin*2) / cell);
        const W = cols % 2 === 0 ? cols-1 : cols; const H = rows % 2 === 0 ? rows-1 : rows;
        const grid = Array.from({length:H}, ()=> Array(W).fill(1));
        const inBounds = (x,y)=> x>0 && y>0 && x<W-1 && y<H-1;
        const rand = this.seededRandomFactory(this.seedStringToInt(seedStr));
        const stack=[]; let cx=1, cy=1; grid[cy][cx]=0; stack.push([cx,cy]);
        const dirs=[[2,0],[-2,0],[0,2],[0,-2]];
        while(stack.length){
            const [x,y]=stack[stack.length-1];
            for (let i=dirs.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [dirs[i],dirs[j]]=[dirs[j],dirs[i]]; }
            let carved=false;
            for (const [dx,dy] of dirs){
                const nx=x+dx, ny=y+dy;
                if (inBounds(nx,ny) && grid[ny][nx]===1){
                    grid[y+dy/2][x+dx/2]=0; grid[ny][nx]=0; stack.push([nx,ny]); carved=true; break;
                }
            }
            if (!carved) stack.pop();
        }
        const walls=[];
        walls.push({x:0,y:0,w:GAME_CONSTANTS.WORLD_WIDTH,h:margin});
        walls.push({x:0,y:GAME_CONSTANTS.WORLD_HEIGHT-margin,w:GAME_CONSTANTS.WORLD_WIDTH,h:margin});
        walls.push({x:0,y:0,w:margin,h:GAME_CONSTANTS.WORLD_HEIGHT});
        walls.push({x:GAME_CONSTANTS.WORLD_WIDTH-margin,y:0,w:margin,h:GAME_CONSTANTS.WORLD_HEIGHT});
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (grid[y][x]===1) walls.push({x:margin + x*cell, y:margin + y*cell, w:cell, h:cell});
        return walls;
    },
    
    removeUnit(unit) {
        this.units = this.units.filter(u => u.id !== unit.id);
        this.selectedUnits = this.selectedUnits.filter(u => u.id !== unit.id);
    },
    
    // Devuelve la cuadrícula de tiles actual con obstáculos dinámicos
    getTileGrid() {
        let grid = JSON.parse(JSON.stringify(this.tileGrid)); // Copia profunda
        
        // Marcar obstáculos dinámicos (otras unidades/edificios)
        this.units.forEach(unit => {
            if (unit.def.type === 'building' && unit.def.dimensions) {
                for (let dy = 0; dy < unit.def.dimensions.h; dy++) {
                    for (let dx = 0; dx < unit.def.dimensions.w; dx++) {
                        grid[Math.floor(unit.y) + dy][Math.floor(unit.x) + dx] = 1;
                    }
                }
            } else {
                // Marcar el tile de unidades simples como obstruido
                grid[Math.floor(unit.y)][Math.floor(unit.x)] = 1;
            }
        });
        return grid;
    },

    // --- MANEJO DE INPUT Y SELECCIÓN ---
    // Maneja la selección por clic
    handleLeftClick(coords) {
        this.clearSelection();
        const clickedUnit = this.getUnitAt(coords.gameX, coords.gameY);
        if (clickedUnit && clickedUnit.team === 'blue') {
            this.selectUnit(clickedUnit);
        }
    },
    
    // Maneja el envío de órdenes con clic derecho/doble toque
    handleRightClick(coords) {
        if (this.selectedUnits.length === 0) return;
        
        const targetUnit = this.getUnitAt(coords.gameX, coords.gameY);
        const targetTile = { 
            x: coords.gameX / GAME_CONSTANTS.TILE_SIZE, 
            y: coords.gameY / GAME_CONSTANTS.TILE_SIZE
        };
        
        // 1. Si hay una unidad enemiga, ATACAR
        if (targetUnit && targetUnit.team !== 'blue') {
            this.selectedUnits.forEach(unit => unit.setOrder({ type: 'HUNT', target: targetUnit }));
            this.showMessage('ORDEN', 'Atacar objetivo.');
        // 2. Si es el terreno, MOVER
        } else if (!targetUnit) {
            this.selectedUnits.forEach(unit => unit.setOrder({ type: 'MOVE', target: targetTile }));
            this.showMessage('ORDEN', 'Movimiento.');
        }
    },
    
    // Maneja la selección por arrastre
    handleDragSelection(start, end) {
        this.clearSelection();
        
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        
        this.units.forEach(unit => {
            const unitWorldX = unit.x * GAME_CONSTANTS.TILE_SIZE;
            const unitWorldY = unit.y * GAME_CONSTANTS.TILE_SIZE;
            
            if (unit.team === 'blue' && unitWorldX >= minX && unitWorldX <= maxX && unitWorldY >= minY && unitWorldY <= maxY) {
                this.selectUnit(unit);
            }
        });
    },

    selectUnit(unit) {
        unit.selected = true;
        this.selectedUnits.push(unit);
    },
    
    clearSelection() {
        this.selectedUnits.forEach(unit => unit.selected = false);
        this.selectedUnits = [];
    },
    
    getUnitAt(worldX, worldY) {
        const TILE = GAME_CONSTANTS.TILE_SIZE;
        const tileX = Math.floor(worldX / TILE);
        const tileY = Math.floor(worldY / TILE);
        
        // Buscar en el tile clickeado
        return this.units.find(unit => 
            Math.floor(unit.x) === tileX && 
            Math.floor(unit.y) === tileY
        );
    },
    
    getNearestEnemy(unit) {
        const enemyTeam = unit.team === 'blue' ? 'green' : 'blue';
        let nearest = null;
        let minDist = Infinity;
        
        this.units.forEach(u => {
            if (u.team === enemyTeam) {
                const dist = this.getDistance(unit, u);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = u;
                }
            }
        });
        return nearest;
    },

    getDistance(u1, u2) {
        return Math.sqrt(Math.pow(u1.x - u2.x, 2) + Math.pow(u1.y - u2.y, 2));
    },
    
    // Habilita/Deshabilita botones en el HUD
    updateCommandPanel() {},

    // --- TRIGGERS Y CONDICIONES ---
    checkGameTriggers() {},
    
    checkWinLossConditions() {},
    
    // --- MENSAJES UI ---
    showMessage(from, message) {
        console.log(`[${from}] ${message}`);
        
        // Crear un mensaje temporal en pantalla
        const msgDiv = document.createElement('div');
        msgDiv.style.position = 'fixed';
        msgDiv.style.top = '20px';
        msgDiv.style.left = '50%';
        msgDiv.style.transform = 'translateX(-50%)';
        msgDiv.style.background = 'rgba(0, 0, 0, 0.8)';
        msgDiv.style.color = 'white';
        msgDiv.style.padding = '10px 20px';
        msgDiv.style.borderRadius = '5px';
        msgDiv.style.zIndex = '1000';
        msgDiv.style.fontFamily = 'monospace';
        msgDiv.textContent = `[${from}] ${message}`;
        
        document.body.appendChild(msgDiv);
        
        setTimeout(() => {
            msgDiv.remove();
        }, 3000);
    },

    showLeaderboard() {
        this.showMessage('INFO', 'Leaderboard no implementado aún.');
    }
};

// Exponer Game al ámbito global para main.js
window.Game = window.Game;