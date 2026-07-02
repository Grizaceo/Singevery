/**
 * En Windows usa dev:electron:win (GPU habilitada, overlay transparente).
 * En Linux/WSL usa dev:electron:nix (GPU deshabilitada).
 */
const { spawnSync } = require('child_process');

const script = process.platform === 'win32' ? 'dev:electron:win' : 'dev:electron:nix';
const result = spawnSync('npm', ['run', script], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
