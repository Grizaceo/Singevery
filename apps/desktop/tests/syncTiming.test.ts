import { describe, it, expect } from 'vitest';
import {
  adjustMatchPosition,
  projectAnchoredPosition,
  computeDrift,
  rampedCorrection,
  normalizeTrackKey,
  computeLineProgress,
  DRIFT_GAIN,
  CORRECTION_RAMP_MS,
} from '../electron/core/syncTiming';
import type { TrackMatch } from '../src/types';

describe('syncTiming', () => {
  it('suma el tiempo de grabación al timecode de AudD', () => {
    const match: TrackMatch = {
      track: {
        provider: 'audd',
        provider_track_id: 'x',
        title: 'T',
        artist: 'A',
      },
      confidence: 1,
      position_ms: 10_000,
      matched_at: 20_000,
    };
    const { positionMs, anchorAt } = adjustMatchPosition(match, 14_000);
    expect(anchorAt).toBe(20_000);
    expect(positionMs).toBe(10_000 + (20_000 - 14_000) + 300);
  });

  it('proyecta la posición tras fetch de letra', () => {
    const projected = projectAnchoredPosition(5000, 1000, 2500);
    expect(projected.positionMs).toBe(6500);
    expect(projected.anchorAt).toBe(2500);
  });
});

describe('computeDrift', () => {
  it('ignora errores dentro de la banda muerta (anti-jitter)', () => {
    expect(computeDrift(10_100, 10_000).action).toBe('ignore');
    expect(computeDrift(10_000, 10_100).action).toBe('ignore');
  });

  it('corrige una fracción del error en derivas moderadas', () => {
    const d = computeDrift(11_000, 10_000); // error +1000
    expect(d.action).toBe('correct');
    expect(d.errorMs).toBe(1000);
    expect(d.correctionMs).toBeCloseTo(1000 * DRIFT_GAIN);
  });

  it('salta en seeks/saltos grandes', () => {
    const d = computeDrift(20_000, 10_000); // error +10000
    expect(d.action).toBe('snap');
    expect(d.correctionMs).toBe(10_000);
  });

  it('la corrección reduce el error pero no lo elimina de golpe', () => {
    const error = 800;
    const { correctionMs } = computeDrift(10_000 + error, 10_000);
    // tras una corrección, el error restante es menor (converge sin saltar)
    expect(Math.abs(error - correctionMs)).toBeLessThan(error);
  });
});

describe('rampedCorrection', () => {
  it('vale 0 al inicio y el target al final de la rampa', () => {
    expect(rampedCorrection(600, 1000, 1000)).toBe(0);
    expect(rampedCorrection(600, 1000, 1000 + CORRECTION_RAMP_MS)).toBe(600);
  });

  it('es lineal en el medio de la rampa', () => {
    const mid = 1000 + CORRECTION_RAMP_MS / 2;
    expect(rampedCorrection(600, 1000, mid)).toBeCloseTo(300);
  });

  it('satura más allá del final de la rampa', () => {
    expect(rampedCorrection(600, 1000, 1000 + CORRECTION_RAMP_MS * 5)).toBe(600);
  });

  it('target 0 → sin corrección', () => {
    expect(rampedCorrection(0, 1000, 5000)).toBe(0);
  });
});

describe('normalizeTrackKey', () => {
  it('es estable ante mayúsculas y espacios', () => {
    expect(normalizeTrackKey('  KOHH ', 'Dirt Boys')).toBe(
      normalizeTrackKey('kohh', 'dirt boys'),
    );
  });

  it('separa artista y título', () => {
    expect(normalizeTrackKey('Artist', 'Title')).toBe('artist::title');
  });
});

describe('computeLineProgress', () => {
  it('vale 0 antes del start y 1 a partir del end', () => {
    const line = { start_ms: 1000, end_ms: 2000 };
    expect(computeLineProgress(line, 500)).toBe(0);
    expect(computeLineProgress(line, 1000)).toBe(0);
    expect(computeLineProgress(line, 2000)).toBe(1);
    expect(computeLineProgress(line, 5000)).toBe(1);
  });

  it('interpola linealmente entre start y end', () => {
    const line = { start_ms: 1000, end_ms: 2000 };
    expect(computeLineProgress(line, 1100)).toBeCloseTo(0.1);
    expect(computeLineProgress(line, 1500)).toBeCloseTo(0.5);
    expect(computeLineProgress(line, 1900)).toBeCloseTo(0.9);
  });

  it('usa el inicio de la siguiente línea si falta end_ms', () => {
    const line = { start_ms: 1000, end_ms: null };
    expect(computeLineProgress(line, 1500, 2000)).toBeCloseTo(0.5);
    expect(computeLineProgress(line, 1000, 2000)).toBe(0);
    expect(computeLineProgress(line, 2000, 2000)).toBe(1);
  });

  it('devuelve 0 si no se puede inferir la duración', () => {
    const line = { start_ms: 1000, end_ms: null };
    expect(computeLineProgress(line, 5000, undefined)).toBe(0);
    // end <= start: duración inválida
    expect(computeLineProgress({ start_ms: 1000, end_ms: 500 }, 1200)).toBe(0);
  });
});
