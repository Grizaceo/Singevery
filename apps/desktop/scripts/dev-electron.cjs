/**
 * En Windows usa dev:electron:win (GPU habilitada, overlay transparente).
 * En Linux nativo usa dev:electron:linux (GPU habilitada, igual que Windows).
 * En WSL usa dev:electron:nix (GPU deshabilitada: WSLg no la expone bien).
 */
const { spawnSync } = require('child_process');
const os = require('os');

const isWsl = Boolean(process.env.WSL_DISTRO_NAME) || /microsoft/i.test(os.release());
const script =
  process.platform === 'win32' ? 'dev:electron:win' : process.platform === 'linux' && !isWsl ? 'dev:electron:linux' : 'dev:electron:nix';
const result = spawnSync('npm', ['run', script], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
