// Un título genérico del SO es un HINT, no un lock: el audio manda al instante.
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

describe('StateStore — títulos genéricos no lockean', () => {
  it('marca como provisional la pista que entró por un título genérico', async () => {
    const { state } = makeState();
    state.setRecognitionSource('system');

    await state.applyExternalTrack('Awake', 'Canal Random', { positionMs: 0 });

    const diag = state.getDiagnostics();
    expect(diag.provisional).toBe(true);
    expect(diag.locked).toBe(false);
    expect(diag.titleDistinctiveness).toBeLessThan(0.5);
  });

  it('un título distintivo sí lockea', async () => {
    const { state } = makeState();
    state.setRecognitionSource('system');

    await state.applyExternalTrack('Bohemian Rhapsody', 'Queen', { positionMs: 0 });

    const diag = state.getDiagnostics();
    expect(diag.provisional).toBe(false);
    expect(diag.locked).toBe(true);
  });

  it('sobre una pista provisional, el audio cambia la canción SIN histéresis', async () => {
    const { state, getLyrics } = makeState();
    state.setRecognitionSource('system');
    await state.applyExternalTrack('Awake', 'Canal Random', { positionMs: 0 });
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // Shazam identifica otra cosa: al primer intento manda.
    const changed = await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'));
    expect(changed).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(2);
    // Tras el match por audio la identidad deja de ser provisional.
    expect(state.getDiagnostics().provisional).toBe(false);
    expect(state.getDiagnostics().locked).toBe(true);
  });

  it('sobre una pista lockeada la histéresis sigue exigiendo dos ciclos', async () => {
    const { state, getLyrics } = makeState();
    state.setRecognitionSource('system');
    await state.applyExternalTrack('Bohemian Rhapsody', 'Queen', { positionMs: 0 });
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // Una mis-identificación puntual no arranca la letra.
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);
    // Confirmada dos veces, sí.
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(2);
  });

  it('sin reconocimiento por audio, el título genérico es lo único que hay', async () => {
    const { state } = makeState();
    // recognitionSource = null: nadie puede confirmar, SMTC es la única verdad.
    await state.applyExternalTrack('Awake', 'Canal Random', { positionMs: 0 });
    expect(state.getDiagnostics().provisional).toBe(false);
    expect(state.getDiagnostics().locked).toBe(true);
  });

  it('si el audio CONFIRMA el título genérico, la pista pasa a lockeada', async () => {
    const { state, getLyrics } = makeState();
    state.setRecognitionSource('system');
    await state.applyExternalTrack('Awake', 'Godsmack', { positionMs: 0 });
    expect(state.getDiagnostics().provisional).toBe(true);

    // Segunda señal independiente: la huella del audio dice lo mismo.
    const changed = await state.applyMatch(match('Awake', 'Godsmack'));
    expect(changed).toBe(false); // no recarga: es la misma pista
    expect(getLyrics).toHaveBeenCalledTimes(1);
    expect(state.getDiagnostics().provisional).toBe(false);
    expect(state.getDiagnostics().locked).toBe(true);
  });

  it('una letra importada por el usuario nunca queda provisional', async () => {
    const { state } = makeState();
    state.setRecognitionSource('system');
    await state.applyExternalTrack('Awake', 'Canal Random', { positionMs: 0 });
    expect(state.getDiagnostics().provisional).toBe(true);

    state.setImportedLyrics(LYRICS, 'Awake', 'Canal Random');
    expect(state.getDiagnostics().provisional).toBe(false);
  });
});

describe('StateStore — getDiagnostics', () => {
  it('no altera el estado (es solo lectura)', async () => {
    const { state, getLyrics } = makeState();
    await state.applyExternalTrack('Bohemian Rhapsody', 'Queen', { positionMs: 5_000 });

    const before = state.getDiagnostics();
    const after = state.getDiagnostics();
    expect(after.track).toEqual(before.track);
    expect(after.identity).toEqual(before.identity);
    expect(getLyrics).toHaveBeenCalledTimes(1);
  });

  it('reporta la letra cargada y el arbitraje', async () => {
    const { state } = makeState();
    state.setRecognitionSource('system');
    await state.applyExternalTrack('Bohemian Rhapsody', 'Queen', { positionMs: 0 });

    const diag = state.getDiagnostics();
    expect(diag.track?.artist).toBe('Queen');
    expect(diag.lyrics).toMatchObject({ source: 'lrclib', synced: true, lines: 1 });
    expect(diag.identity.recognitionSource).toBe('system');
    expect(diag.identity.changeConfirmCount).toBe(2);
    expect(diag.sync.offsetMs).toBe(0);
  });

  it('sin pista cargada devuelve track/lyrics en null', () => {
    const { state } = makeState();
    const diag = state.getDiagnostics();
    expect(diag.track).toBeNull();
    expect(diag.lyrics).toBeNull();
    expect(diag.locked).toBe(false);
  });
});
