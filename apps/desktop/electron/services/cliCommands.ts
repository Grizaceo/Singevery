// ============================================================================
// cliCommands.ts — comandos por línea de comandos para la instancia en curso.
//
// En Windows los atajos Ctrl+Alt+S / T / flechas son globales por la API del
// SO. En Wayland una app no puede capturar teclas globales: el que manda es el
// compositor. La vía universal es que el atajo del escritorio ejecute
//   singevery --sing            (expandir + reconocer)
//   singevery --tangible        (alternar modo tangible)
//   singevery --move=left|right|up|down
// La segunda instancia no abre otra ventana: el lock de instancia única le
// pasa los argumentos a la que ya corre (evento 'second-instance') y termina.
// En Hyprland la app registra esos atajos sola (ver linux/hyprland.ts).
// ============================================================================

export type CliCommand =
  | { type: 'sing' }
  | { type: 'tangible' }
  | { type: 'move'; dx: number; dy: number };

const DIRECTIONS: Record<string, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/**
 * Busca un comando de Singevery en argv. Pura (testeable). Ignora el resto de
 * argumentos: Chromium añade los suyos (--allow-file-access…, --enable-…).
 */
export function parseCliCommand(argv: readonly string[], moveStepPx: number): CliCommand | null {
  for (const arg of argv) {
    if (arg === '--sing') return { type: 'sing' };
    if (arg === '--tangible') return { type: 'tangible' };
    const move = /^--move=(left|right|up|down)$/.exec(arg);
    if (move) {
      const [x, y] = DIRECTIONS[move[1]];
      return { type: 'move', dx: x * moveStepPx, dy: y * moveStepPx };
    }
  }
  return null;
}
