// ============================================================================
// melody.ts — extracción de la melodía de referencia de una canción (P1,
// SWAP-PITCH-001).
//
// Decisión de diseño (Cristóbal, 2026-08-01): la referencia NO es una
// partitura oficial. Es la melodía aproximada que la app extrae de la propia
// canción (la pista capturada por loopback). La UI avisa explícitamente que es
// una interpretación automática.
//
// Enfoque: ventana deslizante de detectPitch (YIN/CMNDF) sobre el buffer
// completo, restringida al rango vocal y con suavizado temporal. Es una
// heurística (frecuencia dominante en rango vocal), no separación de fuentes:
// funciona bien cuando la voz es el componente más prominente en 150-800 Hz
// (pop/rock/J-Pop típico), y se degrada en arreglos densos — aceptado como
// limitación documentada.
//
// Mejora futura (anotada en SWAP): basic-pitch (Spotify) o CREPE en sidecar si
// la calidad no alcanza.
// ============================================================================

import { detectPitch, PITCH_MIN_FREQ, PITCH_MAX_FREQ } from './pitch';

/** Un punto de la melodía: frecuencia estimada en un instante (o null = sin voz). */
export interface MelodyPoint {
  /** Tiempo desde el inicio del buffer, en ms. */
  timeMs: number;
  /** Frecuencia fundamental estimada en Hz, o null si no hay señal clara. */
  freq: number | null;
}

export interface MelodyExtractOptions {
  /** Tamaño de ventana de análisis en ms (2048 samples @ 48 kHz ≈ 43 ms). */
  windowMs?: number;
  /** Avance entre ventanas en ms. */
  hopMs?: number;
  /** Clarity mínima para aceptar un punto (0..1). */
  clarityThreshold?: number;
  /** Rango de frecuencias a conservar (Hz). Por defecto rango vocal. */
  minFreq?: number;
  maxFreq?: number;
}

const DEFAULT_OPTIONS: Required<MelodyExtractOptions> = {
  windowMs: 43,
  hopMs: 50,
  clarityThreshold: 0.08,
  minFreq: 150, // por debajo: bajo/instrumentos graves, no la voz
  maxFreq: 800, // por encima: agudos instrumentales, ruido
};

/**
 * Extrae la melodía de un buffer de samples mono.
 * Devuelve un punto cada `hopMs` milisegundos.
 */
export function extractMelody(
  samples: Float32Array,
  sampleRate: number,
  options: MelodyExtractOptions = {},
): MelodyPoint[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const windowLen = Math.max(64, Math.floor((sampleRate * opts.windowMs) / 1000));
  const hopLen = Math.max(1, Math.floor((sampleRate * opts.hopMs) / 1000));

  const points: MelodyPoint[] = [];
  const buf = new Float32Array(windowLen);

  for (let offset = 0; offset + windowLen <= samples.length; offset += hopLen) {
    buf.set(samples.subarray(offset, offset + windowLen));
    const r = detectPitch(buf, sampleRate, opts.clarityThreshold);
    let freq: number | null = null;
    if (r && r.freq >= opts.minFreq && r.freq <= opts.maxFreq) {
      freq = r.freq;
    }
    points.push({ timeMs: Math.round((offset / sampleRate) * 1000), freq });
  }
  return points;
}

/**
 * Suaviza la melodía: elimina puntos aislados (freq rodeada de nulls) y
 * rellena huecos cortos (≤ maxGapMs) por interpolación lineal. Esto reduce el
 * ruido de la extracción heurística.
 */
export function smoothMelody(points: MelodyPoint[], maxGapMs = 200): MelodyPoint[] {
  const out = points.map((p) => ({ ...p }));
  const n = out.length;
  if (n === 0) return out;

  // Punto aislado (freq con nulls a ambos lados): descartarlo.
  for (let i = 1; i < n - 1; i++) {
    if (out[i].freq != null && out[i - 1].freq == null && out[i + 1].freq == null) {
      out[i].freq = null;
    }
  }

  // Rellenar huecos cortos por interpolación lineal.
  let i = 0;
  while (i < n) {
    if (out[i].freq != null) { i++; continue; }
    // Encontrar el hueco: [i, j) con freq null.
    let j = i;
    while (j < n && out[j].freq == null) j++;
    if (j >= n) break; // hueco hasta el final: no se puede interpolar
    if (i > 0) {
      const gapMs = out[j].timeMs - out[i - 1].timeMs;
      if (gapMs <= maxGapMs) {
        const f0 = out[i - 1].freq!;
        const f1 = out[j].freq!;
        const t0 = out[i - 1].timeMs;
        const t1 = out[j].timeMs;
        for (let k = i; k < j; k++) {
          const t = out[k].timeMs;
          const alpha = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
          out[k].freq = f0 + (f1 - f0) * alpha;
        }
      }
    }
    i = j + 1;
  }

  return out;
}

/**
 * Convierte la melodía a una referencia por rango de tiempo (para comparar con
 * el canto del usuario sin saber la posición exacta: se usará ventana
 * deslizante sobre estos puntos).
 * Simplemente filtra los puntos con freq válida y ordena.
 */
export function toReferencePoints(points: MelodyPoint[]): MelodyPoint[] {
  return points
    .filter((p) => p.freq != null && p.freq >= PITCH_MIN_FREQ && p.freq <= PITCH_MAX_FREQ)
    .sort((a, b) => a.timeMs - b.timeMs);
}
