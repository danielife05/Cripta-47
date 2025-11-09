/**
 * @file engine/loader.js
 * Módulo para cargar assets (imágenes, audio).
 * Utiliza promesas para manejar la carga asíncrona.
 *
 */

export const Loader = {
    // Almacenará los assets cargados (Image objects)
    assets: {},

    /**
     * Carga un conjunto de definiciones de assets.
     * @param {object} assetDefinitions - Objeto con claves de asset y sus rutas.
     */
    async loadAssets(assetDefinitions) {
        const loadPromises = [];

        console.log("Loader: Iniciando carga de assets...");

        for (const key in assetDefinitions) {
            const def = assetDefinitions[key];
            const img = new Image();
            img.src = def.src;

            const promise = new Promise((resolve, reject) => {
                img.onload = () => {
                    // Almacena la imagen cargada junto con sus definiciones (tamaño de frame)
                    this.assets[key] = {
                        img: img,
                        frameWidth: def.frameWidth,
                        frameHeight: def.frameHeight,
                        animations: def.animations
                    };
                    console.log(`Loader: Asset '${key}' cargado desde ${def.src}`);
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Error cargando asset '${key}' desde ${def.src}`);
                    reject(new Error(`Error cargando ${key}`));
                };
            });
            loadPromises.push(promise);
        }

        // Espera a que todas las promesas de carga se completen
        await Promise.all(loadPromises);
        console.log("Loader: Todos los assets cargados.");
    }
};