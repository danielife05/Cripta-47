/**
 * Punto de entrada de Cripta-47.
 *
 * Responsabilidades:
 * - Importar el módulo de juego, que expone `window.Game`.
 * - Crear un bucle principal de `requestAnimationFrame` que llama a
 *   `Game.update(dt)` y `Game.render(ctx)`.
 * - Arrancar el juego cuando el DOM está listo.
 */
import './game/rts/game.js';

const canvas = document.getElementById('game');
const ctx = canvas?.getContext('2d') ?? null;
let last = 0;

/**
 * Bucle principal de animación.
 * Calcula un `dt` acotado y delega en `Game.update` y `Game.render`.
 * @param {DOMHighResTimeStamp} ts marca de tiempo del frame.
 */
function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.066);
  last = ts;

  if (window.Game) {
    Game.update(dt);
    Game.render(ctx);
  }

  requestAnimationFrame(loop);
}

/**
 * Inicializa el objeto global `Game` y arranca el bucle principal
 * una vez que el canvas está listo.
 */
function boot() {
  if (!window.Game) return;
  window.Game.init('game');
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
