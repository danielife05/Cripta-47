// Constantes para Arcade Shooter: Protocolo 47
export const GAME_CONSTANTS = {
  // Canvas visible (ventana de cámara)
  CANVAS_WIDTH: 960,
  CANVAS_HEIGHT: 540,
  // Mundo extenso (laberinto)
  WORLD_WIDTH: 3200,
  WORLD_HEIGHT: 2400,
  // Tiempo límite de partida
  MAX_GAME_TIME: 360, // 6 minutos (360 segundos)
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

export const LEVELS = [
  { name: 'Cripta - Nivel 1', waveMultiplier: 1 },
  { name: 'Cripta - Nivel 2', waveMultiplier: 1.3 },
  { name: 'Cripta - Nivel 3', waveMultiplier: 1.6 }
];

// Mapa base del laberinto: paredes y obstáculos sencillos
// Cada pared/obstáculo es un rectángulo {x,y,w,h} en coordenadas de mundo
export const MAP = {
  walls: [
    // Borde exterior grueso
    { x: 0, y: 0, w: GAME_CONSTANTS.WORLD_WIDTH, h: 40 },
    { x: 0, y: GAME_CONSTANTS.WORLD_HEIGHT - 40, w: GAME_CONSTANTS.WORLD_WIDTH, h: 40 },
    { x: 0, y: 0, w: 40, h: GAME_CONSTANTS.WORLD_HEIGHT },
    { x: GAME_CONSTANTS.WORLD_WIDTH - 40, y: 0, w: 40, h: GAME_CONSTANTS.WORLD_HEIGHT },

    // Pasillos horizontales/verticales
    { x: 200, y: 200, w: 2400, h: 28 },
    { x: 200, y: 600, w: 2600, h: 28 },
    { x: 200, y: 1000, w: 2800, h: 28 },
    { x: 200, y: 1400, w: 2400, h: 28 },
    { x: 200, y: 1800, w: 2600, h: 28 },
    // Columnas verticales conectando
    { x: 500, y: 200, w: 28, h: 600 },
    { x: 1100, y: 600, w: 28, h: 800 },
    { x: 1700, y: 200, w: 28, h: 1200 },
    { x: 2300, y: 1000, w: 28, h: 900 },
  { x: 2900, y: 600, w: 28, h: 1200 },

    // Obstáculos móviles "simulados" (estáticos por ahora)
    { x: 800, y: 300, w: 120, h: 60 },
    { x: 1200, y: 900, w: 160, h: 60 },
    { x: 2100, y: 1500, w: 160, h: 60 },
    { x: 2600, y: 400, w: 100, h: 100 },

    // Más complejidad: salas y pasillos adicionales
    // Bloques centrales
    { x: 900, y: 1200, w: 220, h: 220 },
    { x: 1350, y: 1200, w: 220, h: 220 },
    { x: 1800, y: 1200, w: 220, h: 220 },
    // Corredores con "puertas" estrechas
    { x: 900, y: 1450, w: 1120, h: 26 },
    { x: 900, y: 1700, w: 1120, h: 26 },
    { x: 1500, y: 1200, w: 26, h: 520 },
    // Sección noreste
    { x: 2400, y: 300, w: 360, h: 26 },
    { x: 2400, y: 300, w: 26, h: 360 },
    { x: 2400, y: 660, w: 360, h: 26 },
    { x: 2734, y: 300, w: 26, h: 386 },
    // Zig-zag oeste
    { x: 200, y: 300, w: 26, h: 300 },
    { x: 226, y: 600, w: 300, h: 26 },
    { x: 526, y: 626, w: 26, h: 300 },
    { x: 552, y: 926, w: 300, h: 26 },
    // Sur laberinto
    { x: 300, y: 1900, w: 600, h: 26 },
    { x: 300, y: 1900, w: 26, h: 300 },
    { x: 926, y: 1900, w: 26, h: 300 },
    { x: 600, y: 2100, w: 352, h: 26 },
  ],
  // Posiciones iniciales aproximadas para llaves y salida
  keys: [
    { x: 400, y: 350 },
    { x: 1850, y: 750 },
    { x: 2800, y: 1650 }
  ],
  exit: { x: 3050, y: 2100, w: 100, h: 80 } // puerta de salida
};

