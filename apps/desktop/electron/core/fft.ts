// ============================================================================
// fft.ts — FFT radix-2 mínima (sin dependencias) para análisis de banda vocal.
//
// Se necesita en el proceso MAIN, donde no hay Web Audio: los chunks de audio
// llegan como PCM crudo desde el renderer. Traer una librería completa por una
// transformada de 1024 puntos sería desproporcionado, y las alternativas del
// ecosistema arrastran binarios nativos que romperían el empaquetado.
// ============================================================================

/** true si n es potencia de dos (requisito del radix-2). */
export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/** Mayor potencia de dos ≤ n (0 si no hay). */
export function floorPowerOfTwo(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 0;
  return 2 ** Math.floor(Math.log2(n));
}

/**
 * Ventana de Hann. Sin ventana, el corte abrupto del bloque mete energía
 * espuria en TODAS las bandas (fuga espectral) y el ratio vocal se vuelve
 * ruido.
 */
export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

/**
 * FFT in-place sobre partes real e imaginaria (algoritmo de Cooley-Tukey con
 * reordenamiento bit-reversal). `re` e `im` deben tener el mismo largo, que
 * debe ser potencia de dos.
 */
export function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n !== im.length) throw new Error('fft: re e im deben medir lo mismo');
  if (!isPowerOfTwo(n)) throw new Error(`fft: el largo debe ser potencia de dos (recibí ${n})`);
  if (n === 1) return;

  // Reordenamiento bit-reversal.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Espectro de magnitudes de una señal real. Devuelve las N/2 primeras bins
 * (el resto es espejo). El bin k corresponde a k * sampleRate / N Hz.
 */
export function magnitudeSpectrum(samples: ArrayLike<number>, applyWindow = true): Float32Array {
  const n = samples.length;
  if (!isPowerOfTwo(n)) throw new Error(`magnitudeSpectrum: largo ${n} no es potencia de dos`);
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const window = applyWindow ? hannWindow(n) : null;
  for (let i = 0; i < n; i += 1) {
    re[i] = window ? samples[i] * window[i] : samples[i];
  }
  fftInPlace(re, im);

  const half = n >> 1;
  const mags = new Float32Array(half);
  for (let k = 0; k < half; k += 1) {
    mags[k] = Math.hypot(re[k], im[k]);
  }
  return mags;
}

/** Frecuencia central del bin k de un espectro de tamaño fftSize. */
export function binToHz(bin: number, sampleRate: number, fftSize: number): number {
  return (bin * sampleRate) / fftSize;
}
