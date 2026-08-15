// El corte de audio local como TERCERA señal del arbitraje de identidad.
// Es la única que existe cuando no hay reproductor del SO accesible (parlante
// externo, micrófono, vinilo): un hueco de silencio entre pistas es evidencia
// física de que la canción terminó, y permite confirmar el cambio a la primera
// en vez de gastar otro ciclo de corrección (~20s de letra vieja en pantalla).
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
  return { state: new StateStore(null, undefined, lyricsService), getLyrics };
}

function match(title: string, artist: string): TrackMatch {
  return {
    track: { provider: 'shazam', provider_track_id: title, title, artist },
    confidence: 1,
    position_ms: 0,
    matched_at: Date.now(),
  };
}

/** Letra en pantalla identificada por audio, sin sesión del SO en juego. */
async function lockedByAudio() {
  const { state, getLyrics } = makeState();
  state.setRecognitionSource('microphone');
  await state.loadLyricsByMetadata('Bohemian Rhapsody', 'Queen');
  return { state, getLyrics };
}

describe('StateStore — el corte de audio corrobora el cambio', () => {
  it('un hueco reciente + otra canción cambian la letra a la primera', async () => {
    const { state, getLyrics } = await lockedByAudio();
    expect(state.getDiagnostics().identity.requiredHits).toBe(2);

    state.noteAudioBoundary('gap');
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(2);
  });

  it('sin el hueco, la misma secuencia necesita las dos confirmaciones', async () => {
    const { state, getLyrics } = await lockedByAudio();

    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(true);
  });

  it('la novedad espectral NO se salta la histéresis (es señal débil)', async () => {
    const { state, getLyrics } = await lockedByAudio();

    state.noteAudioBoundary('novelty');
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);
  });

  it('un hueco viejo ya no explica el match', async () => {
    const { state, getLyrics } = await lockedByAudio();

    state.noteAudioBoundary('gap', Date.now() - 60_000);
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);
  });

  it('si el SO sigue afirmando la canción actual, el hueco no manda', async () => {
    const { state, getLyrics } = makeState();
    state.setRecognitionSource('system');
    await state.applyExternalTrack('Bohemian Rhapsody', 'Queen', { positionMs: 0 });
    state.applyExternalPosition(1_000, true); // la sesión del SO está viva
    expect(state.getDiagnostics().identity.osStillConfirmsCurrent).toBe(true);

    // El hueco es casi seguro otra cosa (el usuario pausó): manda el SO, que
    // sabe qué está reproduciendo. Se conservan los 5 strikes.
    state.noteAudioBoundary('gap');
    for (let i = 0; i < 4; i += 1) {
      expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(false);
    }
    expect(getLyrics).toHaveBeenCalledTimes(1);
  });

  it('el hueco se consume: no corrobora también el cambio siguiente', async () => {
    const { state, getLyrics } = await lockedByAudio();

    state.noteAudioBoundary('gap');
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(true);
    expect(state.getDiagnostics().identity.lastAudioBoundary).toBeNull();

    // Sin un hueco nuevo, el siguiente cambio vuelve a exigir histéresis.
    expect(await state.applyMatch(match('Otra Canción', 'Otro Artista'))).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(2);
  });

  it('si el fingerprint reconfirma la pista, el hueco se descarta', async () => {
    const { state, getLyrics } = await lockedByAudio();

    // Hueco por una pausa del usuario: el audio dice que sigue lo mismo.
    state.noteAudioBoundary('gap');
    expect(await state.applyMatch(match('Bohemian Rhapsody', 'Queen'))).toBe(false);
    expect(state.getDiagnostics().identity.lastAudioBoundary).toBeNull();

    // Una mis-identificación posterior no hereda esa evidencia.
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);
  });

  it('el corte queda en diagnósticos para /debug', async () => {
    const { state } = await lockedByAudio();
    expect(state.getDiagnostics().identity.lastAudioBoundary).toBeNull();

    state.noteAudioBoundary('gap', 1234);
    expect(state.getDiagnostics().identity.lastAudioBoundary).toEqual({ kind: 'gap', at: 1234 });
  });
});

describe('StateStore — sospecha de cambio (ciclo rápido del renderer)', () => {
  it('se enciende con la primera identificación distinta y se apaga al confirmar', async () => {
    const { state } = await lockedByAudio();
    expect(state.isChangeSuspected()).toBe(false);

    await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'));
    expect(state.isChangeSuspected()).toBe(true);

    await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'));
    expect(state.isChangeSuspected()).toBe(false);
  });

  it('se apaga si el audio vuelve a confirmar la canción mostrada', async () => {
    const { state } = await lockedByAudio();
    await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'));
    expect(state.isChangeSuspected()).toBe(true);

    await state.applyMatch(match('Bohemian Rhapsody', 'Queen'));
    expect(state.isChangeSuspected()).toBe(false);
  });
});
