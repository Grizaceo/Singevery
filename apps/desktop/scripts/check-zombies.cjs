// ============================================================================
// check-zombies.cjs — verifica que NO queden procesos zombie de Singevery.
//
// Corre con node PURO (sin dependencias) desde WSL o Windows.
// Busca, en la lista de procesos de Windows:
//   - espejo-smtc.exe  (sidecar SMTC)
//   - Singevery.exe    (main de la app empaquetada)
//   - electron.exe     (main en desarrollo)
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

function main() {
  const procs = winProcesses();
  const hits = procs.filter((p) => PATTERNS.some((pat) => p.name.toLowerCase().includes(pat.toLowerCase())));

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
  console.error('[check-zombies] Para matarlos: taskkill /PID <pid> /F  (o Task Manager)');
  return 1;
}

try {
  process.exit(main());
} catch (err) {
  console.error('[check-zombies] error al listar procesos:', err.message);
  process.exit(2);
}
