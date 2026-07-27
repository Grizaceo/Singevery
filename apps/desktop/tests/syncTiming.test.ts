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
  SAMPLE_ANCHOR_FRACTION,
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

  it('respeta la calibración global pasada por parámetro (P2.8)', () => {
    const match: TrackMatch = {
      track: { provider: 'audd', provider_track_id: 'x', title: 'T', artist: 'A' },
      confidence: 1,
      position_ms: 10_000,
      matched_at: 20_000,
    };
    const { positionMs } = adjustMatchPosition(match, 14_000, 500);
    expect(positionMs).toBe(10_000 + (20_000 - 14_000) + 500);
  });

  // ==========================================================================
  // Punto de referencia del position_ms (bug de sincronía: letra adelantada).
  // ==========================================================================

  it('descuenta una fracción de sample_offset_ms (el offset cae dentro de la ventana)', () => {
    // Grabación de 6s (14_000→20_000) + red; la huella que hizo match cubría
    // los primeros 4s del chunk. El punto exacto al que apunta el offset de
    // Shazam no está documentado: se descuenta SAMPLE_ANCHOR_FRACTION.
    const match: TrackMatch = {
      track: { provider: 'shazam', provider_track_id: 'x', title: 'T', artist: 'A' },
      confidence: 1,
      position_ms: 10_000,
      matched_at: 20_000,
      sample_offset_ms: 4_000,
    };
    const { positionMs } = adjustMatchPosition(match, 14_000, 0);
    expect(positionMs).toBe(10_000 - 4_000 * SAMPLE_ANCHOR_FRACTION + 6_000);
  });

  it('la fracción de anclaje queda estrictamente entre los dos extremos', () => {
    // Descontar 0 dejaba la letra adelantada; descontar la ventana completa la
    // dejaba atrasada. El valor útil está entre ambos.
    expect(SAMPLE_ANCHOR_FRACTION).toBeGreaterThan(0);
    expect(SAMPLE_ANCHOR_FRACTION).toBeLessThan(1);
  });

  it('sin sample_offset_ms mantiene el comportamiento previo (AudD)', () => {
    const match: TrackMatch = {
      track: { provider: 'audd', provider_track_id: 'x', title: 'T', artist: 'A' },
      confidence: 1,
      position_ms: 10_000,
      matched_at: 20_000,
    };
    expect(adjustMatchPosition(match, 14_000, 0).positionMs).toBe(16_000);
  });

  it('acota un sample_offset_ms absurdo al tiempo transcurrido', () => {
    const match: TrackMatch = {
      track: { provider: 'shazam', provider_track_id: 'x', title: 'T', artist: 'A' },
      confidence: 1,
      position_ms: 60_000,
      matched_at: 20_000,
      sample_offset_ms: 999_000, // no se pudo grabar más audio del que pasó
    };
    const { positionMs } = adjustMatchPosition(match, 14_000, 0);
    // El offset se acota al elapsed (6s) antes de aplicar la fracción.
    expect(positionMs).toBe(60_000 - 6_000 * SAMPLE_ANCHOR_FRACTION + 6_000);
  });

  it('nunca produce una posición negativa cerca del inicio de la canción', () => {
    const match: TrackMatch = {
      track: { provider: 'shazam', provider_track_id: 'x', title: 'T', artist: 'A' },
      confidence: 1,
      position_ms: 1_000,
      matched_at: 20_000,
      sample_offset_ms: 4_000,
    };
    const { positionMs } = adjustMatchPosition(match, 14_000, 0);
    expect(positionMs).toBe(0 + 6_000);
    expect(positionMs).toBeGreaterThanOrEqual(0);
  });

  // ==========================================================================
  // Simulación del lazo de corrección completo.
  //
  // `trueFrac` es el punto REAL de la ventana de la huella al que apunta el
  // offset del proveedor (desconocido en la práctica: 0 = inicio, 1 = final).
  // Devuelve el error en régimen permanente: positivo = letra adelantada.
  // ==========================================================================
  function simulateLoop(trueFrac: number, calibrationMs = 0): number {
    const RECORD_MS = 6_000;
    const NETWORK_MS = 1_500;
    const SAMPLE_MS = 4_000;
    const CYCLE_MS = 18_000;
    let displayed = 0; // arranca 12s atrasado respecto al audio real
    let realPosition = 12_000;

    for (let cycle = 0; cycle < 15; cycle++) {
      const recordStartedAt = cycle * CYCLE_MS;
      const matchedAt = recordStartedAt + RECORD_MS + NETWORK_MS;
      const match: TrackMatch = {
        track: { provider: 'shazam', provider_track_id: 'x', title: 'T', artist: 'A' },
        confidence: 1,
        position_ms: realPosition + SAMPLE_MS * trueFrac,
        matched_at: matchedAt,
        sample_offset_ms: SAMPLE_MS,
      };
      const anchor = adjustMatchPosition(match, recordStartedAt, calibrationMs);
      const estimatedNow = anchor.positionMs + (matchedAt - anchor.anchorAt);
      const displayedNow = displayed + (matchedAt - recordStartedAt);
      const decision = computeDrift(estimatedNow, displayedNow);
      displayed =
        displayedNow + (decision.action === 'snap' ? decision.errorMs : decision.correctionMs);
      // Avanza al siguiente ciclo (audio y reloj corren a la misma velocidad).
      realPosition += CYCLE_MS;
      displayed += CYCLE_MS - (matchedAt - recordStartedAt);
    }

    return displayed - realPosition;
  }

  it('el lazo converge (no oscila ni diverge) sea cual sea el punto real', () => {
    // Lo importante del lazo: llega a un régimen estable. El valor de ese
    // régimen depende de cuánto se acierte con la fracción, y eso lo corrige
    // la calibración global.
    for (const trueFrac of [0, 0.25, 0.5, 0.75, 1]) {
      const error = simulateLoop(trueFrac);
      expect(Number.isFinite(error)).toBe(true);
      // El error residual nunca supera media ventana de huella.
      expect(Math.abs(error)).toBeLessThanOrEqual(4_000 * 0.5 + 150);
    }
  });

  it('acertar la fracción deja el error en cero', () => {
    expect(Math.abs(simulateLoop(SAMPLE_ANCHOR_FRACTION))).toBeLessThan(150);
  });

  it('la fracción a mitad de camino acota el error a la mitad del peor caso', () => {
    // Con el punto real en un extremo, el error residual es media ventana —
    // la mitad de lo que costaba equivocarse de extremo a extremo.
    expect(Math.abs(simulateLoop(0))).toBeCloseTo(4_000 * SAMPLE_ANCHOR_FRACTION, -2);
    expect(Math.abs(simulateLoop(1))).toBeCloseTo(4_000 * (1 - SAMPLE_ANCHOR_FRACTION), -2);
  });

  it('la calibración global cancela el desfase constante que quede', () => {
    // Es exactamente lo que hace el botón "aplicar a todas las canciones":
    // un residuo constante se elimina con una calibración del mismo tamaño.
    const residual = simulateLoop(1); // peor caso: letra atrasada
    expect(Math.abs(residual)).toBeGreaterThan(500);
    expect(Math.abs(simulateLoop(1, -residual))).toBeLessThan(150);
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
