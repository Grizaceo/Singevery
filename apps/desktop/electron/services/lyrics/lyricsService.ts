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
import type {
  CachedLyricsInfo,
  LyricsCache,
  LyricsProvider,
  LyricsQuery,
  LyricsSourceKind,
  RawLyrics,
  CacheMeta,
} from './types';
import { NULL_LYRICS_CACHE, classifyLyricsSource } from './types';
import { providerChain } from './providers';
import { parseLrc, plainTextToLyrics, spreadPlainLyrics } from '../lrcParser';
import { romanizeTimedLyrics, needsReannotation, stripReadings } from '../romanize';
import { normalizeTrackKey } from '../../core/syncTiming';
import { buildQueryVariants } from './normalizeQuery';
import { resolveMetadataHints } from './metadataHints';
import { vetoLyricsByLanguage, dominantScript, isInExpectedScript } from './artistLanguage';

/** Texto crudo de una letra, sea LRC o plana, para analizar su escritura. */
function rawLyricsText(raw: RawLyrics): string {
  if (raw.lrc) {
    // Fuera los timestamps: "[00:12.34]" no aporta nada al análisis de escritura.
    return raw.lrc.replace(/\[[^\]]*\]/g, ' ');
  }
  return raw.plain ?? '';
}

/** Duración mínima de la pista para repartir una plana sobre su duración real. */
const PLAIN_SPREAD_MIN_DURATION_MS = 30_000;

function normalizeRaw(raw: RawLyrics, durationMs?: number | null): TimedLyrics | null {
  if (raw.synced && raw.lrc) {
    const lines = parseLrc(raw.lrc);
    if (lines.length === 0) return null;
    return { lines, source: raw.source, synced: true };
  }
  if (raw.plain) {
    // Con duración conocida la plana se reparte uniforme sobre la pista; sin
    // ella se mantiene el espaciado fijo de 5 s (no hay con qué calibrar).
    const lines =
      durationMs != null && durationMs >= PLAIN_SPREAD_MIN_DURATION_MS
        ? spreadPlainLyrics(raw.plain, durationMs)
        : plainTextToLyrics(raw.plain);
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
 * Cada cuánto se re-verifica en la red una letra PLANA cacheada que vino de un
 * proveedor. Una plana puede ser solo la versión sin LRC de una canción que
 * sí tiene sincronizada en otra entrada/endpoint (caso real en LRCLIB); sin
 * re-verificación la cacheada quedaría plana para siempre.
 */
export const PLAIN_RECHECK_MS = 24 * 60 * 60 * 1000;

/**
 * Presupuesto de la re-verificación de una plana cacheada. Es menor que el de
 * una búsqueda normal: aquí YA hay una letra que mostrar, así que no se hace
 * esperar al usuario más de unos segundos por una posible mejora.
 */
export const PLAIN_RECHECK_BUDGET_MS = 6_000;

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
      // Una PLANA cacheada de proveedor no queda fija para siempre: puede ser
      // la versión sin LRC de una canción que sí tiene sincronizada en otra
      // entrada. Se re-verifica cada PLAIN_RECHECK_MS; lo importado a mano no
      // se re-busca. Las caches sin soporte de marcas (NULL, dobles de test
      // antiguos) se comportan como antes: hit y devolver.
      // Igual con una letra que NO está en la escritura de un artista conocido
      // (caso real: YOASOBI "Idol" cacheada en inglés y Mrs. GREEN APPLE
      // "Inferno" en romaji, aunque LRCLIB tiene la versión japonesa): la
      // búsqueda de hoy ya prefiere la nativa, pero la caché la tapaba.
      const scriptMismatch =
        isInExpectedScript(query.artist, cached.lines.map((l) => l.text).join('\n')) === false;
      if (
        (!cached.synced || scriptMismatch) &&
        classifyLyricsSource(cached.source) !== 'import' &&
        this.cache.plainRecheckedAt != null &&
        this.cache.markPlainRechecked != null
      ) {
        const recheckedAt = this.cache.plainRecheckedAt(key);
        if (recheckedAt == null || Date.now() - recheckedAt >= PLAIN_RECHECK_MS) {
          const existingRecheck = this.inflight.get(key);
          if (existingRecheck) return existingRecheck;
          const promise = this.recheckPlain(key, query, cached, scriptMismatch).finally(() =>
            this.inflight.delete(key),
          );
          this.inflight.set(key, promise);
          return promise;
        }
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

  /**
   * Re-verificación de una plana cacheada: repite el barrido normal y, solo si
   * ahora devuelve una SINCRONIZADA, la usa (fetchAndStore ya la guardó). En
   * cualquier otro caso —plana nueva, "no existe" o error de red— se conserva
   * la cacheada y se estampa la marca para no reintentar en cada escucha.
   */
  private async recheckPlain(
    key: string,
    query: LyricsQuery,
    cached: TimedLyrics,
    scriptMismatch = false,
  ): Promise<TimedLyrics> {
    let fresh: TimedLyrics | null = null;
    try {
      fresh = await this.fetchAndStore(key, query, Math.min(this.opts.totalBudgetMs, PLAIN_RECHECK_BUDGET_MS));
    } catch {
      fresh = null; // error de red: la cacheada sigue siendo lo mejor
    }
    if (scriptMismatch) {
      // Solo se cambia si ahora sí está en la escritura del artista y no se
      // pierde sincronía; si no, se restaura la cacheada (fetchAndStore ya la
      // había pisado) para no empeorar lo que había.
      const nativeNow =
        fresh != null &&
        isInExpectedScript(query.artist, fresh.lines.map((l) => l.text).join('\n')) === true &&
        (fresh.synced || !cached.synced);
      if (!nativeNow) {
        await this.cache.put(key, cached, {
          title: query.title,
          artist: query.artist,
          album: query.album ?? null,
          durationMs: query.durationMs ?? null,
        });
      }
      this.cache.markPlainRechecked?.(key);
      return nativeNow && fresh ? fresh : cached;
    }
    if (fresh?.synced) return fresh;
    if (!fresh) {
      // El barrido pudo marcar "no encontrada" y pisar la entrada positiva:
      // se restaura la plana que sí teníamos para no perderla.
      await this.cache.put(key, cached, {
        title: query.title,
        artist: query.artist,
        album: query.album ?? null,
        durationMs: query.durationMs ?? null,
      });
    }
    this.cache.markPlainRechecked?.(key);
    // Si el barrido trajo otra plana (p. ej. repartida ya por la duración
    // real), esa es la que quedó en caché: devolver la misma que se guardó.
    return fresh ?? cached;
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

  private async fetchAndStore(
    key: string,
    query: LyricsQuery,
    budgetMs: number = this.opts.totalBudgetMs,
  ): Promise<TimedLyrics | null> {
    const startedAt = Date.now();
    const deadline = startedAt + budgetMs;
    const hints = this.opts.enableMetadataHints
      ? await resolveMetadataHints(query).catch(() => ({ primary: query, alternates: [] }))
      : { primary: query, alternates: [] };
    const variants = buildQueryVariants(hints.primary, hints.alternates).slice(0, MAX_VARIANTS);
    let bestSynced: { raw: RawLyrics; query: LyricsQuery; provider: string } | null = null;
    let bestPlain: { raw: RawLyrics; query: LyricsQuery; provider: string } | null = null;
    let sawNotFound = false;
    let lastError: unknown = null;
    let budgetExhausted = false;
    /** Se descartó alguna letra por idioma: "no encontrada" sería mentira. */
    let sawLanguageVeto = false;
    /** Resultado por proveedor para la línea resumen del barrido. */
    const providerStatus = new Map<string, 'sincronizada' | 'plana' | 'error' | '—'>();

    outer: for (const provider of this.providers) {
      let pSynced = false;
      let pPlain = false;
      let pError = false;
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
          pError = true;
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
        if (raw.synced) pSynced = true;
        else pPlain = true;
        // Veto por escritura: un artista japonés conocido no tiene su letra en
        // hangul. Encontrar algo NO es lo mismo que encontrar lo correcto, y
        // una letra de otro idioma es peor que ninguna (se muestra y desincroniza).
        // Se prueban ambos artistas: el de la variante (puede ser el original
        // recuperado de un cover) y el que reportó el reconocedor.
        const text = rawLyricsText(raw);
        const variantVeto = vetoLyricsByLanguage(variant.artist, text);
        const veto = variantVeto.vetoed ? variantVeto : vetoLyricsByLanguage(query.artist, text);
        if (veto.vetoed) {
          console.warn(
            `[lyrics] ${provider.name} descartado para "${variant.artist} - ${variant.title}": ${veto.reason}`,
          );
          sawLanguageVeto = true;
          continue;
        }
        // Detalle de la entrada cuando el proveedor lo expone (LRCLIB): id,
        // álbum consultado, duración de la entrada y escritura dominante.
        const metaParts: string[] = [];
        if (raw.meta?.id != null) metaParts.push(`id=${raw.meta.id}`);
        if (variant.album) metaParts.push(`álbum="${variant.album}"`);
        if (raw.meta?.durationS != null) metaParts.push(`dur=${raw.meta.durationS}s`);
        metaParts.push(`esc=${dominantScript(text)}`);
        console.log(
          `[lyrics] ${provider.name} → ${raw.synced ? 'sincronizada' : 'plana'} para "${variant.artist} - ${variant.title}" ` +
            `(${Date.now() - t0}ms, ${metaParts.join(' ')})`,
        );
        if (raw.synced) {
          bestSynced = { raw, query: variant, provider: provider.name };
          break;
        }
        if (!bestPlain) bestPlain = { raw, query: variant, provider: provider.name };
      }
      providerStatus.set(
        provider.name,
        pSynced ? 'sincronizada' : pPlain ? 'plana' : pError ? 'error' : '—',
      );
      if (bestSynced) break;
    }

    // Resumen del barrido en UNA línea: resultado por proveedor y elegida.
    // Sin texto de letra (privacidad de logs).
    const sweep = this.providers
      .map((p) => `${p.name}=${providerStatus.get(p.name) ?? '—'}`)
      .join(', ');
    const logSweep = (elegida: string): void => {
      console.log(`[lyrics] barrido "${query.artist} - ${query.title}": ${sweep} → elegida=${elegida}`);
    };

    const chosen = bestSynced ?? bestPlain;
    const fallbackChosen = bestSynced && bestPlain ? bestPlain : null;
    const base = chosen ? normalizeRaw(chosen.raw, chosen.query.durationMs) : null;
    const normalized = base ?? (fallbackChosen ? normalizeRaw(fallbackChosen.raw, fallbackChosen.query.durationMs) : null);
    if (!normalized) {
      logSweep('ninguna');
      // Solo es un ERROR real si TODAS las consultas fallaron. Si al menos una
      // fuente respondió "no existe", el resultado honesto es "sin letra"
      // (null) — antes cualquier proveedor caído (p. ej. Musixmatch con
      // captcha) convertía todo en ERROR aunque LRCLIB hubiera respondido bien.
      if (lastError && !sawNotFound) {
        throw new LyricsLookupError('No se pudo consultar ninguna fuente de letras.', lastError);
      }
      // Cachear "no encontrada" solo tras un barrido completo y limpio; con
      // errores, presupuesto agotado o vetos por idioma no se puede afirmar que
      // no exista (el veto dice "esto no es", no "no hay").
      if (sawNotFound && !lastError && !budgetExhausted && !sawLanguageVeto) {
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
          `(notFound=${sawNotFound}, errores=${lastError != null}, agotado=${budgetExhausted}, ` +
          `vetoIdioma=${sawLanguageVeto}, ${Date.now() - startedAt}ms)`,
      );
      return null;
    }

    const effectiveChosen = base ? chosen : fallbackChosen;
    logSweep(
      effectiveChosen
        ? `${effectiveChosen.provider}/${normalized.synced ? 'sincronizada' : 'plana'}`
        : 'ninguna',
    );
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
   *  para que el próximo getLyrics vuelva a pegarle a la red (auto-reintento).
   *  Sin `force` respeta lo que el usuario importó a mano. */
  async forgetTrack(key: string, options: { force?: boolean } = {}): Promise<void> {
    await this.cache.clearEntry?.(key, options);
  }

  /** Ficha de la letra cacheada (fuente, antigüedad) para diagnóstico. */
  describeCachedTrack(key: string): CachedLyricsInfo | null {
    return this.cache.describeEntry?.(key) ?? null;
  }

  /** Invalida selectivamente lo que vino de una fuente. Devuelve cuántas cayeron. */
  invalidateSource(kind: LyricsSourceKind): number {
    return this.cache.invalidateBySource?.(kind) ?? 0;
  }

  /** Orden actual de la cadena de proveedores (diagnóstico). */
  getProviderNames(): string[] {
    return this.providers.map((provider) => provider.name);
  }
}

/** Instancia por defecto (sin caché). Feature 2 reemplaza la caché al inicializar. */
export const defaultLyricsService = new LyricsService();
