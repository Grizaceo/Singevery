// Upgrade de letra PLANA a SINCRONIZADA en LRCLIB.
//
// Caso real: /api/get con artist "Eminem, Dr. Dre & 50 Cent", track
// "Crack A Bottle", album "Curtain Call 2", duration 298 devuelve una entrada
// con syncedLyrics=null; la misma firma con album_name vacío devuelve una
// sincronizada de 298 s. Una plana cacheada/obtenida no debe quedar fija si
// existe una sincronizada compatible.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../electron/services/http', () => ({
  appFetch: vi.fn(),
}));

import { appFetch } from '../electron/services/http';
import { lrclibProvider } from '../electron/services/lyrics/providers/lrclib';
import type { LyricsQuery } from '../electron/services/lyrics/types';

const appFetchMock = vi.mocked(appFetch);

const EN_TEXT =
  'we gonna make a million deals tonight\nraise the bottle up to the sky\nand we never look back, never say goodbye';
const EN_LRC =
  '[00:05.00]we gonna make a million deals tonight\n[00:12.00]raise the bottle up to the sky\n[00:20.00]and we never look back, never say goodbye';
const JA_TEXT =
  '夜の街をひとり歩いて\n君の声がまだ耳に残る\n明日の光を待ちながら\nこの道の先へ進んでいく';
const JA_LRC =
  '[00:05.00]夜の街をひとり歩いて\n[00:12.00]君の声がまだ耳に残る\n[00:20.00]明日の光を待ちながら\n[00:30.00]この道の先へ進んでいく';

const QUERY: LyricsQuery = {
  title: 'Crack A Bottle',
  artist: 'Eminem, Dr. Dre & 50 Cent',
  album: 'Curtain Call 2',
  durationMs: 298_000,
};

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 1234,
    trackName: 'Crack A Bottle',
    artistName: 'Eminem, Dr. Dre & 50 Cent',
    albumName: 'Curtain Call 2',
    duration: 298,
    syncedLyrics: null,
    plainLyrics: EN_TEXT,
    instrumental: false,
    ...over,
  };
}

const PLAIN_ENTRY = entry();
const SYNCED_ENTRY = entry({ id: 5678, syncedLyrics: EN_LRC, plainLyrics: null });

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** URLs llamadas a appFetch, en orden. */
function calledUrls(): string[] {
  return appFetchMock.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  appFetchMock.mockReset();
});

describe('lrclibProvider.lookup — upgrade plana → sincronizada', () => {
  it('plana con álbum + sincronizada sin álbum → devuelve la sincronizada', async () => {
    appFetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/get?')) {
        // La firma con álbum trae la plana; la de album_name vacío, la LRC.
        return url.includes('album_name=') && !url.includes('album_name=&')
          ? jsonResponse(200, PLAIN_ENTRY)
          : jsonResponse(200, SYNCED_ENTRY);
      }
      return jsonResponse(404, {});
    });

    const raw = await lrclibProvider.lookup(QUERY);
    expect(raw?.synced).toBe(true);
    expect(raw?.lrc).toContain('million deals');
    expect(raw?.meta?.id).toBe(5678);
    // Dos llamadas: /get con álbum y /get sin álbum.
    const urls = calledUrls();
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('album_name=Curtain');
    expect(urls[1]).toContain('/get?');
    expect(urls[1]).toContain('album_name=');
    expect(urls[1]).not.toContain('Curtain');
  });

  it('plana sin alternativa sincronizada → se queda la plana', async () => {
    appFetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/get?')) return jsonResponse(200, PLAIN_ENTRY);
      if (url.includes('/search?')) return jsonResponse(200, []);
      return jsonResponse(404, {});
    });

    const raw = await lrclibProvider.lookup(QUERY);
    expect(raw?.synced).toBe(false);
    expect(raw?.plain).toContain('million deals');
  });

  it('la búsqueda alternativa falla → devuelve la plana exacta sin lanzar', async () => {
    appFetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/get?') && url.includes('Curtain')) {
        return jsonResponse(200, PLAIN_ENTRY);
      }
      return jsonResponse(500, {});
    });

    const raw = await lrclibProvider.lookup(QUERY);
    expect(raw?.synced).toBe(false);
    expect(raw?.plain).toContain('million deals');
  });

  it('/get ya devuelve sincronizada → una sola llamada, sin búsquedas extra', async () => {
    appFetchMock.mockImplementation(async () => jsonResponse(200, SYNCED_ENTRY));

    const raw = await lrclibProvider.lookup(QUERY);
    expect(raw?.synced).toBe(true);
    expect(appFetchMock).toHaveBeenCalledTimes(1);
  });

  it('no cambia a una sincronizada de otra escritura para artista conocido', async () => {
    // Artista japonés conocido: la plana exacta está en japonés (escritura
    // esperada) y todas las alternativas sincronizadas vienen en inglés.
    const jaQuery: LyricsQuery = {
      title: 'Crack A Bottle',
      artist: 'AiNA THE END',
      album: 'Curtain Call 2',
      durationMs: 298_000,
    };
    const jaPlain = entry({
      artistName: 'AiNA THE END',
      syncedLyrics: null,
      plainLyrics: JA_TEXT,
    });
    const enSynced = entry({
      artistName: 'AiNA THE END',
      syncedLyrics: EN_LRC,
      plainLyrics: null,
    });
    const jaSynced = entry({
      artistName: 'AiNA THE END',
      syncedLyrics: JA_LRC,
      plainLyrics: null,
    });
    appFetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/get?')) {
        return url.includes('Curtain') ? jsonResponse(200, jaPlain) : jsonResponse(200, jaSynced);
      }
      if (url.includes('/search?')) return jsonResponse(200, [enSynced]);
      return jsonResponse(404, {});
    });

    const raw = await lrclibProvider.lookup(jaQuery);
    // La alternativa sin álbum sí es válida (misma escritura) → sincronizada JA.
    expect(raw?.synced).toBe(true);
    expect(raw?.lrc).toContain('夜の街');
  });

  it('todas las alternativas en otra escritura → conserva la plana', async () => {
    const jaQuery: LyricsQuery = {
      title: 'Crack A Bottle',
      artist: 'AiNA THE END',
      album: 'Curtain Call 2',
      durationMs: 298_000,
    };
    const jaPlain = entry({
      artistName: 'AiNA THE END',
      syncedLyrics: null,
      plainLyrics: JA_TEXT,
    });
    const enSynced = entry({
      artistName: 'AiNA THE END',
      syncedLyrics: EN_LRC,
      plainLyrics: null,
    });
    appFetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/get?')) {
        // Ni con álbum ni sin álbum hay sincronizada válida.
        return jsonResponse(200, url.includes('Curtain') ? jaPlain : enSynced);
      }
      if (url.includes('/search?')) return jsonResponse(200, [enSynced]);
      return jsonResponse(404, {});
    });

    const raw = await lrclibProvider.lookup(jaQuery);
    // La /get sin álbum trae EN (inválida por escritura); /search e
    // /search?q también EN → se queda la plana japonesa.
    expect(raw?.synced).toBe(false);
    expect(raw?.plain).toContain('夜の街');
  });
});
