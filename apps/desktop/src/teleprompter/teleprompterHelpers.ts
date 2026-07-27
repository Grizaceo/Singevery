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

/**
 * Factor de compresión según cuántas líneas de contexto haya en pantalla.
 *
 * Con la ventana clásica (2 arriba + 2 abajo = 4 de contexto) todo entra
 * holgado. Si el usuario sube el contexto para ver más de lo que viene, hay
 * que encoger o el texto se sale de la ventana. Baja suave y con suelo, para
 * que 5 líneas por lado sigan siendo legibles. Función pura (testeable).
 */
export function contextScale(contextLines: number): number {
  const BASE = 4; // contexto de la configuración por defecto
  if (contextLines <= BASE) return 1;
  // −7% por cada línea extra, con suelo en 0.6 (aprox. 10 líneas de contexto).
  return Math.max(0.6, 1 - (contextLines - BASE) * 0.07);
}

/**
 * @param contextLines total de líneas visibles además de la actual (previas +
 *        siguientes). Se deduce del propio RenderModel, así no hace falta
 *        propagar el ajuste hasta el renderer.
 */
export function tierSizes(
  fontScale: number,
  fastPace: boolean,
  contextLines = 4,
): TierSizes {
  const k = fontScale * contextScale(contextLines);
  return {
    current: `${4 * k}rem`,
    prevAdjacent: `${(fastPace ? 1.5 : 2.1) * k}rem`,
    nextAdjacent: `${(fastPace ? 3 : 2.1) * k}rem`,
    far: `${1.35 * k}rem`,
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
