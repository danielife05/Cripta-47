/**
 * Módulo de entrada del juego.
 *
 * Responsabilidades:
 * - Escuchar teclado (WASD, etc.) y exponer un set de teclas presionadas.
 * - Convertir eventos de mouse y touch en una posición común relativa al canvas.
 * - Ofrecer un helper para transformar esa posición a coordenadas de mundo
 *   mediante el offset de cámara.
 */
export const Input = {
  canvas: null,
  ctx: null,
  keys: new Set(),
  mouse: { x: 0, y: 0, down: false },

  /**
   * Inicializa el sistema de entrada con el canvas principal.
   * Registra listeners globales de teclado y listeners de mouse/touch en el canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {CanvasRenderingContext2D} ctx
   */
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
  /**
   * Convierte las coordenadas actuales del puntero (relativas al canvas)
   * en coordenadas de mundo aplicando el offset de cámara.
   * @param {number} offsetX desplazamiento de cámara en X.
   * @param {number} offsetY desplazamiento de cámara en Y.
   * @returns {{x:number,y:number}}
   */
  getMouseWorld(offsetX, offsetY) {
    return { x: this.mouse.x + offsetX, y: this.mouse.y + offsetY };
  }
};