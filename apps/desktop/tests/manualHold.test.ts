// Hold manual de sincronía: cuando el usuario mueve la letra a mano
// (seekToLine ◀/▶ o nudgePosition por rueda), ninguna fuente automática
// (reconocimiento, SMTC/MPRIS, energía) puede re-anclar ni corregir hasta
// que pulse "Sincronizar" (resumeAutoSync) o cambie de pista/letra.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

import { StateStore } from '../electron/core/stateStore';
import type { LyricsService } from '../electron/services/lyrics/lyricsService';
import type { TimedLyrics, TrackMatch } from '../src/types';

const LYRICS: TimedLyrics = {
  lines: [
    { start_ms: 0, text: 'uno' },
    { start_ms: 60_000, text: 'dos' },
  ],
  source: 'lrclib',
  synced: true,
};

function makeState(lyrics: TimedLyrics | null = LYRICS) {
  const getLyrics = vi.fn(async () => lyrics);
  const lyricsService = { getLyrics } as unknown as LyricsService;
  return { state: new StateStore(null, undefined, lyricsService), getLyrics };
}

/** Match de reconocimiento de la pista cargada, con timecode en `pos`. */
function matchAt(pos: number, at: number, title = 'Known Song', artist = 'Artist'): TrackMatch {
  return {
    track: { provider: 'shazam', provider_track_id: 's', title, artist },
    confidence: 1,
    position_ms: pos,
    matched_at: at,
  };
}

describe('StateStore — hold manual de sincronía', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('tras seekToLine, anclas de reconocimiento discrepantes no mueven la letra', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { state } = makeState();
    await state.loadLyricsByMetadata('Known Song', 'Artist', 10_000, 0);

    expect(state.seekToLine(1)).toBe(true); // salta a la línea de 60 s
    expect(state.getDisplayedPosition(0)).toBe(60_000);
    expect(state.getDiagnostics().sync.manualHold).toBe(true);
    expect(state.getDiagnostics().sync.holdReason).toBe('seekLine');

    // 3 anclas que dirían que la canción va por los 5 s (>4 s de error: sin
    // hold serían snap duro). La letra no se inmuta.
    for (const at of [1_000, 2_000, 3_000]) {
      vi.setSystemTime(at);
      await state.applyMatch(matchAt(5_000, at));
    }
    expect(state.getDisplayedPosition(3_000)).toBeCloseTo(63_000, -2);
    expect(state.getDiagnostics().sync.manualHold).toBe(true);

    const logs = log.mock.calls.flat().join('\n');
    expect(logs).toContain('[manual] hold activado (seekLine)');
    expect(logs).toContain('[sync] hold: error=');
  });

  it('tras nudgePosition, posiciones externas discrepantes no mueven la letra', async () => {
    const { state } = makeState();
    await state.loadLyricsByMetadata('Known Song', 'Artist', 10_000, 0);

    state.nudgePosition(20_000); // selección manual: ~30 s
    expect(state.getDisplayedPosition(0)).toBe(30_000);
    expect(state.getDiagnostics().sync.holdReason).toBe('nudge');

    // El reproductor del SO insiste en otra posición: queda como sugerencia.
    state.applyExternalPosition(5_000, true, 1_000);
    state.applyExternalPosition(6_000, true, 2_000);
    expect(state.getDisplayedPosition(2_000)).toBeCloseTo(32_000, -2);
    expect(state.getDiagnostics().sync.manualHold).toBe(true);
  });

  it('resumeAutoSync aplica la última sugerencia proyectada (snap) y pide resync', async () => {
    const { state } = makeState();
    const resync = vi.fn();
    state.setResyncRequester(resync);
    await state.loadLyricsByMetadata('Known Song', 'Artist', 10_000, 0);
    state.nudgePosition(20_000); // selección manual: ~30 s en t=0

    // La fuente externa cree que la canción va por 90 s.
    state.applyExternalPosition(90_000, true, 1_000);
    vi.setSystemTime(3_000);
    state.resumeAutoSync(3_000);

    // Sugerencia proyectada al ahora: 90 s + 2 s = 92 s → snap (>4 s de error).
    expect(state.getDisplayedPosition(3_000)).toBeCloseTo(92_000, -2);
    expect(resync).toHaveBeenCalledTimes(1);
    expect(state.getDiagnostics().sync.manualHold).toBe(false);
  });

  it('un cambio de pista libera el hold y el auto vuelve a mandar', async () => {
    const { state } = makeState();
    await state.loadLyricsByMetadata('Known Song', 'Artist', 10_000, 0);
    state.seekToLine(1);
    expect(state.getDiagnostics().sync.manualHold).toBe(true);

    await state.loadLyricsByMetadata('Otra Cancion', 'Otro Artista', 5_000, 1_000);
    expect(state.getDiagnostics().sync.manualHold).toBe(false);

    // Y un ancla discrepante de la pista nueva sí reconcilia la posición
    // (el snap se confirma con la segunda lectura, igual que siempre).
    vi.setSystemTime(2_000);
    await state.applyMatch(matchAt(1_000, 2_000, 'Otra Cancion', 'Otro Artista'));
    vi.setSystemTime(3_000);
    await state.applyMatch(matchAt(1_000, 3_000, 'Otra Cancion', 'Otro Artista'));
    expect(state.getDisplayedPosition(3_000)).toBeCloseTo(1_000, -2);
  });

  it('pausa y reanudación durante el hold no cambian la línea', async () => {
    const { state } = makeState();
    await state.loadLyricsByMetadata('Known Song', 'Artist', 10_000, 0);
    state.nudgePosition(20_000); // selección manual: ~30 s

    // El SO pausa → el reloj se congela donde estaba (no salta a los 80 s).
    state.setPlaybackState(false, 1_000);
    vi.setSystemTime(11_000);
    expect(state.isClockPaused()).toBe(true);
    expect(state.getDisplayedPosition(11_000)).toBeCloseTo(31_000, -2);

    // Ni siquiera una posición externa en pausa mueve la letra.
    state.applyExternalPosition(80_000, false, 11_000);
    expect(state.getDisplayedPosition(11_000)).toBeCloseTo(31_000, -2);

    // Al volver a sonar, el reloj reanuda desde donde quedó congelado.
    state.applyExternalPosition(80_000, true, 12_000);
    vi.setSystemTime(13_000);
    expect(state.getDisplayedPosition(13_000)).toBeCloseTo(32_000, -2);
    expect(state.getDiagnostics().sync.manualHold).toBe(true);
  });

  it('el RenderModel expone sync_hold, sync_hold_drift_ms y lyrics_synced', async () => {
    const { state } = makeState();
    await state.loadLyricsByMetadata('Known Song', 'Artist', 10_000, 0);
    state.seekToLine(1); // hold en la línea de 60 s
    state.applyExternalPosition(90_000, true, 0); // sugerencia: va por 90 s

    state.start(50);
    vi.setSystemTime(1_000);
    vi.advanceTimersByTime(60); // un par de ticks → emite el modelo
    state.stop();

    const model = state.getLastModel();
    expect(model?.sync_hold).toBe(true);
    // Sugerencia proyectada (91 s) − mostrada (61 s) = 30 s de deriva.
    expect(model?.sync_hold_drift_ms).toBe(30_000);
    expect(model?.lyrics_synced).toBe(true);
  });

  it('lyrics_synced es false cuando la letra cargada es plana', async () => {
    const plain: TimedLyrics = {
      lines: [{ start_ms: 0, text: 'letra plana' }],
      source: 'test',
      synced: false,
    };
    const { state } = makeState(plain);
    await state.loadLyricsByMetadata('Known Song', 'Artist', 0, 0);

    state.start(50);
    vi.advanceTimersByTime(60);
    state.stop();

    expect(state.getLastModel()?.lyrics_synced).toBe(false);
  });

  it('adjustSyncOffset NO activa el hold (es calibración, no selección)', async () => {
    const { state } = makeState();
    await state.loadLyricsByMetadata('Known Song', 'Artist', 10_000, 0);

    state.adjustSyncOffset(500);
    expect(state.getDiagnostics().sync.manualHold).toBe(false);

    // El auto sigue mandando: un ancla discrepante sí reconcilia la posición
    // (el snap se confirma con la segunda lectura, igual que siempre).
    vi.setSystemTime(1_000);
    await state.applyMatch(matchAt(1_000, 1_000));
    vi.setSystemTime(2_000);
    await state.applyMatch(matchAt(1_000, 2_000));
    expect(state.getDisplayedPosition(2_000)).toBeLessThan(10_000);
  });
});
