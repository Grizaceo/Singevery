// ============================================================================
// Genera build/THIRD-PARTY-NOTICES.txt: licencias de TODAS las dependencias
// de producción (árbol transitivo) + avisos manuales de componentes que no
// viven en node_modules (Electron/Chromium/Node, sidecar .NET, dict IPADIC).
//
// Uso: node scripts/generate-third-party-notices.cjs
// Se corre antes de `npm run package`; el resultado se distribuye en la
// carpeta de instalación vía extraFiles (electron-builder.yml).
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');
const NM = path.join(APP_DIR, 'node_modules');
const OUT = path.join(APP_DIR, 'build', 'THIRD-PARTY-NOTICES.txt');

const LICENSE_FILES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT', 'LICENSE-MIT.txt',
  'LICENCE', 'LICENCE.md', 'LICENCE.txt', 'COPYING', 'COPYING.txt',
  'license', 'license.md', 'license.txt', 'License.md',
];
const NOTICE_FILES = ['NOTICE', 'NOTICE.md', 'NOTICE.txt'];

/** Directorio de un paquete: node_modules anidado del padre, o el raíz. */
function resolvePkgDir(name, fromDir) {
  const nested = path.join(fromDir, 'node_modules', name);
  if (fs.existsSync(path.join(nested, 'package.json'))) return nested;
  const root = path.join(NM, name);
  if (fs.existsSync(path.join(root, 'package.json'))) return root;
  return null;
}

function readFirst(dir, candidates) {
  for (const f of candidates) {
    const p = path.join(dir, f);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return fs.readFileSync(p, 'utf8').trim();
    }
  }
  return null;
}

function licenseId(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(' OR ');
  return 'ver texto';
}

// --- Recorrido transitivo de dependencias de producción ---
const rootPkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
const queue = Object.keys(rootPkg.dependencies ?? {}).map((name) => ({ name, fromDir: APP_DIR }));
const seen = new Set();
const entries = [];
const missing = [];

while (queue.length > 0) {
  const { name, fromDir } = queue.shift();
  const dir = resolvePkgDir(name, fromDir);
  if (!dir) {
    missing.push(name);
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;
  seen.add(key);
  entries.push({
    key,
    name: pkg.name,
    version: pkg.version,
    license: licenseId(pkg),
    homepage: pkg.homepage ?? '',
    text: readFirst(dir, LICENSE_FILES),
    notice: readFirst(dir, NOTICE_FILES),
  });
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    queue.push({ name: dep, fromDir: dir });
  }
}

entries.sort((a, b) => a.key.localeCompare(b.key));

// --- Avisos manuales (componentes fuera del árbol npm de producción) ---
const electronDir = path.join(NM, 'electron');
let electronVersion = 'ver package.json';
let electronLicense = null;
if (fs.existsSync(path.join(electronDir, 'package.json'))) {
  electronVersion = JSON.parse(
    fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8'),
  ).version;
  electronLicense = readFirst(electronDir, LICENSE_FILES);
}

const MANUAL = `
================================================================================
COMPONENTES ADICIONALES (fuera del árbol npm de producción)
================================================================================

--------------------------------------------------------------------------------
Electron ${electronVersion} — MIT
--------------------------------------------------------------------------------
Esta aplicación se distribuye con el framework Electron, que incluye Chromium
y Node.js. Los textos completos de las licencias de Electron, Chromium y de
los demás componentes que Electron incorpora se instalan junto a la
aplicación en los archivos "LICENSE.electron.txt" y "LICENSES.chromium.html".

${electronLicense ?? '(texto de licencia de Electron no encontrado en node_modules)'}

--------------------------------------------------------------------------------
Sidecar SMTC (espejo-smtc.exe) — .NET 8 y C#/WinRT (Microsoft)
--------------------------------------------------------------------------------
El componente que lee la sesión de medios de Windows (System Media Transport
Controls) es un ejecutable .NET 8 propio de Singevery (licencia MIT del
proyecto). Se distribuye junto con bibliotecas de Microsoft:

* WinRT.Runtime.dll — C#/WinRT (https://github.com/microsoft/CsWinRT),
  licencia MIT, Copyright (c) Microsoft Corporation.
* Microsoft.Windows.SDK.NET.dll — proyecciones .NET del Windows SDK
  (paquete Microsoft.Windows.SDK.NET.Ref), licencia MIT,
  Copyright (c) Microsoft Corporation.
* Cuando el sidecar se publica en modo autocontenido ("self-contained"),
  la carpeta incluye además el runtime de .NET 8 (dotnet/runtime),
  licencia MIT, Copyright (c) .NET Foundation and Contributors.

--------------------------------------------------------------------------------
Diccionario morfológico japonés (kuromoji / IPADIC)
--------------------------------------------------------------------------------
Las ayudas de lectura en japonés usan kuromoji.js (Apache License 2.0, ver
sección "kuromoji" arriba), cuyo diccionario deriva de mecab-ipadic /
IPADIC, Copyright (c) Nara Institute of Science and Technology (NAIST).
El diccionario se redistribuye bajo los términos de IPADIC incluidos con el
paquete kuromoji (node_modules/kuromoji). IPADIC permite uso, copia,
modificación y redistribución conservando su aviso de copyright.

--------------------------------------------------------------------------------
Servicios de terceros usados en tiempo de ejecución
--------------------------------------------------------------------------------
Singevery consulta en tiempo de ejecución servicios externos (LRCLIB,
Musixmatch, Letras.mus.br para letras; Shazam mediante un cliente no oficial
y AudD de forma opcional para reconocimiento). Estos servicios NO forman
parte de esta distribución de software; su uso está sujeto a sus propios
términos. Ver AVISO_LEGAL.md para el detalle.
`;

// --- Salida ---
const header = `AVISOS DE SOFTWARE DE TERCEROS — Singevery ${rootPkg.version}
================================================================================
Este archivo enumera las bibliotecas de terceros incluidas en la aplicación
y reproduce sus licencias. Generado con scripts/generate-third-party-notices.cjs
(${entries.length} paquetes npm de producción).
La licencia de Singevery está en el archivo LICENSE (MIT).
================================================================================
`;

const body = entries
  .map((e) => {
    const lines = [
      '--------------------------------------------------------------------------------',
      `${e.name} ${e.version} — ${e.license}${e.homepage ? ` — ${e.homepage}` : ''}`,
      '--------------------------------------------------------------------------------',
      e.text ?? `(El paquete no incluye archivo de licencia; licencia declarada: ${e.license}.)`,
    ];
    if (e.notice) lines.push('', 'NOTICE:', e.notice);
    return lines.join('\n');
  })
  .join('\n\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${header}\n${body}\n${MANUAL}`);

console.log(`OK: ${entries.length} paquetes → ${path.relative(APP_DIR, OUT)}`);
if (missing.length) console.warn('No resueltos (revisar):', missing.join(', '));
