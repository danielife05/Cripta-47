// Punto de entrada del juego
import './game/game.js';

const canvas = document.getElementById("game");
const ctx = canvas ? canvas.getContext("2d") : null;
let last = 0;

// Validación básica del canvas

function loop(ts) {
  // Calcula el tiempo transcurrido (dt) en segundos
  const dt = (ts - last) / 1000;
  last = ts;

  // Límite de tiempo para evitar bugs si la pestaña se suspende (ej. 1/15s = 0.066s)
  const safeDt = Math.min(dt, 0.066);

  if (window.Game) {
    Game.update(safeDt);
    Game.render(ctx);
  }

  requestAnimationFrame(loop);
}

function boot() {
  if (window.Game) {
    window.Game.init("game");
    requestAnimationFrame(loop);
  } else {
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
