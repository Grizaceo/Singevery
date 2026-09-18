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

function findSevenZip() {
  const cacheRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache')
    : '';
  const fromCache = findExecutable(cacheRoot, '7za.exe');
  if (fromCache) return fromCache;
  // Entornos no-Windows (Docker): 7za puede estar en el cache de
  // electron-builder bajo ~/.cache o en el PATH (p7zip-full).
  const homeCache = process.env.HOME
    ? path.join(process.env.HOME, '.cache', 'electron-builder', 'Cache')
    : '';
  const fromHome = findExecutable(homeCache, '7za.exe');
  if (fromHome) return fromHome;
  for (const name of ['7za', '7z']) {
    const which = childProcess.spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      [name],
      { encoding: 'utf8' },
    );
    if (which.status === 0 && which.stdout.trim()) {
      const candidate = which.stdout.trim().split(/\r?\n/)[0];
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function verifyInstallerPayload(installer) {
  const sevenZip = findSevenZip();
  if (!sevenZip) {
    if (process.platform === 'win32') {
      fail('no se encontró 7za.exe para inspeccionar el contenido real del instalador');
      return false;
    }
    // Linux/Docker: sin 7za no se puede inspeccionar el NSIS; el contenido
    // ya se verificó en win-unpacked. Avisar sin fallar (ALTA 4 del audit
    // Opus): el build de Docker no debe morir después de generar el
    // instalador correctamente.
    process.stderr.write('[package verify] AVISO: sin 7za no se inspecciona el instalador NSIS (solo Windows).\n');
    return true;
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
  // Runtime LLM embebido: si el binario existe en inputs, debe viajar en el
  // instalador. Es condicional porque en dev puede no estar compilado.
  const llmBin = path.join(appRoot, 'native', 'llm', 'llama-server.exe');
  if (fs.existsSync(llmBin)) {
    const llmPath = 'resources\\native\\llm\\llama-server.exe';
    if (!listing.includes(`Path = ${llmPath}`)) {
      fail(`el instalador no contiene ${llmPath} (runtime LLM embebido)`);
      ok = false;
    }
  }

  // Ningún .env debe viajar dentro del instalador. Durante la beta, un
  // extraResources copiaba el .env del desarrollador a resources/.env y el
  // AUDD_API_TOKEN quedaba en texto plano para cualquiera que instalara la app.
  // check-secrets.cjs no puede detectarlo (salta los .env a propósito, porque el
  // .env local del desarrollador SÍ lleva un token real), así que la única
  // barrera posible es esta: mirar el artefacto que se va a repartir.
  for (const line of listing.split(/\r?\n/)) {
    const match = /^Path = (.*)$/.exec(line.trim());
    if (match && /(^|\\)\.env(\.|$)/i.test(match[1])) {
      fail(`el instalador contiene ${match[1]} — un .env empaquetado reparte credenciales`);
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
  // Espejo del check del instalador, un paso antes: si un .env se coló en
  // win-unpacked, se colará en el .exe.
  for (const dir of [unpacked, path.join(unpacked, 'resources')]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (/^\.env(\.|$)/i.test(entry)) {
        fail(`${path.join(path.relative(releaseDir, dir), entry)} no debe empaquetarse (credenciales)`);
        ok = false;
      }
    }
  }
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

/** Linux no lleva sidecar SMTC ni .ico: el reproductor se lee por MPRIS. */
function verifyInputsLinux() {
  const required = ['GUIA_BETA_PROFESORES.md', 'PRIVACIDAD_Y_DATOS.md', 'build/THIRD-PARTY-NOTICES.txt', 'build/icon.png'];
  if (required.every((relative) => requireFile(path.join(appRoot, relative)))) {
    process.stdout.write('[package verify] Entradas de release Linux completas.\n');
  }
}

/** .env en cualquier nivel del árbol empaquetado (credenciales). */
function findDotEnv(dir, depth = 4) {
  if (depth < 0 || !fs.existsSync(dir)) return [];
  const hits = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (/^\.env(\.|$)/i.test(entry.name)) hits.push(full);
    else if (entry.isDirectory() && entry.name !== 'node_modules') hits.push(...findDotEnv(full, depth - 1));
  }
  return hits;
}

function verifyOutputLinux() {
  const unpacked = path.join(releaseDir, 'linux-unpacked');
  const required = [
    path.join(unpacked, 'singevery'),
    path.join(unpacked, 'resources', 'app.asar'),
    path.join(unpacked, 'GUIA_DE_USO.md'),
    path.join(unpacked, 'GUIA_BETA_PROFESORES.md'),
    path.join(unpacked, 'PRIVACIDAD_Y_DATOS.md'),
    path.join(unpacked, 'THIRD-PARTY-NOTICES.txt'),
  ];
  let ok = required.every((file) => requireFile(file));
  if (fs.existsSync(path.join(unpacked, 'resources', 'native', 'smtc'))) {
    fail('el paquete Linux no debe llevar el sidecar SMTC de Windows');
    ok = false;
  }
  for (const hit of findDotEnv(unpacked)) {
    fail(`${path.relative(releaseDir, hit)} no debe empaquetarse (credenciales)`);
    ok = false;
  }
  const appImage = fs
    .readdirSync(releaseDir)
    .find((f) => f.startsWith(`Singevery-${pkg.version}-`) && f.endsWith('.AppImage'));
  if (!appImage) {
    fail(`falta el AppImage de la versión ${pkg.version}`);
    ok = false;
  } else if (fs.statSync(path.join(releaseDir, appImage)).size < 50_000_000) {
    fail('el AppImage parece incompleto (menos de 50 MB)');
    ok = false;
  }
  if (!ok) return;

  const file = path.join(releaseDir, appImage);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(`${file}.sha256.txt`, `${digest}  ${appImage}\n`, 'utf8');
  process.stdout.write(`[package verify] AppImage verificado: ${appImage}\n`);
  process.stdout.write(`[package verify] SHA-256: ${digest}\n`);
}

const mode = process.argv[2];
if (mode === '--inputs') verifyInputs();
else if (mode === '--output') verifyOutput();
else if (mode === '--inputs-linux') verifyInputsLinux();
else if (mode === '--output-linux') verifyOutputLinux();
else {
  fail('usa --inputs, --output, --inputs-linux o --output-linux');
}
