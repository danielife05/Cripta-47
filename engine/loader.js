// Sistema de carga de recursos del juego
export class Loader {
    constructor() {
        this.resources = {};
        this.loaded = 0;
        this.total = 0;
    }

    // Simula la carga de recursos (imágenes, sonidos, etc.)
    loadResources(resourceList, onComplete) {
        this.total = resourceList.length;
        
        if (this.total === 0) {
            // Si no hay recursos, completar inmediatamente
            onComplete();
            return;
        }

        resourceList.forEach(resource => {
            // Simulación de carga asíncrona
            setTimeout(() => {
                this.resources[resource.name] = resource;
                this.loaded++;
                
                if (this.loaded === this.total) {
                    onComplete();
                }
            }, Math.random() * 500 + 100); // Simula tiempo de carga aleatorio
        });
    }

    getProgress() {
        return this.total > 0 ? this.loaded / this.total : 1;
    }
}

export default new Loader();
