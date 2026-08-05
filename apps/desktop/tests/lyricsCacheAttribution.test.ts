// Atribución de fuente en la caché: de dónde salió cada letra y cuándo.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileLyricsCache } from '../electron/services/cache/lyricsCache';
import { classifyLyricsSource, LYRICS_SOURCE_PRIORITY } from '../electron/services/lyrics/types';
import type { CacheMeta } from '../electron/services/lyrics/types';
import type { TimedLyrics } from '../src/types';

const lyricsFrom = (source: string): TimedLyrics => ({
  lines: [{ start_ms: 0, text: 'hola' }],
  source,
  synced: true,
});
const meta = (title: string): CacheMeta => ({ title, artist: 'A', album: null, durationMs: 1000 });

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrattr-'));
});
afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('classifyLyricsSource', () => {
  it('normaliza los nombres crudos de los proveedores', () => {
    expect(classifyLyricsSource('lrclib')).toBe('lrclib');
    expect(classifyLyricsSource('musixmatch')).toBe('musixmatch');
    expect(classifyLyricsSource('letras.mus.br')).toBe('letras');
    expect(classifyLyricsSource('netease')).toBe('netease');
    expect(classifyLyricsSource('import-local')).toBe('import');
    expect(classifyLyricsSource('youtube-captions')).toBe('captions');
    expect(classifyLyricsSource('proveedor-nuevo')).toBe('unknown');
    expect(classifyLyricsSource('')).toBe('none');
    expect(classifyLyricsSource(null)).toBe('none');
  });

  it('lo importado por el usuario tiene la prioridad más alta', () => {
    expect(LYRICS_SOURCE_PRIORITY.import).toBeLessThan(LYRICS_SOURCE_PRIORITY.lrclib);
    expect(LYRICS_SOURCE_PRIORITY.lrclib).toBeLessThan(LYRICS_SOURCE_PRIORITY.musixmatch);
  });
});

describe('FileLyricsCache — atribución', () => {
  it('describeEntry expone fuente, prioridad y antigüedad', async () => {
    const c = new FileLyricsCache(dir);
    await c.put('k1', lyricsFrom('lrclib'), meta('K1'));

    const info = c.describeEntry('k1');
    expect(info).not.toBeNull();
    expect(info!.source).toBe('lrclib');
    expect(info!.sourceKind).toBe('lrclib');
    expect(info!.sourcePriority).toBe(LYRICS_SOURCE_PRIORITY.lrclib);
    expect(info!.synced).toBe(true);
    expect(info!.negative).toBe(false);
    expect(info!.cachedAt).toBeGreaterThan(0);
    expect(info!.vintageMs).toBeGreaterThanOrEqual(0);
    c.flush();
  });

  it('cachedAt es la fecha de ESCRITURA, no la de la última escucha', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const c = new FileLyricsCache(dir);
    await c.put('k1', lyricsFrom('lrclib'), meta('K1'));

    vi.setSystemTime(1_000_000 + 60_000);
    await c.get('k1'); // re-escucha: sube lastHeardAt, no cachedAt

    const info = c.describeEntry('k1')!;
    expect(info.cachedAt).toBe(1_000_000);
    expect(info.lastHeardAt).toBe(1_060_000);
    expect(info.vintageMs).toBe(60_000);
    c.flush();
  });

  it('la entrada negativa queda marcada como "none"', async () => {
    const c = new FileLyricsCache(dir);
    await c.markNotFound('k2', meta('K2'));
    const info = c.describeEntry('k2')!;
    expect(info.sourceKind).toBe('none');
    expect(info.negative).toBe(true);
  });

  it('describeEntry devuelve null para una pista desconocida', () => {
    expect(new FileLyricsCache(dir).describeEntry('nada')).toBeNull();
  });

  it('invalidateBySource tira SOLO lo de esa fuente', async () => {
    const c = new FileLyricsCache(dir);
    await c.put('a', lyricsFrom('lrclib'), meta('A'));
    await c.put('b', lyricsFrom('musixmatch'), meta('B'));
    await c.put('c', lyricsFrom('lrclib'), meta('C'));

    expect(c.invalidateBySource('lrclib')).toBe(2);
    expect(await c.get('a')).toBeNull();
    expect(await c.get('c')).toBeNull();
    expect((await c.get('b'))?.lines[0].text).toBe('hola');
    c.flush();
  });

  it('un reintento automático NO borra lo que el usuario importó', async () => {
    const c = new FileLyricsCache(dir);
    await c.put('imp', lyricsFrom('import-local'), meta('IMP'));

    await c.clearEntry('imp'); // reintento automático
    expect((await c.get('imp'))?.lines[0].text).toBe('hola');

    await c.clearEntry('imp', { force: true }); // acción explícita del usuario
    expect(await c.get('imp')).toBeNull();
    c.flush();
  });

  it('las entradas de proveedor sí se borran con clearEntry normal', async () => {
    const c = new FileLyricsCache(dir);
    await c.put('k', lyricsFrom('lrclib'), meta('K'));
    await c.clearEntry('k');
    expect(await c.get('k')).toBeNull();
    c.flush();
  });

  it('rellena la atribución de índices viejos sin tirar la caché', async () => {
    // Índice escrito por una versión anterior: sin sourceKind ni cachedAt.
    const legacy = {
      schemaVersion: 4,
      entries: {
        vieja: {
          key: 'vieja',
          title: 'T',
          artist: 'A',
          album: null,
          durationMs: null,
          source: 'musixmatch',
          synced: true,
          hasFurigana: false,
          hasRomaji: false,
          hasKana: false,
          lyricsFile: 'lyrics/aa/deadbeef.json.gz',
          bytes: 10,
          firstHeardAt: 500,
          lastHeardAt: 900,
          playCount: 2,
        },
      },
    };
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(legacy), 'utf8');

    const info = new FileLyricsCache(dir).describeEntry('vieja')!;
    expect(info.sourceKind).toBe('musixmatch');
    expect(info.cachedAt).toBe(500); // mejor aproximación: primera escucha
  });
});
