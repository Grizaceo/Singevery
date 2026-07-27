// ============================================================================
// LyricsService — orquestador de la capa de letras (Feature 1)
//
// Flujo "cache-first":
//   1. caché (Feature 2) → hit devuelve sin red ni romanización.
//   2. caché negativa → null (se sabe que no hay letra, evita re-pegar a la red).
//   3. single-flight: dedupe de requests concurrentes por pista (prefetch + carga).
//   4. cadena de proveedores → primer RawLyrics.
//   5. normalizar (parseLrc / plainTextToLyrics) → romanizar → guardar en caché.
// ============================================================================

import { createHash } from 'crypto';
import type { TimedLyrics } from '../../../src/types';
import type { LyricsCache, LyricsProvider, LyricsQuery, RawLyrics, CacheMeta } from './types';
import { NULL_LYRICS_CACHE } from './types';
import { providerChain } from './providers';
import { parseLrc, plainTextToLyrics } from '../lrcParser';
import { romanizeTimedLyrics, needsReannotation, stripReadings } from '../romanize';
import { normalizeTrackKey } from '../../core/syncTiming';
import { buildQueryVariants } from './normalizeQuery';
import { resolveMetadataHints } from './metadataHints';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LyricsLookupError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'LyricsLookupError';
  }
}

export interface LyricsServiceOptions {
  /** Timeout por INTENTO de lookup (un lookup puede encadenar varios requests). */
  requestTimeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  enableMetadataHints: boolean;
  /** Presupuesto total de la búsqueda (todas las fuentes y variantes). */
  totalBudgetMs: number;
}

const DEFAULT_OPTIONS: LyricsServiceOptions = {
  // 5s era muy justo: el lookup de LRCLIB puede encadenar /get + /search +
  // /search?q= y el de Musixmatch token + search + subtitle. Con 5s se
  // abortaba a mitad de camino y la canción terminaba en "ERROR".
  //
  // 8s tampoco alcanzaba para el PRIMER lookup en frío: el chain tibio de
  // LRCLIB tarda ~6s, pero el primer request (DNS + TLS + HTTP/2 sin abrir)
  // se pasaba de 8s y se abortaba -> la cancion quedaba en NO_LYRICS y solo el
  // re-intento del loop de correccion (ya con conexion tibia) la encontraba.
  // 12s le da margen al arranque en frio sin que un host realmente caido
  // queme mucho antes de caer al siguiente proveedor.
  requestTimeoutMs: 12000,
  retryCount: 1,
  retryDelayMs: 250,
  enableMetadataHints: true,
  totalBudgetMs: 25000,
};

/** Máximo de variantes de query a probar por proveedor. */
const MAX_VARIANTS = 4;

/**
 * Versión del pipeline de búsqueda. Se mezcla en el hash de la caché negativa:
 * al subirla, las entradas "no encontrada" viejas (cacheadas cuando los
 * proveedores estaban rotos) dejan de aplicar y se vuelve a buscar.
 * v3: fallback por duración cuando el gate de similitud descarta todo
 * (canciones con metadata en otro alfabeto volvieron a ser encontrables).
 * v4: letras.mus.br gana fallback por página del artista (slugs no estándar
 * y URLs numéricas); las "no encontrada" viejas deben re-buscarse.
 */
export const PROVIDER_SCOPE_VERSION = 4;

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export class LyricsService {
  private readonly cache: LyricsCache;
  private readonly providers: LyricsProvider[];
  private readonly opts: LyricsServiceOptions;
  private readonly providerScopeHash: string;
  /** Requests en vuelo por clave de pista (single-flight). */
  private readonly inflight = new Map<string, Promise<TimedLyrics | null>>();

  constructor(
    cache: LyricsCache = NULL_LYRICS_CACHE,
    providers: LyricsProvider[] = providerChain,
    opts: Partial<LyricsServiceOptions> = {},
  ) {
    this.cache = cache;
    this.providers = providers;
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    this.providerScopeHash = createHash('sha1')
      .update(`v${PROVIDER_SCOPE_VERSION}|${this.providers.map((provider) => provider.name).join('|')}`)
      .digest('hex');
  }

  async getLyrics(query: LyricsQuery): Promise<TimedLyrics | null> {
    const key = normalizeTrackKey(query.artist, query.title);

    const cached = await this.cache.get(key);
    if (cached) {
      if (needsReannotation(cached)) {
        const reannotated = await romanizeTimedLyrics(stripReadings(cached));
        await this.cache.put(key, reannotated, {
          title: query.title,
          artist: query.artist,
          album: query.album ?? null,
          durationMs: query.durationMs ?? null,
        });
        return reannotated;
      }
      return cached;
    }
    if (this.cache.isNegative(key, this.providerScopeHash)) return null;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = this.fetchAndStore(key, query).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private async lookupWithRetry(
    provider: LyricsProvider,
    query: LyricsQuery,
    deadline: number,
  ): Promise<RawLyrics | null> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.opts.retryCount; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        Math.min(this.opts.requestTimeoutMs, remainingMs),
      );
      try {
        return await provider.lookup(query, controller.signal);
      } catch (err) {
        lastError = err;
        // Un abort es NUESTRO timeout: reintentar duplicaría la espera.
        if (isAbortError(err) || controller.signal.aborted) break;
        if (attempt >= this.opts.retryCount) break;
        await sleep(this.opts.retryDelayMs * (attempt + 1));
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'presupuesto agotado'));
  }

  private async fetchAndStore(key: string, query: LyricsQuery): Promise<TimedLyrics | null> {
    const startedAt = Date.now();
    const deadline = startedAt + this.opts.totalBudgetMs;
    const hints = this.opts.enableMetadataHints
      ? await resolveMetadataHints(query).catch(() => ({ primary: query, alternates: [] }))
      : { primary: query, alternates: [] };
    const variants = buildQueryVariants(hints.primary, hints.alternates).slice(0, MAX_VARIANTS);
    let bestSynced: { raw: RawLyrics; query: LyricsQuery } | null = null;
    let bestPlain: { raw: RawLyrics; query: LyricsQuery } | null = null;
    let sawNotFound = false;
    let lastError: unknown = null;
    let budgetExhausted = false;

    outer: for (const provider of this.providers) {
      for (const variant of variants) {
        if (Date.now() >= deadline) {
          budgetExhausted = true;
          break outer;
        }
        const t0 = Date.now();
        let raw: RawLyrics | null = null;
        try {
          raw = await this.lookupWithRetry(provider, variant, deadline);
        } catch (err) {
          console.error(
            `[lyrics] ${provider.name} falló para "${variant.artist} - ${variant.title}" (${Date.now() - t0}ms):`,
            err instanceof Error ? err.message : err,
          );
          lastError = err;
          // Un timeout (abort) en una variante predice timeouts en las demás
          // (host colgado/red rota): saltar al siguiente proveedor en vez de
          // quemar el timeout completo por cada variante restante.
          if (isAbortError(err)) break;
          continue;
        }
        if (!raw) {
          sawNotFound = true;
          continue;
        }
        console.log(
          `[lyrics] ${provider.name} → ${raw.synced ? 'sincronizada' : 'plana'} para "${variant.artist} - ${variant.title}" (${Date.now() - t0}ms)`,
        );
        if (raw.synced) {
          bestSynced = { raw, query: variant };
          break;
        }
        if (!bestPlain) bestPlain = { raw, query: variant };
      }
      if (bestSynced) break;
    }

    const chosen = bestSynced ?? bestPlain;
    const fallbackChosen = bestSynced && bestPlain ? bestPlain : null;
    const base = chosen ? normalizeRaw(chosen.raw) : null;
    const normalized = base ?? (fallbackChosen ? normalizeRaw(fallbackChosen.raw) : null);
    if (!normalized) {
      // Solo es un ERROR real si TODAS las consultas fallaron. Si al menos una
      // fuente respondió "no existe", el resultado honesto es "sin letra"
      // (null) — antes cualquier proveedor caído (p. ej. Musixmatch con
      // captcha) convertía todo en ERROR aunque LRCLIB hubiera respondido bien.
      if (lastError && !sawNotFound) {
        throw new LyricsLookupError('No se pudo consultar ninguna fuente de letras.', lastError);
      }
      // Cachear "no encontrada" solo tras un barrido completo y limpio; con
      // errores o presupuesto agotado no se puede afirmar que no exista.
      if (sawNotFound && !lastError && !budgetExhausted) {
        await this.cache.markNotFound(
          key,
          {
            title: query.title,
            artist: query.artist,
            album: hints.primary.album ?? null,
            durationMs: hints.primary.durationMs ?? null,
          },
          this.providerScopeHash,
        );
      }
      console.log(
        `[lyrics] sin letra para "${query.artist} - ${query.title}" ` +
          `(notFound=${sawNotFound}, errores=${lastError != null}, agotado=${budgetExhausted}, ${Date.now() - startedAt}ms)`,
      );
      return null;
    }

    const effectiveChosen = base ? chosen : fallbackChosen;
    const lyrics = await romanizeTimedLyrics(normalized);
    await this.cache.put(key, lyrics, {
      title: query.title,
      artist: query.artist,
      album: effectiveChosen?.query.album ?? hints.primary.album ?? query.album ?? null,
      durationMs: effectiveChosen?.query.durationMs ?? hints.primary.durationMs ?? query.durationMs ?? null,
    });
    return lyrics;
  }

  /** Actualiza letras ya cacheadas (p. ej. tras traducir). */
  async updateCachedLyrics(key: string, lyrics: TimedLyrics, meta: CacheMeta): Promise<void> {
    await this.cache.put(key, lyrics, meta);
  }

  /** Olvida la entrada de caché de una pista (incluida la caché negativa),
   *  para que el próximo getLyrics vuelva a pegarle a la red (auto-reintento). */
  async forgetTrack(key: string): Promise<void> {
    await this.cache.clearEntry?.(key);
  }
}

/** Instancia por defecto (sin caché). Feature 2 reemplaza la caché al inicializar. */
export const defaultLyricsService = new LyricsService();
