const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const asar = await import('@electron/asar');
  const root = path.resolve(__dirname, '..');
  const archive = path.join(process.argv[2], 'resources/app.asar');
  const expectedText = fs.readFileSync(path.join(root, 'dist/build-info.json'), 'utf8');
  const actualText = asar.extractFile(archive, 'dist/build-info.json').toString();
  if (actualText !== expectedText) throw new Error('El paquete no coincide con el build actual');
  const evidence = JSON.parse(actualText);
  if (evidence.version !== require('../package.json').version) throw new Error('Versión de build desactualizada');
  const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  if (evidence.lockSha256 !== sha256(fs.readFileSync(path.join(root, 'package-lock.json')))) throw new Error('El lock cambió después del build');
  for (const [name, expected] of Object.entries(evidence.files)) {
    if (sha256(asar.extractFile(archive, name)) !== expected) throw new Error(`Contenido desactualizado/manipulado: ${name}`);
    if (sha256(fs.readFileSync(path.join(root, name))) !== expected) throw new Error(`Recompila antes de empaquetar: ${name}`);
  }
  const secrets = asar.listPackage(archive).filter(name => /(^|[\\/])\.env(\.|$)/i.test(name));
  if (secrets.length) throw new Error('El ASAR contiene archivos .env');
  console.log(`[build verify] ${evidence.version}, Electron ${evidence.electron}: ${Object.keys(evidence.files).length} archivos verificados`);
}
main().catch(error => { console.error(`[build verify] ${error.message}`); process.exitCode = 1; });
