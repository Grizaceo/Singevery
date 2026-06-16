import type { TrackMatch } from '../../src/types';

export type RecognitionPhase = 'LISTENING' | 'IDENTIFYING' | null;

/** Compensa latencia de grabación + identificación (ms). */
export const SYNC_OFFSET_MS = 300;

export function adjustMatchPosition(
  match: TrackMatch,
  recordStartedAt: number,
): { positionMs: number; anchorAt: number } {
  const anchorAt = match.matched_at;
  const elapsed = anchorAt - recordStartedAt;
  return {
    positionMs: match.position_ms + Math.max(0, elapsed) + SYNC_OFFSET_MS,
    anchorAt,
  };
}

/** Proyecta la posición anclada al momento actual (p. ej. tras fetch de letra). */
export function projectAnchoredPosition(
  positionMs: number,
  anchoredAt: number,
  at = Date.now(),
): { positionMs: number; anchorAt: number } {
  return {
    positionMs: positionMs + Math.max(0, at - anchoredAt),
    anchorAt: at,
  };
}

// ============================================================================
// Corrección de deriva (drift) — re-sincronización continua.
//
// Tras el primer match, la posición avanza por reloj de pared y se va
// desviando de la realidad (error del timecode de AudD, etc). Cada nueva
// identificación produce un `error` entre lo que AudD estima "ahora" y lo
// que mostramos "ahora". En vez de saltar, absorbemos una fracción del error
// de forma suave (rampa), salvo que el error sea enorme (seek/cambio brusco),
// en cuyo caso saltamos. Si es minúsculo, lo ignoramos para no temblar.
// ============================================================================

/** Errores por debajo de esto se ignoran (evita jitter por ruido de AudD). */
export const DRIFT_DEADBAND_MS = 150;
/** Errores por encima de esto se tratan como seek/salto → corrección dura. */
export const DRIFT_SNAP_MS = 4000;
/** Fracción del error que se absorbe en cada corrección suave (low-pass). */
export const DRIFT_GAIN = 0.6;
/** Duración de la rampa con la que se aplica una corrección suave. */
export const CORRECTION_RAMP_MS = 1200;

export interface DriftDecision {
  action: 'ignore' | 'correct' | 'snap';
  /** ms a aplicar: para 'correct' es error*gain (rampa); para 'snap' es el error completo. */
  correctionMs: number;
  errorMs: number;
}

/**
 * Decide cómo reconciliar la posición estimada por un nuevo match con la
 * posición que se está mostrando ahora mismo. Función pura (testeable).
 *
 * @param estimatedNowMs posición real estimada por el match, proyectada a "ahora".
 * @param currentNowMs   posición que el widget está mostrando "ahora".
 */
export function computeDrift(estimatedNowMs: number, currentNowMs: number): DriftDecision {
  const errorMs = estimatedNowMs - currentNowMs;
  const abs = Math.abs(errorMs);
  if (abs < DRIFT_DEADBAND_MS) return { action: 'ignore', correctionMs: 0, errorMs };
  if (abs > DRIFT_SNAP_MS) return { action: 'snap', correctionMs: errorMs, errorMs };
  return { action: 'correct', correctionMs: errorMs * DRIFT_GAIN, errorMs };
}

/**
 * Valor de la corrección suave en curso en el instante `now`: ramplea
 * linealmente de 0 a `targetMs` durante `rampMs`. Función pura (testeable).
 */
export function rampedCorrection(
  targetMs: number,
  startedAt: number,
  now: number,
  rampMs = CORRECTION_RAMP_MS,
): number {
  if (targetMs === 0 || rampMs <= 0) return targetMs;
  const t = Math.max(0, Math.min(1, (now - startedAt) / rampMs));
  return targetMs * t;
}

/** Clave canónica de pista para persistir el offset crónico. */
export function normalizeTrackKey(artist: string, title: string): string {
  const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${norm(artist)}::${norm(title)}`;
}
