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

  it('sobre una pista lockeada sin sesión del SO, la histéresis sigue en dos ciclos', async () => {
    const { state, getLyrics } = makeState();
    state.setRecognitionSource('system');
    // Sin evento del SO: la letra entró por audio, no hay segunda señal.
    await state.loadLyricsByMetadata('Bohemian Rhapsody', 'Queen');
    expect(getLyrics).toHaveBeenCalledTimes(1);
    expect(state.getDiagnostics().identity.requiredHits).toBe(2);

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

describe('StateStore — two-signal lock y wrong-song strikes', () => {
  /** El SO sigue reportando la misma canción: segunda señal en contra. */
  async function lockedWithOsAgreeing() {
    const { state, getLyrics } = makeState();
    state.setRecognitionSource('system');
    await state.applyExternalTrack('Bohemian Rhapsody', 'Queen', { positionMs: 0 });
    // El sidecar sigue mandando posición: la sesión está viva.
    state.applyExternalPosition(1_000, true);
    return { state, getLyrics };
  }

  it('con el SO confirmando la canción actual, exige 5 insistencias del audio', async () => {
    const { state, getLyrics } = await lockedWithOsAgreeing();
    expect(state.getDiagnostics().identity.osStillConfirmsCurrent).toBe(true);
    expect(state.getDiagnostics().identity.requiredHits).toBe(5);

    // Cuatro identificaciones seguidas de OTRA canción no rompen el lock.
    for (let i = 0; i < 4; i += 1) {
      expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(false);
    }
    expect(getLyrics).toHaveBeenCalledTimes(1);
    const strikes = state.getDiagnostics().identity.wrongSong;
    expect(strikes?.consecutiveHits).toBe(4);
    expect(strikes?.titleStillSays).toBe('Bohemian Rhapsody');

    // La quinta sí: el audio insiste demasiado como para ignorarlo.
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(2);
    expect(state.getDiagnostics().identity.wrongSong).toBeNull();
  });

  it('una racha interrumpida vuelve a empezar', async () => {
    const { state, getLyrics } = await lockedWithOsAgreeing();
    await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'));
    await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'));
    expect(state.getDiagnostics().identity.wrongSong?.consecutiveHits).toBe(2);

    // Otra canción distinta: la racha anterior no cuenta.
    await state.applyMatch(match('Otra Cosa Distinta', 'Otro Artista'));
    expect(state.getDiagnostics().identity.wrongSong?.songIdentified).toContain('otro artista');
    expect(state.getDiagnostics().identity.wrongSong?.consecutiveHits).toBe(1);
    expect(getLyrics).toHaveBeenCalledTimes(1);
  });

  it('si el título del SO TAMBIÉN cambió, dos señales bastan (2 confirmaciones)', async () => {
    const { state, getLyrics } = await lockedWithOsAgreeing();

    // El SO pasa a otra canción: segunda señal independiente de que cambió.
    await state.applyExternalTrack('Tren al Sur', 'Los Prisioneros', { positionMs: 0 });
    expect(state.getDiagnostics().identity.osStillConfirmsCurrent).toBe(false);
    expect(state.getDiagnostics().identity.requiredHits).toBe(2);

    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(2);
  });

  it('una sesión del SO muerta ya no confirma nada', async () => {
    const { state } = await lockedWithOsAgreeing();
    expect(state.getDiagnostics().identity.osStillConfirmsCurrent).toBe(true);

    // 40 s sin una sola señal del SO: su último título no prueba nada.
    const future = Date.now() + 40_000;
    expect(state.getDiagnostics(future).identity.osStillConfirmsCurrent).toBe(false);
    expect(state.getDiagnostics(future).identity.requiredHits).toBe(2);
  });

  it('en modo micrófono el SO no cuenta como señal (va suprimido)', async () => {
    const { state, getLyrics } = await lockedWithOsAgreeing();
    state.setExternalInputSuppressed(true);
    expect(state.getDiagnostics().identity.osStillConfirmsCurrent).toBe(false);

    // Sin segunda señal en contra, basta la histéresis normal de 2 ciclos.
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(false);
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(2);
  });

  it('confirmar la pista actual borra la racha acumulada', async () => {
    const { state } = await lockedWithOsAgreeing();
    await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'));
    expect(state.getDiagnostics().identity.wrongSong?.consecutiveHits).toBe(1);

    await state.applyMatch(match('Bohemian Rhapsody', 'Queen'));
    expect(state.getDiagnostics().identity.wrongSong).toBeNull();
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
    expect(diag.identity.lastExternalTitle?.title).toBe('Bohemian Rhapsody');
    expect(diag.identity.requiredHits).toBe(5); // el SO confirma la actual
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
