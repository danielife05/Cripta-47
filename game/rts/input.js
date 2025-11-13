/**
 * Módulo de entrada: teclado, mouse y touch con coordenadas de mundo.
 */
export const Input = {
  canvas: null,
  ctx: null,
  keys: new Set(),
  mouse: { x: 0, y: 0, down: false },

  init(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;

    window.addEventListener('keydown', e => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup',   e => this.keys.delete(e.key.toLowerCase()));

    const updateMouseFromEvent = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = clientX - rect.left;
      this.mouse.y = clientY - rect.top;
    };

    canvas.addEventListener('mousemove', e => {
      updateMouseFromEvent(e.clientX, e.clientY);
    });

    canvas.addEventListener('mousedown', () => { this.mouse.down = true; });
    canvas.addEventListener('mouseup',   () => { this.mouse.down = false; });

    // Touch → se mapea a mouse
    canvas.addEventListener('touchstart', e => {
      const t = e.touches[0];
      updateMouseFromEvent(t.clientX, t.clientY);
      this.mouse.down = true;
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      const t = e.touches[0];
      updateMouseFromEvent(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', () => { this.mouse.down = false; });
  },
  // Convierte coordenadas del mouse en coordenadas de mundo con el offset de cámara
  getMouseWorld(offsetX, offsetY) {
    return { x: this.mouse.x + offsetX, y: this.mouse.y + offsetY };
  }
};