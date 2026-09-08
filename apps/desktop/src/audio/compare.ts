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
// Correcciones del audit (2026-09-08):
//  - Normalización temporal: el tiempo del usuario se mide RELATIVO al inicio
//    de su ventana (up.timeMs - userStart). Antes se usaba el tiempo absoluto
//    acumulado del monitor: la misma ventana puntuaba distinto según cuánto
//    llevara el monitor encendido, y el barrido quedaba corrido por userStart.
//  - Sin extrapolación: los puntos cuya posición caería FUERA de la cobertura
//    temporal de la referencia se descartan. Antes, nearestRef devolvía la
//    primera/última nota indefinidamente, permitiendo score perfecto con un
//    offset completamente anterior (o posterior) a la canción.
//  - Cobertura mínima: un candidato solo se acepta si al menos minCoverage de
//    los puntos del usuario caen dentro de la referencia; la cobertura real
//    se reporta en el resultado.
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
  /** Fracción (0..1) de puntos del usuario con cobertura real en la referencia. */
  coverage: number;
}

export interface CompareOptions {
  /** Tolerancia en cents (por defecto ±50 = cuarto de tono, ver SWAP). */
  toleranceCents?: number;
  /** Salto del barrido de offsets en ms. */
  offsetHopMs?: number;
  /** Máximo desplazamiento a buscar en ms (por defecto ±20 s). */
  maxOffsetMs?: number;
  /** Cobertura mínima (0..1) para aceptar un candidato. */
  minCoverage?: number;
}

const DEFAULT_COMPARE: Required<CompareOptions> = {
  toleranceCents: 50,
  offsetHopMs: 200,
  maxOffsetMs: 20000,
  minCoverage: 0.5,
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
    return { score: 0, bestOffsetMs: 0, targetFreq: null, validCount: 0, coverage: 0 };
  }

  // Duracion de la ventana del usuario (tiempo RELATIVO: el inicio de la
  // ventana es el origen, no el arranque del monitor).
  const userStart = valid[0].timeMs;
  const userEnd = valid[valid.length - 1].timeMs;
  const userDur = Math.max(1, userEnd - userStart);

  // Referencia: índice por tiempo para lookup rápido.
  const refStart = reference[0].timeMs;
  const refEnd = reference[reference.length - 1].timeMs;

  let bestScore = -1;
  let bestOffset = 0;
  let bestTarget: number | null = null;
  let bestCoverage = 0;

  // Barrido de offsets: el inicio de la ventana del usuario se alinea con
  // (refStart - maxOffset) .. (refEnd - userDur + maxOffset).
  const firstOffset = refStart - opts.maxOffsetMs;
  const lastOffset = refEnd - userDur + opts.maxOffsetMs;

  for (let offset = firstOffset; offset <= lastOffset; offset += opts.offsetHopMs) {
    let hits = 0;
    let covered = 0;
    let targetFreq: number | null = null;

    for (const up of valid) {
      // Tiempo del usuario RELATIVO a su ventana: el inicio de la ventana se
      // alinea con la referencia en `offset`. Sin esta normalización, una
      // ventana capturada tarde (monitor encendido hace rato) queda corrida
      // por userStart y el score depende del tiempo acumulado.
      const refTime = up.timeMs - userStart + offset;
      // Fuera de la cobertura temporal de la referencia: no extrapolar la
      // primera/última nota (permitía score perfecto sin solapamiento real).
      if (refTime < refStart || refTime > refEnd) continue;
      covered++;
      // Buscar el punto de referencia más cercano en tiempo.
      const ref = nearestRef(reference, refTime);
      if (!ref || ref.freq == null) continue;
      const cents = Math.abs(centsBetween(up.freq!, ref.freq));
      if (cents <= opts.toleranceCents) hits++;
      if (targetFreq == null) targetFreq = ref.freq;
    }

    if (covered === 0) continue;
    const coverage = covered / valid.length;
    // Score sobre TODOS los puntos válidos, no solo los cubiertos: la
    // cobertura entra sola en el denominador y un alineamiento parcial en el
    // borde de la referencia no puede ganarle a uno completo (MEDIA 7 del
    // audit Opus). Antes (hits/covered), un borde con coverage 0.5 y score
    // 1.00 le ganaba a un alineamiento completo con 0.97.
    const score = hits / valid.length;
    // Exigir solapamiento mínimo: un puñado de puntos pegados al borde de la
    // referencia no debe bastar para un score perfecto. Ante score empatado,
    // gana el alineamiento con MAYOR cobertura (el parcial no debe ganarle al
    // completo solo por aparecer primero en el barrido).
    if (
      coverage >= opts.minCoverage &&
      (score > bestScore || (score === bestScore && coverage > bestCoverage))
    ) {
      bestScore = score;
      bestOffset = offset;
      bestTarget = targetFreq;
      bestCoverage = coverage;
    }
  }

  return {
    score: bestScore < 0 ? 0 : bestScore,
    bestOffsetMs: bestOffset,
    targetFreq: bestTarget,
    validCount: valid.length,
    coverage: bestCoverage,
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
