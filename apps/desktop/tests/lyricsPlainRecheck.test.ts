// Re-verificación de letras PLANAS cacheadas.
//
// Una plana de proveedor puede ser solo la versión sin LRC de una canción que
// sí tiene sincronizada en otra entrada (caso LRCLIB). La caché no debe dejarla
// fija para siempre: cada PLAIN_RECHECK_MS se repite el barrido y, solo si
// aparece una sincronizada, se usa. En cualquier otro caso se conserva la
// cacheada y se estampa la marca.
import { describe, it, expect } from 'vitest';
import { LyricsService } from '../electron/services/lyrics/lyricsService';
import type {
  LyricsCache,
  LyricsProvider,
  RawLyrics,
} from '../electron/services/lyrics/types';
import type { TimedLyrics } from '../src/types';
import { ANNOTATIONS_VERSION } from '../electron/services/romanize';

const SYNCED_LRC = '[00:01.00]hello\n[00:03.00]world';

const cachedPlain = (): TimedLyrics => ({
  lines: [{ start_ms: 0, text: 'cached plain' }],
  source: 'lrclib',
  synced: false,
  annotationsVersion: ANNOTATIONS_VERSION,
});

function memCache() {
  const store = new Map<string, TimedLyrics>();
  const rechecked = new Map<string, number>();
  const cache: LyricsCache = {
    get: async (k) => store.get(k) ?? null,
    put: async (k, lyrics) => {
      store.set(k, lyrics);
    },
    isNegative: () => false,
    markNotFound: async () => {},
    plainRecheckedAt: (k) => rechecked.get(k) ?? null,
    markPlainRechecked: (k, at = Date.now()) => {
      rechecked.set(k, at);
    },
  };
  return { cache, store, rechecked };
}

function provider(raw: RawLyrics | null, onCall?: () => void): LyricsProvider {
  return {
    name: 'fake',
    lookup: async () => {
      onCall?.();
      return raw;
    },
  };
}

const QUERY = { title: 'T', artist: 'A' };

describe('LyricsService — re-verificación de planas cacheadas', () => {
  it('plana vencida + el barrido ahora da sincronizada → usa la sincronizada', async () => {
    const { cache, store } = memCache();
    store.set('a::t', cachedPlain());
    let calls = 0;
    const svc = new LyricsService(
      cache,
      [provider({ source: 'lrclib', synced: true, lrc: SYNCED_LRC }, () => (calls += 1))],
      { enableMetadataHints: false },
    );

    const out = await svc.getLyrics(QUERY);
    expect(calls).toBe(1);
    expect(out?.synced).toBe(true);
    expect(out?.lines.map((l) => l.text)).toEqual(['hello', 'world']);
    // La sincronizada quedó cacheada.
    expect(store.get('a::t')?.synced).toBe(true);
  });

  it('plana vencida + el barrido sigue dando plana → devuelve la plana nueva (la que quedó en caché) y marca', async () => {
    const { cache, store, rechecked } = memCache();
    store.set('a::t', cachedPlain());
    let calls = 0;
    const svc = new LyricsService(
      cache,
      [provider({ source: 'lrclib', synced: false, plain: 'otra\nplana' }, () => (calls += 1))],
      { enableMetadataHints: false },
    );

    const out = await svc.getLyrics(QUERY);
    expect(calls).toBe(1);
    expect(out?.lines[0].text).toBe('otra');
    expect(store.get('a::t')?.lines[0].text).toBe('otra');
    expect(rechecked.has('a::t')).toBe(true);
  });

  it('plana vencida + "no existe" → conserva la cacheada (no la pisa la negativa)', async () => {
    const { cache, store, rechecked } = memCache();
    const original = cachedPlain();
    store.set('a::t', original);
    const svc = new LyricsService(cache, [provider(null)], { enableMetadataHints: false });

    const out = await svc.getLyrics(QUERY);
    expect(out?.lines[0].text).toBe('cached plain');
    // La entrada positiva sigue en caché (se restauró tras markNotFound).
    expect(store.get('a::t')?.lines[0].text).toBe('cached plain');
    expect(rechecked.has('a::t')).toBe(true);
  });

  it('plana vencida + error de red → devuelve la cacheada y marca', async () => {
    const { cache, store, rechecked } = memCache();
    store.set('a::t', cachedPlain());
    const svc = new LyricsService(
      cache,
      [
        {
          name: 'fake',
          lookup: async () => {
            throw new Error('network down');
          },
        },
      ],
      { enableMetadataHints: false, retryDelayMs: 0 },
    );

    const out = await svc.getLyrics(QUERY);
    expect(out?.lines[0].text).toBe('cached plain');
    expect(rechecked.has('a::t')).toBe(true);
  });

  it('plana cacheada con re-verificación reciente → no llama al proveedor', async () => {
    const { cache, store, rechecked } = memCache();
    store.set('a::t', cachedPlain());
    rechecked.set('a::t', Date.now());
    let calls = 0;
    const svc = new LyricsService(
      cache,
      [provider({ source: 'lrclib', synced: true, lrc: SYNCED_LRC }, () => (calls += 1))],
      { enableMetadataHints: false },
    );

    const out = await svc.getLyrics(QUERY);
    expect(calls).toBe(0);
    expect(out?.synced).toBe(false);
  });

  it('letra SINCRONIZADA cacheada → comportamiento intacto (sin re-verificación)', async () => {
    const { cache, store } = memCache();
    store.set('a::t', {
      lines: [{ start_ms: 0, text: 'synced' }],
      source: 'lrclib',
      synced: true,
      annotationsVersion: ANNOTATIONS_VERSION,
    });
    let calls = 0;
    const svc = new LyricsService(
      cache,
      [provider({ source: 'lrclib', synced: false, plain: 'x' }, () => (calls += 1))],
      { enableMetadataHints: false },
    );

    const out = await svc.getLyrics(QUERY);
    expect(calls).toBe(0);
    expect(out?.synced).toBe(true);
  });

  it('plana IMPORTADA por el usuario → nunca se re-verifica', async () => {
    const { cache, store } = memCache();
    store.set('a::t', {
      lines: [{ start_ms: 0, text: 'importada' }],
      source: 'import-local',
      synced: false,
      annotationsVersion: ANNOTATIONS_VERSION,
    });
    let calls = 0;
    const svc = new LyricsService(
      cache,
      [provider({ source: 'lrclib', synced: true, lrc: SYNCED_LRC }, () => (calls += 1))],
      { enableMetadataHints: false },
    );

    const out = await svc.getLyrics(QUERY);
    expect(calls).toBe(0);
    expect(out?.lines[0].text).toBe('importada');
  });

  it('plana con duración conocida se reparte uniforme al cachear de nuevo', async () => {
    const { cache } = memCache();
    const svc = new LyricsService(
      cache,
      [
        provider({
          source: 'lrclib',
          synced: false,
          plain: 'uno\ndos\ntres\ncuatro',
        }),
      ],
      { enableMetadataHints: false },
    );

    const out = await svc.getLyrics({ ...QUERY, durationMs: 200_000 });
    expect(out?.synced).toBe(false);
    expect(out?.lines.map((l) => l.start_ms)).toEqual([0, 50_000, 100_000, 150_000]);
  });

  it('plana sin duración mantiene el espaciado fijo de 5 s', async () => {
    const { cache } = memCache();
    const svc = new LyricsService(
      cache,
      [provider({ source: 'lrclib', synced: false, plain: 'uno\ndos' })],
      { enableMetadataHints: false },
    );

    const out = await svc.getLyrics(QUERY);
    expect(out?.lines.map((l) => l.start_ms)).toEqual([0, 5_000]);
  });
});
