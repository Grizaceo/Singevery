// ============================================================================
// check-zombies.cjs — verifica que NO queden procesos zombie de Singevery.
//
// Corre con node PURO (sin dependencias) desde Windows, WSL o Linux.
// Busca, en la lista de procesos del SO:
//   - espejo-smtc.exe  (sidecar SMTC, Windows)
//   - Singevery.exe / singevery (main de la app empaquetada)
//   - electron(.exe)   (main en desarrollo)
//   - llama-server     (runtime LLM embebido, si se usa)
//
// Uso:
//   npm run check:zombies            → app cerrada: alerta si hay zombies
//   npm run check:zombies -- --allow  → app abierta: lista los procesos (info)
//
// Exit code: 0 = limpio, 1 = hay zombies (app cerrada) o error.
// ============================================================================

const { execFileSync } = require('child_process');

const ALLOW_APP = process.argv.includes('--allow');
const PATTERNS = ['espejo-smtc', 'Singevery', 'electron'];
/** Linux nativo (no WSL): la lista de procesos es la del propio SO. */
const NATIVE_LINUX = process.platform === 'linux' && !process.env.WSL_DISTRO_NAME && !/microsoft/i.test(require('os').release());
const APP_DIR = require('path').resolve(__dirname, '..');

function winProcesses() {
  const out = execFileSync('tasklist.exe', ['/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.replace(/^"|"$/g, '').split('","'))
    .map((cols) => ({ name: cols[0] || '', pid: cols[1] || '' }))
    .filter((p) => p.name);
}

/**
 * Procesos de Singevery en Linux. `electron` a secas no sirve de patrón:
 * cualquier app Electron del usuario (Discord, VS Code…) lo llevaría. Se
 * cuentan el binario empaquetado, el electron de ESTE repo y llama-server.
 */
function linuxProcesses() {
  const out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return out
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => ({ pid: m[1], name: m[2] }))
    .filter((p) => Number(p.pid) !== process.pid)
    .filter((p) => {
      // Solo el ejecutable (argv[0]): los argumentos de otras órdenes (una
      // shell, un grep) pueden mencionar "singevery" o la ruta del repo.
      const exe = p.name.split(/\s+/)[0];
      const base = require('path').basename(exe).toLowerCase();
      return (
        base === 'singevery' ||
        (base.endsWith('.appimage') && base.includes('singevery')) ||
        exe === require('path').join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron') ||
        base === 'llama-server'
      );
    });
}

function main() {
  const hits = NATIVE_LINUX
    ? linuxProcesses()
    : winProcesses().filter((p) => PATTERNS.some((pat) => p.name.toLowerCase().includes(pat.toLowerCase())));

  if (hits.length === 0) {
    console.log('[check-zombies] LIMPIO: no hay procesos de Singevery en segundo plano.');
    return 0;
  }

  if (ALLOW_APP) {
    console.log('[check-zombies] INFO (--allow): procesos Singevery presentes:');
    for (const h of hits) console.log(`  PID ${h.pid.padStart(7)}  ${h.name}`);
    console.log('[check-zombies] (esperado: la app está abierta)');
    return 0;
  }

  console.error('[check-zombies] ZOMBIES DETECTADOS — la app está cerrada pero quedaron procesos:');
  for (const h of hits) console.error(`  PID ${h.pid.padStart(7)}  ${h.name}`);
  console.error(
    NATIVE_LINUX
      ? '[check-zombies] Para matarlos: kill <pid>  (o kill -9 <pid>)'
      : '[check-zombies] Para matarlos: taskkill /PID <pid> /F  (o Task Manager)',
  );
  return 1;
}

try {
  process.exit(main());
} catch (err) {
  console.error('[check-zombies] error al listar procesos:', err.message);
  process.exit(2);
}
