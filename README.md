## Cripta 47: El Amanecer de las Sombras

Juego top–down arcade stealth/shooter en JavaScript sin dependencias externas.

### Objetivo
Recoge 3 llaves en el laberinto oscuro, activa la salida y escapa antes de que se agote el tiempo, sobreviviendo a oleadas de enemigos que se aceleran con el paso de los minutos y cada llave capturada.

### Mecánicas principales
1. Luz cónica (FOV) del jugador: solo ilumina parte del escenario; enemigos fuera de la luz no pueden ser abatidos.
2. Enemigos aceleran con el progreso del tiempo y las llaves obtenidas.
3. Captura de llaves y salida es progresiva: permanecer quieto cerca acelera la captura.
4. Daño cuerpo a cuerpo por contacto continuo (cada cierto intervalo).
5. Audio dinámico (ambient zombie + proximidad amenaza).

### Controles
Movimiento: WASD / Flechas
Apuntar: Mouse / Touch
Disparo: Click / Tap

### Estructura (src)
```
index.html      # Canvas y pantallas UI
main.js         # Bucle principal (requestAnimationFrame) + bootstrap
game/game.js    # Objeto Game: lógica principal (refactorizado, funciones claras)
game/units.js   # Clases Player, Enemy, Bullet
game/input.js   # Entrada teclado/mouse/touch
game/audio.js   # Sistema de audio WebAudio (carga y reproducción eventos)
game/level_data.js # Constantes y mapa base
game/pathfinding.js # A* (actualmente no integrado en gameplay principal)
engine/loader.js # Loader de imágenes (SVG, etc.)
styles/style.css # Estilos UI
assets/         # Imágenes y audio
```

### Refactor 2025-11
Se documentó `game/game.js` y se dividieron responsabilidades internas:
* Escalada de dificultad -> `applyDifficultyEscalation()`
* Spawning -> `handleEnemySpawning()` + `isValidEnemySpawn()`
* Audio amenaza -> `updateThreatAudio()`
* Contacto melee -> `resolveMeleeContact()`
* Captura llaves -> `updateKeys()`
* Captura salida -> `updateExit()`
* HUD -> `updateHUD()`
* Validaciones spawn repetidas centralizadas.

Sin cambios en las mecánicas originales ni parámetros principales.


### Ejecución
Abrir `index.html` en un servidor estático (recomendado) o directamente en el navegador moderno. Si el audio no suena inicialmente, realizar una interacción (click en el botón) para permitir contexto de Audio.

### Licencia
Uso académico / personal. Ajustar según necesidad.

