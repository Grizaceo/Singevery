/**
 * Borra windowBounds guardados (ventana fuera de pantalla / monitor desconectado).
 * Uso: npm run dev:reset-window
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS = 'espejo-settings.json';
// Carpeta de datos de Electron (userData): %APPDATA% en Windows, XDG en Linux.
const base =
  process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const dirs = [
  path.join(base, 'singevery-desktop'), // userData = name del package.json (dev y empaquetada)
  path.join(base, 'Singevery'), // por si un build fija productName como nombre
  path.join(base, 'espejo-teleprompter-desktop'),
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
