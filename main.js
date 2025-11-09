// Punto de entrada del juego
import './game/game.js';

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let last = 0;

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

// Esperar a que el DOM esté completamente cargado
window.addEventListener('DOMContentLoaded', () => {
  // Verificar que Game esté disponible
  if (window.Game) {
    window.Game.init("game");
    requestAnimationFrame(loop);
  } else {
    console.error("Game object not found!");
  }
});
