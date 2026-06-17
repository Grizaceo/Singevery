// ============================================================================
// geniusLyrics.ts — Genius. Letra PLAIN vía search + scrape del HTML.
//
// 1. GET https://genius.com/api/search?q=<artist title> → {response:{hits:[{
//      result:{url, title, primary_artist:{name}, ...}}]}}
//    La API search de Genius es pública (sin token, rate-limited). Tomamos la
//    primera hit con url.
// 2. GET la url de la canción → HTML server-rendered. La letra vive en nodos
//    <div data-lyrics-container="true">...</div>. Extraemos con regex (sin
//    cheerio/jsdom), <br> → \n, limpiamos tags, decodificamos entidades.
//
// Plain, sin timestamps, sin duración. Zona gris de TOS (uso personal). Si
// Genius bloquea o la estructura cambia → null (la cadena termina).
// ============================================================================

import { cleanPlainLyrics, isEmptyLyrics } from './lyricsCleaner';
import type { LyricSource, LyricSourceResult } from './lyricsSource';

const GENIUS_SEARCH_URL = 'https://genius.com/api/search';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

interface GeniusHit {
  result?: {
    url?: string;
    title?: string;
    primary_artist?: { name?: string };
  };
}
interface GeniusSearchResponse {
  response?: { hits?: GeniusHit[] };
}

// Contenedor principal de Genius (estructura estable años).
const LYRICS_CONTAINER_RE =
  /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g;
// Fallback: contenedor legacy class="lyrics".
const LYRICS_CLASS_RE = /<div[^>]*class="lyrics"[^>]*>([\s\S]*?)<\/div>/g;
const TAG_RE = /<[^>]+>/g;
const BR_RE = /<br\s*\/?>/gi;

/**
 * Extrae la letra del HTML de una página de canción de Genius. Función pura
 * (testeable sin red). Devuelve la letra saneada o null si no encuentra
 * contenedor.
 */
export function extractGeniusLyrics(html: string): string | null {
  // Probar el contenedor moderno primero, luego el legacy.
  for (const re of [LYRICS_CONTAINER_RE, LYRICS_CLASS_RE]) {
    const localRe = new RegExp(re.source, 'g');
    const chunks: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = localRe.exec(html)) !== null) {
      // <br> → newline antes de quitar tags, para conservar saltos de línea.
      const withNewlines = match[1].replace(BR_RE, '\n');
      const text = withNewlines.replace(TAG_RE, '');
      chunks.push(text);
    }
    if (chunks.length > 0) {
      const raw = chunks.join('\n');
      const cleaned = cleanPlainLyrics(raw);
      if (!isEmptyLyrics(cleaned)) return cleaned;
    }
  }
  return null;
}

/**
 * Parsea la respuesta de la API search de Genius. Devuelve la url de la
 * primera hit válida (con url). Función pura (testeable sin red).
 */
export function parseGeniusSearchResponse(raw: string): string | null {
  let data: GeniusSearchResponse;
  try {
    data = JSON.parse(raw) as GeniusSearchResponse;
  } catch {
    return null;
  }
  const hits = data.response?.hits;
  if (!Array.isArray(hits) || hits.length === 0) return null;
  for (const hit of hits) {
    const url = hit?.result?.url;
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
  }
  return null;
}

/** Fuente Genius: search + scrape. Plain, sin durationMs. */
export const geniusLyricsSource: LyricSource = {
  name: 'genius',
  async fetch(title: string, artist: string): Promise<LyricSourceResult | null> {
    // 1. Buscar la canción en Genius.
    const q = `${artist} ${title}`.trim();
    const searchUrl = `${GENIUS_SEARCH_URL}?q=${encodeURIComponent(q)}`;
    const searchResp = await fetch(searchUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!searchResp.ok) return null;
    const songUrl = parseGeniusSearchResponse(await searchResp.text());
    if (!songUrl) return null;

    // 2. Scrapear la página de la canción.
    const pageResp = await fetch(songUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!pageResp.ok) return null;
    const html = await pageResp.text();
    const lyrics = extractGeniusLyrics(html);
    if (!lyrics) return null;
    return { lyrics, synced: false, source: 'genius' };
  },
};