import type { TimedLyrics } from '../../src/types';
import { parseLrc, plainTextToLyrics } from './lrcParser';
import type { LyricSource, LyricSourceResult } from './lyricsSource';

const USER_AGENT = 'Espejo-Teleprompter/0.1.0';
const SEARCH_URL = 'https://lrclib.net/api/search';

interface LrcLibResult {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
  /** Duración de la pista en segundos (lo da lrclib). Para repartir letra plana. */
  duration?: number | null;
}

/**
 * Búsqueda cruda en lrclib. Devuelve el resultado crudo (texto + si es synced
 * + duración en ms) sin parsear, para que el orquestador de la cadena decida
 * cómo parsearlo. Función pura sobre la respuesta JSON (testeable sin red).
 * Devuelve null si no hay matches válidos.
 */
export function pickLrclibResult(results: LrcLibResult[]): LyricSourceResult | null {
  const result = results.find(
    (entry) => !entry.instrumental && (entry.syncedLyrics || entry.plainLyrics),
  );
  if (!result) return null;

  const durationMs =
    typeof result.duration === 'number' && result.duration > 0
      ? Math.round(result.duration * 1000)
      : undefined;

  if (result.syncedLyrics && result.syncedLyrics.trim()) {
    return { lyrics: result.syncedLyrics, synced: true, durationMs, source: 'lrclib' };
  }
  if (result.plainLyrics && result.plainLyrics.trim()) {
    return { lyrics: result.plainLyrics.trim(), synced: false, durationMs, source: 'lrclib' };
  }
  return null;
}

/** Fuente lrclib. Preferimos synced (karaoke por palabra); si solo hay plain,
 *  lo devolvemos como plain (el orquestador lo reparte por duración). */
export const lrclibSource: LyricSource = {
  name: 'lrclib',
  async fetch(trackName: string, artistName: string): Promise<LyricSourceResult | null> {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });
    const response = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) return null;
    const results = (await response.json()) as LrcLibResult[];
    if (!Array.isArray(results) || results.length === 0) return null;
    return pickLrclibResult(results);
  },
};

export async function fetchLyricsByMetadata(
  trackName: string,
  artistName: string,
): Promise<TimedLyrics | null> {
  const raw = await lrclibSource.fetch(trackName, artistName);
  if (!raw) return null;

  if (raw.synced) {
    const lines = parseLrc(raw.lyrics);
    if (lines.length === 0) return null;
    return { lines, source: 'lrclib', synced: true };
  }

  // Plain: repartir por la duración que lrclib reporta (si la da).
  const lines = plainTextToLyrics(raw.lyrics, raw.durationMs);
  if (lines.length === 0) return null;
  return { lines, source: 'lrclib', synced: false };
}
