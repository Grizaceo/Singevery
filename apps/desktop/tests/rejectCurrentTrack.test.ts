// "✗ No es esta" con efecto: la clave vetada se ignora, la letra se retira y
// el título reciente del reproductor sirve de segunda opinión.
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

import { StateStore } from '../electron/core/stateStore';
import type { LyricsService } from '../electron/services/lyrics/lyricsService';
import type { TimedLyrics, TrackMatch } from '../src/types';

const LYRICS: TimedLyrics = {
  lines: [{ start_ms: 0, text: 'linea' }],
  source: 'lrclib',
  synced: true,
};

function makeState() {
  const getLyrics = vi.fn(async () => LYRICS);
  const lyricsService = {
    getLyrics,
    describeCachedTrack: () => null,
    getProviderNames: () => ['lrclib'],
  } as unknown as LyricsService;
  const state = new StateStore(null, undefined, lyricsService);
  return { state, getLyrics };
}

function match(title: string, artist: string): TrackMatch {
  return {
    track: { provider: 'shazam', provider_track_id: title, title, artist },
    confidence: 1,
    position_ms: 0,
    matched_at: Date.now(),
  };
}

describe('StateStore — rejectCurrentTrack ("No es esta")', () => {
  it('tras rechazar, un match de la misma clave se ignora y no recarga letra', async () => {
    const { state, getLyrics } = makeState();
    await state.loadLyricsByMetadata('Be a flower', 'Ryokuoushaku Shakai');
    expect(getLyrics).toHaveBeenCalledTimes(1);

    await state.rejectCurrentTrack();
    // Letra retirada: estado "buscando", sin pista nueva todavía.
    expect(state.getDiagnostics().status).toBe('FETCHING_LYRICS');
    expect(state.getDiagnostics().lyrics).toBeNull();

    const res = await state.applyMatch(match('Be a flower', 'Ryokuoushaku Shakai'));
    expect(res).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);
  });

  it('sin título externo reciente solo espera nueva identificación', async () => {
    const { state, getLyrics } = makeState();
    await state.loadLyricsByMetadata('Be a flower', 'Ryokuoushaku Shakai');

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await state.rejectCurrentTrack();
    expect(log.mock.calls.flat().join(' ')).toContain('espera nueva identificación');
    log.mockRestore();
    expect(getLyrics).toHaveBeenCalledTimes(1);
  });

  it('con título del reproductor reciente carga esa letra como segunda opinión', async () => {
    const { state, getLyrics } = makeState();
    state.setRecognitionSource('system');
    await state.loadLyricsByMetadata('Be a flower', 'Ryokuoushaku Shakai');

    // El SO reporta OTRA canción; con reconocimiento activo y letra en
    // pantalla queda bloqueada (no recarga) pero su título queda registrado.
    const changed = await state.applyExternalTrack('Baka survivor V', 'Artist V', { positionMs: 0 });
    expect(changed).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);

    await state.rejectCurrentTrack();
    // La segunda opinión se cargó por metadata del reproductor.
    expect(getLyrics).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Baka survivor V', artist: 'Artist V' }),
    );
    expect(state.getDiagnostics().track?.title).toBe('Baka survivor V');
    // La identidad de la segunda opinión es provisional.
    expect(state.getDiagnostics().provisional).toBe(true);

    // El veto de "Be a flower" SOBREVIVE a la carga de la segunda opinión.
    const calls = getLyrics.mock.calls.length;
    expect(await state.applyMatch(match('Be a flower', 'Ryokuoushaku Shakai'))).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(calls);
  });

  it('una pista distinta confirmada limpia los vetos', async () => {
    const { state, getLyrics } = makeState();
    await state.loadLyricsByMetadata('Be a flower', 'Ryokuoushaku Shakai');
    await state.rejectCurrentTrack();

    // Nueva identificación (sin letra mostrándose → cambio inmediato).
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(true);
    expect(getLyrics).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Tren al Sur' }),
    );

    // El veto se levantó: "Be a flower" vuelve a poder identificarse.
    // (histeresis: primer intento no confirma, segundo sí)
    expect(await state.applyMatch(match('Be a flower', 'Ryokuoushaku Shakai'))).toBe(false);
    expect(await state.applyMatch(match('Be a flower', 'Ryokuoushaku Shakai'))).toBe(true);
    expect(getLyrics).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Be a flower' }),
    );
  });

  it('un evento externo de la pista vetada tampoco la recarga', async () => {
    const { state, getLyrics } = makeState();
    await state.loadLyricsByMetadata('Be a flower', 'Ryokuoushaku Shakai');
    await state.rejectCurrentTrack();

    const calls = getLyrics.mock.calls.length;
    const changed = await state.applyExternalTrack('Be a flower', 'Ryokuoushaku Shakai', {
      positionMs: 0,
    });
    expect(changed).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(calls);
  });
});
