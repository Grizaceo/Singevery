import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileLyricsCache } from '../electron/services/cache/lyricsCache';
import type { CacheMeta } from '../electron/services/lyrics/types';
import type { TimedLyrics } from '../src/types';
import { ANNOTATIONS_VERSION } from '../electron/services/romanize';

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
    c.flush(); // evita timer diferido pendiente tras el test
  });

  it('persiste entre instancias (índice + payload gzip en disco)', async () => {
    const c1 = new FileLyricsCache(dir);
    await c1.put('k1', lyrics('persist'), meta('K1'));
    const c2 = new FileLyricsCache(dir); // nueva instancia, mismo dir
    const out = await c2.get('k1');
    expect(out?.lines[0].text).toBe('persist');
    expect(fs.existsSync(path.join(dir, 'index.json'))).toBe(true);
    c2.flush();
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

  it('persiste annotationsVersion en el índice', async () => {
    const c = new FileLyricsCache(dir);
    const annotated: TimedLyrics = {
      lines: [{ start_ms: 0, text: 'Привет', romaji: 'Privet' }],
      source: 'lrclib',
      synced: true,
      annotationsVersion: ANNOTATIONS_VERSION,
    };
    await c.put('k1', annotated, meta('K1'));
    const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
      entries: { k1: { annotationsVersion?: number } };
    };
    expect(idx.entries.k1.annotationsVersion).toBe(ANNOTATIONS_VERSION);
    c.flush();
  });

  it('clear vacía todo', async () => {
    const c = new FileLyricsCache(dir);
    await c.put('k1', lyrics('x'), meta('K1'));
    c.clear();
    expect(c.stats().entries).toBe(0);
    expect(await c.get('k1')).toBeNull();
  });

  it('debouncea persist en get() (no reescribe el índice en cada play)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const c = new FileLyricsCache(dir, { persistDebounceMs: 1000 });
    await c.put('k1', lyrics('hola'), meta('K1')); // playCount=1, persist inmediato
    const idx = () =>
      JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
        entries: { k1: { playCount: number } };
      };

    // Tres re-escuchas rápidas sin avanzar el reloj: solo un persist diferido.
    await c.get('k1');
    await c.get('k1');
    await c.get('k1');
    expect(idx().entries.k1.playCount).toBe(1); // disco aún sin el boost
    expect(c.stats().entries).toBe(1);

    // Al expirar el debounce, una sola escritura deja el playCount final.
    vi.advanceTimersByTime(1000);
    expect(idx().entries.k1.playCount).toBe(4);
    c.flush(); // no-op (ya persistió), deja el timer limpio
  });

  it('persist() inmediato coalesce con el debounce pendiente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const c = new FileLyricsCache(dir, { persistDebounceMs: 1000 });
    await c.put('k1', lyrics('a'), meta('K1')); // playCount=1
    await c.get('k1'); // programado para t=1000
    // Un put posterior (escritura inmediata) cancela el debounce pendiente.
    await c.put('k2', lyrics('b'), meta('K2'));
    vi.advanceTimersByTime(1000); // no debe doble-escribir ni revivir el timer
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
      entries: Record<string, { playCount: number }>;
    };
    expect(onDisk.entries.k1.playCount).toBe(2); // el boost del get quedó persistido por el put
    expect(onDisk.entries.k2).toBeDefined();
    c.flush();
  });
});
