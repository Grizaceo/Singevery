import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LyricsService } from '../electron/services/lyrics/lyricsService';
import { pickBest, lrclibProvider } from '../electron/services/lyrics/providers/lrclib';
import type {
  CacheMeta,
  LyricsCache,
  LyricsProvider,
  RawLyrics,
} from '../electron/services/lyrics/types';
import type { TimedLyrics } from '../src/types';

const SYNCED_LRC = '[00:01.00]hello\n[00:03.00]world';

function fakeProvider(raw: RawLyrics | null, onCall?: () => void): LyricsProvider {
  return {
    name: 'fake',
    lookup: async () => {
      onCall?.();
      return raw;
    },
  };
}

/** Caché en memoria que registra put/markNotFound para aserciones. */
function memCache() {
  const store = new Map<string, TimedLyrics>();
  const negatives = new Set<string>();
  const puts: Array<{ key: string; meta: CacheMeta }> = [];
  const cache: LyricsCache = {
    get: async (k) => store.get(k) ?? null,
    put: async (k, lyrics, meta) => {
      store.set(k, lyrics);
      puts.push({ key: k, meta });
    },
    isNegative: (k) => negatives.has(k),
    markNotFound: async (k) => {
      negatives.add(k);
    },
  };
  return { cache, store, negatives, puts };
}

describe('pickBest (LRCLIB)', () => {
  it('prefiere letra sincronizada sobre plana', () => {
    const best = pickBest(
      [
        { plainLyrics: 'plain only' },
        { syncedLyrics: SYNCED_LRC },
      ],
      { title: 't', artist: 'a' },
    );
    expect(best?.synced).toBe(true);
  });

  it('desambigua por duración cercana', () => {
    const best = pickBest(
      [
        { syncedLyrics: '[00:01.00]A', duration: 500 },
        { syncedLyrics: '[00:01.00]B', duration: 200 },
      ],
      { title: 't', artist: 'a', durationMs: 200_000 },
    );
    expect(best?.lrc).toContain('B');
  });

  it('descarta instrumentales', () => {
    const best = pickBest([{ instrumental: true, syncedLyrics: 'x' }], { title: 't', artist: 'a' });
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
        json: async () => [{ syncedLyrics: SYNCED_LRC, duration: 180 }],
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
      json: async () => [{ plainLyrics: 'hello world' }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const raw = await lrclibProvider.lookup({ title: 't', artist: 'a' });
    expect(raw?.synced).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/search?');
  });
});

describe('LyricsService', () => {
  beforeEach(() => vi.useRealTimers());

  it('devuelve de caché sin llamar al proveedor', async () => {
    const { cache, store } = memCache();
    store.set('a::t', { lines: [{ start_ms: 0, text: 'cached' }], source: 'x', synced: true });
    let called = false;
    const svc = new LyricsService(cache, [fakeProvider(null, () => (called = true))]);
    const out = await svc.getLyrics({ title: 'T', artist: 'A' });
    expect(out?.lines[0].text).toBe('cached');
    expect(called).toBe(false);
  });

  it('caché negativa → null sin proveedor', async () => {
    const { cache, negatives } = memCache();
    negatives.add('a::t');
    let called = false;
    const svc = new LyricsService(cache, [fakeProvider(null, () => (called = true))]);
    expect(await svc.getLyrics({ title: 'T', artist: 'A' })).toBeNull();
    expect(called).toBe(false);
  });

  it('miss → parsea, romaniza (no-op en inglés) y guarda en caché', async () => {
    const { cache, puts } = memCache();
    const svc = new LyricsService(cache, [
      fakeProvider({ source: 'lrclib', synced: true, lrc: SYNCED_LRC }),
    ]);
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
    ]);
    const [a, b] = await Promise.all([
      svc.getLyrics({ title: 'T', artist: 'A' }),
      svc.getLyrics({ title: 'T', artist: 'A' }),
    ]);
    expect(a).toEqual(b);
    expect(calls).toBe(1);
  });

  it('sin resultado → markNotFound y null', async () => {
    const { cache, negatives } = memCache();
    const svc = new LyricsService(cache, [fakeProvider(null)]);
    expect(await svc.getLyrics({ title: 'T', artist: 'A' })).toBeNull();
    expect(negatives.has('a::t')).toBe(true);
  });
});
