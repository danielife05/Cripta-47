## Cripta 47: El Amanecer de las Sombras

Top‑down shooter en una cripta oscura: ilumina, sobrevive y escapa.

---

### Objetivo

Explora la cripta, **recolecta las 3 llaves** dispersas por el laberinto y luego regresa al **punto de partida** para abrir la puerta de escape. Al conseguir las 3 llaves obtendrás **tiempo extra** para lograrlo antes de que el contador llegue a cero.

Ganas si abres la puerta antes de que el tiempo se agote. Pierdes si te quedas sin vidas o si el tiempo llega a cero.

---

### Cómo jugar

#### Iniciar partida

- Abre `index.html` en tu navegador (Chrome/Firefox recomendados).
- En la pantalla de menú, haz clic en **INICIAR MISIÓN** o entra primero en **INSTRUCCIONES** para ver el resumen dentro del juego.

#### Controles

- **Movimiento:** `W A S D`.
- **Apuntar:** **mouse** (o tocar en pantalla en dispositivos táctiles).
- **Disparar:** **clic izquierdo** (o tap).
- **Pausa:** `Esc` pausar / reanudar la partida.
- **Sonido:** `R` silenciar / activar el audio global. Cuando el sonido está silenciado aparece un icono 🔇 en la esquina inferior izquierda del HUD.

#### Luz y visibilidad

- El soldado ilumina un **cono de luz** delante de él.
- Los zombies son **más rápidos en la oscuridad** y más lentos dentro del cono de luz.
- Solo puedes dañarlos con balas si están **iluminados**.

#### Llaves

- Hay **3 llaves** repartidas por el laberinto.
- Para capturarlas debes permanecer cerca; una **barra circular** indica el progreso.
- Si te mueves demasiado o te alejas, el progreso se detiene o retrocede lentamente.
- Cada llave otorga **puntos** y ajusta ligeramente la dificultad (más enemigos y algo más rápidos).

#### Puerta de salida

- Cuando consigues las **3 llaves**, aparece la **puerta de salida** en el punto de partida.
- Al conseguir la tercera llave obtienes **tiempo extra** para escapar.
- Entra en la zona de la puerta y quédate dentro hasta completar la barra de progreso de escape.
- Durante la apertura de la puerta se activa un **asedio final** con más presión de zombies.

#### Enemigos

- Te persiguen continuamente por el laberinto.
- A medida que pasa el tiempo y consigues llaves, se vuelven **más rápidos y numerosos**.
- Si se quedan pegados a ti, te hacen **daño periódico**.

#### HUD (interfaz)

- **Arriba izquierda:** vidas (corazones) y llaves recogidas.
- **Centro:** tiempo restante.
- **Arriba derecha:** puntuación actual.
- **Abajo izquierda:** indicador de sonido silenciado (🔇) cuando el audio está en mute.

---

### Puntuación y high score

- Cada zombie eliminado otorga puntos.
- Cada llave capturada añade una cantidad extra de puntos.
- Al escapar, se añade un **bonus de puntuación** según el tiempo restante.
- El juego guarda automáticamente tu **mejor puntuación (high score)** en `localStorage` bajo la clave `cripta47_highscore`.

---

### Audio

- El juego tiene música de menú, música de partida, sonidos de ambiente de zombies y efectos para disparos, daño, llaves y puerta.
- Si el audio no suena al principio, haz clic en **INICIAR MISIÓN** o en cualquier botón del menú para que el navegador permita usar el audio.
- Puedes silenciar o reactivar todo el sonido con la tecla `R`.

---

### Reiniciar y estados de partida

- **PAUSA:** usa `Esc` para pausar o continuar desde la pantalla de pausa.
- **GAME OVER:** aparece si te quedas sin vidas o se acaba el tiempo. Desde ahí puedes volver al menú principal.
- **VICTORIA:** aparece si logras abrir la puerta y escapar. También verás tu puntuación final y el high score.

---

### Aspectos técnicos

- Implementado en **HTML5 Canvas** y **JavaScript** sin frameworks.
- Lógica de juego modularizada en `game/rts/game.js`, con módulos de apoyo para entrada (`input.js`), audio (`audio.js`), entidades (`units.js`) y constantes (`level_data.js`).
- Laberinto generado de forma **procedural** en cada partida.
