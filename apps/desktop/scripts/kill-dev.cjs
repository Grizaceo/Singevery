/**
 * Libera procesos de desarrollo colgados (Electron + puerto Vite 5173).
 * Uso: npm run dev:kill
 *
 * En Windows solo mata procesos node en el puerto (evita intentar matar svchost).
 */
const { execSync, spawnSync } = require('child_process');

const PORT = 5173;
const quiet = process.argv.includes('--quiet');

function log(msg) {
  if (!quiet) console.log(msg);
}

function killPortWin(port) {
  const ps = [
    `$p=${port}`,
    '$conns=Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue',
    'foreach ($c in $conns) {',
    '  $proc=Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue',
    '  if ($proc -and $proc.ProcessName -eq "node") {',
    '    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue',
    '    Write-Output "killed:$($proc.Id)"',
    '  }',
    '}',
  ].join('; ');

  try {
    const out = execSync(`powershell -NoProfile -Command "${ps}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^killed:(\d+)$/);
      if (m) log(`[dev:kill] Puerto ${port}: node ${m[1]} terminado`);
    }
  } catch {
    /* puerto libre o sin permisos */
  }
}

function killPortUnix(port) {
  try {
    execSync(`npx --yes kill-port ${port}`, { stdio: 'ignore', shell: true });
    log(`[dev:kill] Puerto ${port} liberado`);
  } catch {
    /* noop */
  }
}

function killElectronWin() {
  try {
    execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
    log('[dev:kill] electron.exe terminado');
  } catch {
    /* no había procesos */
  }
}

function killElectronUnix() {
  try {
    execSync('pkill -f "electron \\." || true', { stdio: 'ignore', shell: true });
    log('[dev:kill] procesos electron terminados');
  } catch {
    /* noop */
  }
}

if (process.platform === 'win32') {
  killElectronWin();
  killPortWin(PORT);
} else {
  killElectronUnix();
  killPortUnix(PORT);
}

if (!quiet) {
  console.log('[dev:kill] Listo. Ejecuta npm run dev:electron');
}
