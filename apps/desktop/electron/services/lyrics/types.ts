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

/**
 * Caché de letras (la implementa Feature 2). El orquestador la usa "cache-first".
 * Se define aquí como interfaz para no acoplar la capa de letras a una impl.
 */
export interface LyricsCache {
  get(key: string): Promise<TimedLyrics | null>;
  put(key: string, lyrics: TimedLyrics, meta: CacheMeta): Promise<void>;
  /** true si la pista está en caché negativa (se sabe que no hay letra, TTL). */
  isNegative(key: string): boolean;
  markNotFound(key: string): Promise<void>;
}

/** Caché nula (sin persistencia): default cuando aún no se inyecta la real. */
export const NULL_LYRICS_CACHE: LyricsCache = {
  get: async () => null,
  put: async () => {},
  isNegative: () => false,
  markNotFound: async () => {},
};
