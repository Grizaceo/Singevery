import { describe, it, expect } from 'vitest';
import {
  fftInPlace,
  magnitudeSpectrum,
  isPowerOfTwo,
  floorPowerOfTwo,
  binToHz,
} from '../electron/core/fft';
import {
  ENERGY_BIN_MS,
  buildLyricsActivityMask,
  buildVocalMaskFromPcm,
  correlateEnergyMask,
  vocalBandRatio,
} from '../electron/core/energySync';
import type { LyricLine } from '../src/types';

// --- FFT -------------------------------------------------------------------

describe('fft', () => {
  it('reconoce potencias de dos', () => {
    expect(isPowerOfTwo(1024)).toBe(true);
    expect(isPowerOfTwo(1000)).toBe(false);
    expect(floorPowerOfTwo(3200)).toBe(2048);
    expect(floorPowerOfTwo(0)).toBe(0);
  });

  it('una senoidal pura pone su pico en el bin correcto', () => {
    const n = 1024;
    const sampleRate = 16_000;
    const freq = 1000; // Hz → bin 1000 * 1024 / 16000 = 64
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i += 1) samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);

    const mags = magnitudeSpectrum(samples);
    let peakBin = 0;
    for (let k = 1; k < mags.length; k += 1) if (mags[k] > mags[peakBin]) peakBin = k;

    expect(peakBin).toBe(64);
    expect(binToHz(peakBin, sampleRate, n)).toBeCloseTo(freq, 0);
  });

  it('rechaza largos que no son potencia de dos', () => {
    expect(() => magnitudeSpectrum(new Float32Array(100))).toThrow(/potencia de dos/);
    expect(() => fftInPlace(new Float32Array(4), new Float32Array(8))).toThrow();
  });
});

// --- Banda vocal -----------------------------------------------------------

/** PCM de un tono a `freq` Hz durante `ms`, con amplitud `amp`. */
function tone(freq: number, ms: number, sampleRate: number, amp = 0.8): Float32Array {
  const n = Math.round((sampleRate * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

describe('vocalBandRatio', () => {
  const sampleRate = 16_000;
  const fftSize = 1024;

  it('un tono dentro de la banda vocal da razón alta', () => {
    const mags = magnitudeSpectrum(tone(800, 64, sampleRate).subarray(0, fftSize));
    expect(vocalBandRatio(mags, sampleRate, fftSize)).toBeGreaterThan(0.8);
  });

  it('un bajo grave fuera de la banda da razón baja', () => {
    const mags = magnitudeSpectrum(tone(60, 64, sampleRate).subarray(0, fftSize));
    expect(vocalBandRatio(mags, sampleRate, fftSize)).toBeLessThan(0.2);
  });

  it('silencio absoluto no divide por cero', () => {
    const mags = magnitudeSpectrum(new Float32Array(fftSize));
    expect(vocalBandRatio(mags, sampleRate, fftSize)).toBe(0);
  });
});

// --- Máscara de audio ------------------------------------------------------

describe('buildVocalMaskFromPcm', () => {
  const sampleRate = 16_000;

  it('detecta los tramos con voz en audio sintético', () => {
    // 600ms de bajo (sin voz) + 600ms de banda vocal + 600ms de bajo.
    const pcm = concat([
      tone(60, 600, sampleRate),
      tone(900, 600, sampleRate),
      tone(60, 600, sampleRate),
    ]);
    const { mask } = buildVocalMaskFromPcm(pcm, sampleRate);

    expect(mask).toHaveLength(9); // 1800ms / 200ms
    expect(mask.slice(0, 3).every((v) => v === false)).toBe(true);
    expect(mask.slice(3, 6).every((v) => v === true)).toBe(true);
    expect(mask.slice(6).every((v) => v === false)).toBe(true);
  });

  it('sin contraste (todo igual) no inventa actividad', () => {
    const { mask } = buildVocalMaskFromPcm(tone(900, 2000, sampleRate), sampleRate);
    expect(mask.every((v) => v === false)).toBe(true);
  });

  it('silencio total no produce máscara activa', () => {
    const { mask } = buildVocalMaskFromPcm(new Float32Array(sampleRate), sampleRate);
    expect(mask.some((v) => v)).toBe(false);
  });

  it('audio más corto que un bin devuelve máscara vacía sin romperse', () => {
    const out = buildVocalMaskFromPcm(new Float32Array(100), sampleRate);
    expect(out.mask).toEqual([]);
  });
});

// --- Máscara de la letra ---------------------------------------------------

const line = (start: number, end?: number): LyricLine => ({
  start_ms: start,
  text: 'x',
  ...(end != null ? { end_ms: end } : {}),
});

describe('buildLyricsActivityMask', () => {
  it('marca los bins donde hay línea activa', () => {
    const mask = buildLyricsActivityMask([line(0, 400), line(1000, 1400)], 0, 10);
    expect(mask.slice(0, 2).every(Boolean)).toBe(true); // 0-400ms
    expect(mask[4]).toBe(false); // 800ms: silencio
    expect(mask[5]).toBe(true); // 1000ms
  });

  it('sin end_ms la línea dura hasta la siguiente', () => {
    const mask = buildLyricsActivityMask([line(0), line(600)], 0, 5);
    expect(mask.every(Boolean)).toBe(true);
  });

  it('un hueco enorme no cuenta como canto continuo', () => {
    // Segunda línea a 5 minutos: la primera no puede durar todo eso.
    const mask = buildLyricsActivityMask([line(0), line(300_000)], 0, 100);
    expect(mask.slice(0, 60).every(Boolean)).toBe(true); // tope de 12s
    expect(mask[80]).toBe(false);
  });

  it('respeta el bin de inicio (ventana desplazada)', () => {
    const mask = buildLyricsActivityMask([line(10_000, 10_400)], 50, 5); // 50 bins = 10s
    expect(mask[0]).toBe(true);
    expect(mask[4]).toBe(false);
  });

  it('sin líneas devuelve todo false', () => {
    expect(buildLyricsActivityMask([], 0, 5)).toEqual([false, false, false, false, false]);
  });
});

// --- Correlación -----------------------------------------------------------

/** Máscara con actividad en los índices indicados. */
function maskOf(length: number, active: Array<[number, number]>): boolean[] {
  const m = new Array<boolean>(length).fill(false);
  for (const [from, to] of active) for (let i = from; i <= to && i < length; i += 1) m[i] = true;
  return m;
}

describe('correlateEnergyMask', () => {
  it('sin desfase el offset es 0 y la confianza alta', () => {
    const pattern = maskOf(60, [[5, 9], [20, 26], [40, 44]]);
    const r = correlateEnergyMask(pattern, pattern);
    expect(r.offsetMs).toBe(0);
    expect(r.peak).toBeCloseTo(1, 5);
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('detecta que la letra va ADELANTADA (offset negativo)', () => {
    const lrc = maskOf(60, [[5, 9], [20, 26], [40, 44]]);
    // El audio ocurre 5 bins (1s) MÁS TARDE que lo que dice la letra.
    const audio = maskOf(60, [[10, 14], [25, 31], [45, 49]]);
    const r = correlateEnergyMask(lrc, audio);
    expect(r.offsetMs).toBe(-5 * ENERGY_BIN_MS);
    // Con música real el segundo pico nunca es cero (los versos se parecen
    // entre sí), así que la confianza útil vive alrededor de 0.3-0.6.
    expect(r.confidence).toBeGreaterThan(0.3);
  });

  it('detecta que la letra va ATRASADA (offset positivo)', () => {
    const lrc = maskOf(60, [[10, 14], [25, 31], [45, 49]]);
    const audio = maskOf(60, [[5, 9], [20, 26], [40, 44]]);
    const r = correlateEnergyMask(lrc, audio);
    expect(r.offsetMs).toBe(5 * ENERGY_BIN_MS);
  });

  it('CHORUS TRAP: un patrón que se repite no da confianza', () => {
    // Bloques idénticos cada 10 bins: varios desplazamientos calzan igual.
    const repeating = maskOf(80, [
      [0, 4], [10, 14], [20, 24], [30, 34], [40, 44], [50, 54], [60, 64], [70, 74],
    ]);
    const r = correlateEnergyMask(repeating, repeating, { peakSeparationMs: 1_500 });
    expect(r.peak).toBeCloseTo(1, 5);
    // El pico es perfecto pero NO es único: la medición no sirve.
    expect(r.confidence).toBeLessThan(0.2);
  });

  it('máscaras sin relación dan confianza baja', () => {
    const lrc = maskOf(60, [[0, 30]]);
    const audio = maskOf(60, [[0, 59]]); // constante: sin varianza
    expect(correlateEnergyMask(lrc, audio).confidence).toBe(0);
  });

  it('respeta el desplazamiento máximo', () => {
    const lrc = maskOf(60, [[0, 4]]);
    const audio = maskOf(60, [[50, 54]]);
    const r = correlateEnergyMask(lrc, audio, { maxLagMs: 1_000 }); // ±5 bins
    expect(Math.abs(r.offsetMs)).toBeLessThanOrEqual(1_000);
  });

  it('no explota con entradas vacías o solapamiento insuficiente', () => {
    expect(correlateEnergyMask([], []).confidence).toBe(0);
    expect(correlateEnergyMask([true], [true]).confidence).toBe(0);
    expect(correlateEnergyMask(maskOf(5, [[0, 2]]), maskOf(5, [[0, 2]])).offsetMs).toBe(0);
  });

  it('la confianza siempre queda en 0..1', () => {
    const cases: Array<[boolean[], boolean[]]> = [
      [maskOf(60, [[0, 29]]), maskOf(60, [[30, 59]])],
      [maskOf(60, [[0, 4]]), maskOf(60, [[0, 4], [30, 34]])],
      [new Array(60).fill(true), new Array(60).fill(false)],
    ];
    for (const [a, b] of cases) {
      const r = correlateEnergyMask(a, b);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// --- Extremo a extremo (audio sintético + letra) ---------------------------

describe('pipeline completo con audio sintético', () => {
  it('mide el desfase real entre una letra y un audio desplazado', () => {
    const sampleRate = 16_000;
    // Audio: 1s instrumental, 2s de voz, 1s instrumental, 2s de voz.
    const pcm = concat([
      tone(60, 1000, sampleRate),
      tone(900, 2000, sampleRate),
      tone(60, 1000, sampleRate),
      tone(900, 2000, sampleRate),
    ]);
    const { mask: audioMask } = buildVocalMaskFromPcm(pcm, sampleRate);
    expect(audioMask.some(Boolean)).toBe(true);

    // Letra que dice que las frases empiezan 600 ms ANTES de lo que se escucha.
    const lines = [line(400, 2400), line(3400, 5400)];
    const lrcMask = buildLyricsActivityMask(lines, 0, audioMask.length);

    const r = correlateEnergyMask(lrcMask, audioMask);
    expect(r.offsetMs).toBeLessThan(0); // la letra va adelantada
    expect(Math.abs(r.offsetMs + 600)).toBeLessThanOrEqual(400); // ±2 bins
    expect(r.confidence).toBeGreaterThan(0.2);
  });
});
