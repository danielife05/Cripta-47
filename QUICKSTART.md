# 🚀 Guía de Inicio Rápido

## Ejecutar el Juego

### Opción 1: VS Code Live Server (Recomendado)
1. Instala la extensión "Live Server" en VS Code
2. Haz clic derecho en `index.html`
3. Selecciona "Open with Live Server"
4. El juego se abrirá automáticamente en tu navegador

### Opción 2: Python Server
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```
Luego abre: http://localhost:8000

### Opción 3: Node.js (http-server)
```bash
npx http-server
```

## 🎮 Controles

| Acción | Control |
|--------|---------|
| Seleccionar unidad | Clic izquierdo |
| Selección múltiple | Arrastrar ratón |
| Mover unidad | Clic derecho en terreno |
| Atacar enemigo | Clic derecho en enemigo |
| Construir unidad | Botones del HUD (abajo derecha) |

## 📋 Pasos para Jugar

1. **Pantalla de Carga**
   - Espera 1-2 segundos mientras se cargan los recursos

2. **Menú Principal**
   - Haz clic en "INICIAR MISIÓN"

3. **Tutorial Rápido**
   - Tu base azul está en el centro
   - Los enemigos rojos vienen desde la izquierda
   - Tienes 1500 créditos iniciales

4. **Construye Defensa**
   - Selecciona tu Base Móvil (cuadrado azul grande)
   - Haz clic en "Tanque Ligero (500)" para construir
   - También puedes construir "Torreta (800)"

5. **Controla tus Unidades**
   - Selecciona tanques con clic izquierdo
   - Clic derecho para moverlos
   - Clic derecho en enemigos para atacar

6. **Sobrevive**
   - Oleada 1: 3 enemigos a los 5 segundos
   - Oleada 2: 5 enemigos a los 20 segundos
   - Oleada 3: 7 enemigos a los 40 segundos

## 💡 Consejos

- **Construye rápido**: Los enemigos llegan pronto
- **Posiciona bien**: Coloca unidades entre enemigos y tu base
- **Gestiona recursos**: Cada tanque cuesta 500 créditos
- **Usa extractores**: Generan 5 créditos por segundo
- **Selección múltiple**: Arrastra para seleccionar varios tanques

## ⚠️ Requisitos

- Navegador moderno (Chrome, Firefox, Edge)
- JavaScript habilitado
- Servidor local (para módulos ES6)

## 🐛 Solución de Problemas

### Problema: Pantalla en blanco
**Solución**: Asegúrate de usar un servidor local (no abrir directamente el archivo)

### Problema: "CARGANDO RECURSOS..." infinito
**Solución**: Verifica la consola del navegador (F12) para errores

### Problema: Botones no funcionan
**Solución**: Selecciona primero la Base Móvil para construir unidades

### Problema: Unidades no se mueven
**Solución**: Usa clic DERECHO para dar órdenes, no izquierdo

## 🎯 Objetivo del Juego

**SOBREVIVIR** a todas las oleadas enemigas sin perder tu Base Móvil

- Base destruida = DERROTA
- 3 oleadas completadas = VICTORIA

## 📊 Sistema de Recursos

| Recurso | Descripción |
|---------|-------------|
| Créditos iniciales | 1500 |
| Costo Tanque | 500 |
| Costo Torreta | 800 |
| Generación Extractor | 5/segundo |

## 🔧 Debugging

Para ver información de debug, abre la consola (F12) y verás:
- Ataques de unidades
- Creación/destrucción
- Cambios de estado
- Activación de oleadas

## ✅ Verificación

El juego funciona correctamente si:
1. ✅ La pantalla de carga desaparece después de 1-2 segundos
2. ✅ Aparece el menú con el botón "INICIAR MISIÓN"
3. ✅ Al iniciar, ves el mapa con tu base azul
4. ✅ Los enemigos rojos aparecen y atacan automáticamente
5. ✅ Puedes seleccionar y mover unidades

---

## 🎮 ¡Disfruta el Juego!

Si todo está funcionando, deberías poder:
- ✅ Ver el mapa y unidades
- ✅ Seleccionar y dar órdenes
- ✅ Construir nuevas unidades
- ✅ Combatir enemigos
- ✅ Ganar o perder la partida

**¡Buena suerte, Comandante!** 🎖️
