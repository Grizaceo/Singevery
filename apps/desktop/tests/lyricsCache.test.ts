import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileLyricsCache } from '../electron/services/cache/lyricsCache';
import type { CacheMeta } from '../electron/services/lyrics/types';
import type { TimedLyrics } from '../src/types';

const lyrics = (text: string): TimedLyrics => ({
  lines: [{ start_ms: 0, text }],
  source: 'lrclib',
  synced: true,
});
const meta = (title: string): CacheMeta => ({ title, artist: 'A', album: null, durationMs: 1000 });

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrcache-'));
});
afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('FileLyricsCache', () => {
  it('put + get devuelve la letra y sube playCount', async () => {
    const c = new FileLyricsCache(dir);
    await c.put('k1', lyrics('hola'), meta('K1'));
    const a = await c.get('k1');
    expect(a?.lines[0].text).toBe('hola');
    await c.get('k1');
    expect(c.stats().entries).toBe(1);
  });

  it('persiste entre instancias (índice + payload gzip en disco)', async () => {
    const c1 = new FileLyricsCache(dir);
    await c1.put('k1', lyrics('persist'), meta('K1'));
    const c2 = new FileLyricsCache(dir); // nueva instancia, mismo dir
    const out = await c2.get('k1');
    expect(out?.lines[0].text).toBe('persist');
    expect(fs.existsSync(path.join(dir, 'index.json'))).toBe(true);
  });

  it('markNotFound → isNegative y get null', async () => {
    const c = new FileLyricsCache(dir, { negativeTtlMs: 10_000 });
    await c.markNotFound('nope');
    expect(c.isNegative('nope')).toBe(true);
    expect(await c.get('nope')).toBeNull();
  });

  it('la caché negativa expira con el TTL', async () => {
    const c = new FileLyricsCache(dir, { negativeTtlMs: 0 });
    await c.markNotFound('nope');
    expect(c.isNegative('nope')).toBe(false);
  });

  it('prune respeta favoritos (mayor playCount/recencia)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const c = new FileLyricsCache(dir, { maxEntries: 2, playWeightMs: 100_000 });
    await c.put('a', lyrics('A'), meta('A'));
    vi.setSystemTime(2000);
    await c.put('b', lyrics('B'), meta('B'));
    vi.setSystemTime(3000);
    await c.get('a'); // 'a' se vuelve favorita
    vi.setSystemTime(4000);
    await c.put('c', lyrics('C'), meta('C')); // dispara prune → quedan 2

    expect(c.stats().entries).toBe(2);
    expect(await c.get('b')).toBeNull(); // 'b' (menor score) fue expulsada
    expect((await c.get('a'))?.lines[0].text).toBe('A');
    expect((await c.get('c'))?.lines[0].text).toBe('C');
  });

  it('clear vacía todo', async () => {
    const c = new FileLyricsCache(dir);
    await c.put('k1', lyrics('x'), meta('K1'));
    c.clear();
    expect(c.stats().entries).toBe(0);
    expect(await c.get('k1')).toBeNull();
  });
});
