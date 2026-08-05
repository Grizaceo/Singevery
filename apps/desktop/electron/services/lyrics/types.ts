// ============================================================================
// Tipos de la capa de letras (Feature 1).
//
// La capa desacopla AL WIDGET de cualquier fuente concreta de letras: se busca
// por metadata (título/artista/álbum/duración), un proveedor devuelve letra
// CRUDA (LRC o texto plano), y el orquestador la normaliza + romaniza localmente.
// Agregar otra fuente = implementar `LyricsProvider` y sumarlo a la cadena.
// ============================================================================

import type { TimedLyrics } from '../../../src/types';

/** Consulta de letra por metadata. `durationMs` desambigua (LRCLIB /api/get). */
export interface LyricsQuery {
  title: string;
  artist: string;
  album?: string | null;
  durationMs?: number | null;
}

/** Letra cruda devuelta por un proveedor, antes de parsear/romanizar. */
export interface RawLyrics {
  source: string; // "lrclib", ...
  /** true si `lrc` trae timestamps sincronizados. */
  synced: boolean;
  /** LRC sincronizado crudo (si `synced`). */
  lrc?: string;
  /** Texto plano sin timestamps (fallback). */
  plain?: string;
}

/** Un proveedor de letras (LRCLIB y, a futuro, otros). */
export interface LyricsProvider {
  name: string;
  lookup(query: LyricsQuery, signal?: AbortSignal): Promise<RawLyrics | null>;
}

/** Metadata que el orquestador entrega a la caché al guardar una letra. */
export interface CacheMeta {
  title: string;
  artist: string;
  album?: string | null;
  durationMs?: number | null;
}

// ============================================================================
// Atribución de fuente
//
// Cada letra cacheada recuerda DE DÓNDE salió y CUÁNDO. Sin eso, un proveedor
// que empieza a devolver basura contamina la caché para siempre (no hay forma
// de invalidar solo lo suyo) y un match malo es indepurable a posteriori.
// También distingue lo que cargó el usuario a mano: eso no se re-busca ni se
// borra por un reintento automático.
// ============================================================================

/** Familia de la fuente, normalizada (el `source` crudo varía por proveedor). */
export type LyricsSourceKind =
  | 'lrclib'
  | 'musixmatch'
  | 'letras'
  | 'netease'
  | 'captions'
  | 'import'
  | 'unknown'
  /** Entrada negativa: no es una letra, es un "no existe" cacheado. */
  | 'none';

/**
 * Preferencia entre fuentes (menor = mejor). Lo que eligió el usuario a mano
 * gana siempre; después va el orden de la cadena de proveedores.
 */
export const LYRICS_SOURCE_PRIORITY: Record<LyricsSourceKind, number> = {
  import: 0,
  lrclib: 1,
  musixmatch: 2,
  letras: 3,
  netease: 4,
  captions: 5,
  unknown: 8,
  none: 9,
};

/** Normaliza el `source` crudo de una letra a su familia. Función pura. */
export function classifyLyricsSource(source: string | null | undefined): LyricsSourceKind {
  const value = (source ?? '').trim().toLowerCase();
  if (!value || value === 'none') return 'none';
  if (value.startsWith('import')) return 'import';
  if (value.includes('lrclib')) return 'lrclib';
  if (value.includes('musixmatch')) return 'musixmatch';
  if (value.includes('letras')) return 'letras';
  if (value.includes('netease') || value.includes('163')) return 'netease';
  if (value.includes('caption') || value.includes('subtitle')) return 'captions';
  return 'unknown';
}

/** Ficha de una entrada de caché para diagnóstico (no incluye la letra). */
export interface CachedLyricsInfo {
  key: string;
  title: string;
  artist: string;
  /** `source` crudo tal como lo declaró el proveedor. */
  source: string;
  sourceKind: LyricsSourceKind;
  sourcePriority: number;
  synced: boolean;
  /** Cuándo se guardó esta letra (epoch ms). */
  cachedAt: number;
  /** Antigüedad de la entrada al momento de consultarla. */
  vintageMs: number;
  lastHeardAt: number;
  playCount: number;
  bytes: number;
  /** true si es una entrada negativa ("sin letra") y no una letra real. */
  negative: boolean;
}

/**
 * Caché de letras (la implementa Feature 2). El orquestador la usa "cache-first".
 * Se define aquí como interfaz para no acoplar la capa de letras a una impl.
 */
export interface LyricsCache {
  get(key: string): Promise<TimedLyrics | null>;
  put(key: string, lyrics: TimedLyrics, meta: CacheMeta): Promise<void>;
  /** true si la pista está en caché negativa (se sabe que no hay letra, TTL). */
  isNegative(key: string, sourceHash?: string): boolean;
  markNotFound(key: string, meta?: CacheMeta, sourceHash?: string): Promise<void>;
  /** Borra la entrada. Las importadas por el usuario se respetan salvo `force`. */
  clearEntry?(key: string, options?: { force?: boolean }): Promise<void> | void;
  /** Ficha de la entrada (sin la letra) para el endpoint de diagnóstico. */
  describeEntry?(key: string): CachedLyricsInfo | null;
  /** Invalida selectivamente todo lo que vino de una fuente. Devuelve cuántas. */
  invalidateBySource?(kind: LyricsSourceKind): number;
}

/** Caché nula (sin persistencia): default cuando aún no se inyecta la real. */
export const NULL_LYRICS_CACHE: LyricsCache = {
  get: async () => null,
  put: async () => {},
  isNegative: () => false,
  markNotFound: async () => {},
  clearEntry: async () => {},
  describeEntry: () => null,
  invalidateBySource: () => 0,
};
