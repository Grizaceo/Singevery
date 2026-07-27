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

import type { LyricsProvider, LyricsQuery, RawLyrics } from '../types';
import { titleArtistSimilarity, titleSimilarity } from '../normalizeQuery';
import { appFetch } from '../../http';

const BASE = 'https://www.letras.mus.br';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/** Similitud mínima entre lo pedido y lo que declara la página. */
const MIN_MATCH_SCORE = 0.68;
/** Similitud mínima de título al elegir un link del listado del artista. */
const MIN_LINK_SCORE = 0.75;
/** Segmentos bajo /<artista>/ que no son canciones. */
const NON_SONG_SEGMENTS = new Set([
  'discografia',
  'fotos',
  'shows',
  'radio',
  'ouvir',
  'cifras',
  'traducoes',
  'significados',
  'playlists',
  'albuns',
]);

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
  // Guarda dura: las vistas derivadas (traducción, significado, impresión) no
  // son la letra original y nunca deben pedirse.
  if (/\/(traducao|traduccion|significado|print)\b/i.test(url)) return null;
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

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿가-힯]/;
const CJK_GLOBAL_RE = /[぀-ヿ㐀-䶿一-鿿가-힯]/g;

/**
 * Deshace la "transliteração automática" de letras.mus.br.
 *
 * La página sirve el original y su romanización DENTRO de la misma línea, sin
 * separador, y las devuelve pegadas al extraer el texto:
 *   "無敵の笑顔であらすメディアmuteki no egao de arasu media"
 *   "(You're my savior)(You're my savior)"   ← si el original ya es latino
 * Mostrar eso arruina la letra. Esta función recupera solo el original.
 * Pura y testeable.
 */
export function stripInterleavedTransliteration(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return '';

  // Caso 1 — original latino: la transliteración es idéntica, así que la línea
  // es exactamente el mismo texto dos veces seguidas.
  const half = trimmed.length / 2;
  if (Number.isInteger(half) && half > 0) {
    const left = trimmed.slice(0, half);
    if (left === trimmed.slice(half)) return left.trim();
  }

  // Caso 2 — original CJK seguido de su romanización latina. Se corta en el
  // último carácter CJK: lo que sigue (latino) es la lectura añadida.
  if (CJK_RE.test(trimmed)) {
    CJK_GLOBAL_RE.lastIndex = 0;
    let lastCjk = -1;
    let m: RegExpExecArray | null;
    while ((m = CJK_GLOBAL_RE.exec(trimmed)) !== null) lastCjk = m.index;
    const tail = trimmed.slice(lastCjk + 1);
    // Solo si la cola es una romanización plausible (latino, sin CJK) y con
    // cuerpo suficiente como para no comerse signos de puntuación legítimos.
    if (tail.trim().length >= 3 && /^[\p{Script=Latin}\p{N}\s'’,.!?()\-–—]+$/u.test(tail)) {
      return trimmed.slice(0, lastCjk + 1).trim();
    }
  }

  return trimmed;
}

/** Aplica la limpieza línea a línea, preservando los saltos de estrofa. */
export function cleanLetrasLyrics(text: string): string {
  return text
    .split('\n')
    .map((line) => stripInterleavedTransliteration(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * ¿El bloque extraído es una TRADUCCIÓN y no la letra original? letras.mus.br
 * publica la traducción en la misma plantilla (pestaña "Tradução"), y servirla
 * como si fuera la letra es justo lo que no queremos.
 */
export function looksLikeTranslationBlock(html: string, blockIndex: number): boolean {
  // Contexto inmediatamente anterior al bloque: ahí van los encabezados y las
  // clases que marcan la columna traducida.
  const context = html.slice(Math.max(0, blockIndex - 400), blockIndex);
  return /lyric-translation|cnt-trad|letra-traduzida|traducao|traducción|tradução/i.test(context);
}

export function parseSongPage(html: string): { plainLyrics: string | null; title: string; artist: string } {
  const title = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html)?.[1]?.trim() ?? '';
  const artist = /<h2[^>]*>(?:<a[^>]*>)?([^<]+)/i.exec(html)?.[1]?.trim() ?? '';

  // Preferir SIEMPRE el contenedor del original. El fallback genérico
  // (cnt-letra) comparte plantilla con la vista de traducción, así que solo se
  // acepta si su contexto no delata que es el bloque traducido.
  const original = /<div[^>]+class="[^"]*lyric-original[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  let lyricsHtml: string | null = original?.[1] ?? null;

  if (lyricsHtml == null) {
    const generic = /<div[^>]+class="[^"]*cnt-letra[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    if (generic && !looksLikeTranslationBlock(html, generic.index)) {
      lyricsHtml = generic[1];
    }
  }

  return {
    plainLyrics: lyricsHtml ? cleanLetrasLyrics(decodeHtml(lyricsHtml)) : null,
    title,
    artist,
  };
}

/** Links a canciones dentro de la página del artista (server-rendered). */
export function extractArtistSongLinks(
  html: string,
  artistSlug: string,
): Array<{ href: string; label: string }> {
  const links: Array<{ href: string; label: string }> = [];
  const seen = new Set<string>();
  const re = new RegExp(
    `<a[^>]+href="((?:https?://[^"/]+)?/${artistSlug}/([^"/?#]+)/?)"[^>]*>([\\s\\S]*?)</a>`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const segment = m[2];
    if (segment.includes('.') || NON_SONG_SEGMENTS.has(segment.toLowerCase())) continue;
    const title = /title="([^"]*)"/.exec(m[0])?.[1];
    const label = decodeHtml(title && title.trim() ? title : m[3]);
    if (!label || seen.has(href)) continue;
    seen.add(href);
    links.push({ href, label });
  }
  return links;
}

/** Valida la página de canción contra la query y la convierte en RawLyrics. */
function pageToRaw(pageHtml: string, query: LyricsQuery): RawLyrics | null {
  const parsed = parseSongPage(pageHtml);
  if (!parsed.plainLyrics?.trim()) return null;

  const score = titleArtistSimilarity(query, {
    title: parsed.title || query.title,
    artist: parsed.artist || query.artist,
  });
  if (score < MIN_MATCH_SCORE) return null;

  return { source: 'letras', synced: false, plain: parsed.plainLyrics.trim() };
}

export const letrasProvider: LyricsProvider = {
  name: 'letras',
  async lookup(query, signal): Promise<RawLyrics | null> {
    const artistSlug = letrasSlug(query.artist);
    const titleSlug = letrasSlug(query.title);
    if (!artistSlug || !titleSlug) return null;

    // 1) Slug directo /<artista>/<titulo>/ (redirige a la URL canónica).
    const directHtml = await fetchPage(`${BASE}/${artistSlug}/${titleSlug}/`, signal);
    if (directHtml) {
      const direct = pageToRaw(directHtml, query);
      if (direct) return direct;
    }

    // 2) Fallback: el slug adivinado falla cuando letras usa slugs no
    //    estándar (p. ej. "pequea-serenata-diurna") o URLs numéricas sin
    //    redirect. La página del artista SÍ es server-rendered y lista todas
    //    sus canciones: elegir el link cuyo título calce con lo buscado.
    const artistHtml = await fetchPage(`${BASE}/${artistSlug}/`, signal);
    if (!artistHtml) return null;

    const links = extractArtistSongLinks(artistHtml, artistSlug);
    let best: { href: string; score: number } | null = null;
    for (const link of links) {
      const score = titleSimilarity(query.title, link.label);
      if (score >= MIN_LINK_SCORE && (!best || score > best.score)) {
        best = { href: link.href, score };
      }
    }
    if (!best) return null;

    const songUrl = best.href.startsWith('http') ? best.href : `${BASE}${best.href}`;
    const songHtml = await fetchPage(songUrl, signal);
    if (!songHtml) return null;
    return pageToRaw(songHtml, query);
  },
};
