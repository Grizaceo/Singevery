// ============================================================================
// energySync.ts — sincronización por correlación de energía vocal.
//
// La idea: no hace falta transcribir el audio para saber si la letra va
// corrida. Basta con saber CUÁNDO hay voz. Se construyen dos máscaras
// booleanas sobre la misma línea de tiempo:
//
//   máscara LRC   ─ ¿hay una línea de letra activa en este instante?
//   máscara AUDIO ─ ¿hay energía en la banda vocal en este instante?
//
// El desplazamiento que mejor las alinea es el error de sincronía. Es barato
// (una FFT por bloque de 200 ms), no depende de ningún servicio, y funciona
// igual en japonés que en español porque no mira el contenido, solo el ritmo
// de entradas y silencios.
//
// La trampa que hay que evitar (chorus trap): un estribillo que se repite hace
// que varios desplazamientos correlacionen casi igual de bien. Por eso el pico
// no basta: tiene que ser fuerte Y ÚNICO. Si el segundo mejor pico lejano
// puntúa parecido, la medición no vale y se descarta.
//
// Todo aquí es función pura sobre arrays: se puede testear con señales
// sintéticas sin audio real.
// ============================================================================

import type { LyricLine } from '../../src/types';
import { floorPowerOfTwo, magnitudeSpectrum, binToHz } from './fft';

/** Granularidad temporal de las máscaras. 200 ms ≈ una sílaba cantada. */
export const ENERGY_BIN_MS = 200;

/** Banda donde vive la voz cantada (fundamental + primeros formantes). */
export const VOCAL_BAND_HZ = { low: 200, high: 3000 } as const;

// --- Máscara de la letra ---------------------------------------------------

/**
 * Máscara booleana de "hay línea sonando" a partir de los timestamps del LRC.
 * `startBin` es el bin de la posición inicial; se generan `bins` casillas.
 *
 * Si una línea no trae `end_ms` (lo normal en LRC), se asume que dura hasta el
 * inicio de la siguiente, con un tope: un silencio de dos minutos entre versos
 * no debe contarse como canto continuo.
 */
export function buildLyricsActivityMask(
  lines: LyricLine[],
  startBin: number,
  bins: number,
  binMs: number = ENERGY_BIN_MS,
  maxLineMs = 12_000,
): boolean[] {
  const mask = new Array<boolean>(Math.max(0, bins)).fill(false);
  if (bins <= 0 || lines.length === 0) return mask;

  const sorted = [...lines].sort((a, b) => a.start_ms - b.start_ms);
  for (let i = 0; i < sorted.length; i += 1) {
    const line = sorted[i];
    const next = sorted[i + 1];
    const rawEnd = line.end_ms ?? (next ? next.start_ms : line.start_ms + maxLineMs);
    const end = Math.min(rawEnd, line.start_ms + maxLineMs);
    const from = Math.max(0, Math.floor(line.start_ms / binMs) - startBin);
    const to = Math.min(bins - 1, Math.ceil(end / binMs) - startBin);
    for (let b = from; b <= to; b += 1) {
      if (b >= 0 && b < bins) mask[b] = true;
    }
  }
  return mask;
}

// --- Máscara del audio -----------------------------------------------------

/**
 * Proporción de energía en la banda vocal sobre la energía total del espectro.
 * Es una RAZÓN, no un nivel: así el resultado no depende del volumen, que en
 * este widget varía con lo que el usuario tenga puesto en el sistema.
 */
export function vocalBandRatio(
  magnitudes: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  band: { low: number; high: number } = VOCAL_BAND_HZ,
): number {
  let total = 0;
  let vocal = 0;
  for (let k = 1; k < magnitudes.length; k += 1) {
    const power = magnitudes[k] * magnitudes[k];
    total += power;
    const hz = binToHz(k, sampleRate, fftSize);
    if (hz >= band.low && hz <= band.high) vocal += power;
  }
  return total > 0 ? vocal / total : 0;
}

export interface VocalMaskResult {
  mask: boolean[];
  /** Razón vocal cruda por bin (para diagnóstico y umbral adaptativo). */
  ratios: number[];
  /** Umbral que se aplicó. */
  threshold: number;
}

/**
 * Convierte PCM mono en una máscara de actividad vocal.
 *
 * El umbral es ADAPTATIVO, no fijo: la mezcla de cada canción tiene su propio
 * piso y techo de energía vocal (una balada acústica y un tema de metal no
 * comparten escala). Se toma el rango observado en la ventana y se corta a
 * `thresholdFactor` del recorrido entre el mínimo y el máximo. Si el rango es
 * demasiado plano —silencio absoluto o un instrumental parejo— no hay nada que
 * distinguir y la máscara queda toda en false.
 */
export function buildVocalMaskFromPcm(
  samples: Float32Array,
  sampleRate: number,
  binMs: number = ENERGY_BIN_MS,
  options: { thresholdFactor?: number; minRange?: number } = {},
): VocalMaskResult {
  const thresholdFactor = options.thresholdFactor ?? 0.4;
  const minRange = options.minRange ?? 0.05;
  const samplesPerBin = Math.max(1, Math.round((sampleRate * binMs) / 1000));
  const fftSize = floorPowerOfTwo(samplesPerBin);
  const bins = Math.floor(samples.length / samplesPerBin);
  const ratios: number[] = [];

  if (fftSize < 32 || bins <= 0) return { mask: [], ratios: [], threshold: 0 };

  for (let b = 0; b < bins; b += 1) {
    const from = b * samplesPerBin;
    const block = samples.subarray(from, from + fftSize);
    if (block.length < fftSize) break;
    ratios.push(vocalBandRatio(magnitudeSpectrum(block), sampleRate, fftSize));
  }
  if (ratios.length === 0) return { mask: [], ratios: [], threshold: 0 };

  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  if (max - min < minRange) {
    // Sin contraste no se puede afirmar dónde entra la voz.
    return { mask: ratios.map(() => false), ratios, threshold: max + 1 };
  }
  const threshold = min + thresholdFactor * (max - min);
  return { mask: ratios.map((r) => r >= threshold), ratios, threshold };
}

// --- Correlación -----------------------------------------------------------

export interface EnergyCorrelation {
  /**
   * Milisegundos que hay que SUMAR a la posición mostrada para alinear la
   * letra con lo que se escucha. Negativo = la letra va adelantada.
   */
  offsetMs: number;
  /** 0..1. Alta solo si el pico es fuerte Y único (ver chorus trap). */
  confidence: number;
  /** Correlación del mejor desplazamiento (-1..1). */
  peak: number;
  /** Mejor correlación entre los desplazamientos LEJANOS al ganador. */
  runnerUp: number;
  /** Bins comparados en el mejor desplazamiento. */
  overlapBins: number;
}

export interface CorrelateOptions {
  binMs: number;
  /** Desplazamiento máximo a explorar, en ms. */
  maxLagMs: number;
  /** Mínimo solapamiento absoluto para que una comparación cuente. */
  minOverlapBins: number;
  /**
   * Fracción de la ventana que debe solaparse. Sin esto, los desplazamientos
   * grandes comparan un puñado de bins y cualquier coincidencia parcial gana:
   * la correlación de Pearson sobre pocas muestras es puro ruido.
   */
  minOverlapRatio: number;
  /** Distancia mínima para considerar a otro pico "lejano" (chorus trap). */
  peakSeparationMs: number;
}

export const DEFAULT_CORRELATE_OPTIONS: CorrelateOptions = {
  binMs: ENERGY_BIN_MS,
  maxLagMs: 5_000,
  minOverlapBins: 10,
  minOverlapRatio: 0.6,
  peakSeparationMs: 1_500,
};

/**
 * Diferencia de correlación entre el pico y su perseguidor lejano que ya
 * constituye evidencia completa de unicidad.
 */
const GAP_FOR_FULL_CREDIT = 0.5;

/**
 * Confianza mínima para tocar la sincronía. Calibrado contra las señales
 * sintéticas de los tests: un alineamiento limpio pasa de 0.8, dos frases
 * sueltas en una ventana de 6 s rondan 0.2, y un patrón repetido (la trampa
 * del estribillo) se queda cerca de 0. Ante la duda NO se corrige: mover la
 * letra sin motivo es peor que dejarla como está.
 */
export const ENERGY_SYNC_MIN_CONFIDENCE = 0.35;

/** Corrección máxima que se admite de una sola medición. */
export const ENERGY_SYNC_MAX_CORRECTION_MS = 3_000;

const EMPTY_CORRELATION: EnergyCorrelation = {
  offsetMs: 0,
  confidence: 0,
  peak: 0,
  runnerUp: 0,
  overlapBins: 0,
};

/**
 * Correlación de Pearson entre dos tramos booleanos. Con secuencias constantes
 * (todo true o todo false) la varianza es cero y no hay nada que correlacionar:
 * devuelve 0 en vez de dividir por cero.
 */
function booleanCorrelation(a: boolean[], b: boolean[], aFrom: number, bFrom: number, len: number): number {
  if (len <= 0) return 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < len; i += 1) {
    if (a[aFrom + i]) sumA += 1;
    if (b[bFrom + i]) sumB += 1;
  }
  const meanA = sumA / len;
  const meanB = sumB / len;
  let num = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < len; i += 1) {
    const da = (a[aFrom + i] ? 1 : 0) - meanA;
    const db = (b[bFrom + i] ? 1 : 0) - meanB;
    num += da * db;
    varA += da * da;
    varB += db * db;
  }
  const den = Math.sqrt(varA * varB);
  return den > 0 ? num / den : 0;
}

/**
 * Busca el desplazamiento que mejor alinea la máscara de la letra con la del
 * audio. Ambas deben estar en la MISMA línea de tiempo nominal (la posición
 * que el widget cree) y con la misma granularidad.
 *
 * La confianza castiga la ambigüedad: si otro desplazamiento lejano correlaciona
 * casi igual (estribillo repetido, patrón de versos regular), el resultado no
 * sirve por más alto que sea el pico.
 */
export function correlateEnergyMask(
  lrcMask: boolean[],
  audioMask: boolean[],
  options: Partial<CorrelateOptions> = {},
): EnergyCorrelation {
  const opts = { ...DEFAULT_CORRELATE_OPTIONS, ...options };
  if (lrcMask.length === 0 || audioMask.length === 0) return EMPTY_CORRELATION;

  const maxLag = Math.max(0, Math.round(opts.maxLagMs / opts.binMs));
  const separation = Math.max(1, Math.round(opts.peakSeparationMs / opts.binMs));
  const window = Math.min(lrcMask.length, audioMask.length);
  const minOverlap = Math.max(opts.minOverlapBins, Math.ceil(window * opts.minOverlapRatio));

  const scores = new Map<number, number>();
  let best = { lag: 0, score: -Infinity, overlap: 0 };

  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    // lrcMask[i] se compara con audioMask[i + lag].
    const from = Math.max(0, -lag);
    const to = Math.min(lrcMask.length, audioMask.length - lag);
    const len = to - from;
    if (len < minOverlap) continue;

    const score = booleanCorrelation(lrcMask, audioMask, from, from + lag, len);
    scores.set(lag, score);
    if (score > best.score) best = { lag, score, overlap: len };
  }

  if (!Number.isFinite(best.score) || scores.size === 0) return EMPTY_CORRELATION;

  let runnerUp = -Infinity;
  for (const [lag, score] of scores) {
    if (Math.abs(lag - best.lag) < separation) continue;
    if (score > runnerUp) runnerUp = score;
  }
  if (!Number.isFinite(runnerUp)) runnerUp = 0;

  const peak = best.score;
  // Confianza = fuerza del pico × unicidad del pico.
  //
  // La unicidad se mide como la DISTANCIA absoluta al mejor pico lejano, no
  // como fracción: las correlaciones ya están normalizadas a [-1,1], y una
  // diferencia de 0.5 entre el ganador y su perseguidor es evidencia completa
  // de que el alineamiento es uno solo. Un pico negativo o nulo significa que
  // las máscaras no se parecen en ningún desplazamiento: no hay medición.
  const gap = Math.max(0, peak - runnerUp);
  const uniqueness = Math.min(1, gap / GAP_FOR_FULL_CREDIT);
  const confidence = peak > 0 ? Math.max(0, Math.min(1, peak)) * uniqueness : 0;

  return {
    // El mejor lag L significa: el audio va L bins por delante de la letra en
    // la línea de tiempo nominal, o sea que la posición mostrada se pasa por L.
    // Para alinear hay que restarle esa cantidad. El `|| 0` evita devolver -0,
    // que serializa raro en el JSON de diagnóstico.
    offsetMs: -(best.lag * opts.binMs) || 0,
    confidence,
    peak,
    runnerUp,
    overlapBins: best.overlap,
  };
}
