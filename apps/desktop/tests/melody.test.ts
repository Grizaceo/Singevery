import { describe, expect, it } from 'vitest';
import { extractMelody, smoothMelody, toReferencePoints, type MelodyPoint } from '../src/audio/melody';
import { centsBetween, matchWindow } from '../src/audio/compare';

const SR = 48000;

/** Buffer con una secuencia de notas (cada nota = [freq, duraciónMs]). */
function noteSequence(notes: [number, number][]): Float32Array {
  const total = notes.reduce((acc, [, dur]) => acc + Math.floor((dur * SR) / 1000), 0);
  const out = new Float32Array(total);
  let pos = 0;
  for (const [freq, durMs] of notes) {
    const len = Math.floor((durMs * SR) / 1000);
    for (let i = 0; i < len; i++) {
      out[pos + i] = Math.sin((2 * Math.PI * freq * i) / SR);
    }
    pos += len;
  }
  return out;
}

/** Secuencia de pitch sintético del usuario (tiempo relativo, frecuencias). */
function userSeq(freqs: (number | null)[], hopMs = 100): MelodyPoint[] {
  return freqs.map((f, i) => ({ timeMs: i * hopMs, freq: f }));
}

describe('extractMelody', () => {
  it('extrae una secuencia de notas con sus frecuencias', () => {
    // 400 ms de 261.63 (C4) + 400 ms de 329.63 (E4) + 400 ms de 392 (G4)
    const buf = noteSequence([
      [261.63, 400],
      [329.63, 400],
      [392, 400],
    ]);
    const melody = extractMelody(buf, SR);
    // Puntos alrededor de t=200ms → C4; t=600ms → E4; t=1000ms → G4.
    const at = (t: number): number | null => {
      const p = melody.reduce((best, cur) =>
        Math.abs(cur.timeMs - t) < Math.abs(best.timeMs - t) ? cur : best,
      );
      return p.freq;
    };
    expect(Math.abs(at(200)! - 261.63) / 261.63).toBeLessThan(0.03);
    expect(Math.abs(at(600)! - 329.63) / 329.63).toBeLessThan(0.03);
    expect(Math.abs(at(1000)! - 392) / 392).toBeLessThan(0.03);
  });

  it('devuelve null en silencio', () => {
    const melody = extractMelody(new Float32Array(SR), SR);
    expect(melody.every((p) => p.freq == null)).toBe(true);
  });

  it('respeta el rango vocal configurado (150-800 Hz)', () => {
    // 80 Hz (fuera, grave) + 440 Hz (dentro)
    const buf = noteSequence([
      [80, 400],
      [440, 400],
    ]);
    const melody = extractMelody(buf, SR);
    const freqs = melody.map((p) => p.freq).filter((f): f is number => f != null);
    expect(freqs.every((f) => f >= 150 && f <= 800)).toBe(true);
  });
});

describe('smoothMelody', () => {
  it('rellena huecos cortos por interpolación', () => {
    const points: MelodyPoint[] = [
      { timeMs: 0, freq: 200 },
      { timeMs: 100, freq: null },
      { timeMs: 200, freq: 300 },
    ];
    const out = smoothMelody(points, 200);
    expect(out[1].freq).not.toBeNull();
    expect(Math.abs(out[1].freq! - 250)).toBeLessThan(1); // interpola 200→300
  });

  it('no rellena huecos largos', () => {
    const points: MelodyPoint[] = [
      { timeMs: 0, freq: 200 },
      { timeMs: 1000, freq: null },
      { timeMs: 2000, freq: 300 },
    ];
    const out = smoothMelody(points, 200);
    expect(out[1].freq).toBeNull();
  });
});

describe('centsBetween', () => {
  it('octava = 1200 cents', () => {
    expect(Math.abs(centsBetween(220, 440) - 1200)).toBeLessThan(0.01);
  });
  it('misma frecuencia = 0', () => {
    expect(centsBetween(440, 440)).toBe(0);
  });
  it('semitono ≈ 100 cents', () => {
    // A4=440, A#4=466.16 → ~100 cents
    expect(Math.abs(centsBetween(440, 466.16) - 100)).toBeLessThan(1);
  });
});

describe('matchWindow', () => {
  // Referencia: una canción sintética de 10 s con notas.
  const reference = toReferencePoints(
    extractMelody(
      noteSequence([
        [261.63, 1000],
        [329.63, 1000],
        [392, 1000],
        [329.63, 1000],
        [261.63, 1000],
        [329.63, 1000],
        [392, 1000],
        [329.63, 1000],
        [261.63, 1000],
        [440, 1000],
      ]),
      SR,
    ),
  );

  it('canto exacto → score alto (≥0.9)', () => {
    // El usuario canta exactamente la melodía: cada nota DURA 1000ms como en
    // la canción. Puntos cada 100ms → 10 puntos por nota.
    const user = userSeq([
      // 10 puntos de 261.63, luego 10 de 329.63, etc. (cada nota = 1000ms)
      ...Array(10).fill(261.63),
      ...Array(10).fill(329.63),
      ...Array(10).fill(392),
      ...Array(10).fill(329.63),
      ...Array(10).fill(261.63),
      ...Array(10).fill(329.63),
      ...Array(10).fill(392),
      ...Array(10).fill(329.63),
      ...Array(10).fill(261.63),
      ...Array(10).fill(440),
    ]);
    const r = matchWindow(user, reference, { toleranceCents: 50 });
    expect(r.score).toBeGreaterThanOrEqual(0.9);
    expect(r.validCount).toBe(100);
  });

  it('canto con la melodía desplazada en el tiempo → la encuentra (offset)', () => {
    // El usuario empieza en t=3000ms de la canción (nota 392) y canta 5 notas
    // con duración real (1000ms c/u), pero su ventana empieza en t=0.
    const user = userSeq([
      ...Array(10).fill(392),
      ...Array(10).fill(329.63),
      ...Array(10).fill(261.63),
      ...Array(10).fill(329.63),
      ...Array(10).fill(392),
    ]);
    const r = matchWindow(user, reference, { toleranceCents: 50, maxOffsetMs: 20000 });
    expect(r.score).toBeGreaterThanOrEqual(0.7);
    expect(r.bestOffsetMs).toBeGreaterThan(1000); // encontró el desplazamiento
  });

  it('canto desafinado (octava arriba) → score bajo', () => {
    const user = userSeq([523.26, 659.26, 784, 659.26, 523.26]);
    const r = matchWindow(user, reference, { toleranceCents: 50 });
    expect(r.score).toBeLessThan(0.3);
  });

  it('sin señal (todo null) → score 0', () => {
    const r = matchWindow(userSeq([null, null, null]), reference);
    expect(r.score).toBe(0);
    expect(r.validCount).toBe(0);
  });

  it('referencia vacía → score 0 sin crash', () => {
    const r = matchWindow(userSeq([261.63, 329.63]), []);
    expect(r.score).toBe(0);
  });
});
