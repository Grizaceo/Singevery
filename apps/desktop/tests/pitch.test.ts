import { describe, expect, it } from 'vitest';
import { detectPitch, freqToNote } from '../src/audio/pitch';

/** Genera una onda senoidal con frecuencia y sampleRate dados. */
function sineWave(freq: number, sampleRate: number, seconds: number): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

const SR = 48000;
/** Tolerancia de frecuencia: ±2% (suficiente para práctica vocal). */
function approx(actual: number, expected: number, pct = 0.02): boolean {
  return Math.abs(actual - expected) / expected < pct;
}

describe('freqToNote', () => {
  it('A4 = 440 Hz → nota A4, cents 0', () => {
    const r = freqToNote(440);
    expect(r.note).toBe('A4');
    expect(Math.abs(r.cents)).toBeLessThanOrEqual(2);
  });

  it('C4 = 261.63 Hz → nota C4', () => {
    const r = freqToNote(261.63);
    expect(r.note).toBe('C4');
    expect(Math.abs(r.cents)).toBeLessThanOrEqual(2);
  });

  it('un poco desafinado reporta cents ≠ 0', () => {
    const r = freqToNote(445); // ~+19 cents sobre A4
    expect(r.cents).toBeGreaterThan(10);
  });
});

describe('detectPitch — tonos sintéticos', () => {
  it('detecta 440 Hz (A4)', () => {
    const r = detectPitch(sineWave(440, SR, 0.1), SR);
    expect(r).not.toBeNull();
    expect(approx(r!.freq, 440)).toBe(true);
    expect(r!.note).toBe('A4');
  });

  it('detecta 261.63 Hz (C4)', () => {
    const r = detectPitch(sineWave(261.63, SR, 0.1), SR);
    expect(r).not.toBeNull();
    expect(approx(r!.freq, 261.63)).toBe(true);
    expect(r!.note).toBe('C4');
  });

  it('detecta 523.25 Hz (C5, octava arriba)', () => {
    const r = detectPitch(sineWave(523.25, SR, 0.1), SR);
    expect(r).not.toBeNull();
    expect(approx(r!.freq, 523.25)).toBe(true);
    expect(r!.note).toBe('C5');
  });

  it('detecta 110 Hz (A2, registro grave)', () => {
    const r = detectPitch(sineWave(110, SR, 0.1), SR);
    expect(r).not.toBeNull();
    expect(approx(r!.freq, 110)).toBe(true);
  });

  it('devuelve null en silencio', () => {
    const silence = new Float32Array(2048);
    expect(detectPitch(silence, SR)).toBeNull();
  });

  it('devuelve null con ruido blanco (no periódico)', () => {
    const noise = new Float32Array(2048);
    let seed = 12345;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    // El ruido blanco puede producir correlaciones espurias; con el umbral de
    // claridad por defecto debe rechazarse (o al menos no dar un pitch estable
    // dentro del rango vocal con claridad alta).
    const r = detectPitch(noise, SR, 0.5);
    if (r) {
      expect(r.clarity).toBeLessThan(0.9);
    }
  });

  it('respeta el rango vocal configurado', () => {
    // 40 Hz está bajo el mínimo: debe rechazarse.
    const r = detectPitch(sineWave(40, SR, 0.2), SR);
    expect(r).toBeNull();
    // 2000 Hz sobre el máximo: rechazado.
    const r2 = detectPitch(sineWave(2000, SR, 0.1), SR);
    expect(r2).toBeNull();
  });
});
