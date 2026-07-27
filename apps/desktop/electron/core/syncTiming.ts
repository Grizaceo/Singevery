import type { TrackMatch } from '../../src/types';

export type RecognitionPhase = 'LISTENING' | 'IDENTIFYING' | null;

/** Compensa latencia de grabación + identificación (ms). Valor por defecto de
 *  la calibración global; el ajuste persistido vive en settings.ts. */
export const SYNC_OFFSET_MS = 300;

/**
 * Qué fracción de `sample_offset_ms` se descuenta al anclar un match.
 *
 * La huella enviada a Shazam cubre la ventana [0, samplems] de la grabación, y
 * su `offset` está referido a ALGÚN punto de esa ventana — la API no documenta
 * cuál. Medido contra el comportamiento observado:
 *   - descontando 0 (comportamiento original), la letra se estabilizaba
 *     ADELANTADA → el punto no es el inicio de la ventana;
 *   - descontando la ventana completa, queda ATRASADA → tampoco es el final.
 * Con el punto real acotado entre ambos extremos, el punto medio es la
 * estimación que minimiza el error máximo. El residuo que quede lo absorbe la
 * calibración global (manual o aprendida), que es constante por equipo.
 */
export const SAMPLE_ANCHOR_FRACTION = 0.5;

/**
 * Ancla el timecode del reconocedor al instante del match.
 *
 * La cuenta correcta necesita saber a QUÉ INSTANTE de la grabación se refiere
 * `position_ms` (`sample_offset_ms`). Antes se asumía siempre el inicio de la
 * grabación y se sumaba el elapsed completo:
 *
 *     positionMs = position_ms + (matched_at − recordStartedAt) + calibración
 *
 * Con AudD eso es correcto (`timecode` apunta al inicio del archivo), pero
 * Shazam —el proveedor por defecto— devuelve un offset referido al FINAL de la
 * ventana de audio que cubre la huella (`samplems`, varios segundos dentro del
 * chunk de 6s). Se contaba ese tramo dos veces → cada corrección medía la
 * posición con un sesgo constante HACIA ADELANTE, y como el lazo de corrección
 * empuja la letra hacia lo medido, terminaba estabilizándose adelantada.
 *
 * Ahora se retrocede primero a la posición en `recordStartedAt` y desde ahí se
 * proyecta. `syncOffsetMs` es la calibración global de latencia (por defecto
 * SYNC_OFFSET_MS); se recibe por parámetro para que el StateStore use el valor
 * persistido (P2.8). Función pura.
 */
export function adjustMatchPosition(
  match: TrackMatch,
  recordStartedAt: number,
  syncOffsetMs: number = SYNC_OFFSET_MS,
): { positionMs: number; anchorAt: number } {
  const anchorAt = match.matched_at;
  const elapsed = Math.max(0, anchorAt - recordStartedAt);
  // Posición de la canción en el instante en que empezó la grabación. El
  // offset no puede superar el tiempo transcurrido (no se puede haber grabado
  // más audio del que pasó): acota valores absurdos del proveedor.
  const sampleOffset =
    Math.min(Math.max(0, match.sample_offset_ms ?? 0), elapsed) * SAMPLE_ANCHOR_FRACTION;
  const positionAtRecordStart = Math.max(0, match.position_ms - sampleOffset);
  return {
    positionMs: positionAtRecordStart + elapsed + syncOffsetMs,
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

/**
 * Progreso fraccional (0..1) de la línea actual en `positionMs`. Avanza
 * linealmente desde start_ms hasta end_ms; si falta end_ms se usa el inicio
 * de la siguiente línea (nextStartMs). Antes de start → 0; a partir de end → 1.
 * Si no se puede inferir la duración (última línea sin end_ms ni siguiente),
 * devuelve 0 (sin resaltado) — la precisión por palabra (A2/P2.7) cubre ese
 * caso. Función pura (testeable).
 */
export function computeLineProgress(
  line: { start_ms: number; end_ms?: number | null },
  positionMs: number,
  nextStartMs?: number,
): number {
  const start = line.start_ms;
  const end = line.end_ms ?? nextStartMs;
  if (end == null || end <= start) return 0;
  if (positionMs <= start) return 0;
  if (positionMs >= end) return 1;
  return (positionMs - start) / (end - start);
}

/** Clave canónica de pista para persistir el offset crónico. */
export function normalizeTrackKey(artist: string, title: string): string {
  const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${norm(artist)}::${norm(title)}`;
}
