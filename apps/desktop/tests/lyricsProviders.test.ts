import { afterEach, describe, expect, it, vi } from 'vitest';
import { musixmatchProvider } from '../electron/services/lyrics/providers/musixmatch';
import { neteaseProvider } from '../electron/services/lyrics/providers/netease';
import {
  extractArtistSongLinks,
  letrasProvider,
  letrasSlug,
} from '../electron/services/lyrics/providers/letras';

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

  // Formato real de la página de artista de letras.mus.br (server-rendered).
  const ARTIST_PAGE = `
    <a href="/los-bunkers/mais_acessadas.html">Mais tocadas</a>
    <a href="/los-bunkers/discografia/">Discografia</a>
    <a href="https://www.letras.mus.br/los-bunkers/399753/" title="Llueve Sobre La Ciudad">Llueve Sobre La Ciudad</a>
    <a href="https://www.letras.mus.br/los-bunkers/pequea-serenata-diurna/" title="Pequeña Serenata Diurna">Pequeña Serenata Diurna</a>
    <a href="/otra-banda/123/" title="De otro artista">De otro artista</a>`;

  it('letras extrae solo links de canciones del artista (filtra .html y secciones)', () => {
    const links = extractArtistSongLinks(ARTIST_PAGE, 'los-bunkers');
    expect(links).toEqual([
      {
        href: 'https://www.letras.mus.br/los-bunkers/399753/',
        label: 'Llueve Sobre La Ciudad',
      },
      {
        href: 'https://www.letras.mus.br/los-bunkers/pequea-serenata-diurna/',
        label: 'Pequeña Serenata Diurna',
      },
    ]);
  });

  it('letras fallback: slug directo 404 → página del artista → canción con slug no estándar', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      // El slug adivinado (pequena-...) no existe; el real del sitio es pequea-...
      if (url === 'https://www.letras.mus.br/los-bunkers/pequena-serenata-diurna/') {
        return { ok: false, status: 404, text: async () => '' };
      }
      if (url === 'https://www.letras.mus.br/los-bunkers/') {
        return { ok: true, status: 200, text: async () => ARTIST_PAGE };
      }
      if (url === 'https://www.letras.mus.br/los-bunkers/pequea-serenata-diurna/') {
        return {
          ok: true,
          status: 200,
          text: async () =>
            '<h1>Pequeña Serenata Diurna</h1><h2><a href="/los-bunkers/">Los Bunkers</a></h2><div class="lyric-original">Vivo en un país libre<br>Cual solamente puede ser libre</div>',
        };
      }
      return { ok: false, status: 404, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    const raw = await letrasProvider.lookup({
      title: 'Pequeña Serenata Diurna',
      artist: 'Los Bunkers',
    });
    expect(raw).toEqual({
      source: 'letras',
      synced: false,
      plain: 'Vivo en un país libre\nCual solamente puede ser libre',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('letras fallback: sin link que calce en la página del artista → null', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://www.letras.mus.br/los-bunkers/') {
        return { ok: true, status: 200, text: async () => ARTIST_PAGE };
      }
      return { ok: false, status: 404, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    const raw = await letrasProvider.lookup({ title: 'Cancion Inventada', artist: 'Los Bunkers' });
    expect(raw).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('letras fallback: artista inexistente (404) → null sin lanzar', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    const raw = await letrasProvider.lookup({
      title: 'Gracias a la Vida',
      artist: 'Violeta Parra',
    });
    expect(raw).toBeNull();
  });
});
