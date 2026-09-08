import { describe, expect, it } from 'vitest';
import { matchWindow, centsBetween } from '../src/audio/compare';
import type { MelodyPoint } from '../src/audio/melody';

/** Ventana de pitch sintética del usuario (tiempo relativo, frecuencias). */
function userSeq(freqs: (number | null)[], hopMs = 100): MelodyPoint[] {
  return freqs.map((f, i) => ({ timeMs: i * hopMs, freq: f }));
}

describe('matchWindow — regresiones del audit (2026-09-08)', () => {
  // Referencia: 2 s de 261.63 + 2 s de 329.63.
  const reference: MelodyPoint[] = [
    { timeMs: 0, freq: 261.63 },
    { timeMs: 100, freq: 261.63 },
    { timeMs: 200, freq: 261.63 },
    { timeMs: 300, freq: 261.63 },
    { timeMs: 400, freq: 261.63 },
    { timeMs: 500, freq: 261.63 },
    { timeMs: 600, freq: 261.63 },
    { timeMs: 700, freq: 261.63 },
    { timeMs: 800, freq: 261.63 },
    { timeMs: 900, freq: 261.63 },
    { timeMs: 1000, freq: 261.63 },
    { timeMs: 1100, freq: 261.63 },
    { timeMs: 1200, freq: 261.63 },
    { timeMs: 1300, freq: 261.63 },
    { timeMs: 1400, freq: 261.63 },
    { timeMs: 1500, freq: 261.63 },
    { timeMs: 1600, freq: 261.63 },
    { timeMs: 1700, freq: 261.63 },
    { timeMs: 1800, freq: 261.63 },
    { timeMs: 1900, freq: 261.63 },
    { timeMs: 2000, freq: 329.63 },
    { timeMs: 2100, freq: 329.63 },
    { timeMs: 2200, freq: 329.63 },
    { timeMs: 2300, freq: 329.63 },
    { timeMs: 2400, freq: 329.63 },
    { timeMs: 2500, freq: 329.63 },
    { timeMs: 2600, freq: 329.63 },
    { timeMs: 2700, freq: 329.63 },
    { timeMs: 2800, freq: 329.63 },
    { timeMs: 2900, freq: 329.63 },
    { timeMs: 3000, freq: 329.63 },
    { timeMs: 3100, freq: 329.63 },
    { timeMs: 3200, freq: 329.63 },
    { timeMs: 3300, freq: 329.63 },
    { timeMs: 3400, freq: 329.63 },
    { timeMs: 3500, freq: 329.63 },
    { timeMs: 3600, freq: 329.63 },
    { timeMs: 3700, freq: 329.63 },
    { timeMs: 3800, freq: 329.63 },
    { timeMs: 3900, freq: 329.63 },
  ];

  it('la MISMA ventana con timestamps desplazados da el MISMO score y offset', () => {
    // El monitor lleva 0 s encendido.
    const early = userSeq([261.63, 261.63, 329.63, 329.63], 500);
    // El monitor lleva 5 s encendido: mismos contenidos, timestamps corridos.
    const late = early.map((p) => ({ timeMs: p.timeMs + 5000, freq: p.freq }));

    const rEarly = matchWindow(early, reference, { toleranceCents: 50 });
    const rLate = matchWindow(late, reference, { toleranceCents: 50 });

    // El score no puede depender de cuánto tiempo llevaba el monitor encendido.
    expect(rLate.score).toBe(rEarly.score);
    expect(rLate.bestOffsetMs).toBe(rEarly.bestOffsetMs);
    expect(rEarly.score).toBeGreaterThanOrEqual(0.9);
  });

  it('no extrapola: nota constante NO puntúa con offset anterior a la referencia', () => {
    // Referencia corta al inicio (1 s de 261.63).
    const shortRef: MelodyPoint[] = [
      { timeMs: 0, freq: 261.63 },
      { timeMs: 100, freq: 261.63 },
      { timeMs: 200, freq: 261.63 },
      { timeMs: 300, freq: 261.63 },
      { timeMs: 400, freq: 261.63 },
      { timeMs: 500, freq: 261.63 },
      { timeMs: 600, freq: 261.63 },
      { timeMs: 700, freq: 261.63 },
      { timeMs: 800, freq: 261.63 },
      { timeMs: 900, freq: 261.63 },
    ];
    // Ventana larga (8 s) de una nota constante.
    const user = userSeq(Array(80).fill(261.63), 100);

    const r = matchWindow(user, shortRef, { toleranceCents: 50 });

    // El mejor offset debe estar DENTRO de la cobertura real de la referencia
    // (0..900 ms), no en −20000 ms extrapolando la primera nota.
    expect(r.bestOffsetMs).toBeGreaterThanOrEqual(0);
    expect(r.bestOffsetMs).toBeLessThanOrEqual(900);
    // Con cobertura mínima 0.5, una ventana de 8 s contra 1 s de referencia
    // no puede dar score perfecto: solo ~12 % de los puntos se solapan.
    expect(r.score).toBeLessThan(0.5);
    expect(r.coverage).toBeLessThan(0.5);
  });

  it('cobertura mínima: un solapamiento parcial no basta para score alto', () => {
    // Referencia de 1 s; usuario canta 8 s. El solapamiento real es ~12 %.
    const shortRef: MelodyPoint[] = [
      { timeMs: 0, freq: 261.63 },
      { timeMs: 100, freq: 261.63 },
      { timeMs: 200, freq: 261.63 },
      { timeMs: 300, freq: 261.63 },
      { timeMs: 400, freq: 261.63 },
      { timeMs: 500, freq: 261.63 },
      { timeMs: 600, freq: 261.63 },
      { timeMs: 700, freq: 261.63 },
      { timeMs: 800, freq: 261.63 },
      { timeMs: 900, freq: 261.63 },
    ];
    const user = userSeq(Array(80).fill(261.63), 100);

    const r = matchWindow(user, shortRef, { toleranceCents: 50, minCoverage: 0.5 });
    expect(r.score).toBe(0);
    expect(r.coverage).toBeLessThan(0.5);
  });

  it('reporta cobertura y validCount', () => {
    const r = matchWindow(userSeq([261.63, 329.63, null]), reference);
    expect(r.validCount).toBe(2);
    expect(r.coverage).toBeGreaterThanOrEqual(0);
    expect(r.coverage).toBeLessThanOrEqual(1);
  });
});

describe('centsBetween', () => {
  it('octava = 1200 cents', () => {
    expect(Math.abs(centsBetween(220, 440) - 1200)).toBeLessThan(0.01);
  });
  it('misma frecuencia = 0', () => {
    expect(centsBetween(440, 440)).toBe(0);
  });
});
