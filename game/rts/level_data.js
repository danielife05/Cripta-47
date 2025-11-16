// Constantes para Arcade Shooter: Protocolo 47
export const GAME_CONSTANTS = {
  // Canvas visible (ventana de cámara)
  CANVAS_WIDTH: 960,
  CANVAS_HEIGHT: 540,
  // Mundo extenso (laberinto)
  WORLD_WIDTH: 3200,
  WORLD_HEIGHT: 2400,
  // Tiempo límite de partida
  MAX_GAME_TIME: 420, // 7 minutos (420 segundos)
  DIFFICULTY_INCREASE_TIME: 120, // 2 minutos (120 segundos)
  
  PLAYER: {
    SPEED: 200, // px/seg
    MAX_LIVES: 3,
    BULLET_RATE: 8, // balas por segundo
    BULLET_SPEED: 900,
    BULLET_DAMAGE: 25,
    FOV_RADIUS: 220, // radio de luz
    FOV_ANGLE: Math.PI * 0.65, // ~117º
    INVULN_TIME: 1.5 // segundos de invulnerabilidad tras daño
  },
  ENEMY: {
    SPEED_DARK: 55,
    SPEED_LIGHT: 120,
    // Valores después de escalada (2 min)
    SPEED_DARK_HARD: 85,
    SPEED_LIGHT_HARD: 180,
    HP: 60,
    RADIUS: 12,
    SPAWN_PADDING: 150,
    MIN_SPAWN_DIST: 600 // mínima distancia al jugador
  },
  WAVES: {
    INITIAL_SPAWN_INTERVAL: 2.5,
    HARD_SPAWN_INTERVAL: 1.2, // Intervalo tras escalada
    DIFFICULTY_RAMP: 0.94 // reduce spawn interval por oleada
  }
};

export const COLORS = {
  PLAYER: '#4a90e2',
  ENEMY: '#7a9b6e',
  BULLET: '#ffdd57',
    FLOOR: '#14181e', // ligeramente más claro para mayor contraste con paredes
  GRID: '#1c2128',
  WALL: '#2d3640',
  EXIT: '#48bb78',
  EXIT_STROKE: '#68d391',
  KEY: '#fbbf24'
};


