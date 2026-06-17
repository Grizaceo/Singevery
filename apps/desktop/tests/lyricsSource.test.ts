import { describe, it, expect } from 'vitest';
import {
  fetchLyricsChain,
  chainResultToTimedLyrics,
  type LyricSource,
  type LyricSourceResult,
} from '../electron/services/lyricsSource';
import { pickLrclibResult } from '../electron/services/lrclib';
import { parseAuddFindLyricsResponse } from '../electron/services/auddLyrics';
import { parseOvhResponse } from '../electron/services/lyricsOvh';
import { extractGeniusLyrics, parseGeniusSearchResponse } from '../electron/services/geniusLyrics';

// Helpers para fuentes fake (testeable sin red).
function fakeSource(name: string, result: LyricSourceResult | null): LyricSource {
  return {
    name,
    async fetch(): Promise<LyricSourceResult | null> {
      return result;
    },
  };
}
function throwingSource(name: string, err: Error): LyricSource {
  return {
    name,
    async fetch(): Promise<LyricSourceResult | null> {
      throw err;
    },
  };
}

describe('fetchLyricsChain', () => {
  it('devuelve la primera fuente con letra', async () => {
    const a = fakeSource('a', null);
    const b = fakeSource('b', { lyrics: 'letra B', synced: false, source: 'b' });
    const c = fakeSource('c', { lyrics: 'letra C', synced: false, source: 'c' });
    const r = await fetchLyricsChain([a, b, c], 't', 'art');
    expect(r?.source).toBe('b');
  });

  it('no prueba las fuentes siguientes tras la primera que responde', async () => {
    let cCalled = false;
    const b: LyricSource = {
      name: 'b',
      async fetch(): Promise<LyricSourceResult | null> {
        return { lyrics: 'letra B', synced: false, source: 'b' };
      },
    };
    const c: LyricSource = {
      name: 'c',
      async fetch(): Promise<LyricSourceResult | null> {
        cCalled = true;
        return null;
      },
    };
    const a = fakeSource('a', null);
    await fetchLyricsChain([a, b, c], 't', 'art');
    expect(cCalled).toBe(false);
  });

  it('devuelve null si ninguna fuente tiene letra', async () => {
    const a = fakeSource('a', null);
    const b = fakeSource('b', null);
    expect(await fetchLyricsChain([a, b], 't', 'art')).toBeNull();
  });

  it('ignora letra vacía (trim) y sigue a la siguiente', async () => {
    const a = fakeSource('a', { lyrics: '   \n  ', synced: false, source: 'a' });
    const b = fakeSource('b', { lyrics: 'real', synced: false, source: 'b' });
    const r = await fetchLyricsChain([a, b], 't', 'art');
    expect(r?.source).toBe('b');
  });

  it('una fuente que lanza no rompe la cadena (sigue a la siguiente)', async () => {
    const a = throwingSource('a', new Error('red caída'));
    const b = fakeSource('b', { lyrics: 'letra B', synced: false, source: 'b' });
    const r = await fetchLyricsChain([a, b], 't', 'art');
    expect(r?.source).toBe('b');
  });
});

describe('chainResultToTimedLyrics', () => {
  it('synced → parseLrc (con timestamps por línea)', () => {
    const r: LyricSourceResult = {
      lyrics: '[00:01.00]Line one\n[00:03.00]Line two',
      synced: true,
      source: 'lrclib',
    };
    const timed = chainResultToTimedLyrics(r);
    expect(timed?.synced).toBe(true);
    expect(timed?.source).toBe('lrclib');
    expect(timed?.lines.map((l) => l.start_ms)).toEqual([1000, 3000]);
  });

  it('plain → reparte por duración', () => {
    const r: LyricSourceResult = {
      lyrics: 'A\nB\nC',
      synced: false,
      source: 'audd',
    };
    const timed = chainResultToTimedLyrics(r, 30_000);
    expect(timed?.synced).toBe(false);
    expect(timed?.source).toBe('audd');
    // 3 líneas, 30s → (n-1)=2 intervalos → 0, 15000, 30000
    expect(timed?.lines.map((l) => l.start_ms)).toEqual([0, 15_000, 30_000]);
  });

  it('plain sin duración → 5s/línea fijo', () => {
    const r: LyricSourceResult = { lyrics: 'A\nB', synced: false, source: 'genius' };
    const timed = chainResultToTimedLyrics(r);
    expect(timed?.lines.map((l) => l.start_ms)).toEqual([0, 5_000]);
  });

  it('usa durationMs de la fuente si no se pasa fallback', () => {
    const r: LyricSourceResult = {
      lyrics: 'A\nB',
      synced: false,
      source: 'lrclib',
      durationMs: 20_000,
    };
    const timed = chainResultToTimedLyrics(r); // sin fallback → usa 20s de la fuente
    expect(timed?.lines.map((l) => l.start_ms)).toEqual([0, 20_000]);
  });

  it('synced sin timestamps válidos → null', () => {
    const r: LyricSourceResult = { lyrics: 'no timestamps here', synced: true, source: 'lrclib' };
    expect(chainResultToTimedLyrics(r)).toBeNull();
  });
});

describe('pickLrclibResult', () => {
  it('prefiere synced sobre plain', () => {
    const r = pickLrclibResult([
      { syncedLyrics: '[00:01.00]synced', plainLyrics: 'plain', duration: 60 },
    ]);
    expect(r?.synced).toBe(true);
    expect(r?.lyrics).toBe('[00:01.00]synced');
    expect(r?.durationMs).toBe(60_000);
  });

  it('cae a plain si no hay synced', () => {
    const r = pickLrclibResult([{ plainLyrics: 'plain text', duration: 120 }]);
    expect(r?.synced).toBe(false);
    expect(r?.lyrics).toBe('plain text');
    expect(r?.durationMs).toBe(120_000);
  });

  it('ignora instrumentales', () => {
    expect(pickLrclibResult([{ instrumental: true, syncedLyrics: 'x' }])).toBeNull();
  });

  it('null si nada válido', () => {
    expect(pickLrclibResult([{ instrumental: false }])).toBeNull();
    expect(pickLrclibResult([])).toBeNull();
  });
});

describe('parseAuddFindLyricsResponse', () => {
  it('devuelve el primer match con letra, saneado', () => {
    const raw = JSON.stringify({
      status: 'success',
      result: [
        { title: 'T', artist: 'A', lyrics: '[Verse 1]\nReal lyric\n[Chorus]\nMore' },
        { title: 'T2', artist: 'B', lyrics: 'other' },
      ],
    });
    expect(parseAuddFindLyricsResponse(raw)).toBe('Real lyric\nMore');
  });

  it('salta matches con letra vacía', () => {
    const raw = JSON.stringify({
      status: 'success',
      result: [{ lyrics: '   ' }, { lyrics: 'real' }],
    });
    expect(parseAuddFindLyricsResponse(raw)).toBe('real');
  });

  it('null si status error', () => {
    expect(parseAuddFindLyricsResponse(JSON.stringify({ status: 'error' }))).toBeNull();
  });

  it('null si sin result', () => {
    expect(parseAuddFindLyricsResponse(JSON.stringify({ status: 'success', result: [] }))).toBeNull();
  });

  it('null si JSON inválido', () => {
    expect(parseAuddFindLyricsResponse('not json')).toBeNull();
  });
});

describe('parseOvhResponse', () => {
  it('devuelve letra saneada', () => {
    const raw = JSON.stringify({ lyrics: '[Verse 1]\nHello\n[Chorus]\nWorld' });
    expect(parseOvhResponse(raw)).toBe('Hello\nWorld');
  });

  it('null si lyrics vacío', () => {
    expect(parseOvhResponse(JSON.stringify({ lyrics: '   ' }))).toBeNull();
  });

  it('null si JSON inválido o sin lyrics', () => {
    expect(parseOvhResponse('bad')).toBeNull();
    expect(parseOvhResponse(JSON.stringify({}))).toBeNull();
  });
});

describe('extractGeniusLyrics', () => {
  it('extrae del contenedor data-lyrics-container, <br> → newline', () => {
    const html =
      '<div data-lyrics-container="true">Line one<br>Line two<br/>Line three</div>';
    expect(extractGeniusLyrics(html)).toBe('Line one\nLine two\nLine three');
  });

  it('concatena múltiples contenedores', () => {
    const html =
      '<div data-lyrics-container="true">A<br>B</div><div data-lyrics-container="true">C</div>';
    expect(extractGeniusLyrics(html)).toBe('A\nB\nC');
  });

  it('cae al contenedor class="lyrics" si no hay data-lyrics-container', () => {
    const html = '<div class="lyrics">Legacy<br>lyric</div>';
    expect(extractGeniusLyrics(html)).toBe('Legacy\nlyric');
  });

  it('quita tags internos (<a>, <i>) y decodifica entidades', () => {
    const html =
      '<div data-lyrics-container="true">It&#39;s <a href="#">link</a> <i>ital</i> end</div>';
    expect(extractGeniusLyrics(html)).toBe("It's link ital end");
  });

  it('null si no encuentra contenedor', () => {
    expect(extractGeniusLyrics('<html><body>no lyrics here</body></html>')).toBeNull();
  });

  it('quita headers de sección que añade Genius', () => {
    const html =
      '<div data-lyrics-container="true">[Verse 1]\nReal\n[Embed]\n[Outro]</div>';
    expect(extractGeniusLyrics(html)).toBe('Real');
  });
});

describe('parseGeniusSearchResponse', () => {
  it('devuelve la url de la primera hit válida', () => {
    const raw = JSON.stringify({
      response: {
        hits: [
          { result: { url: 'https://genius.com/A-x-lyrics', title: 'X' } },
          { result: { url: 'https://genius.com/B-y-lyrics', title: 'Y' } },
        ],
      },
    });
    expect(parseGeniusSearchResponse(raw)).toBe('https://genius.com/A-x-lyrics');
  });

  it('salta hits sin url y toma la siguiente', () => {
    const raw = JSON.stringify({
      response: { hits: [{ result: { title: 'no url' } }, { result: { url: 'https://ok' } }] },
    });
    expect(parseGeniusSearchResponse(raw)).toBe('https://ok');
  });

  it('null si sin hits', () => {
    expect(parseGeniusSearchResponse(JSON.stringify({ response: { hits: [] } }))).toBeNull();
  });

  it('null si JSON inválido', () => {
    expect(parseGeniusSearchResponse('bad')).toBeNull();
  });
});