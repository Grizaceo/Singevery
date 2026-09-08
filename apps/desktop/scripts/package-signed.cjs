// ============================================================================
// package-signed.cjs — ruta de empaquetado "firmado" HONESTO.
//
// package:signed prometía firma pero ejecutaba exactamente el mismo pipeline
// que package: electron-builder solo firma cuando recibe credenciales, así que
// el nombre mentía: cualquiera podía creer que su instalador estaba firmado.
//
// Este wrapper:
//  1. Exige el entorno de firma ANTES de empaquetar:
//     WIN_CSC_LINK (o CSC_LINK) → ruta al .pfx/.p12 o base64 del certificado
//     WIN_CSC_KEY_PASSWORD (o CSC_KEY_PASSWORD) → contraseña
//  2. Tras empaquetar, VERIFICA la firma del instalador real
//     (Get-AuthenticodeSignature en Windows, osslsigncode en Linux). El
//     entorno de firma no garantiza que electron-builder firmara: un .pfx
//     inválido o una config que salte la firma producen un instalador sin
//     firmar (BAJA 10 del audit Opus).
// ============================================================================
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));

const hasSigningEnv =
  (process.env.WIN_CSC_LINK || process.env.CSC_LINK) &&
  (process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD);

if (!hasSigningEnv) {
  process.stderr.write(
    '[package:signed] ERROR: no hay entorno de firma configurado.\n' +
      '  Este comando produce un instalador FIRMADO; sin credenciales no firma.\n' +
      '  Configura WIN_CSC_LINK (o CSC_LINK) y WIN_CSC_KEY_PASSWORD (o CSC_KEY_PASSWORD)\n' +
      '  y reintenta. Para un instalador sin firmar usa: npm run package\n',
  );
  process.exit(1);
}

function verifySignature() {
  const installer = path.join(appRoot, 'release', `Singevery-Setup-${pkg.version}.exe`);
  if (!fs.existsSync(installer)) {
    process.stderr.write(`[package:signed] ERROR: no existe ${installer}\n`);
    return false;
  }
  if (process.platform === 'win32') {
    const ps = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$s = Get-AuthenticodeSignature -FilePath '${installer}'; if ($s.Status -ne 'Valid') { Write-Error ('Firma no válida: ' + $s.Status); exit 1 }`,
      ],
      { stdio: 'inherit' },
    );
    return ps.status === 0;
  }
  const ossl = spawnSync('which', ['osslsigncode'], { encoding: 'utf8' });
  if (ossl.status === 0) {
    const r = spawnSync('osslsigncode', ['verify', installer], { stdio: 'inherit' });
    return r.status === 0;
  }
  process.stderr.write(
    '[package:signed] ERROR: no hay forma de verificar la firma en este sistema.\n' +
      '  Windows: Get-AuthenticodeSignature. Linux: instala osslsigncode.\n',
  );
  return false;
}

const steps = [
  'npm run build',
  'npm run notices',
  'npm run verify:package-inputs',
  'npx electron-builder --config electron-builder.yml',
  'npm run verify:package-output',
];

for (const step of steps) {
  const result = spawnSync(step, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`[package:signed] falló: ${step}\n`);
    process.exit(result.status ?? 1);
  }
}

if (!verifySignature()) {
  process.stderr.write('[package:signed] falló: la firma del instalador no se pudo verificar.\n');
  process.exit(1);
}

process.stdout.write('[package:signed] Instalador firmado y verificado.\n');
