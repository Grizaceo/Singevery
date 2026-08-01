// ============================================================================
// compare.ts — comparación del pitch del usuario contra la melodía de
// referencia (P2, SWAP-PITCH-001).
//
// Estrategia: ventana deslizante sobre la referencia. No sabemos la posición
// exacta de la canción en tiempo real (el pitch del usuario no lleva reloj de
// canción), así que buscamos el segmento de la referencia que mejor matchea
// la ventana reciente de pitch del usuario. El score = % de puntos del usuario
// dentro de la tolerancia en cents, en el mejor offset.
//
// Puro y testeable: no toca DOM ni audio.
// ============================================================================

import type { MelodyPoint } from './melody';

/** Distancia entre dos frecuencias en cents (1200 cents = octava). */
export function centsBetween(f1: number, f2: number): number {
  if (f1 <= 0 || f2 <= 0) return Infinity;
  return 1200 * Math.log2(f2 / f1);
}

export interface MatchResult {
  /** Score 0..1: fracción de puntos del usuario dentro de tolerancia. */
  score: number;
  /** Offset (ms) de la referencia que maximizó el match. */
  bestOffsetMs: number;
  /** Frecuencia de referencia en el centro de la ventana (para mostrar la nota objetivo). */
  targetFreq: number | null;
  /** Cantidad de puntos del usuario con señal válida (denominador del score). */
  validCount: number;
}

export interface CompareOptions {
  /** Tolerancia en cents (por defecto ±50 = cuarto de tono, ver SWAP). */
  toleranceCents?: number;
  /** Salto del barrido de offsets en ms. */
  offsetHopMs?: number;
  /** Máximo desplazamiento a buscar en ms (por defecto ±20 s). */
  maxOffsetMs?: number;
}

const DEFAULT_COMPARE: Required<CompareOptions> = {
  toleranceCents: 50,
  offsetHopMs: 200,
  maxOffsetMs: 20000,
};

/**
 * Compara la ventana de pitch del usuario contra la referencia completa.
 * Devuelve el mejor score con su offset.
 */
export function matchWindow(
  userPitches: MelodyPoint[],
  reference: MelodyPoint[],
  options: CompareOptions = {},
): MatchResult {
  const opts = { ...DEFAULT_COMPARE, ...options };
  const valid = userPitches.filter((p) => p.freq != null);
  if (valid.length === 0 || reference.length === 0) {
    return { score: 0, bestOffsetMs: 0, targetFreq: null, validCount: 0 };
  }

  // Duracion de la ventana del usuario.
  const userStart = valid[0].timeMs;
  const userEnd = valid[valid.length - 1].timeMs;
  const userDur = Math.max(1, userEnd - userStart);

  // Referencia: índice por tiempo para lookup rápido.
  const refStart = reference[0].timeMs;
  const refEnd = reference[reference.length - 1].timeMs;

  let bestScore = -1;
  let bestOffset = 0;
  let bestTarget: number | null = null;

  // Barrido de offsets: el inicio de la ventana del usuario se alinea con
  // (refStart - maxOffset) .. (refEnd - userDur + maxOffset).
  const firstOffset = refStart - opts.maxOffsetMs;
  const lastOffset = refEnd - userDur + opts.maxOffsetMs;

  for (let offset = firstOffset; offset <= lastOffset; offset += opts.offsetHopMs) {
    let hits = 0;
    let total = 0;
    let targetFreq: number | null = null;

    for (const up of valid) {
      const refTime = up.timeMs + offset; // donde estaría el usuario en la ref
      // Buscar el punto de referencia más cercano en tiempo.
      const ref = nearestRef(reference, refTime);
      if (!ref || ref.freq == null) continue;
      total++;
      const cents = Math.abs(centsBetween(up.freq!, ref.freq));
      if (cents <= opts.toleranceCents) hits++;
      if (targetFreq == null) targetFreq = ref.freq;
    }

    if (total === 0) continue;
    const score = hits / total;
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
      bestTarget = targetFreq;
    }
  }

  return {
    score: bestScore < 0 ? 0 : bestScore,
    bestOffsetMs: bestOffset,
    targetFreq: bestTarget,
    validCount: valid.length,
  };
}

/** Busca el punto de referencia más cercano en tiempo (búsqueda binaria). */
function nearestRef(reference: MelodyPoint[], timeMs: number): MelodyPoint | null {
  if (reference.length === 0) return null;
  let lo = 0;
  let hi = reference.length - 1;
  if (timeMs <= reference[0].timeMs) return reference[0];
  if (timeMs >= reference[hi].timeMs) return reference[hi];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (reference[mid].timeMs < timeMs) lo = mid + 1;
    else hi = mid;
  }
  // lo es el primer punto >= timeMs; comparar con el anterior.
  if (lo === 0) return reference[0];
  const a = reference[lo - 1];
  const b = reference[lo];
  return timeMs - a.timeMs <= b.timeMs - timeMs ? a : b;
}
