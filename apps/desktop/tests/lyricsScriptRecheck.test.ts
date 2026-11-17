// Re-verificación de letras cacheadas en la escritura EQUIVOCADA para un
// artista conocido (casos reales del 17-11: YOASOBI "Idol" cacheada en inglés
// y Mrs. GREEN APPLE "Inferno" en romaji, con versión japonesa en LRCLIB).
import { describe, it, expect } from 'vitest';
import { LyricsService } from '../electron/services/lyrics/lyricsService';
import type { LyricsCache, LyricsProvider, RawLyrics } from '../electron/services/lyrics/types';
import type { TimedLyrics } from '../src/types';
import { ANNOTATIONS_VERSION } from '../electron/services/romanize';
import { blankEchoedLines } from '../electron/services/translate';

// Letras inventadas para el test (no son de canciones reales).
const EN_TEXT = ['walking through the city alone tonight', 'your voice still stays with me forever'];
const JA_LRC = '[00:05.00]夜の街をひとり歩いていく\n[00:12.00]君の声がまだ耳に残っている';

const cachedEnglish = (): TimedLyrics => ({
  lines: EN_TEXT.map((text, i) => ({ start_ms: i * 5000, text })),
  source: 'lrclib',
  synced: true,
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

const QUERY = { title: 'Idol', artist: 'YOASOBI' };
const KEY = 'yoasobi::idol';

describe('LyricsService — letra cacheada en otra escritura para artista conocido', () => {
  it('cacheada en inglés + el barrido trae la japonesa sincronizada → usa la japonesa', async () => {
    const { cache, store, rechecked } = memCache();
    store.set(KEY, cachedEnglish());
    const svc = new LyricsService(cache, [provider({ source: 'lrclib', synced: true, lrc: JA_LRC })], {
      enableMetadataHints: false,
    });
    const out = await svc.getLyrics(QUERY);
    expect(out?.lines[0].text).toContain('夜の街');
    expect(store.get(KEY)?.lines[0].text).toContain('夜の街');
    expect(rechecked.has(KEY)).toBe(true);
  });

  it('el barrido vuelve a traer inglés → conserva la cacheada y marca (no reintenta en cada escucha)', async () => {
    const { cache, store, rechecked } = memCache();
    store.set(KEY, cachedEnglish());
    let calls = 0;
    const svc = new LyricsService(
      cache,
      [provider({ source: 'lrclib', synced: true, lrc: '[00:01.00]another english line here\n[00:03.00]and one more english line' }, () => (calls += 1))],
      { enableMetadataHints: false },
    );
    const first = await svc.getLyrics(QUERY);
    expect(first?.lines[0].text).toBe(EN_TEXT[0]);
    expect(store.get(KEY)?.lines[0].text).toBe(EN_TEXT[0]);
    expect(rechecked.has(KEY)).toBe(true);
    await svc.getLyrics(QUERY);
    expect(calls).toBe(1);
  });

  it('la japonesa solo existe plana y la cacheada es sincronizada → no se pierde la sincronía', async () => {
    const { cache, store } = memCache();
    store.set(KEY, cachedEnglish());
    const svc = new LyricsService(
      cache,
      [provider({ source: 'lrclib', synced: false, plain: '夜の街をひとり歩いていく\n君の声がまだ耳に残っている' })],
      { enableMetadataHints: false },
    );
    const out = await svc.getLyrics(QUERY);
    expect(out?.synced).toBe(true);
    expect(out?.lines[0].text).toBe(EN_TEXT[0]);
    expect(store.get(KEY)?.synced).toBe(true);
  });

  it('artista fuera de la tabla con letra latina sincronizada → hit de caché sin red', async () => {
    const { cache, store } = memCache();
    store.set('artista x::t', cachedEnglish());
    let calls = 0;
    const svc = new LyricsService(cache, [provider(null, () => (calls += 1))], { enableMetadataHints: false });
    await svc.getLyrics({ title: 'T', artist: 'Artista X' });
    expect(calls).toBe(0);
  });
});

describe('blankEchoedLines', () => {
  it('vacía las líneas largas devueltas idénticas y respeta las cortas y las traducidas', () => {
    const originals = ['kimi no koe ga mada mimi ni nokotteru', 'Oh yeah', 'yoru no machi wo hitori aruku'];
    const translated = ['kimi no koe ga mada mimi ni nokotteru', 'Oh yeah', 'I walk the night city alone'];
    expect(blankEchoedLines(originals, translated)).toEqual(['', 'Oh yeah', 'I walk the night city alone']);
  });
});
