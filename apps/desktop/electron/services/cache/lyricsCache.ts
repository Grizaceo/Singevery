// ============================================================================
// FileLyricsCache — caché local de letras en disco (Feature 2).
//
// Filosofía (coherente con settings.ts: fs sobre userData, sin deps nativas):
//   - Índice JSON legible (index.json): metadata caliente, una entrada por pista.
//   - Payloads gzip por canción (lyrics/<shard>/<hash>.json.gz): el TimedLyrics
//     ya normalizado y romanizado. gzip → ~5-10x menos espacio.
//   - Clave = normalizeTrackKey(artist,title); nombre de archivo = sha1(clave).
//
// Aprovecha las re-escuchas: cada hit sube playCount y lastHeardAt; la eviction
// puntúa por recencia + frecuencia, así las canciones favoritas sobreviven.
// Caché negativa con TTL evita re-pegarle a la red a instrumentales/sin letra.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import type { CacheMeta, CachedLyricsInfo, LyricsCache, LyricsSourceKind } from '../lyrics/types';
import { LYRICS_SOURCE_PRIORITY, classifyLyricsSource } from '../lyrics/types';
import type { TimedLyrics } from '../../../src/types';
import { ANNOTATIONS_VERSION } from '../romanize';

// v4: parseLrc conserva solo el primer bloque cuando el LRC trae varias
// letras concatenadas (original + romaji); invalida entradas intercaladas.
const SCHEMA_VERSION = 4;
const INDEX_FILE = 'index.json';
const PAYLOAD_DIR = 'lyrics';

export interface CacheEntry {
  key: string;
  title: string;
  artist: string;
  album?: string | null;
  durationMs?: number | null;
  /** `source` crudo declarado por el proveedor ("lrclib", "import-local", ...). */
  source: string;
  /**
   * Familia normalizada de la fuente. Permite invalidar selectivamente cuando
   * un proveedor se degrada, y proteger lo que el usuario cargó a mano.
   * Las entradas escritas antes de este campo se clasifican al cargar.
   */
  sourceKind?: LyricsSourceKind;
  synced: boolean;
  hasFurigana: boolean;
  hasRomaji: boolean;
  hasKana: boolean;
  annotationsVersion?: number;
  translationLang?: string;
  lyricsFile: string; // ruta relativa sharded, '' si es entrada negativa
  bytes: number; // tamaño del payload gzip (para el cap por espacio)
  firstHeardAt: number;
  lastHeardAt: number;
  /**
   * Cuándo se ESCRIBIÓ esta letra (≠ lastHeardAt, que sube en cada escucha).
   * Es la antigüedad real del dato: sin ella no se puede saber si un match malo
   * viene de una letra vieja o de una recién traída.
   */
  cachedAt?: number;
  playCount: number;
  /** Caché negativa: se sabe que no hay letra hasta `at + ttlMs`. */
  notFound?: { at: number; ttlMs: number; sourceHash?: string };
}

interface CacheIndexShape {
  schemaVersion: number;
  entries: Record<string, CacheEntry>;
}

export interface CacheOptions {
  maxEntries: number;
  maxBytes: number;
  /** TTL de la caché negativa (ms). */
  negativeTtlMs: number;
  /** Peso de cada reproducción en el score de eviction (ms equivalentes). */
  playWeightMs: number;
  /** Debounce de la escritura del índice en get() (ms). 0 = escritura inmediata. */
  persistDebounceMs: number;
}

export const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  maxEntries: 1000,
  maxBytes: 100 * 1024 * 1024, // 100 MB
  negativeTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 días
  playWeightMs: 3 * 24 * 60 * 60 * 1000, // cada play "vale" 3 días de recencia
  persistDebounceMs: 1000, // el boost de re-escucha no reescribe el índice en cada play
};

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

function hasFuriganaIn(lyrics: TimedLyrics): boolean {
  return lyrics.lines.some((l) => l.furigana != null && l.furigana.length > 0);
}
function hasRomajiIn(lyrics: TimedLyrics): boolean {
  return lyrics.lines.some((l) => l.romaji != null && l.romaji !== '');
}
function hasKanaIn(lyrics: TimedLyrics): boolean {
  return lyrics.lines.some((l) => l.kana != null && l.kana !== '');
}

export class FileLyricsCache implements LyricsCache {
  private readonly baseDir: string;
  private readonly opts: CacheOptions;
  private index: CacheIndexShape = { schemaVersion: SCHEMA_VERSION, entries: {} };
  /** Timer del persist diferido (boost de get); null si no hay pendiente. */
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(baseDir: string, opts: Partial<CacheOptions> = {}) {
    this.baseDir = baseDir;
    this.opts = { ...DEFAULT_CACHE_OPTIONS, ...opts };
    this.load();
  }

  private indexPath(): string {
    return path.join(this.baseDir, INDEX_FILE);
  }

  private payloadPath(file: string): string {
    return path.join(this.baseDir, file);
  }

  private load(): void {
    try {
      fs.mkdirSync(this.baseDir, { recursive: true });
      const raw = fs.readFileSync(this.indexPath(), 'utf8');
      const parsed = JSON.parse(raw) as CacheIndexShape;
      if (
        parsed &&
        parsed.schemaVersion === SCHEMA_VERSION &&
        parsed.entries &&
        typeof parsed.entries === 'object'
      ) {
        this.index = { schemaVersion: parsed.schemaVersion ?? SCHEMA_VERSION, entries: parsed.entries };
      } else {
        this.index = { schemaVersion: SCHEMA_VERSION, entries: {} };
      }
    } catch {
      // Sin índice (primer arranque) o corrupto → empezamos limpio.
      this.index = { schemaVersion: SCHEMA_VERSION, entries: {} };
    }
    this.backfillAttribution();
    this.dropExpiredNegatives();
  }

  /**
   * Rellena `sourceKind`/`cachedAt` en entradas guardadas antes de que
   * existieran. Se prefiere esto a subir SCHEMA_VERSION: tirar la caché entera
   * para estrenar la atribución de fuente sería justo lo contrario de lo que
   * la atribución sirve (invalidar SOLO lo dudoso).
   */
  private backfillAttribution(): void {
    let changed = false;
    for (const entry of Object.values(this.index.entries)) {
      if (entry.sourceKind == null) {
        entry.sourceKind = classifyLyricsSource(entry.source);
        changed = true;
      }
      if (entry.cachedAt == null) {
        // La mejor aproximación disponible: cuándo se oyó por primera vez.
        entry.cachedAt = entry.firstHeardAt ?? entry.lastHeardAt ?? Date.now();
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  /** Escritura atómica del índice (tmp + rename) para no corromper.
   *  Cancela cualquier persist diferido pendiente (coalesce): el estado en
   *  memoria ya incluye esos cambios, así que la escritura inmediata los cubre. */
  private persist(): void {
    if (this.persistTimer != null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    try {
      fs.mkdirSync(this.baseDir, { recursive: true });
      const tmp = this.indexPath() + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.index, null, 2), 'utf8');
      fs.renameSync(tmp, this.indexPath());
    } catch (err) {
      console.error('[cache] no se pudo guardar el índice:', err);
    }
  }

  /** Persistencia diferida para el boost de re-escucha en get(): evita
   *  reescribir el índice completo en cada playCount++. Si persistDebounceMs es
   *  0, escribe igual que persist() (compat). */
  private schedulePersist(): void {
    if (this.opts.persistDebounceMs <= 0) {
      this.persist();
      return;
    }
    if (this.persistTimer != null) return; // ya hay una escritura pendiente
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, this.opts.persistDebounceMs);
  }

  /** Fuerza la escritura diferida pendiente (graceful shutdown / tests). */
  flush(): void {
    if (this.persistTimer != null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      this.persist();
    }
  }

  private dropExpiredNegatives(): void {
    const now = Date.now();
    let changed = false;
    for (const [key, e] of Object.entries(this.index.entries)) {
      if (e.notFound && !e.lyricsFile && now - e.notFound.at >= e.notFound.ttlMs) {
        delete this.index.entries[key];
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  async get(key: string): Promise<TimedLyrics | null> {
    const entry = this.index.entries[key];
    if (!entry || !entry.lyricsFile) return null;
    try {
      const gz = fs.readFileSync(this.payloadPath(entry.lyricsFile));
      const lyrics = JSON.parse(gunzipSync(gz).toString('utf8')) as TimedLyrics;
      // Boost de re-escucha: sube frecuencia y recencia. La escritura del
      // índice se debouncea — el estado en memoria es el que importa para
      // score/prune; el disco se actualiza una vez por ventana.
      entry.lastHeardAt = Date.now();
      entry.playCount += 1;
      this.schedulePersist();
      return lyrics;
    } catch {
      // Payload perdido/corrupto → limpiar la entrada y tratar como miss.
      delete this.index.entries[key];
      this.persist();
      return null;
    }
  }

  isNegative(key: string, sourceHash?: string): boolean {
    const e = this.index.entries[key];
    if (!e || !e.notFound || e.lyricsFile) return false;
    if (sourceHash && e.notFound.sourceHash && e.notFound.sourceHash !== sourceHash) return false;
    if (sourceHash && !e.notFound.sourceHash) return false;
    return Date.now() - e.notFound.at < e.notFound.ttlMs;
  }

  async markNotFound(key: string, meta?: CacheMeta, sourceHash?: string): Promise<void> {
    const now = Date.now();
    const existing = this.index.entries[key];
    this.index.entries[key] = {
      key,
      title: meta?.title ?? existing?.title ?? '',
      artist: meta?.artist ?? existing?.artist ?? '',
      album: meta?.album ?? existing?.album ?? null,
      durationMs: meta?.durationMs ?? existing?.durationMs ?? null,
      source: 'none',
      sourceKind: 'none',
      synced: false,
      hasFurigana: false,
      hasRomaji: false,
      hasKana: false,
      annotationsVersion: 0,
      lyricsFile: '',
      bytes: 0,
      firstHeardAt: existing?.firstHeardAt ?? now,
      lastHeardAt: now,
      cachedAt: now,
      playCount: existing?.playCount ?? 0,
      notFound: { at: now, ttlMs: this.opts.negativeTtlMs, sourceHash },
    };
    this.persist();
  }

  async put(key: string, lyrics: TimedLyrics, meta: CacheMeta): Promise<void> {
    const now = Date.now();
    const hash = sha1(key);
    const shard = hash.slice(0, 2);
    const rel = path.join(PAYLOAD_DIR, shard, `${hash}.json.gz`);
    const abs = this.payloadPath(rel);

    let bytes = 0;
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const gz = gzipSync(Buffer.from(JSON.stringify(lyrics), 'utf8'));
      bytes = gz.length;
      const tmp = abs + '.tmp';
      fs.writeFileSync(tmp, gz);
      fs.renameSync(tmp, abs);
    } catch (err) {
      console.error('[cache] no se pudo guardar el payload:', err);
      return;
    }

    const existing = this.index.entries[key];
    this.index.entries[key] = {
      key,
      title: meta.title,
      artist: meta.artist,
      album: meta.album ?? null,
      durationMs: meta.durationMs ?? null,
      source: lyrics.source,
      sourceKind: classifyLyricsSource(lyrics.source),
      synced: lyrics.synced,
      hasFurigana: hasFuriganaIn(lyrics),
      hasRomaji: hasRomajiIn(lyrics),
      hasKana: hasKanaIn(lyrics),
      annotationsVersion: lyrics.annotationsVersion ?? ANNOTATIONS_VERSION,
      translationLang: lyrics.translationLang,
      lyricsFile: rel,
      bytes,
      firstHeardAt: existing?.firstHeardAt ?? now,
      lastHeardAt: now,
      cachedAt: now,
      playCount: existing?.playCount ?? 1,
      // notFound limpiado al pasar a positivo.
    };
    this.persist();
    this.prune();
  }

  /** Score de retención: mayor = más vale conservar. Premia recencia y plays. */
  private score(e: CacheEntry): number {
    return e.lastHeardAt + e.playCount * this.opts.playWeightMs;
  }

  /** Aplica los caps (entradas y bytes) expulsando primero el menor score. */
  prune(): void {
    const positives = Object.values(this.index.entries).filter((e) => e.lyricsFile);
    let totalBytes = positives.reduce((s, e) => s + e.bytes, 0);
    let count = positives.length;
    if (count <= this.opts.maxEntries && totalBytes <= this.opts.maxBytes) return;

    const byScoreAsc = positives.sort((a, b) => this.score(a) - this.score(b));
    let changed = false;
    for (const e of byScoreAsc) {
      if (count <= this.opts.maxEntries && totalBytes <= this.opts.maxBytes) break;
      try {
        fs.rmSync(this.payloadPath(e.lyricsFile), { force: true });
      } catch {
        /* noop */
      }
      delete this.index.entries[e.key];
      totalBytes -= e.bytes;
      count -= 1;
      changed = true;
    }
    if (changed) this.persist();
  }

  /** Estadísticas para un futuro panel de settings / IPC cache:stats. */
  stats(): { entries: number; negatives: number; bytes: number } {
    const all = Object.values(this.index.entries);
    const positives = all.filter((e) => e.lyricsFile);
    return {
      entries: positives.length,
      negatives: all.length - positives.length,
      bytes: positives.reduce((s, e) => s + e.bytes, 0),
    };
  }

  /** Borra todo (payloads + índice). Para cache:clear. */
  clear(): void {
    try {
      fs.rmSync(path.join(this.baseDir, PAYLOAD_DIR), { recursive: true, force: true });
    } catch {
      /* noop */
    }
    this.index = { schemaVersion: SCHEMA_VERSION, entries: {} };
    this.persist();
  }

  /**
   * Olvida una pista. Lo que el usuario importó a mano NO se borra por un
   * reintento automático: costó trabajo y no hay proveedor que lo reponga.
   * `force` (acción explícita del usuario) sí lo borra.
   */
  async clearEntry(key: string, options: { force?: boolean } = {}): Promise<void> {
    const entry = this.index.entries[key];
    if (!entry) return;
    if (!options.force && (entry.sourceKind ?? classifyLyricsSource(entry.source)) === 'import') {
      return;
    }
    if (entry.lyricsFile) {
      try {
        fs.rmSync(this.payloadPath(entry.lyricsFile), { force: true });
      } catch {
        /* noop */
      }
    }
    delete this.index.entries[key];
    this.persist();
  }

  /** Ficha de una entrada (sin la letra) para el endpoint de diagnóstico. */
  describeEntry(key: string): CachedLyricsInfo | null {
    const entry = this.index.entries[key];
    if (!entry) return null;
    const kind = entry.sourceKind ?? classifyLyricsSource(entry.source);
    const cachedAt = entry.cachedAt ?? entry.firstHeardAt;
    return {
      key: entry.key,
      title: entry.title,
      artist: entry.artist,
      source: entry.source,
      sourceKind: kind,
      sourcePriority: LYRICS_SOURCE_PRIORITY[kind],
      synced: entry.synced,
      cachedAt,
      vintageMs: Math.max(0, Date.now() - cachedAt),
      lastHeardAt: entry.lastHeardAt,
      playCount: entry.playCount,
      bytes: entry.bytes,
      negative: !entry.lyricsFile,
    };
  }

  /**
   * Invalida TODO lo que vino de una fuente. Es la razón de ser de la
   * atribución: cuando un proveedor empieza a devolver letras de otra canción,
   * se tira solo lo suyo en vez de vaciar la caché entera.
   * Nunca toca lo importado por el usuario (salvo que se pida 'import').
   */
  invalidateBySource(kind: LyricsSourceKind): number {
    let removed = 0;
    for (const [key, entry] of Object.entries(this.index.entries)) {
      const entryKind = entry.sourceKind ?? classifyLyricsSource(entry.source);
      if (entryKind !== kind) continue;
      if (entry.lyricsFile) {
        try {
          fs.rmSync(this.payloadPath(entry.lyricsFile), { force: true });
        } catch {
          /* noop */
        }
      }
      delete this.index.entries[key];
      removed += 1;
    }
    if (removed > 0) this.persist();
    return removed;
  }
}
