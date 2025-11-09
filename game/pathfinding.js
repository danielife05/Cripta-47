// Implementación simplificada del algoritmo A* para la cuadrícula del juego.
// Adaptado para trabajar con la matriz de obstáculos del juego.

export const Pathfinding = {
    // Nodo para el algoritmo A*
    Node: function(parent, point, gScore, hScore) {
        this.parent = parent;
        this.point = point;
        this.g = gScore; // Costo desde el inicio hasta este nodo
        this.h = hScore; // Costo heurístico estimado hasta el final
        this.f = this.g + this.h; // Costo total estimado
    },

    // Heurística de Distancia (Euclidean)
    heuristic: (p1, p2) => {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    },

    // La función principal del Pathfinding (Similar a AStar(grid, start, end, heuristic) del libro)
    findPath: (grid, start, end) => {
        const startPoint = { x: start.x, y: start.y };
        const endPoint = { x: end.x, y: end.y };
        
        // Convertir a coordenadas de cuadrícula
        const startTile = { x: Math.floor(startPoint.x), y: Math.floor(startPoint.y) };
        const endTile = { x: Math.floor(endPoint.x), y: Math.floor(endPoint.y) };

        if (grid[endTile.y][endTile.x] === 1) { // 1 = Obstáculo
            // No se puede ir a un tile ocupado, pero en un RTS podemos permitir ir al borde.
            // Para simplificar, si el destino está bloqueado, no hay camino directo.
            return [];
        }

        let openList = []; // Nodos a evaluar
        let closedList = []; // Nodos ya evaluados

        let startNode = new Pathfinding.Node(null, startTile, 0, Pathfinding.heuristic(startTile, endTile));
        openList.push(startNode);

        while (openList.length > 0) {
            // Encuentra el nodo con el menor F en openList
            let currentNode = openList[0];
            let currentIndex = 0;
            for (let i = 1; i < openList.length; i++) {
                if (openList[i].f < currentNode.f) {
                    currentNode = openList[i];
                    currentIndex = i;
                }
            }

            // Mueve el nodo actual de openList a closedList
            openList.splice(currentIndex, 1);
            closedList.push(currentNode);

            // Si llegamos al final, reconstruir el camino
            if (currentNode.point.x === endTile.x && currentNode.point.y === endTile.y) {
                let path = [];
                let temp = currentNode;
                while (temp) {
                    // El camino se retorna en coordenadas de cuadrícula
                    path.push(temp.point); 
                    temp = temp.parent;
                }
                return path.reverse(); // El camino desde el inicio hasta el final
            }

            // Generar sucesores (vecinos)
            let successors = [];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;

                    let successorPoint = { x: currentNode.point.x + dx, y: currentNode.point.y + dy };

                    // 1. Está dentro de los límites del mapa
                    if (successorPoint.x < 0 || successorPoint.x >= grid[0].length || 
                        successorPoint.y < 0 || successorPoint.y >= grid.length) continue;

                    // 2. No es un obstáculo (valor 1 en la cuadrícula)
                    if (grid[successorPoint.y][successorPoint.x] === 1) continue;

                    // 3. No está en la lista cerrada
                    let inClosed = closedList.some(node => node.point.x === successorPoint.x && node.point.y === successorPoint.y);
                    if (inClosed) continue;

                    // Calcular nuevo G y H
                    let newG = currentNode.g + (dx !== 0 && dy !== 0 ? 1.414 : 1); // Costo diagonal 1.414, recto 1
                    let newH = Pathfinding.heuristic(successorPoint, endTile);
                    let newNode = new Pathfinding.Node(currentNode, successorPoint, newG, newH);
                    
                    // 4. No está ya en la lista abierta con un costo F menor
                    let existingOpen = openList.find(node => node.point.x === successorPoint.x && node.point.y === successorPoint.y);
                    if (existingOpen && existingOpen.f <= newNode.f) continue;
                    
                    openList.push(newNode);
                }
            }
        }

        return []; // No se encontró camino
    }
};