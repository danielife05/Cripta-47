import { GAME_CONSTANTS, COLORS } from './level_data.js';
import { Audio } from './audio.js';

/**
 * Clases de entidad: Player, Enemy, Bullet.
 * Mantienen lógica de movimiento y dibujo vectorial.
 */

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.lives = 3;
    this.invuln = 0; // breve ventana para evitar múltiples pérdidas por frame
    this.angle = 0; // ángulo del sprite (dirección de movimiento)
    this.aimAngle = 0; // ángulo de puntería (hacia el mouse, para disparar)
    this.fireCooldown = 0;
    this.keys = 0; // llaves recogidas
    this.vx = 0; this.vy = 0; // velocidad
    // Parámetros de dibujo
    this.width = 42;
    this.height = 42;
  }
  // Actualizar movimiento del jugador, ángulos y disparo
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
  // Dibujar jugador (forma vectorial) centrado en cámara
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

export class Enemy {
  constructor(x, y, variant = 0) {
    this.x = x; this.y = y; this.hp = GAME_CONSTANTS.ENEMY.HP;
    this.state = 'alive'; // alive -> dying -> dead
    this.deathTimer = 0; // cuenta regresiva para desvanecimiento
    this.r = GAME_CONSTANTS.ENEMY.RADIUS;
    this.variant = variant; // 0..4
    this.angle = 0;
  }
  // Actualizar movimiento del enemigo hacia el jugador
  update(dt, player, isInLight, speedScale=1) {
    if(this.state === 'dying'){
      this.deathTimer -= dt;
      if(this.deathTimer <= 0){ this.state = 'dead'; }
      return; // no se mueve mientras muere
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
  kill(){
    if(this.state !== 'alive') return;
    this.state = 'dying';
    this.deathTimer = 1.2; // segundos para desvanecerse
  }
  // Dibujar enemigo (forma vectorial)
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
    // brillo tenue cuando está en luz (solo se dibuja en luz en render principal)
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0,0, this.r*0.1, 0,0,this.r);
    g.addColorStop(0,'rgba(255,255,255,0.35)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

export class Bullet {
  // Proyectil: x,y cabeza; dirx,diry unitario; speed px/s; length px
  constructor(x, y, dirx, diry, speed, damage) {
    this.x=x; this.y=y; this.dx=dirx; this.dy=diry; this.speed=speed; this.damage=damage; this.life=0.3; this.length=24;
  }
  // Actualizar movimiento/vida del proyectil
  update(dt) {
    this.x += this.dx * this.speed * dt;
    this.y += this.dy * this.speed * dt;
    this.life -= dt;
  }
  // Dibujar proyectil como trazo luminoso
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