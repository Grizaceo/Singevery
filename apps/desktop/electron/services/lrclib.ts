import type { TimedLyrics } from '../../src/types';
import { parseLrc, plainTextToLyrics } from './lrcParser';

const USER_AGENT = 'Espejo-Teleprompter/0.1.0';
const SEARCH_URL = 'https://lrclib.net/api/search';

interface LrcLibResult {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
  /** Duración de la pista en segundos (lo da lrclib). Para repartir letra plana. */
  duration?: number | null;
}

export async function fetchLyricsByMetadata(
  trackName: string,
  artistName: string,
): Promise<TimedLyrics | null> {
  const params = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
  });

  const response = await fetch(`${SEARCH_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`LRCLIB search failed: ${response.status} ${response.statusText}`);
  }

  const results = (await response.json()) as LrcLibResult[];
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const result = results.find(
    (entry) => !entry.instrumental && (entry.syncedLyrics || entry.plainLyrics),
  );
  if (!result) {
    return null;
  }

  if (result.syncedLyrics) {
    const lines = parseLrc(result.syncedLyrics);
    if (lines.length === 0) {
      return null;
    }
    return { lines, source: 'lrclib', synced: true };
  }

  if (result.plainLyrics) {
    const trimmed = result.plainLyrics.trim();
    if (!trimmed) {
      return null;
    }
    const durationMs =
      typeof result.duration === 'number' && result.duration > 0
        ? Math.round(result.duration * 1000)
        : undefined;
    const lines = plainTextToLyrics(trimmed, durationMs);
    if (lines.length === 0) {
      return null;
    }
    return { lines, source: 'lrclib', synced: false };
  }

  return null;
}
