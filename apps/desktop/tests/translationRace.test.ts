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
import type { TimedLyrics, TrackMatch, TranslationSettings } from '../src/types';
import type { TranslationStore } from '../electron/services/settings';

const LYRICS: TimedLyrics = {
  lines: [{ start_ms: 0, text: 'linea' }],
  source: 'lrclib',
  synced: true,
};

function makeState(translationStore?: TranslationStore, lyrics = LYRICS) {
  const getLyrics = vi.fn(async () => lyrics);
  const updateCachedLyrics = vi.fn(async () => {});
  const lyricsService = {
    getLyrics,
    updateCachedLyrics,
    describeCachedTrack: () => null,
    getProviderNames: () => ['lrclib'],
  } as unknown as LyricsService;
  const state = new StateStore(null, undefined, lyricsService, undefined, undefined, translationStore);
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
  it('no reutiliza caché sin procedencia local ni de otro modelo', async () => {
    translateLines.mockClear();
    let config: TranslationSettings = {
      provider: 'local', apiKey: '', targetLang: 'es',
      localEndpoint: 'http://localhost:11434/v1/chat/completions', localModel: 'hymt2-singevery',
    };
    const store: TranslationStore = { get: () => config, set: (p) => { config = { ...config, ...p }; } };
    const legacy: TimedLyrics = { ...LYRICS, translationLang: 'es', lines: [{ ...LYRICS.lines[0], translation: 'vieja' }] };
    const { state, updateCachedLyrics } = makeState(store, legacy);
    state.setRecognitionSource('system');
    await state.applyMatch(match('Cancion A', 'Artista A'));
    translateLines.mockResolvedValue({ ok: true, translations: ['nueva'] });
    expect((await state.requestTranslation()).ok).toBe(true);
    expect(translateLines).toHaveBeenCalledTimes(1);
    const saved = updateCachedLyrics.mock.calls[0] as unknown as [string, TimedLyrics];
    expect(saved[1].translationEngineKey).toContain('hymt2-singevery');
    expect((await state.requestTranslation()).ok).toBe(true);
    expect(translateLines).toHaveBeenCalledTimes(1);
    store.set({ localModel: 'translategemma:4b' });
    expect((await state.requestTranslation()).ok).toBe(true);
    expect(translateLines).toHaveBeenCalledTimes(2);
  });
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
