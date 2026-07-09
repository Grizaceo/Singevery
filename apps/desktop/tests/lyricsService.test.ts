import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { LyricsService, PROVIDER_SCOPE_VERSION } from '../electron/services/lyrics/lyricsService';
import { pickBest, lrclibProvider } from '../electron/services/lyrics/providers/lrclib';
import type {
  CacheMeta,
  LyricsCache,
  LyricsProvider,
  RawLyrics,
} from '../electron/services/lyrics/types';
import type { TimedLyrics } from '../src/types';

const SYNCED_LRC = '[00:01.00]hello\n[00:03.00]world';

function fakeProvider(
  raw: RawLyrics | null,
  onCall?: (query: import('../electron/services/lyrics/types').LyricsQuery) => void,
): LyricsProvider {
  return {
    name: 'fake',
    lookup: async (query) => {
      onCall?.(query);
      return raw;
    },
  };
}

/** Caché en memoria que registra put/markNotFound para aserciones. */
function memCache() {
  const store = new Map<string, TimedLyrics>();
  const negatives = new Map<string, string | undefined>();
  const puts: Array<{ key: string; meta: CacheMeta }> = [];
  const cache: LyricsCache = {
    get: async (k) => store.get(k) ?? null,
    put: async (k, lyrics, meta) => {
      store.set(k, lyrics);
      puts.push({ key: k, meta });
    },
    isNegative: (k, sourceHash) => negatives.get(k) === sourceHash,
    markNotFound: async (k, _meta, sourceHash) => {
      negatives.set(k, sourceHash);
    },
    clearEntry: async (k) => negatives.delete(k),
  };
  return { cache, store, negatives, puts };
}

describe('pickBest (LRCLIB)', () => {
  it('prefiere letra sincronizada sobre plana', () => {
    const best = pickBest(
      [
        { plainLyrics: 'plain only', trackName: 't', artistName: 'a' },
        { syncedLyrics: SYNCED_LRC, trackName: 't', artistName: 'a' },
      ],
      { title: 't', artist: 'a' },
    );
    expect(best?.synced).toBe(true);
  });

  it('desambigua por duración cercana', () => {
    const best = pickBest(
      [
        { syncedLyrics: '[00:01.00]A', duration: 500, trackName: 't', artistName: 'a' },
        { syncedLyrics: '[00:01.00]B', duration: 200, trackName: 't', artistName: 'a' },
      ],
      { title: 't', artist: 'a', durationMs: 200_000 },
    );
    expect(best?.lrc).toContain('B');
  });

  it('descarta instrumentales', () => {
    const best = pickBest(
      [{ instrumental: true, syncedLyrics: 'x', trackName: 't', artistName: 'a' }],
      { title: 't', artist: 'a' },
    );
    expect(best).toBeNull();
  });

  it('rechaza resultados de otra canción aunque tengan synced lyrics', () => {
    const best = pickBest(
      [{ syncedLyrics: SYNCED_LRC, trackName: 'otro tema', artistName: 'otro artista' }],
      { title: 't', artist: 'a' },
    );
    expect(best).toBeNull();
  });

  it('cross-script: acepta por duración exacta cuando el texto no coincide', () => {
    // LRCLIB tiene la pista con metadata en japonés; la query llega en romaji.
    const best = pickBest(
      [
        { syncedLyrics: SYNCED_LRC, trackName: 'アイドル', artistName: 'ヨアソビ', duration: 213 },
        { syncedLyrics: '[00:01.00]otra', trackName: '別の曲', artistName: '別の人', duration: 340 },
      ],
      { title: 'Idol', artist: 'YOASOBI', durationMs: 213_000 },
    );
    expect(best?.synced).toBe(true);
    expect(best?.lrc).toBe(SYNCED_LRC);
  });

  it('cross-script: sin duración conocida NO acepta candidatos que no coinciden', () => {
    const best = pickBest(
      [{ syncedLyrics: SYNCED_LRC, trackName: 'アイドル', artistName: 'ヨアソビ', duration: 213 }],
      { title: 'Idol', artist: 'YOASOBI' },
    );
    expect(best).toBeNull();
  });
});

describe('lrclibProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('usa /api/get exacto cuando hay duración', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ syncedLyrics: SYNCED_LRC, duration: 180 }),
      _url: url,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const raw = await lrclibProvider.lookup({ title: 't', artist: 'a', durationMs: 180_000 });
    expect(raw?.synced).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/get?');
  });

  it('cae a /api/search cuando /get da 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ syncedLyrics: SYNCED_LRC, duration: 180, trackName: 't', artistName: 'a' }],
      });
    vi.stubGlobal('fetch', fetchMock);
    const raw = await lrclibProvider.lookup({ title: 't', artist: 'a', durationMs: 180_000 });
    expect(raw?.synced).toBe(true);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/search?');
  });

  it('sin duración va directo a /search', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ plainLyrics: 'hello world', trackName: 't', artistName: 'a' }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const raw = await lrclibProvider.lookup({ title: 't', artist: 'a' });
    expect(raw?.synced).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/search?');
  });

  it('cae a q= cuando /search por artista+título no devuelve resultados', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ syncedLyrics: SYNCED_LRC, trackName: 't', artistName: 'a' }],
      });
    vi.stubGlobal('fetch', fetchMock);
    const raw = await lrclibProvider.lookup({ title: 't', artist: 'a' });
    expect(raw?.synced).toBe(true);
    expect(String(fetchMock.mock.calls[1][0])).toContain('q=');
  });
});

describe('LyricsService', () => {
  beforeEach(() => vi.useRealTimers());

  it('devuelve de caché sin llamar al proveedor', async () => {
    const { cache, store } = memCache();
    store.set('a::t', { lines: [{ start_ms: 0, text: 'cached' }], source: 'x', synced: true });
    let called = false;
    const svc = new LyricsService(cache, [fakeProvider(null, () => (called = true))], {
      enableMetadataHints: false,
    });
    const out = await svc.getLyrics({ title: 'T', artist: 'A' });
    expect(out?.lines[0].text).toBe('cached');
    expect(called).toBe(false);
  });

  it('caché negativa → null sin proveedor', async () => {
    const { cache, negatives } = memCache();
    negatives.set(
      'a::t',
      createHash('sha1').update(`v${PROVIDER_SCOPE_VERSION}|fake`).digest('hex'),
    );
    let called = false;
    const svc = new LyricsService(cache, [fakeProvider(null, () => (called = true))], {
      enableMetadataHints: false,
    });
    expect(await svc.getLyrics({ title: 'T', artist: 'A' })).toBeNull();
    expect(called).toBe(false);
  });

  it('miss → parsea, romaniza (no-op en inglés) y guarda en caché', async () => {
    const { cache, puts } = memCache();
    const svc = new LyricsService(cache, [
      fakeProvider({ source: 'lrclib', synced: true, lrc: SYNCED_LRC }),
    ], { enableMetadataHints: false });
    const out = await svc.getLyrics({ title: 'T', artist: 'A', durationMs: 1000 });
    expect(out?.lines.map((l) => l.text)).toEqual(['hello', 'world']);
    expect(puts).toHaveLength(1);
    expect(puts[0].meta.title).toBe('T');
  });

  it('single-flight: requests concurrentes llaman al proveedor una vez', async () => {
    const { cache } = memCache();
    let calls = 0;
    const svc = new LyricsService(cache, [
      fakeProvider({ source: 'lrclib', synced: true, lrc: SYNCED_LRC }, () => (calls += 1)),
    ], { enableMetadataHints: false });
    const [a, b] = await Promise.all([
      svc.getLyrics({ title: 'T', artist: 'A' }),
      svc.getLyrics({ title: 'T', artist: 'A' }),
    ]);
    expect(a).toEqual(b);
    expect(calls).toBe(1);
  });

  it('sin resultado → markNotFound y null', async () => {
    const { cache, negatives } = memCache();
    const svc = new LyricsService(cache, [fakeProvider(null)], { enableMetadataHints: false });
    expect(await svc.getLyrics({ title: 'T', artist: 'A' })).toBeNull();
    expect(negatives.has('a::t')).toBe(true);
  });

  it('reintenta fallos transitorios antes de abandonar una fuente', async () => {
    const { cache } = memCache();
    let attempts = 0;
    const retryingProvider: LyricsProvider = {
      name: 'retrying',
      lookup: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('boom');
        return { source: 'retrying', synced: true, lrc: SYNCED_LRC };
      },
    };
    const svc = new LyricsService(cache, [retryingProvider], {
      enableMetadataHints: false,
      retryDelayMs: 0,
    });
    const out = await svc.getLyrics({ title: 'T', artist: 'A' });
    expect(out?.synced).toBe(true);
    expect(attempts).toBe(2);
  });

  it('no marca caché negativa cuando solo hubo errores de red', async () => {
    const { cache, negatives } = memCache();
    const svc = new LyricsService(
      cache,
      [
        {
          name: 'broken',
          lookup: async () => {
            throw new Error('network down');
          },
        },
      ],
      { enableMetadataHints: false, retryDelayMs: 0 },
    );

    await expect(svc.getLyrics({ title: 'T', artist: 'A' })).rejects.toThrow();
    expect(negatives.has('a::t')).toBe(false);
  });

  it('una fuente caída no convierte "no encontrada" en ERROR (mixto → null sin negativa)', async () => {
    const { cache, negatives } = memCache();
    const svc = new LyricsService(
      cache,
      [
        fakeProvider(null), // respondió bien: no existe
        {
          name: 'caido',
          lookup: async () => {
            throw new Error('captcha / rate limit');
          },
        },
      ],
      { enableMetadataHints: false, retryDelayMs: 0 },
    );

    // No lanza (hay una respuesta legítima de "no existe")...
    await expect(svc.getLyrics({ title: 'T', artist: 'A' })).resolves.toBeNull();
    // ...pero tampoco cachea la negativa (el barrido no fue limpio).
    expect(negatives.has('a::t')).toBe(false);
  });

  it('no reintenta cuando el intento fue abortado por timeout propio', async () => {
    const { cache } = memCache();
    let attempts = 0;
    const abortingProvider: LyricsProvider = {
      name: 'lento',
      lookup: async () => {
        attempts += 1;
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    };
    const svc = new LyricsService(cache, [abortingProvider], {
      enableMetadataHints: false,
      retryDelayMs: 0,
    });
    await expect(svc.getLyrics({ title: 'T', artist: 'A' })).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('prefiere un fallback sincronizado sobre uno plano previo', async () => {
    const { cache } = memCache();
    const svc = new LyricsService(
      cache,
      [
        { name: 'plain', lookup: async () => ({ source: 'plain', synced: false, plain: 'uno\ndos' }) },
        { name: 'synced', lookup: async () => ({ source: 'synced', synced: true, lrc: SYNCED_LRC }) },
      ],
      { enableMetadataHints: false },
    );
    const out = await svc.getLyrics({ title: 'T', artist: 'A' });
    expect(out?.source).toBe('synced');
  });
});
