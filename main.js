// Punto de entrada del juego
import './game/rts/game.js';

const canvas = document.getElementById('game');
const ctx = canvas?.getContext('2d') ?? null;
let last = 0;

function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.066); // limita dt si la pestaña se suspende
  last = ts;

  if (window.Game) {
    Game.update(dt);
    Game.render(ctx);
  }

  requestAnimationFrame(loop);
}

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
