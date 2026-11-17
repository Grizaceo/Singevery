// Preferencia de escritura nativa entre versiones del mismo tema.
//
// Caso real (issue #2): "Aina The End - On The Way" existe en LRCLIB dos veces
// con la misma duración (~198 s): una letra en inglés ("On The Way") y otra en
// japonés ("革命道中 - On The Way"). /api/get devuelve la inglesa por firma
// exacta y la duración no desempata. Para artistas conocidos en la tabla, la
// letra en su escritura esperable gana.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../electron/services/http', () => ({
  appFetch: vi.fn(),
}));

import { appFetch } from '../electron/services/http';
import {
  isInExpectedScript,
  knownArtistLanguage,
} from '../electron/services/lyrics/artistLanguage';
import {
  lrclibProvider,
  pickBest,
} from '../electron/services/lyrics/providers/lrclib';
import type { LyricsQuery } from '../electron/services/lyrics/types';

const appFetchMock = vi.mocked(appFetch);

// Letras inventadas para el test (no son de canciones reales).
const JA_TEXT =
  '夜の街をひとり歩いて\n君の声がまだ耳に残る\n明日の光を待ちながら\nこの道の先へ進んでいく';
const JA_LRC =
  '[00:05.00]夜の街をひとり歩いて\n[00:12.00]君の声がまだ耳に残る\n[00:20.00]明日の光を待ちながら\n[00:30.00]この道の先へ進んでいく';
const EN_LRC =
  '[00:05.00]walking through the city alone\n[00:12.00]your voice still stays with me\n[00:20.00]waiting for the light of tomorrow\n[00:30.00]walking on down this endless road';

const QUERY: LyricsQuery = {
  title: 'On The Way',
  artist: 'Aina The End',
  album: null,
  durationMs: 197_668,
};

function entry(over: Record<string, unknown> = {}) {
  return {
    trackName: 'On The Way',
    artistName: 'Aina the End',
    duration: 198,
    syncedLyrics: EN_LRC,
    plainLyrics: null,
    instrumental: false,
    ...over,
  };
}

const JA_ENTRY = entry({
  trackName: '革命道中 - On The Way',
  artistName: 'AiNA THE END',
  syncedLyrics: JA_LRC,
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  appFetchMock.mockReset();
});

describe('knownArtistLanguage — AiNA THE END', () => {
  it('reconoce las grafías del artista como japonesas', () => {
    expect(knownArtistLanguage('Aina The End')).toBe('ja');
    expect(knownArtistLanguage('AiNA THE END')).toBe('ja');
    expect(knownArtistLanguage('アイナ・ジ・エンド')).toBe('ja');
  });
});

describe('isInExpectedScript', () => {
  it('letra japonesa para artista japonés → true', () => {
    expect(isInExpectedScript('AiNA THE END', JA_TEXT)).toBe(true);
    expect(isInExpectedScript('AiNA THE END', JA_LRC)).toBe(true);
  });

  it('letra inglesa para artista japonés → false (no es veto, es preferencia)', () => {
    expect(isInExpectedScript('AiNA THE END', 'walking through the city alone')).toBe(false);
  });

  it('artista desconocido → null', () => {
    expect(isInExpectedScript('Artista X', JA_TEXT)).toBeNull();
    expect(isInExpectedScript(null, JA_TEXT)).toBeNull();
  });

  it('texto demasiado corto → null', () => {
    expect(isInExpectedScript('AiNA THE END', 'こんにちは')).toBeNull();
  });
});

describe('pickBest — desempate por escritura nativa', () => {
  it('entre dos sincronizadas de igual duración gana la japonesa para artista conocido', () => {
    const raw = pickBest([entry(), JA_ENTRY], QUERY);
    expect(raw).toMatchObject({ synced: true });
    expect(raw?.lrc).toContain('夜の街');
  });

  it('con artista desconocido gana la inglesa (sin cambio de comportamiento)', () => {
    const raw = pickBest(
      [entry({ artistName: 'Artista X' }), JA_ENTRY],
      { ...QUERY, artist: 'Artista X' },
    );
    expect(raw).toMatchObject({ synced: true });
    expect(raw?.lrc).toContain('walking through the city');
  });

  it('la sincronizada sigue ganando a la nativa plana', () => {
    const raw = pickBest(
      [
        entry(),
        { ...JA_ENTRY, syncedLyrics: null, plainLyrics: JA_TEXT },
      ],
      QUERY,
    );
    expect(raw).toMatchObject({ synced: true });
    expect(raw?.lrc).toContain('walking through the city');
  });
});

describe('lrclibProvider.lookup — alternativa de escritura nativa', () => {
  it('/get devuelve la inglesa y /search trae ambas → retorna la japonesa', async () => {
    appFetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/get?')) return jsonResponse(200, entry());
      if (url.includes('/search?')) return jsonResponse(200, [entry(), JA_ENTRY]);
      return jsonResponse(404, {});
    });

    const raw = await lrclibProvider.lookup(QUERY);
    expect(raw).toMatchObject({ synced: true });
    expect(raw?.lrc).toContain('夜の街');
  });

  it('la búsqueda por campos solo trae latinas y la general (q=) trae la japonesa → retorna la japonesa', async () => {
    // Así responde LRCLIB hoy: /search?track_name=…&artist_name=… devuelve 20
    // entradas, todas en inglés, y la japonesa solo aparece con /search?q=.
    appFetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/get?')) return jsonResponse(200, entry());
      if (url.includes('/search?') && url.includes('track_name=')) {
        return jsonResponse(200, [entry(), entry({ duration: 255 })]);
      }
      if (url.includes('/search?') && url.includes('q=')) return jsonResponse(200, [JA_ENTRY, entry()]);
      return jsonResponse(404, {});
    });

    const raw = await lrclibProvider.lookup(QUERY);
    expect(raw?.lrc).toContain('夜の街');
    expect(appFetchMock).toHaveBeenCalledTimes(3);
  });

  it('/get devuelve la inglesa y /search falla → retorna la inglesa sin lanzar', async () => {
    appFetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/get?')) return jsonResponse(200, entry());
      return jsonResponse(500, {});
    });

    const raw = await lrclibProvider.lookup(QUERY);
    expect(raw?.lrc).toContain('walking through the city');
  });

  it('/get ya devuelve la japonesa → una sola llamada, sin búsquedas extra', async () => {
    appFetchMock.mockImplementation(async () => jsonResponse(200, JA_ENTRY));

    const raw = await lrclibProvider.lookup(QUERY);
    expect(raw?.lrc).toContain('夜の街');
    expect(appFetchMock).toHaveBeenCalledTimes(1);
  });

  it('artista desconocido con /get inglesa → una sola llamada', async () => {
    appFetchMock.mockImplementation(async () =>
      jsonResponse(200, entry({ artistName: 'Artista X' })),
    );

    const raw = await lrclibProvider.lookup({ ...QUERY, artist: 'Artista X' });
    expect(raw?.lrc).toContain('walking through the city');
    expect(appFetchMock).toHaveBeenCalledTimes(1);
  });
});
