import { GAME_CONSTANTS, COLORS } from './level_data.js';
import { Audio } from './audio.js';

/**
 * Entidad controlada por el jugador.
 * Encapsula la posición, movimiento, disparo y dibujo del soldado.
 */
export class Player {
  /**
   * @param {number} x posición inicial en el mundo (px)
   * @param {number} y posición inicial en el mundo (px)
   */
  constructor(x, y) {
    this.x = x; this.y = y;
    this.lives = 3;
    this.invuln = 0;
    this.angle = 0;
    this.aimAngle = 0;
    this.fireCooldown = 0;
    this.keys = 0;
    this.vx = 0; this.vy = 0;
    this.width = 42;
    this.height = 42;
  }
  /**
   * Actualiza movimiento, orientación, puntería y disparos del jugador.
   * @param {number} dt     delta de tiempo en segundos.
   * @param {import('./input.js').Input} input módulo de entrada compartido.
   * @param {Bullet[]} bullets array de balas activas donde se añaden disparos.
   * @param {{x:number,y:number}} camera offset actual de la cámara.
   */
  update(dt, input, bullets, camera) {
    const maxSpeed = GAME_CONSTANTS.PLAYER.SPEED;
    let ix = 0, iy = 0;
    if (input.keys.has('w') || input.keys.has('arrowup')) iy -= 1;
    if (input.keys.has('s') || input.keys.has('arrowdown')) iy += 1;
    if (input.keys.has('a') || input.keys.has('arrowleft')) ix -= 1;
    if (input.keys.has('d') || input.keys.has('arrowright')) ix += 1;
    const len = Math.hypot(ix, iy) || 1;
    const ax = (ix/len) * (maxSpeed * 6);
    const ay = (iy/len) * (maxSpeed * 6);
    const damping = 6;
    this.vx += (ax - this.vx * damping) * dt;
    this.vy += (ay - this.vy * damping) * dt;
    const vlen = Math.hypot(this.vx, this.vy);
    if (vlen > maxSpeed) { this.vx = (this.vx / vlen) * maxSpeed; this.vy = (this.vy / vlen) * maxSpeed; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.x = Math.max(40, Math.min(GAME_CONSTANTS.WORLD_WIDTH - 40, this.x));
    this.y = Math.max(40, Math.min(GAME_CONSTANTS.WORLD_HEIGHT - 40, this.y));

    const moving = Math.hypot(this.vx, this.vy) > 10;
    if (moving) {
      const targetAngle = Math.atan2(this.vy, this.vx);
      let diff = targetAngle - this.angle;
      while (diff > Math.PI) diff -= 2*Math.PI;
      while (diff < -Math.PI) diff += 2*Math.PI;
      this.angle += diff * 8 * dt;
    }

    const m = input.getMouseWorld(camera.x, camera.y);
    this.aimAngle = Math.atan2(m.y - this.y, m.x - this.x);

    // Disparo
    this.fireCooldown -= dt;
    const rate = 1 / GAME_CONSTANTS.PLAYER.BULLET_RATE;
    if (input.mouse.down && this.fireCooldown <= 0) {
      this.fireCooldown = rate;
      const speedB = GAME_CONSTANTS.PLAYER.BULLET_SPEED;
      const dirx = Math.cos(this.aimAngle), diry = Math.sin(this.aimAngle);
      const muzzleX = this.x + dirx * 14;
      const muzzleY = this.y + diry * 6;
      bullets.push(new Bullet(muzzleX, muzzleY, dirx, diry, speedB, GAME_CONSTANTS.PLAYER.BULLET_DAMAGE));
      try { Audio.playShoot(); } catch (_) {}
    }

    if (this.invuln > 0) this.invuln -= dt;
  }
  /**
   * Dibuja al jugador relativo a la cámara, incluyendo halo de invulnerabilidad.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number,y:number}} camera
   */
  draw(ctx, camera) {
    const sxWorld = this.x - camera.x;
    const syWorld = this.y - camera.y;
    ctx.fillStyle = COLORS.PLAYER;
    ctx.beginPath();
    ctx.arc(sxWorld, syWorld, 18, 0, Math.PI*2);
    ctx.fill();
    if (this.invuln > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(sxWorld, syWorld, 24, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
}

/**
 * Entidad enemiga básica (zombie).
 * Se mueve hacia el jugador, puede morir y se dibuja con forma vectorial.
 */
export class Enemy {
  /**
   * @param {number} x posición inicial del enemigo.
   * @param {number} y posición inicial del enemigo.
   * @param {number} [variant=0] variante visual (reservado para futuros usos).
   */
  constructor(x, y, variant = 0) {
    this.x = x; this.y = y; this.hp = GAME_CONSTANTS.ENEMY.HP;
    this.state = 'alive';
    this.deathTimer = 0;
    this.r = GAME_CONSTANTS.ENEMY.RADIUS;
    this.variant = variant;
    this.angle = 0;
  }
  /**
   * Actualiza el movimiento del enemigo hacia el jugador.
   * @param {number} dt
   * @param {Player} player objetivo al que seguir.
   * @param {boolean} isInLight indica si está dentro del cono de luz.
   * @param {number} [speedScale=1] factor global de velocidad (dificultad).
   */
  update(dt, player, isInLight, speedScale=1) {
    if(this.state === 'dying'){
      this.deathTimer -= dt;
      if(this.deathTimer <= 0){ this.state = 'dead'; }
      return;
    }
    if(this.state !== 'alive') return;
    const base = isInLight ? GAME_CONSTANTS.ENEMY.SPEED_LIGHT : GAME_CONSTANTS.ENEMY.SPEED_DARK;
    const speed = base * speedScale;
    const dx = player.x - this.x, dy = player.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx/len) * speed;
    const vy = (dy/len) * speed;
    this.x += vx * dt;
    this.y += vy * dt;
    this.angle = Math.atan2(vy, vx);
  }
  /**
   * Marca al enemigo para morir con una animación de desvanecimiento.
   */
  kill(){
    if(this.state !== 'alive') return;
    this.state = 'dying';
    this.deathTimer = 1.2;
  }
  /**
   * Dibuja al enemigo relativo a la cámara, con fade si está muriendo.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number,y:number}} camera
   */
  draw(ctx, camera) {
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    ctx.save();
    ctx.translate(sx, sy);
    let alpha = 1;
    if(this.state === 'dying') alpha = Math.max(0, this.deathTimer / 1.2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COLORS.ENEMY;
    ctx.beginPath();
    ctx.moveTo(0, -this.r);
    ctx.quadraticCurveTo(this.r * 0.8, -this.r * 0.4, this.r * 0.9, 0);
    ctx.quadraticCurveTo(this.r * 0.8, this.r * 0.6, 0, this.r);
    ctx.quadraticCurveTo(-this.r * 0.8, this.r * 0.6, -this.r * 0.9, 0);
    ctx.quadraticCurveTo(-this.r * 0.8, -this.r * 0.4, 0, -this.r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0,0, this.r*0.1, 0,0,this.r);
    g.addColorStop(0,'rgba(255,255,255,0.35)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

/**
 * Proyectil disparado por el jugador.
 * Se mueve en línea recta y tiene una vida corta.
 */
export class Bullet {
  /**
   * @param {number} x posición inicial de la cabeza de la bala.
   * @param {number} y posición inicial de la cabeza de la bala.
   * @param {number} dirx vector dirección X unitario.
   * @param {number} diry vector dirección Y unitario.
   * @param {number} speed velocidad en píxeles por segundo.
   * @param {number} damage daño que inflige al impactar.
   */
  constructor(x, y, dirx, diry, speed, damage) {
    this.x=x; this.y=y; this.dx=dirx; this.dy=diry; this.speed=speed; this.damage=damage; this.life=0.3; this.length=24;
  }
  /**
   * Actualiza posición y tiempo de vida del proyectil.
   * @param {number} dt
   */
  update(dt) {
    this.x += this.dx * this.speed * dt;
    this.y += this.dy * this.speed * dt;
    this.life -= dt;
  }
  /**
   * Dibuja el proyectil como un trazo luminoso relativo a la cámara.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number,y:number}} camera
   */
  draw(ctx, camera) {
    const hx = this.x - camera.x;
    const hy = this.y - camera.y;
    const tx = hx - this.dx * this.length;
    const ty = hy - this.dy * this.length;
    ctx.strokeStyle = COLORS.BULLET;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();
  }
}