// Embed hashes of the actual build outputs, not just the package version.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const files = {};
function visit(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`;
    if (name === 'dist/build-info.json' || name.endsWith('.map')) continue;
    if (entry.isDirectory()) visit(name);
    else files[name] = digest(fs.readFileSync(path.join(root, name)));
  }
}
visit('dist');
visit('dist-electron');
let commit = 'unknown';
try { commit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* source archive */ }
// Restricted build environments can read the checkout but cannot spawn git.
if (commit === 'unknown') {
  try {
    let gitDir = path.resolve(root, '../../.git');
    if (fs.statSync(gitDir).isFile()) {
      gitDir = path.resolve(path.dirname(gitDir), fs.readFileSync(gitDir, 'utf8').trim().replace(/^gitdir: /, ''));
    }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (/^[a-f0-9]{40}$/.test(head)) commit = head;
    else if (head.startsWith('ref: ')) {
      const ref = head.slice(5);
      try { commit = fs.readFileSync(path.join(gitDir, ref), 'utf8').trim(); }
      catch {
        const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
        commit = packed.split('\n').find(line => line.endsWith(` ${ref}`))?.split(' ')[0] ?? 'unknown';
      }
    }
  } catch { /* source archive without git metadata */ }
}
const pkg = require('../package.json');
const lock = require('../package-lock.json');
fs.writeFileSync(path.join(root, 'dist/build-info.json'), JSON.stringify({
  version: pkg.version,
  commit,
  electron: lock.packages['node_modules/electron'].version,
  lockSha256: digest(fs.readFileSync(path.join(root, 'package-lock.json'))),
  files,
}, null, 2) + '\n');
