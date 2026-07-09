import type { LyricsQuery } from './types';

const SPACE_RE = /\s+/g;
const FEAT_SUFFIX_RE =
  /\s*[([\-–—,]\s*(feat|featuring|ft|con)\.?\s+[^)\]]+[)\]]?\s*$/i;
const DECORATION_RE =
  /\s*[([\-–—]\s*(en vivo|live|remaster(?:ed|izado)?(?:\s+\d{4})?|version|versi[oó]n|edit|radio edit|album version|mono|stereo|bonus track|deluxe|ac[uú]stic[ao]?|acoustic|karaoke)\s*[)\]]?\s*$/i;

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
    const next = out.replace(FEAT_SUFFIX_RE, '').replace(DECORATION_RE, '').trim();
    if (next !== out) {
      out = next;
      changed = true;
    }
  }
  return out;
}

function stripArtistPrefix(title: string, artist: string): string {
  const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
  if (!escapedArtist) return title.trim();
  return title.replace(new RegExp(`^\\s*${escapedArtist}\\s*[-–—:]\\s*`, 'i'), '').trim();
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

  return variants;
}
