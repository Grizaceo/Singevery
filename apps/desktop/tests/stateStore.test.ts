import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `electron` no existe fuera del runtime de Electron: lo mockeamos para poder
// importar StateStore (y settings.ts) en un test de Node puro.
vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

import { StateStore } from '../electron/core/stateStore';
import type { CalibrationStore } from '../electron/services/settings';
import type { LyricsService } from '../electron/services/lyrics/lyricsService';

// StateStore usa Date.now() internamente; controlamos el reloj con fake timers.
describe('StateStore — pausa del reloj por silencio', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeStore(): StateStore {
    // window=null: emit() está guardado contra null; offsetStore por defecto = NULL.
    return new StateStore(null);
  }

  it('avanza con el reloj de pared cuando hay señal', () => {
    const s = makeStore();
    s.nudgePosition(10_000); // posición = 10s en t=0
    vi.setSystemTime(2_000);
    expect(s.getDisplayedPosition()).toBe(12_000);
  });

  it('congela la posición tras silencio sostenido', () => {
    const s = makeStore();
    s.nudgePosition(10_000); // t=0 → pos 10s
    vi.setSystemTime(2_000); // pos 12s

    s.reportAudioLevel(0, 2_000); // empieza el silencio (aún no pausa)
    expect(s.isClockPaused()).toBe(false);
    s.reportAudioLevel(0, 2_500); // silencio sostenido ≥400ms → pausa
    expect(s.isClockPaused()).toBe(true);

    // Congelado en ~12s aunque pase el tiempo de pared.
    vi.setSystemTime(8_000);
    expect(s.getDisplayedPosition(8_000)).toBeCloseTo(12_000, -1);
  });

  it('reanuda sin salto cuando vuelve la señal', () => {
    const s = makeStore();
    s.nudgePosition(10_000);
    vi.setSystemTime(2_000);
    s.reportAudioLevel(0, 2_000);
    s.reportAudioLevel(0, 2_500); // pausa, congelado en 12s

    vi.setSystemTime(8_000);
    s.reportAudioLevel(0.5, 8_000); // vuelve la señal → reanuda desde 12s
    expect(s.isClockPaused()).toBe(false);

    vi.setSystemTime(10_000); // +2s desde la reanudación
    expect(s.getDisplayedPosition(10_000)).toBeCloseTo(14_000, -1);
  });

  it('no pausa por un bache puntual de nivel', () => {
    const s = makeStore();
    s.nudgePosition(10_000);
    s.reportAudioLevel(0, 0); // silencio empieza
    s.reportAudioLevel(0.5, 100); // vuelve señal antes del hold → nunca pausó
    expect(s.isClockPaused()).toBe(false);
  });
});

describe('StateStore — calibración global (P2.8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeCalibration(initial: number): {
    store: CalibrationStore;
    state: StateStore;
  } {
    let value = initial;
    const store: CalibrationStore = {
      get: () => value,
      set: (v) => {
        value = v;
      },
    };
    const state = new StateStore(null, undefined, undefined, store);
    return { store, state };
  }

  it('carga la calibración inicial desde el store', () => {
    const { state } = makeCalibration(450);
    expect(state.getCalibrationOffsetMs()).toBe(450);
  });

  it('adjustCalibrationOffset desplaza la letra en vivo y persiste', () => {
    const { store, state } = makeCalibration(300);
    state.nudgePosition(10_000); // posición 10s
    expect(state.getDisplayedPosition()).toBe(10_000);

    state.adjustCalibrationOffset(50);
    // La calibración subió a 350 y se persistió.
    expect(state.getCalibrationOffsetMs()).toBe(350);
    expect(store.get()).toBe(350);
    // La letra se desplazó +50ms (adelantada).
    expect(state.getDisplayedPosition()).toBe(10_050);
  });
});

describe('StateStore — metadata para búsqueda de letras', () => {
  it('applyMatch propaga album y duration_ms al LyricsService', async () => {
    const getLyrics = vi.fn(async () => null);
    const lyricsService = { getLyrics } as unknown as LyricsService;
    const state = new StateStore(null, undefined, lyricsService);

    await state.applyMatch({
      track: {
        provider: 'shazam',
        provider_track_id: 'x',
        title: 'Tren al Sur',
        artist: 'Los Prisioneros',
        album: 'Corazones',
        duration_ms: 312000,
      },
      confidence: 1,
      position_ms: 0,
      matched_at: Date.now(),
    });

    expect(getLyrics).toHaveBeenCalledWith({
      title: 'Tren al Sur',
      artist: 'Los Prisioneros',
      album: 'Corazones',
      durationMs: 312000,
    });
  });

  it('applyExternalTrack no relanza la búsqueda para la misma pista sin letra', async () => {
    const getLyrics = vi.fn(async () => null); // sin letra disponible
    const lyricsService = { getLyrics } as unknown as LyricsService;
    const state = new StateStore(null, undefined, lyricsService);

    const first = await state.applyExternalTrack('Sin Letra', 'Artista X', { positionMs: 0 });
    expect(first).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // SMTC repite el evento 'track' para la misma canción: no debe re-buscar.
    const second = await state.applyExternalTrack('Sin Letra', 'Artista X', { positionMs: 5000 });
    expect(second).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // Una pista DISTINTA sí dispara una búsqueda nueva.
    await state.applyExternalTrack('Otra Cancion', 'Artista X', { positionMs: 0 });
    expect(getLyrics).toHaveBeenCalledTimes(2);
  });
});
