// ============================================================================
// auddLyrics.ts — AudD findLyrics. Letra PLAIN (no sincronizada) por artist+title.
//
// Endpoint: GET https://api.audd.io/findLyrics?q=<query>&api_token=<token>
// Respuesta: {status:'success', result:[{song_id, title, full_title, artist,
//   lyrics, media, ...}]}
// lyrics es texto plano (con headers [Verse 1], [Chorus]...) — NO sincronizado.
// Devuelve el primer match con letra no vacía, saneado con cleanPlainLyrics.
//
// Reutiliza AUDD_API_TOKEN del .env (getAuddToken). Sin token → null (la cadena
// prueba la siguiente fuente). No lanza: errores de red → null.
// ============================================================================

import { getAuddToken } from './env';
import { cleanPlainLyrics, isEmptyLyrics } from './lyricsCleaner';
import type { LyricSource, LyricSourceResult } from './lyricsSource';

const AUDD_FIND_URL = 'https://api.audd.io/findLyrics';

interface AuddLyricsResult {
  lyrics?: string;
  title?: string;
  artist?: string;
  full_title?: string;
}

interface AuddLyricsResponse {
  status: 'success' | 'error';
  result?: AuddLyricsResult[] | null;
  error?: { error_code: number; error_message: string };
}

/**
 * Parsea la respuesta JSON de AudD findLyrics y devuelve la letra del primer
 * match con contenido, ya saneada. Función pura (testeable sin red).
 * Devuelve null si no hay matches o todos están vacíos.
 */
export function parseAuddFindLyricsResponse(raw: string): string | null {
  let data: AuddLyricsResponse;
  try {
    data = JSON.parse(raw) as AuddLyricsResponse;
  } catch {
    return null;
  }
  if (data.status !== 'success' || !Array.isArray(data.result) || data.result.length === 0) {
    return null;
  }
  for (const match of data.result) {
    const lyrics = match?.lyrics;
    if (typeof lyrics !== 'string' || isEmptyLyrics(lyrics)) continue;
    const cleaned = cleanPlainLyrics(lyrics);
    if (!isEmptyLyrics(cleaned)) return cleaned;
  }
  return null;
}

/** Fuente de letras AudD findLyrics. Plain, sin durationMs. */
export const auddLyricsSource: LyricSource = {
  name: 'audd',
  async fetch(title: string, artist: string): Promise<LyricSourceResult | null> {
    const token = getAuddToken();
    if (!token) return null; // sin token no podemos llamar a AudD
    const q = `${artist} ${title}`.trim();
    const url = `${AUDD_FIND_URL}?q=${encodeURIComponent(q)}&api_token=${encodeURIComponent(token)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const raw = await response.text();
    const lyrics = parseAuddFindLyricsResponse(raw);
    if (!lyrics) return null;
    return { lyrics, synced: false, source: 'audd' };
  },
};