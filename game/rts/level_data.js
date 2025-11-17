/**
 * Constantes globales de configuración del juego.
 *
 * Centraliza tamaños de canvas y mundo, parámetros de jugador, enemigos
 * y configuración básica de oleadas. Se importa desde el módulo principal
 * de juego y desde donde se necesiten estos valores de referencia.
 */
export const GAME_CONSTANTS = {
  CANVAS_WIDTH: 960,
  CANVAS_HEIGHT: 540,

  WORLD_WIDTH: 3200,
  WORLD_HEIGHT: 2400,

  MAX_GAME_TIME: 420,
  DIFFICULTY_INCREASE_TIME: 120,
  
  PLAYER: {
    SPEED: 200,
    MAX_LIVES: 3,
    BULLET_RATE: 8,
    BULLET_SPEED: 900,
    BULLET_DAMAGE: 25,
    FOV_RADIUS: 220,
    FOV_ANGLE: Math.PI * 0.65,
    INVULN_TIME: 1.5
  },
  ENEMY: {
    SPEED_DARK: 55,
    SPEED_LIGHT: 120,
    SPEED_DARK_HARD: 85,
    SPEED_LIGHT_HARD: 180,
    HP: 60,
    RADIUS: 12,
    SPAWN_PADDING: 150,
    MIN_SPAWN_DIST: 600
  },
  WAVES: {
    INITIAL_SPAWN_INTERVAL: 2.5,
    HARD_SPAWN_INTERVAL: 1.2,
    DIFFICULTY_RAMP: 0.94
  }
};

/**
 * Paleta de colores lógica utilizada por el render del juego.
 * Permite cambiar la estética global sin tener que buscar hexadecimales
 * dispersos en el código.
 */
export const COLORS = {
  PLAYER: '#4a90e2',
  ENEMY: '#7a9b6e',
  BULLET: '#ffdd57',
  FLOOR: '#14181e',
  GRID: '#1c2128',
  WALL: '#2d3640',
  EXIT: '#48bb78',
  EXIT_STROKE: '#68d391',
  KEY: '#fbbf24'
};


