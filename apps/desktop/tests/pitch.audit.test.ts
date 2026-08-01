import { describe, expect, it } from 'vitest';
import { detectPitch } from '../src/audio/pitch';

/**
 * AUDIT ADVERSARIAL — casos que NO cubre tests/pitch.test.ts
 * (c) 2026-08-01 sesión: verificar que el detector con el umbral POR DEFECTO
 * (0.12, no 0.5 como usa el test original) rechaza ruido real y señales no
 * periódicas, y que los octave errors no reaparecen con armónicos reales.
 */

const SR = 48000;

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido blanco uniforme. */
function whiteNoise(n: number, seed = 1): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1;
  return out;
}

/** Ruido rosa aproximado (filtro de un polo) — más parecido a ambiente real. */
function pinkNoise(n: number, seed = 2): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.997 * b0 + 0.029 * w;
    b1 = 0.985 * b1 + 0.033 * w;
    b2 = 0.95 * b2 + 0.042 * w;
    out[i] = (b0 + b1 + b2 + w) * 0.2;
  }
  return out;
}

/** Onda senoidal pura. */
function sine(freq: number, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

/** Seno + armónicos (voz real tiene armónicos) + ruido ligero. */
function voiceLike(freq: number, n: number, noiseAmplitude = 0.02): Float32Array {
  const rnd = mulberry32(42);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * freq * i) / SR;
    out[i] =
      Math.sin(t) +
      0.4 * Math.sin(2 * t) +
      0.2 * Math.sin(3 * t) +
      0.1 * Math.sin(4 * t) +
      (rnd() * 2 - 1) * noiseAmplitude;
  }
  return out;
}

describe('AUDIT: umbral por defecto vs ruido', () => {
  it('ruido blanco con umbral DEFAULT (0.12) → null (el test original usaba 0.5)', () => {
    const r = detectPitch(whiteNoise(2048), SR); // sin pasar threshold = 0.12
    expect(r).toBeNull();
  });

  it('ruido rosa con umbral DEFAULT → null', () => {
    const r = detectPitch(pinkNoise(2048), SR);
    expect(r).toBeNull();
  });

  it('ruido blanco con distintas semillas → null siempre', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = detectPitch(whiteNoise(2048, seed), SR);
      expect(r, `seed ${seed}`).toBeNull();
    }
  });
});

describe('AUDIT: armónicos y octave errors', () => {
  it('voz con armónicos 220 Hz → 220 (no 440)', () => {
    const r = detectPitch(voiceLike(220, 4096), SR);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.freq - 220) / 220).toBeLessThan(0.03);
  });

  it('voz con armónicos 330 Hz → 330 (no 165 ni 660)', () => {
    const r = detectPitch(voiceLike(330, 4096), SR);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.freq - 330) / 330).toBeLessThan(0.03);
  });

  it('silencio con offset DC → null', () => {
    const dc = new Float32Array(2048).fill(0.0001);
    const r = detectPitch(dc, SR);
    expect(r).toBeNull();
  });
});

describe('AUDIT: buffers cortos y bordes', () => {
  it('buffer de 64 samples exactos (mínimo) → no crashea', () => {
    const r = detectPitch(sine(440, 64), SR);
    expect(r).not.toBeNull();
  });

  it('buffer de 32 samples (bajo mínimo) → null sin crash', () => {
    const r = detectPitch(sine(440, 32), SR);
    expect(r).toBeNull();
  });

  it('sampleRate atípico (16 kHz) → funciona', () => {
    // 440 Hz a 16k: periodo ~36 samples — dentro de maxLag (16000/80=200)
    const n = 2048;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * 440 * i) / 16000);
    const r = detectPitch(out, 16000);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.freq - 440) / 440).toBeLessThan(0.03);
  });
});
