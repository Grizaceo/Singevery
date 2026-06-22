// ============================================================================
// LyricsService — orquestador de la capa de letras (Feature 1).
//
// Flujo "cache-first":
//   1. caché (Feature 2) → hit devuelve sin red ni romanización.
//   2. caché negativa → null (se sabe que no hay letra, evita re-pegar a la red).
//   3. single-flight: dedupe de requests concurrentes por pista (prefetch + carga).
//   4. cadena de proveedores → primer RawLyrics.
//   5. normalizar (parseLrc / plainTextToLyrics) → romanizar → guardar en caché.
// ============================================================================

import type { TimedLyrics } from '../../../src/types';
import type { LyricsCache, LyricsProvider, LyricsQuery, RawLyrics } from './types';
import { NULL_LYRICS_CACHE } from './types';
import { providerChain } from './providers';
import { parseLrc, plainTextToLyrics } from '../lrcParser';
import { romanizeTimedLyrics } from '../romanize';
import { normalizeTrackKey } from '../../core/syncTiming';

function normalizeRaw(raw: RawLyrics): TimedLyrics | null {
  if (raw.synced && raw.lrc) {
    const lines = parseLrc(raw.lrc);
    if (lines.length === 0) return null;
    return { lines, source: raw.source, synced: true };
  }
  if (raw.plain) {
    const lines = plainTextToLyrics(raw.plain);
    if (lines.length === 0) return null;
    return { lines, source: raw.source, synced: false };
  }
  return null;
}

export class LyricsService {
  private readonly cache: LyricsCache;
  private readonly providers: LyricsProvider[];
  /** Requests en vuelo por clave de pista (single-flight). */
  private readonly inflight = new Map<string, Promise<TimedLyrics | null>>();

  constructor(cache: LyricsCache = NULL_LYRICS_CACHE, providers: LyricsProvider[] = providerChain) {
    this.cache = cache;
    this.providers = providers;
  }

  async getLyrics(query: LyricsQuery): Promise<TimedLyrics | null> {
    const key = normalizeTrackKey(query.artist, query.title);

    const cached = await this.cache.get(key);
    if (cached) return cached;
    if (this.cache.isNegative(key)) return null;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = this.fetchAndStore(key, query).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private async fetchAndStore(key: string, query: LyricsQuery): Promise<TimedLyrics | null> {
    let raw: RawLyrics | null = null;
    for (const provider of this.providers) {
      try {
        raw = await provider.lookup(query);
      } catch (err) {
        console.error(`[lyrics] proveedor ${provider.name} falló:`, err);
        raw = null;
      }
      if (raw) break;
    }

    const base = raw ? normalizeRaw(raw) : null;
    if (!base) {
      await this.cache.markNotFound(key);
      return null;
    }

    const lyrics = await romanizeTimedLyrics(base);
    await this.cache.put(key, lyrics, {
      title: query.title,
      artist: query.artist,
      album: query.album ?? null,
      durationMs: query.durationMs ?? null,
    });
    return lyrics;
  }
}

/** Instancia por defecto (sin caché). Feature 2 reemplaza la caché al inicializar. */
export const defaultLyricsService = new LyricsService();
