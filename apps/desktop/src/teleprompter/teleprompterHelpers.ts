import type { RenderLine } from '../types';

/** Parte líneas previas: lejana + adyacente (última). */
export function splitPreviousTiers(lines: RenderLine[]): {
  far: RenderLine[];
  adjacent: RenderLine[];
} {
  if (lines.length <= 1) return { far: [], adjacent: lines };
  return { far: lines.slice(0, -1), adjacent: lines.slice(-1) };
}

/** Parte líneas siguientes: adyacente (primera) + lejana (resto). */
export function splitNextTiers(lines: RenderLine[]): {
  far: RenderLine[];
  adjacent: RenderLine[];
} {
  if (lines.length <= 1) return { far: [], adjacent: lines };
  return { far: lines.slice(1), adjacent: lines.slice(0, 1) };
}

export const STATUS_LABEL: Record<string, string> = {
  IDLE: 'Esperando',
  LISTENING: 'Escuchando',
  IDENTIFYING: 'Identificando',
  FETCHING_LYRICS: 'Buscando letra',
  DISPLAYING: '',
  NO_LYRICS: 'Sin letra',
  ERROR: 'Error',
};
