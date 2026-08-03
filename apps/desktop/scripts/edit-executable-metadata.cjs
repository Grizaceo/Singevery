const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const executable = path.join(appRoot, 'release', 'win-unpacked', 'Singevery.exe');
const icon = path.join(appRoot, 'build', 'icon.ico');

function findExecutable(root, filename, depth = 6) {
  if (!root || depth < 0 || !fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return candidate;
    if (entry.isDirectory()) {
      const nested = findExecutable(candidate, filename, depth - 1);
      if (nested) return nested;
    }
  }
  return null;
}

if (!fs.existsSync(executable)) {
  throw new Error('Falta release/win-unpacked/Singevery.exe; genera primero el paquete desempaquetado');
}
if (!fs.existsSync(icon)) throw new Error('Falta build/icon.ico');

const cacheRoot = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'winCodeSign')
  : '';
const rcedit = findExecutable(cacheRoot, 'rcedit-x64.exe');
if (!rcedit) throw new Error('No se encontró rcedit-x64.exe en la caché de electron-builder');

const versionNumbers = pkg.version.match(/^\d+\.\d+\.\d+/)?.[0] ?? '0.0.0';
const numericVersion = `${versionNumbers}.0`;
const result = childProcess.spawnSync(
  rcedit,
  [
    executable,
    '--set-icon',
    icon,
    '--set-file-version',
    numericVersion,
    '--set-product-version',
    numericVersion,
    '--set-version-string',
    'ProductName',
    'Singevery',
    '--set-version-string',
    'FileDescription',
    'Singevery — letras, lectura y práctica musical',
    '--set-version-string',
    'CompanyName',
    pkg.author || 'Gris',
    '--set-version-string',
    'LegalCopyright',
    'Copyright © 2026 Gris',
    '--set-version-string',
    'OriginalFilename',
    'Singevery.exe',
    '--set-version-string',
    'InternalName',
    'Singevery',
    '--set-version-string',
    'ProductVersion',
    pkg.version,
    '--set-version-string',
    'FileVersion',
    pkg.version,
  ],
  { encoding: 'utf8', windowsHide: true },
);

if (result.status !== 0) {
  throw new Error(`rcedit falló: ${(result.stderr || result.stdout).trim()}`);
}
process.stdout.write(`[metadata] Singevery.exe marcado como Singevery ${pkg.version}.\n`);
