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

/** Tamaños de fuente por tier. En secciones densas (fast_pace) la línea
 * SIGUIENTE crece hacia el tamaño de la actual (es la que se lee con
 * anticipación) y la previa cede espacio vertical para compensar. */
export interface TierSizes {
  current: string;
  prevAdjacent: string;
  nextAdjacent: string;
  far: string;
}

export function tierSizes(fontScale: number, fastPace: boolean): TierSizes {
  return {
    current: `${4 * fontScale}rem`,
    prevAdjacent: `${(fastPace ? 1.5 : 2.1) * fontScale}rem`,
    nextAdjacent: `${(fastPace ? 3 : 2.1) * fontScale}rem`,
    far: `${1.35 * fontScale}rem`,
  };
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
