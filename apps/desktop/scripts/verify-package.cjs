const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const sidecarInput = path.join(appRoot, 'build', 'smtc-dist');
const releaseDir = path.join(appRoot, 'release');

function fail(message) {
  process.stderr.write(`[package verify] ERROR: ${message}\n`);
  process.exitCode = 1;
}

function requireFile(file, label = path.relative(appRoot, file)) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    fail(`falta ${label}`);
    return false;
  }
  return true;
}

function verifySelfContained(directory) {
  const exe = path.join(directory, 'espejo-smtc.exe');
  const coreclr = path.join(directory, 'coreclr.dll');
  const runtimeConfig = path.join(directory, 'espejo-smtc.runtimeconfig.json');
  let ok = requireFile(exe, 'sidecar espejo-smtc.exe');
  ok = requireFile(coreclr, 'runtime autocontenido coreclr.dll') && ok;
  if (requireFile(runtimeConfig, 'espejo-smtc.runtimeconfig.json')) {
    try {
      const data = JSON.parse(fs.readFileSync(runtimeConfig, 'utf8'));
      if (data.runtimeOptions?.framework) {
        fail('el sidecar sigue dependiendo de .NET instalado; ejecuta npm run build:smtc');
        ok = false;
      }
    } catch (error) {
      fail(`runtimeconfig inválido: ${error.message}`);
      ok = false;
    }
  } else {
    ok = false;
  }
  return ok;
}

function findExecutable(root, filename, depth = 6) {
  if (!root || depth < 0 || !fs.existsSync(root)) return null;
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const candidate = path.join(root, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return candidate;
      if (entry.isDirectory()) {
        const nested = findExecutable(candidate, filename, depth - 1);
        if (nested) return nested;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function verifyInstallerPayload(installer) {
  const cacheRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache')
    : '';
  const sevenZip = findExecutable(cacheRoot, '7za.exe');
  if (!sevenZip) {
    fail('no se encontró 7za.exe para inspeccionar el contenido real del instalador');
    return false;
  }
  const result = childProcess.spawnSync(sevenZip, ['l', '-slt', installer], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    fail(`no se pudo inspeccionar el instalador: ${(result.stderr || result.stdout).trim()}`);
    return false;
  }
  const listing = result.stdout.replace(/\//g, '\\');
  const requiredPaths = [
    'GUIA_DE_USO.md',
    'GUIA_BETA_PROFESORES.md',
    'PRIVACIDAD_Y_DATOS.md',
    'resources\\native\\smtc\\dist\\espejo-smtc.exe',
    'resources\\native\\smtc\\dist\\coreclr.dll',
  ];
  let ok = true;
  for (const requiredPath of requiredPaths) {
    if (!listing.includes(`Path = ${requiredPath}`)) {
      fail(`el instalador no contiene ${requiredPath}`);
      ok = false;
    }
  }
  return ok;
}

function verifyInputs() {
  const required = [
    'GUIA_BETA_PROFESORES.md',
    'PRIVACIDAD_Y_DATOS.md',
    'build/THIRD-PARTY-NOTICES.txt',
    'build/license.txt',
    'build/icon.ico',
  ];
  let ok = required.every((relative) => requireFile(path.join(appRoot, relative)));
  ok = verifySelfContained(sidecarInput) && ok;
  if (ok) process.stdout.write('[package verify] Entradas de release completas.\n');
}

function verifyOutput() {
  const unpacked = path.join(releaseDir, 'win-unpacked');
  const installer = path.join(releaseDir, `Singevery-Setup-${pkg.version}.exe`);
  const required = [
    path.join(unpacked, 'Singevery.exe'),
    path.join(unpacked, 'GUIA_DE_USO.md'),
    path.join(unpacked, 'GUIA_BETA_PROFESORES.md'),
    path.join(unpacked, 'PRIVACIDAD_Y_DATOS.md'),
    path.join(unpacked, 'THIRD-PARTY-NOTICES.txt'),
    installer,
  ];
  let ok = required.every((file) => requireFile(file));
  ok = verifySelfContained(path.join(unpacked, 'resources', 'native', 'smtc', 'dist')) && ok;
  if (ok) {
    const installerTime = fs.statSync(installer).mtimeMs;
    const newestPayloadTime = Math.max(...required.slice(0, -1).map((file) => fs.statSync(file).mtimeMs));
    if (installerTime < newestPayloadTime) {
      fail('el instalador es anterior a su contenido; ejecuta npm run package:installer');
      ok = false;
    }
  }
  if (fs.existsSync(installer) && fs.statSync(installer).size < 20_000_000) {
    fail('el instalador parece incompleto (menos de 20 MB)');
    ok = false;
  }
  if (fs.existsSync(installer)) ok = verifyInstallerPayload(installer) && ok;
  if (!ok) return;

  const digest = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
  const checksumFile = `${installer}.sha256.txt`;
  fs.writeFileSync(checksumFile, `${digest}  ${path.basename(installer)}\n`, 'utf8');
  process.stdout.write(`[package verify] Instalador verificado: ${path.basename(installer)}\n`);
  process.stdout.write(`[package verify] SHA-256: ${digest}\n`);
}

const mode = process.argv[2];
if (mode === '--inputs') verifyInputs();
else if (mode === '--output') verifyOutput();
else {
  fail('usa --inputs o --output');
}
