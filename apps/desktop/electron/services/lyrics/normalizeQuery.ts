import type { LyricsQuery } from './types';
import { extractCoverOriginal } from './coverTitle';

const SPACE_RE = /\s+/g;
const FEAT_SUFFIX_RE =
  /\s*[([\-–—,]\s*(feat|featuring|ft|con)\.?\s+[^)\]]+[)\]]?\s*$/i;
const DECORATION_RE =
  /\s*[([\-–—]\s*(en vivo|live|remaster(?:ed|izado)?(?:\s+\d{4})?|version|versi[oó]n|edit|radio edit|album version|mono|stereo|bonus track|deluxe|ac[uú]stic[ao]?|acoustic|karaoke)\s*[)\]]?\s*$/i;
/** Ruido típico de títulos de video (YouTube): "(Official Video)", "[Letra]",
 *  "(Video Oficial 4K)", "(Lyric Video)", "| Visualizer", etc. */
const VIDEO_NOISE_RE =
  /\s*[([|]\s*(official|oficial|video|lyric|lyrics|letra|audio|visuali[sz]er|mv|m\/v|hd|4k|sub\.?\s|subtitulad[oa])[^)\]|]*[)\]]?\s*$/i;
/** Sufijos de canal que no son el artista real: "X - Topic", "XVEVO", "X Official". */
const CHANNEL_NOISE_RE = /\s*(?:-\s*topic|vevo|official|oficial)\s*$/i;

function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '');
}

export function normalizeSearchText(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/['".,!?/\\]+/g, ' ')
    .replace(/[(){}[\]「」『』【】]+/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[-–—]+/g, ' ')
    .replace(SPACE_RE, ' ')
    .trim();
}

/**
 * Títulos estilo video de YouTube japonés: `Artista「Canción」×TV Anime…`.
 * El contenido del primer par de corchetes CJK suele ser el nombre real de la
 * canción; extraerlo permite que los proveedores la encuentren.
 */
export function extractCornerBracketTitle(title: string): string | null {
  const match = title.match(/[「『【]([^」』】]+)[」』】]/);
  const inner = match?.[1]?.trim() ?? '';
  return inner.length >= 2 ? inner : null;
}

function uniquePush(values: string[], candidate: string): void {
  const normalized = normalizeSearchText(candidate);
  if (!normalized) return;
  if (values.some((value) => normalizeSearchText(value) === normalized)) return;
  values.push(candidate.trim());
}

function stripDecorations(title: string): string {
  let out = title.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const next = out
      .replace(FEAT_SUFFIX_RE, '')
      .replace(DECORATION_RE, '')
      .replace(VIDEO_NOISE_RE, '')
      .trim();
    if (next !== out) {
      out = next;
      changed = true;
    }
  }
  return out;
}

/** Quita TODO segmento entre paréntesis/corchetes. Variante agresiva para
 *  títulos de video: "Song (Official Video) [4K]" → "Song". */
function stripAllBrackets(title: string): string {
  return title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(SPACE_RE, ' ')
    .trim();
}

/** Limpia sufijos de canal en el "artista" reportado por un navegador. */
function stripChannelNoise(artist: string): string {
  const out = artist.replace(CHANNEL_NOISE_RE, '').trim();
  return out.length >= 2 ? out : artist.trim();
}

function stripArtistPrefix(title: string, artist: string): string {
  const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
  if (!escapedArtist) return title.trim();
  return title.replace(new RegExp(`^\\s*${escapedArtist}\\s*[-–—:]\\s*`, 'i'), '').trim();
}

/** Como stripArtistPrefix pero al FINAL: "Canción - Artista" / "Canción | Artista". */
function stripArtistSuffix(title: string, artist: string): string {
  const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
  if (!escapedArtist) return title.trim();
  return title.replace(new RegExp(`\\s*[-–—:|]\\s*${escapedArtist}\\s*$`, 'i'), '').trim();
}

/** Corta " feat./ft. X" en cualquier posición hasta el final (para identidad;
 *  NO usa "con" para no romper títulos en español que lo contengan). */
function stripFeatTail(title: string): string {
  return title.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, '').trim();
}

function tokenize(value: string): string[] {
  return normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

function overlapRatio(expected: string, actual: string): number {
  const a = tokenize(expected);
  const b = tokenize(actual);
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  let matches = 0;
  for (const token of a) {
    if (bSet.has(token)) matches += 1;
  }
  return matches / Math.max(a.length, b.length);
}

function exactishMatch(expected: string, actual: string): boolean {
  const left = normalizeSearchText(expected);
  const right = normalizeSearchText(actual);
  return left.length > 0 && left === right;
}

/** Similitud SOLO de título (0..1): igualdad normalizada o solape de tokens.
 *  Para elegir la canción correcta dentro del listado de un artista. */
export function titleSimilarity(expected: string, actual: string): number {
  if (exactishMatch(expected, actual)) return 1;
  return overlapRatio(expected, actual);
}

export function titleArtistSimilarity(
  query: Pick<LyricsQuery, 'title' | 'artist'>,
  candidate: { title?: string | null; artist?: string | null },
): number {
  const title = candidate.title ?? '';
  const artist = candidate.artist ?? '';
  if (!title || !artist) return 0;

  const titleScore = exactishMatch(query.title, title) ? 1 : overlapRatio(query.title, title);
  const artistScore = exactishMatch(query.artist, artist) ? 1 : overlapRatio(query.artist, artist);

  if (titleScore < 0.35 || artistScore < 0.25) return 0;
  return titleScore * 0.65 + artistScore * 0.35;
}

export function buildQueryVariants(query: LyricsQuery, alternates: LyricsQuery[] = []): LyricsQuery[] {
  const titleVariants: string[] = [];
  uniquePush(titleVariants, query.title);

  // `Artista「Canción」×Anime…` → probar el contenido del corchete temprano:
  // el título crudo de estos videos casi nunca existe en los catálogos.
  const bracketTitle = extractCornerBracketTitle(query.title);
  if (bracketTitle) uniquePush(titleVariants, bracketTitle);

  // Cover: el catálogo indexa la canción ORIGINAL, no el upload. Solo se gasta
  // una variante cuando hay marca de cover o artista original detectado; el
  // ruido de video ("(Official Music Video)") ya lo limpian stripDecorations y
  // stripAllBrackets más abajo, y las variantes están topeadas (MAX_VARIANTS).
  const cover = extractCoverOriginal(query.title);
  if ((cover.isCover || cover.artist) && cover.clean) uniquePush(titleVariants, cover.clean);

  // Título estilo video ("Artista - Canción (Official Video)"): la variante
  // completamente limpia va temprano — es la que existe en los catálogos.
  uniquePush(
    titleVariants,
    stripArtistPrefix(stripDecorations(stripAllBrackets(query.title)), query.artist),
  );

  const withoutDecorations = stripDecorations(query.title);
  uniquePush(titleVariants, withoutDecorations);
  uniquePush(titleVariants, stripArtistPrefix(withoutDecorations, query.artist));

  const variants: LyricsQuery[] = [];
  const seen = new Set<string>();
  const candidates = [query, ...alternates];

  for (const base of candidates) {
    const baseTitles = base.title === query.title ? titleVariants : [base.title];
    for (const title of baseTitles) {
      const variant: LyricsQuery = {
        title,
        artist: base.artist.trim(),
        album: base.album ?? null,
        durationMs: base.durationMs ?? null,
      };
      const key = `${normalizeSearchText(variant.artist)}::${normalizeSearchText(variant.title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push(variant);
    }
  }

  // El original detrás de un cover cambia el ARTISTA, no solo el título, así
  // que no cabe en titleVariants (que fija el artista de la consulta). Con
  // marca explícita de cover va temprano: el "artista" del upload suele ser el
  // canal de quien lo cantó y bajo ese nombre no existe ninguna letra.
  if (cover.artist && cover.clean) {
    const coverVariant: LyricsQuery = {
      title: cover.clean,
      artist: cover.artist,
      album: query.album ?? null,
      durationMs: query.durationMs ?? null,
    };
    const key = `${normalizeSearchText(coverVariant.artist)}::${normalizeSearchText(coverVariant.title)}`;
    if (!seen.has(key)) {
      seen.add(key);
      variants.splice(cover.isCover ? Math.min(1, variants.length) : variants.length, 0, coverVariant);
    }
  }

  return variants;
}

// ============================================================================
// Identidad difusa de pista — ¿dos metadatas apuntan a la MISMA canción?
//
// El mismo tema llega con metadata distinta según la fuente: AudD/Shazam dan
// ("Houdini", "Dua Lipa") mientras el SMTC de un navegador con YouTube da
// ("Dua Lipa - Houdini (Official Music Video)", "DuaLipaVEVO"). Si el widget
// compara por clave exacta, cada fuente "cambia" la pista de la otra y la
// letra entra en un loop de recarga. Esta comparación tolerante corta el loop.
// ============================================================================

/** Compactado sin espacios: "DuaLipaVEVO" ≈ "Dua Lipa". */
function compact(value: string): string {
  return normalizeSearchText(value).replace(/ /g, '');
}

/** Variantes limpias del título de un lado (crudo, sin corchetes, sin prefijo
 *  de artista — probando los artistas de AMBOS lados). */
function titleIdentityCandidates(title: string, artists: string[]): string[] {
  const out: string[] = [];
  uniquePush(out, title);
  const corner = extractCornerBracketTitle(title);
  if (corner) uniquePush(out, corner);
  const stripped = stripDecorations(title);
  uniquePush(out, stripped);
  const noBrackets = stripDecorations(stripAllBrackets(title));
  uniquePush(out, noBrackets);
  uniquePush(out, stripFeatTail(noBrackets));
  for (const artist of artists) {
    for (const base of [stripped, noBrackets, stripFeatTail(noBrackets)]) {
      uniquePush(out, stripArtistPrefix(base, artist));
      uniquePush(out, stripArtistSuffix(base, artist));
    }
  }
  return out;
}

const SAME_TRACK_TITLE_THRESHOLD = 0.7;

/**
 * true si `a` y `b` parecen ser la misma canción pese a venir con metadata
 * distinta (título de video con decoraciones, canal "VEVO"/"- Topic" como
 * artista, prefijo "Artista - " dentro del título, etc.). Función pura.
 *
 * Diseñada para NO dar falsos positivos entre canciones distintas del mismo
 * artista: exige similitud alta de título tras limpiar ruido.
 */
export function looksLikeSameTrack(
  a: { title: string; artist: string },
  b: { title: string; artist: string },
): boolean {
  const artistA = stripChannelNoise(a.artist);
  const artistB = stripChannelNoise(b.artist);

  // ¿Artistas compatibles? Solape de tokens, igualdad compactada (DuaLipaVEVO)
  // o contención (colaboraciones: "Dua Lipa" ⊂ "Dua Lipa, Angèle").
  const ca = compact(artistA);
  const cb = compact(artistB);
  const artistsCompatible =
    (ca.length > 0 && ca === cb) ||
    overlapRatio(artistA, artistB) >= 0.5 ||
    (ca.length > 2 && cb.length > 2 && (ca.includes(cb) || cb.includes(ca)));

  const artists = [a.artist, artistA, b.artist, artistB];
  const titlesA = titleIdentityCandidates(a.title, artists);
  const titlesB = titleIdentityCandidates(b.title, artists);

  let bestTitle = 0;
  for (const ta of titlesA) {
    for (const tb of titlesB) {
      const score = titleSimilarity(ta, tb);
      if (score > bestTitle) bestTitle = score;
    }
  }
  if (bestTitle < SAME_TRACK_TITLE_THRESHOLD) return false;
  if (artistsCompatible) return true;

  // Artistas incompatibles (canal genérico): aceptar solo si el título "sucio"
  // de un lado EMBEBE artista+título del otro ("Artista - Canción (Video)").
  const embeds = (dirtyTitle: string, cleanTitle: string, cleanArtist: string): boolean => {
    const dirty = compact(dirtyTitle);
    const artist = compact(cleanArtist);
    const title = compact(stripDecorations(cleanTitle));
    return (
      artist.length > 2 && title.length > 1 && dirty.includes(artist) && dirty.includes(title)
    );
  };
  return embeds(a.title, b.title, artistB) || embeds(b.title, a.title, artistA);
}
