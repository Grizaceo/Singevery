/**
 * Libera procesos de desarrollo colgados (Electron + puerto Vite 5173).
 * Uso: npm run dev:kill
 */
const { execSync, spawnSync } = require('child_process');

const PORT = 5173;
const quiet = process.argv.includes('--quiet');

function log(msg) {
  if (!quiet) console.log(msg);
}

function killPortWin(port) {
  try {
    const out = execSync(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    );
    const pids = new Set();
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        log(`[dev:kill] Puerto ${port}: proceso ${pid} terminado`);
      } catch {
        /* noop */
      }
    }
  } catch {
    /* puerto libre */
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
