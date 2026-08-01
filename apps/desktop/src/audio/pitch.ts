// ============================================================================
// pitch.ts — detección de pitch (frecuencia fundamental) para práctica de canto.
//
// Algoritmo: CMNDF (Cumulative Mean Normalized Difference Function), el núcleo
// del método YIN (de Cheveigné & Kawahara, 2002), sobre un buffer de samples en
// el dominio del tiempo. Puro y testeable: recibe Float32Array + sampleRate y
// devuelve { freq, clarity } o null.
//
// Por qué CMNDF y no autocorrelación cruda: la autocorrelación simple favorece
// los armónicos (octave errors hacia arriba). La función de diferencia con
// normalización acumulada penaliza los sub-múltiplos y encuentra el periodo
// fundamental real.
//
// Precisión reportada en literatura:
//   - YIN: MAE ~31.4 cents; autocorrelación modificada ~16.8 cents (IJCRT
//     2303096). YIN es más robusto contra octave errors, que es el error más
//     molesto en práctica vocal.
//
// No requiere micrófono especial: funciona con el integrado del PC (ver
// docs/SWAP_PITCH_001.md). Los micrófonos dedicados de karaoke existen por
// volumen/retroalimentación en salón, no porque la detección de pitch lo exija.
// ============================================================================

/** Rango vocal razonable para el detector (Hz). Evita octave errors obvios. */
export const PITCH_MIN_FREQ = 80; // ~E2, bajo masculino
export const PITCH_MAX_FREQ = 1200; // ~D6, soprano agudo

/** Clarity mínima para aceptar un pitch (0..1). Baja = acepta más, arriesga falsos. */
export const PITCH_CLARITY_THRESHOLD = 0.12;

export interface PitchResult {
  /** Frecuencia fundamental en Hz. */
  freq: number;
  /** Claridad de la detección (0..1). Cercano a 1 = señal muy periódica. */
  clarity: number;
  /** Nota musical más cercana (p. ej. "A4"). */
  note: string;
  /** Desviación de la nota exacta en cents (-50..+50). */
  cents: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Convierte Hz a { note, cents, midi }. Pura. */
export function freqToNote(freq: number): { note: string; cents: number; midi: number } {
  // MIDI: A4 = 440 Hz = nota 69. midi = 69 + 12*log2(f/440)
  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiFloat);
  // Cents de desviación respecto a la nota redondeada.
  const cents = Math.round((midiFloat - midi) * 100);
  const note = NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  return { note, cents, midi };
}

/**
 * Detecta la frecuencia fundamental con CMNDF (núcleo de YIN).
 * Devuelve null si no hay señal clara (silencio, ruido, voz no periódica).
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  clarityThreshold = PITCH_CLARITY_THRESHOLD,
): PitchResult | null {
  const n = samples.length;
  if (n < 64) return null;

  // Energía: si el buffer es casi silencio, no hay pitch.
  let energy = 0;
  for (let i = 0; i < n; i++) energy += samples[i] * samples[i];
  energy /= n;
  if (energy < 1e-5) return null;

  // Rango de lags: empezar en lag 2 para que las frecuencias ALTAS (fuera del
  // rango vocal) se detecten como tales y luego se rechacen en el filtro final.
  // Si se empieza en el lag del rango vocal, una señal de 2000 Hz aliasa como
  // 1000 Hz (su segundo armónico cae dentro del rango) y pasa el filtro.
  const minLag = 2;
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / PITCH_MIN_FREQ));
  if (maxLag <= minLag) return null;

  // 1) Función de diferencia d(τ) = Σ (x[i] - x[i+τ])² sobre el tramo válido.
  // 2) CMNDF: d'(τ) = d(τ) / ((1/τ) Σ_{k=1..τ} d(k)) — normalización acumulada
  //    que elimina el sesgo hacia lags cortos.
  const d = new Float64Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    let sum = 0;
    const limit = n - tau;
    for (let i = 0; i < limit; i++) {
      const diff = samples[i] - samples[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  const cmndf = new Float64Array(maxLag + 1);
  cmndf[minLag] = 1; // primer valor normalizado contra sí mismo
  let runningSum = d[minLag];
  for (let tau = minLag + 1; tau <= maxLag; tau++) {
    runningSum += d[tau];
    cmndf[tau] = runningSum > 0 ? (d[tau] * tau) / runningSum : 1;
  }

  // 3) Buscar el primer mínimo local bajo el umbral absoluto (regla YIN):
  //    el periodo fundamental es el primer mínimo profundo, no el global.
  let bestTau = -1;
  let bestValue = Infinity;
  let foundBelowThreshold = false;

  for (let tau = minLag; tau <= maxLag; tau++) {
    const v = cmndf[tau];
    const prev = tau > minLag ? cmndf[tau - 1] : 1;
    const next = tau < maxLag ? cmndf[tau + 1] : 1;
    const isLocalMin = v <= prev && v <= next;

    if (!foundBelowThreshold) {
      if (isLocalMin && v < clarityThreshold) {
        foundBelowThreshold = true;
        bestTau = tau;
        bestValue = v;
      }
      // Umbral relativo: primer mínimo bajo threshold * 1.2 (más permisivo).
      if (!foundBelowThreshold && isLocalMin && v < clarityThreshold * 1.2) {
        foundBelowThreshold = true;
        bestTau = tau;
        bestValue = v;
      }
      continue;
    }
    // Ya encontramos el primero bajo el umbral: quedarnos con el mínimo local
    // más profundo dentro de la misma "cavidad" (evita elegir el siguiente).
    if (isLocalMin && v < bestValue) {
      bestTau = tau;
      bestValue = v;
    } else if (v > clarityThreshold && bestTau >= 0) {
      // Salimos de la cavidad: el mejor encontrado es el fundamental.
      break;
    }
  }

  if (bestTau <= 0) {
    // Fallback: mínimo global si ninguno pasó el umbral.
    let globalTau = minLag;
    let globalMin = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++) {
      if (cmndf[tau] < globalMin) {
        globalMin = cmndf[tau];
        globalTau = tau;
      }
    }
    if (globalMin >= clarityThreshold) return null;
    bestTau = globalTau;
    bestValue = globalMin;
  }

  // Interpolación parabólica sobre 3 puntos para precisión sub-muestra.
  const refinedTau = refineLag(cmndf, bestTau, maxLag);
  const freq = sampleRate / refinedTau;
  if (freq < PITCH_MIN_FREQ || freq > PITCH_MAX_FREQ) return null;

  // Claridad de salida: mapear el valor CMNDF (0 = perfecto) a 0..1 invertido.
  const clarity = Math.max(0, Math.min(1, 1 - bestValue));

  const { note, cents } = freqToNote(freq);
  return { freq, note, cents, clarity };
}

/** Interpola el mínimo con parábola sobre 3 puntos (mejor, mejor-1, mejor+1). */
function refineLag(values: Float64Array, tau: number, maxLag: number): number {
  if (tau <= 1 || tau >= maxLag) return tau;
  const y0 = values[tau - 1];
  const y1 = values[tau];
  const y2 = values[tau + 1];
  const denom = y0 - 2 * y1 + y2;
  if (Math.abs(denom) < 1e-12) return tau;
  // Vértice de la parábola: offset = 0.5*(y0-y2)/denom
  const offset = (0.5 * (y0 - y2)) / denom;
  return tau + Math.max(-0.5, Math.min(0.5, offset));
}
