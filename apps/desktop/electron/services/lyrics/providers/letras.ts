// ============================================================================
// Proveedor letras.mus.br — fallback de letra PLANA (sin timestamps).
//
// La página de búsqueda (/buscar/) se renderiza por JavaScript, así que
// scrapearla con regex nunca devuelve resultados. Las páginas de canción, en
// cambio, SÍ vienen server-rendered y usan URLs predecibles por slug:
//   https://www.letras.mus.br/<artista-slug>/<titulo-slug>/
// (redirigen a la URL canónica /<artista>/<id>/ con la letra en el HTML).
// Estrategia: construir el slug, pedir la página y validar con similitud
// título/artista contra el <h1>/<h2> de la página.
// ============================================================================

import type { LyricsProvider, RawLyrics } from '../types';
import { titleArtistSimilarity } from '../normalizeQuery';
import { appFetch } from '../../http';

const BASE = 'https://www.letras.mus.br';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/** Similitud mínima entre lo pedido y lo que declara la página. */
const MIN_MATCH_SCORE = 0.68;

/** Slug estilo letras.mus.br: minúsculas, sin diacríticos, guiones. */
export function letrasSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function decodeHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** GET de una página; 404 = canción inexistente (null), otros errores lanzan. */
async function fetchPage(url: string, signal?: AbortSignal): Promise<string | null> {
  const res = await appFetch(url, {
    signal,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Letras HTTP ${res.status}`);
  return await res.text();
}

export function parseSongPage(html: string): { plainLyrics: string | null; title: string; artist: string } {
  const title = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html)?.[1]?.trim() ?? '';
  const artist = /<h2[^>]*>(?:<a[^>]*>)?([^<]+)/i.exec(html)?.[1]?.trim() ?? '';
  const lyricsHtml =
    /<div[^>]+class="[^"]*lyric-original[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] ??
    /<div[^>]+class="[^"]*cnt-letra[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] ??
    null;

  return {
    plainLyrics: lyricsHtml ? decodeHtml(lyricsHtml) : null,
    title,
    artist,
  };
}

export const letrasProvider: LyricsProvider = {
  name: 'letras',
  async lookup(query, signal): Promise<RawLyrics | null> {
    const artistSlug = letrasSlug(query.artist);
    const titleSlug = letrasSlug(query.title);
    if (!artistSlug || !titleSlug) return null;

    const pageHtml = await fetchPage(`${BASE}/${artistSlug}/${titleSlug}/`, signal);
    if (!pageHtml) return null;

    const parsed = parseSongPage(pageHtml);
    if (!parsed.plainLyrics?.trim()) return null;

    const score = titleArtistSimilarity(query, {
      title: parsed.title || query.title,
      artist: parsed.artist || query.artist,
    });
    if (score < MIN_MATCH_SCORE) return null;

    return { source: 'letras', synced: false, plain: parsed.plainLyrics.trim() };
  },
};
