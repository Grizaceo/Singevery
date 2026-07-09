/**
 * Borra windowBounds guardados (ventana fuera de pantalla / monitor desconectado).
 * Uso: npm run dev:reset-window
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS = 'espejo-settings.json';
const dirs = [
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'singevery-desktop'),
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'espejo-teleprompter-desktop'),
];

let changed = false;

for (const dir of dirs) {
  const file = path.join(dir, SETTINGS);
  if (!fs.existsSync(file)) continue;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.windowBounds) {
      delete data.windowBounds;
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[reset-window] windowBounds borrados en ${file}`);
      changed = true;
    } else {
      console.log(`[reset-window] Sin windowBounds en ${file}`);
    }
  } catch (err) {
    console.error(`[reset-window] No se pudo editar ${file}:`, err.message);
  }
}

if (!changed) {
  console.log('[reset-window] Nada que resetear (o archivos no encontrados).');
} else {
  console.log('[reset-window] Listo. Ejecuta npm run dev:electron');
}
