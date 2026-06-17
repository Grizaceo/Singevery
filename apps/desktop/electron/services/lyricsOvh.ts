// ============================================================================
// lyricsOvh.ts — lyrics.ovh. Letra PLAIN por artist+title, API simple sin token.
//
// Endpoint: GET https://api.lyrics.ovh/v1/<artist>/<title>
// Respuesta: {lyrics: "...\n\n"}  (string, puede venir vacío o 404 si no halla)
// Plain, sin timestamps, sin duración. Sin token. Cobertura pobre en japonés
// y covers, pero es API limpia (sin scrape) — primer intento web.
// ============================================================================

import { cleanPlainLyrics, isEmptyLyrics } from './lyricsCleaner';
import type { LyricSource, LyricSourceResult } from './lyricsSource';

const OVH_BASE = 'https://api.lyrics.ovh/v1';

interface OvhResponse {
  lyrics?: string;
}

/**
 * Parsea la respuesta de lyrics.ovh. Función pura (testeable sin red).
 * Devuelve la letra saneada o null si está vacía/ausente.
 */
export function parseOvhResponse(raw: string): string | null {
  let data: OvhResponse;
  try {
    data = JSON.parse(raw) as OvhResponse;
  } catch {
    return null;
  }
  const lyrics = data.lyrics;
  if (typeof lyrics !== 'string' || isEmptyLyrics(lyrics)) return null;
  const cleaned = cleanPlainLyrics(lyrics);
  return isEmptyLyrics(cleaned) ? null : cleaned;
}

/** Fuente lyrics.ovh. Plain, sin durationMs, sin token. */
export const lyricsOvhSource: LyricSource = {
  name: 'lyrics.ovh',
  async fetch(title: string, artist: string): Promise<LyricSourceResult | null> {
    // lyrics.ovh espera artist/title directamente en la ruta.
    const url = `${OVH_BASE}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const response = await fetch(url);
    if (!response.ok) return null; // 404 común cuando no halla la canción
    const raw = await response.text();
    const lyrics = parseOvhResponse(raw);
    if (!lyrics) return null;
    return { lyrics, synced: false, source: 'lyrics.ovh' };
  },
};