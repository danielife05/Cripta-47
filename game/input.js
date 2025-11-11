/**
 * Módulo de entrada: teclado, mouse y touch con coordenadas de mundo.
 */
export const Input = {
  canvas: null,
  ctx: null,
  keys: new Set(),
  mouse: { x: 0, y: 0, down: false },
  lastShotAt: 0,

  init(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;

    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', () => { this.mouse.down = true; });
    canvas.addEventListener('mouseup', () => { this.mouse.down = false; });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = t.clientX - rect.left;
      this.mouse.y = t.clientY - rect.top;
      this.mouse.down = true;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = t.clientX - rect.left;
      this.mouse.y = t.clientY - rect.top;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { this.mouse.down = false; });
  },

  getAimAngle(px, py) {
    const dx = this.mouse.x - px;
    const dy = this.mouse.y - py;
    return Math.atan2(dy, dx);
  }
  ,
  // Convierte coordenadas del mouse en coordenadas de mundo con el offset de cámara
  getMouseWorld(offsetX, offsetY) {
    return { x: this.mouse.x + offsetX, y: this.mouse.y + offsetY };
  }
};