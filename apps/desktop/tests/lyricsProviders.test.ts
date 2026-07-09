import { afterEach, describe, expect, it, vi } from 'vitest';
import { musixmatchProvider } from '../electron/services/lyrics/providers/musixmatch';
import { neteaseProvider } from '../electron/services/lyrics/providers/netease';
import { letrasProvider, letrasSlug } from '../electron/services/lyrics/providers/letras';

describe('lyrics providers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('musixmatch obtiene letras sincronizadas vía token + search + subtitle', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/token.get')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: { header: { status_code: 200 }, body: { user_token: 'mxm-token' } } }),
        };
      }
      if (url.includes('/track.search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: {
              header: { status_code: 200 },
              body: {
                track_list: [
                  {
                    track: {
                      commontrack_id: 42,
                      track_name: 'Tren al Sur',
                      artist_name: 'Los Prisioneros',
                      has_subtitles: 1,
                      has_lyrics: 1,
                    },
                  },
                ],
              },
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: { subtitle: { subtitle_body: '[00:01.00]hola' } },
          },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const raw = await musixmatchProvider.lookup({ title: 'Tren al Sur', artist: 'Los Prisioneros' });
    expect(raw).toEqual({ source: 'musixmatch', synced: true, lrc: '[00:01.00]hola' });
  });

  it('musixmatch rechaza candidatos flojos para no mezclar otra canción', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/token.get')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: { header: { status_code: 200 }, body: { user_token: 'mxm-token' } } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: {
              track_list: [
                {
                  track: {
                    commontrack_id: 42,
                    track_name: 'Cancion totalmente distinta',
                    artist_name: 'Otro artista',
                    has_subtitles: 1,
                    has_lyrics: 1,
                  },
                },
              ],
            },
          },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const raw = await musixmatchProvider.lookup({ title: 'Tren al Sur', artist: 'Los Prisioneros' });
    expect(raw).toBeNull();
  });

  it('musixmatch cross-script: acepta por duración cuando el texto no coincide', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/token.get')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: { header: { status_code: 200 }, body: { user_token: 'mxm-token' } } }),
        };
      }
      if (url.includes('/track.search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: {
              header: { status_code: 200 },
              body: {
                track_list: [
                  {
                    track: {
                      commontrack_id: 7,
                      track_name: 'アイドル',
                      artist_name: 'ヨアソビ',
                      track_length: 213,
                      has_subtitles: 1,
                      has_lyrics: 1,
                    },
                  },
                ],
              },
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            header: { status_code: 200 },
            body: { subtitle: { subtitle_body: '[00:01.00]hola' } },
          },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const raw = await musixmatchProvider.lookup({
      title: 'Idol',
      artist: 'YOASOBI',
      durationMs: 213_000,
    });
    expect(raw?.synced).toBe(true);
  });

  it('netease devuelve LRC limpio sin créditos', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/search?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              songs: [
                {
                  id: 123,
                  name: 'Cancion',
                  artists: [{ name: 'Artista' }],
                },
              ],
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          lrc: {
            lyric: '[00:00.00]作词 : alguien\n[00:01.00]Primera linea\n[00:02.00]Segunda linea',
          },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const raw = await neteaseProvider.lookup({ title: 'Cancion', artist: 'Artista' });
    expect(raw?.synced).toBe(true);
    expect(raw?.lrc).toContain('Primera linea');
    expect(raw?.lrc).not.toContain('作词');
  });

  it('netease rechaza el primer resultado si no coincide bien', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          songs: [
            {
              id: 123,
              name: 'Cancion china no relacionada',
              artists: [{ name: 'Artista X' }],
            },
          ],
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const raw = await neteaseProvider.lookup({ title: 'Tren al Sur', artist: 'Los Prisioneros' });
    expect(raw).toBeNull();
  });

  it('letras construye slugs al estilo del sitio', () => {
    expect(letrasSlug('Los Prisioneros')).toBe('los-prisioneros');
    expect(letrasSlug('La Camisa Negra')).toBe('la-camisa-negra');
    expect(letrasSlug('Canción Animal')).toBe('cancion-animal');
    expect(letrasSlug("Guns N' Roses")).toBe('guns-n-roses');
  });

  it('letras va directo a la página por slug y extrae fallback plano', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        '<h1>Tren al Sur</h1><h2>Los Prisioneros</h2><div class="lyric-original">Primera<br>Segunda</div>',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const raw = await letrasProvider.lookup({ title: 'Tren al Sur', artist: 'Los Prisioneros' });
    expect(raw).toEqual({ source: 'letras', synced: false, plain: 'Primera\nSegunda' });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://www.letras.mus.br/los-prisioneros/tren-al-sur/',
    );
  });

  it('letras devuelve null en 404 (canción inexistente) sin lanzar', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    const raw = await letrasProvider.lookup({ title: 'No Existe', artist: 'Nadie' });
    expect(raw).toBeNull();
  });

  it('letras rechaza la página si el título/artista no coinciden', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        '<h1>Otra Cancion</h1><h2>Otro Artista</h2><div class="lyric-original">x</div>',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const raw = await letrasProvider.lookup({ title: 'Tren al Sur', artist: 'Los Prisioneros' });
    expect(raw).toBeNull();
  });
});
