// ============================================================================
// Proveedor LRCLIB.
//
// Camino feliz: GET /api/get con firma exacta (artista+título+álbum+duración)
// → 1 request, sin escanear array, máxima precisión. Si no hay duración o /get
// da 404, cae a GET /api/search y elige el mejor resultado (sincronizado y con
// duración cercana). Devuelve letra CRUDA; el orquestador la normaliza.
// ============================================================================

import type { LyricsProvider, LyricsQuery, RawLyrics } from '../types';
import { titleArtistSimilarity } from '../normalizeQuery';
import { appFetch } from '../../http';

const USER_AGENT = 'Singevery/0.1.0 (https://github.com/Grizaceo/Singevery)';
const BASE = 'https://lrclib.net/api';
/** Tolerancia de duración al elegir en /api/search (segundos). */
const DURATION_TOLERANCE_S = 2;

/**
 * Diferencia de duración a partir de la cual la entrada es OTRA VERSIÓN de la
 * canción (extendida, remix, en vivo, radio edit), no esta grabación.
 *
 * Importa porque una letra SINCRONIZADA de otra versión es peor que una plana
 * de la correcta: se muestra con timestamps que no corresponden y la letra
 * corre desfasada toda la canción, sin que nada lo detecte después. Un
 * remaster o una diferencia de fade-out se quedan holgadamente por debajo de
 * 15s; una versión extendida se pasa de largo.
 */
export const VERSION_MISMATCH_S = 15;

interface LrcLibEntry {
  trackName?: string | null;
  artistName?: string | null;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
  duration?: number | null; // segundos
}

/**
 * ¿La entrada corresponde a OTRA versión de la canción? Solo se puede afirmar
 * cuando ambas duraciones se conocen. Pura (testeable).
 */
export function isOtherVersion(
  entryDurationS: number | null | undefined,
  queryDurationMs: number | null | undefined,
): boolean {
  if (entryDurationS == null || queryDurationMs == null) return false;
  return Math.abs(entryDurationS - queryDurationMs / 1000) > VERSION_MISMATCH_S;
}

/**
 * `otherVersion` degrada la letra a PLANA aunque venga sincronizada.
 *
 * Es la misma canción (la similitud de título/artista ya lo filtró), así que el
 * texto sirve; lo que no sirve son sus timestamps, que son de una grabación de
 * otra duración. Mostrarla sincronizada dejaba la letra corriendo desfasada
 * toda la canción y ningún mecanismo posterior lo corregía — el reloj solo sabe
 * ajustar la POSICIÓN, no cuestionar la letra. En plano el usuario ve el texto
 * correcto y ninguna sincronía mentirosa.
 */
function toRaw(entry: LrcLibEntry, otherVersion = false): RawLyrics | null {
  if (entry.instrumental) return null;
  if (!otherVersion && entry.syncedLyrics && entry.syncedLyrics.trim()) {
    return { source: 'lrclib', synced: true, lrc: entry.syncedLyrics };
  }
  if (entry.plainLyrics && entry.plainLyrics.trim()) {
    return { source: 'lrclib', synced: false, plain: entry.plainLyrics };
  }
  // Otra versión y solo hay LRC: se sirve el texto sin sus timestamps.
  if (entry.syncedLyrics && entry.syncedLyrics.trim()) {
    return { source: 'lrclib', synced: false, plain: stripLrcTimestamps(entry.syncedLyrics) };
  }
  return null;
}

/** Quita los `[mm:ss.xx]` de un LRC para poder servirlo como texto plano. */
export function stripLrcTimestamps(lrc: string): string {
  return lrc
    .split('\n')
    .map((line) => line.replace(/\[[0-9]{1,3}:[0-9]{2}(?:[.:][0-9]{1,3})?\]/g, '').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

async function tryGet(query: LyricsQuery, signal?: AbortSignal): Promise<RawLyrics | null> {
  if (query.durationMs == null) return null; // /api/get exige duración
  const params = new URLSearchParams({
    artist_name: query.artist,
    track_name: query.title,
    album_name: query.album ?? '',
    duration: String(Math.round(query.durationMs / 1000)),
  });
  const res = await appFetch(`${BASE}/get?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB /get HTTP ${res.status}`);
  const entry = (await res.json()) as LrcLibEntry;
  // /api/get busca por duración exacta, así que normalmente calza; se comprueba
  // igual porque la firma incluye álbum y LRCLIB puede responder con holgura.
  return toRaw(entry, isOtherVersion(entry.duration, query.durationMs));
}

async function trySearch(query: LyricsQuery, signal?: AbortSignal): Promise<RawLyrics | null> {
  const params = new URLSearchParams({
    track_name: query.title,
    artist_name: query.artist,
  });
  const res = await appFetch(`${BASE}/search?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal,
  });
  if (!res.ok) throw new Error(`LRCLIB /search HTTP ${res.status}`);
  const results = (await res.json()) as LrcLibEntry[];
  if (!Array.isArray(results) || results.length === 0) return null;
  return pickBest(results, query);
}

async function tryGeneralSearch(query: LyricsQuery, signal?: AbortSignal): Promise<RawLyrics | null> {
  const params = new URLSearchParams({
    q: `${query.artist} ${query.title}`.trim(),
  });
  const res = await appFetch(`${BASE}/search?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal,
  });
  if (!res.ok) throw new Error(`LRCLIB /search?q HTTP ${res.status}`);
  const results = (await res.json()) as LrcLibEntry[];
  if (!Array.isArray(results) || results.length === 0) return null;
  return pickBest(results, query);
}

/** Elige el mejor candidato: sincronizado primero, luego duración más cercana. */
export function pickBest(results: LrcLibEntry[], query: LyricsQuery): RawLyrics | null {
  const usable = results.filter((e) => !e.instrumental && (e.syncedLyrics || e.plainLyrics));
  if (usable.length === 0) return null;

  const wantS = query.durationMs != null ? query.durationMs / 1000 : null;
  const score = (e: LrcLibEntry): number => {
    const similarity = titleArtistSimilarity(query, {
      title: e.trackName ?? '',
      artist: e.artistName ?? '',
    });
    if (similarity <= 0) return Number.NEGATIVE_INFINITY;

    let s = 0;
    // El bonus de "sincronizada" solo cuenta si sus timestamps sirven para ESTA
    // grabación. Sin esta condición, una letra sincronizada de otra versión
    // (+1000) aplastaba a la plana correcta aunque su duración se fuera por
    // minutos: era el camino por el que una extendida terminaba con la letra
    // de la versión de álbum, corriendo desfasada de principio a fin.
    if (!isOtherVersion(e.duration, query.durationMs) && e.syncedLyrics && e.syncedLyrics.trim()) {
      s += 1000;
    }
    s += similarity * 250;
    if (wantS != null && e.duration != null) {
      const diff = Math.abs(e.duration - wantS);
      if (diff <= DURATION_TOLERANCE_S) s += 100 - diff; // premia cercanía
      else s -= diff; // penaliza lejanía
    }
    return s;
  };

  const ranked = usable
    .map((entry) => ({ entry, score: score(entry) }))
    .filter((item) => Number.isFinite(item.score));
  if (ranked.length === 0) {
    // Fallback cross-script: LRCLIB guarda muchas pistas JP/KO/ZH con
    // título/artista en su alfabeto original, y la query llega en romaji (o
    // al revés) → similitud de texto 0. Una duración casi exacta identifica
    // la pista con la misma confianza que usa /api/get.
    if (wantS != null) {
      const byDuration = usable
        .filter((e) => e.duration != null && Math.abs(e.duration - wantS) <= DURATION_TOLERANCE_S)
        .sort((a, b) => {
          const syncedDelta =
            Number(Boolean(b.syncedLyrics?.trim())) - Number(Boolean(a.syncedLyrics?.trim()));
          if (syncedDelta !== 0) return syncedDelta;
          return Math.abs((a.duration ?? 0) - wantS) - Math.abs((b.duration ?? 0) - wantS);
        });
      if (byDuration[0]) return toRaw(byDuration[0]);
    }
    return null;
  }
  const best = ranked.reduce((a, b) => (b.score > a.score ? b : a)).entry;
  return toRaw(best, isOtherVersion(best.duration, query.durationMs));
}

export const lrclibProvider: LyricsProvider = {
  name: 'lrclib',
  async lookup(query, signal) {
    const exact = await tryGet(query, signal);
    if (exact) return exact;
    const searched = await trySearch(query, signal);
    if (searched) return searched;
    return tryGeneralSearch(query, signal);
  },
};
