const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

/** Handles both 7-Zip's embedded-archive detection and older NSIS wrapper listings. */
function installerListing(sevenZip, installer, run = cp.spawnSync) {
  const options = { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, windowsHide: true };
  const list = file => {
    const result = run(sevenZip, ['l', '-slt', file], options);
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || '7-Zip falló').trim());
    return result.stdout.replace(/\//g, '\\');
  };
  const listing = list(installer);
  if (/^Path = resources\\app\.asar\r?$/m.test(listing)) return listing;
  const payload = listing.split(/\r?\n/).map(line => /^Path = (\$PLUGINSDIR\\app-64\.7z)$/.exec(line.trim())).find(Boolean)?.[1];
  if (!payload) throw new Error('No se encontró el payload x64 dentro del instalador NSIS');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'singevery-installer-'));
  try {
    const result = run(sevenZip, ['e', '-y', `-o${temp}`, installer, payload], options);
    if (result.status !== 0) throw new Error('No se pudo extraer el payload NSIS');
    return list(path.join(temp, 'app-64.7z'));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
module.exports = { installerListing };
