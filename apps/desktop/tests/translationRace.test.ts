// F1 — la traducción pendiente no debe contaminar la canción que se cargó
// mientras el fetch estaba en vuelo (auditoría integral 2026-09-08).
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

// Mock controlable de translateLines: la promesa se resuelve cuando el test
// lo decide, para simular un fetch lento en vuelo. El resto del módulo
// (constantes que importa settings.ts) se preserva.
const translateLines = vi.fn();
vi.mock('../electron/services/translate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../electron/services/translate')>();
  return { ...actual, translateLines: (...args: unknown[]) => translateLines(...args) };
});

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
  const updateCachedLyrics = vi.fn(async () => {});
  const lyricsService = {
    getLyrics,
    updateCachedLyrics,
    describeCachedTrack: () => null,
    getProviderNames: () => ['lrclib'],
  } as unknown as LyricsService;
  const state = new StateStore(null, undefined, lyricsService);
  return { state, updateCachedLyrics };
}

function match(title: string, artist: string): TrackMatch {
  return {
    track: { provider: 'shazam', provider_track_id: title, title, artist },
    confidence: 1,
    position_ms: 0,
    matched_at: Date.now(),
  };
}

describe('StateStore — requestTranslation con cambio de canción en vuelo', () => {
  it('descarta la traducción de A si la canción cambió durante el fetch', async () => {
    const { state, updateCachedLyrics } = makeState();
    state.setRecognitionSource('system');
    await state.applyMatch(match('Cancion A', 'Artista A'));

    // Fetch lento: la promesa queda pendiente hasta que el test la resuelva.
    let resolveFetch!: (v: { ok: boolean; translations?: string[]; error?: string }) => void;
    translateLines.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const pending = state.requestTranslation();

    // Mientras el fetch de A está en vuelo, el audio identifica B. La
    // histéresis exige dos confirmaciones para cambiar una pista lockeada.
    await state.applyMatch(match('Cancion B', 'Artista B'));
    await state.applyMatch(match('Cancion B', 'Artista B'));

    // El fetch de A resuelve tarde.
    resolveFetch({ ok: true, translations: ['traducción de A'] });
    const result = await pending;

    // La traducción de A NO se aplicó sobre B ni se cacheó bajo la clave de B.
    expect(result.ok).toBe(false);
    expect(updateCachedLyrics).not.toHaveBeenCalled();
  });

  it('aplica y persiste la traducción cuando la canción no cambió', async () => {
    const { state, updateCachedLyrics } = makeState();
    state.setRecognitionSource('system');
    await state.applyMatch(match('Cancion A', 'Artista A'));

    translateLines.mockResolvedValueOnce({ ok: true, translations: ['traducción de A'] });
    const result = await state.requestTranslation();

    expect(result.ok).toBe(true);
    expect(updateCachedLyrics).toHaveBeenCalledTimes(1);
  });
});
