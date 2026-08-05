// ============================================================================
// coverTitle.ts — recuperación del ORIGINAL detrás de un título de cover/MV.
//
// El problema: casi todo lo que suena por el navegador llega con el título del
// video, no con el de la canción. Los catálogos de letras (LRCLIB, NetEase)
// indexan la versión ORIGINAL, así que buscar el título literal del upload
// falla:
//
//   「アイドル / YOASOBI【歌ってみた】」        → catálogo: アイドル — YOASOBI
//   "Lemon (Cover by 花譜)"                     → catálogo: Lemon — 米津玄師
//   "Creep - Radiohead (MV)"                    → catálogo: Creep — Radiohead
//
// Dos artistas distintos viven en un título de cover y NO son intercambiables:
//   - el ORIGINAL (quien compuso/estrenó) → es bajo quien está la letra;
//   - el INTÉRPRETE del cover             → NO sirve para buscar la letra.
// Confundirlos es peor que no extraer nada, así que se devuelven separados y
// solo el original se usa como pista de búsqueda.
//
// Función PURA, sin red: se ejecuta antes de armar las variantes de query.
// ============================================================================

export interface CoverTitleParse {
  /** Título limpio (sin marcas de cover/MV ni cola de artista). */
  clean: string;
  /** Artista ORIGINAL si el título lo revela con confianza. Sirve para buscar. */
  artist?: string;
  /** Quién interpreta esta versión. NUNCA se usa para buscar la letra. */
  coverArtist?: string;
  /** true si había marca explícita de COVER (歌ってみた, "cover by", カバー). */
  isCover: boolean;
  /** true si era un video musical ("(MV)", "Official Music Video"). */
  isVideo: boolean;
}

/**
 * Palabras que, seguidas de "version/ver.", describen un ARREGLO y no a una
 * persona: "Acoustic Version" no significa que el artista sea "Acoustic".
 */
const VERSION_QUALIFIERS = new Set([
  'acoustic', 'acustica', 'acustico', 'live', 'en vivo', 'studio', 'album', 'single',
  'radio', 'extended', 'short', 'full', 'tv', 'anime', 'movie', 'game', 'original',
  'remix', 'remaster', 'remastered', 'demo', 'deluxe', 'piano', 'guitar', 'band',
  'orchestral', 'orchestra', 'instrumental', 'karaoke', 'off vocal', 'inst',
  'english', 'spanish', 'japanese', 'korean', 'chinese', 'latin', 'slowed',
  'sped up', 'nightcore', 'male', 'female', 'solo', 'duet', 'clean', 'explicit',
  'cover', 'special', 'new', 'old', 'final', 'long', 'edit', 'mix', 'self',
]);

/** Marcas de cover en cualquier alfabeto. */
const COVER_MARKER_RE =
  /(?:\bcover(?:ed)?\b|\bcovered\s+by\b|カバー|歌ってみた|うたってみた|唄ってみた|翻唱|커버|불러봤|\bcover\s*ver\.?)/i;

/** Marcas de video musical (sin cover): el título es el bueno, sobra el adorno. */
const MV_MARKER_RE = /(?:\bm\/?v\b|music\s*video|ミュージックビデオ|뮤직비디오)/i;

/**
 * Adornos entre paréntesis/corchetes en CUALQUIER posición. El limpiador de
 * normalizeQuery solo corta al FINAL, y en los títulos de covers el adorno va
 * al principio ("【歌ってみた】Canción") o en medio.
 */
const BRACKET_NOISE_RE =
  /[([{【「『〔]\s*(?:m\/?v|music\s*video|official\s*(?:music\s*)?(?:video|audio)|cover(?:ed)?(?:\s*ver\.?)?|カバー|歌ってみた|うたってみた|唄ってみた|翻唱|커버|full\s*ver\.?|short\s*ver\.?|off\s*vocal|inst\.?|instrumental|フル|ショート)\s*[)\]}】」』〕]/gi;

/** "covered by X", "cover by X", "Cover: X", "カバー：X". */
const COVERED_BY_RE =
  /(?:cover(?:ed)?\s*(?:by|:|：)|カバー\s*(?:by|:|：)|翻唱\s*(?:by|:|：))\s*([^)\]}】」』|/、,]+)/i;

/** Cola "- Artista Version" / "- Artista Ver." */
const VERSION_TAIL_RE = /[\s]*[-–—]\s*([^-–—()[\]{}]{2,40}?)\s+(?:versi[oó]n|version|ver\.?|バージョン)\s*$/i;

/** Cola "(Original: X)" / "[原曲: X]" — el original explícito. */
const ORIGINAL_TAIL_RE =
  /[([{【「]\s*(?:original|orig\.?|原曲|원곡)\s*(?:song)?\s*[:：]?\s*([^)\]}】」]{2,40}?)\s*[)\]}】」]/i;

const SPACE_RE = /\s+/g;

function collapse(value: string): string {
  return value
    .replace(SPACE_RE, ' ')
    // Separadores que quedaron huérfanos al quitar un trozo del medio/extremo.
    .replace(/^[\s|/·・,、\-–—:：]+/, '')
    .replace(/[\s|/·・,、\-–—:：]+$/, '')
    .trim();
}

/** Limpia un nombre de artista extraído: sufijos de canal, honoríficos JP. */
function cleanArtistName(value: string): string {
  return collapse(
    value
      .replace(/\b(?:ch\.?|channel|official|oficial|vevo)\b/gi, ' ')
      .replace(/[（(【[][^)）\]】]*[)）\]】]/g, ' ')
      .replace(/さん$|ちゃん$|くん$/u, ''),
  );
}

/** Un candidato a artista debe parecer un nombre, no una frase suelta. */
function looksLikeArtist(value: string): boolean {
  const v = value.trim();
  if (v.length < 2 || v.length > 40) return false;
  // Frases largas no son nombres (el lado equivocado de un slash de título).
  if (v.split(SPACE_RE).filter(Boolean).length > 6) return false;
  // "Version", "Official Video" y compañía no son artistas.
  if (/^(?:official|oficial|video|audio|lyrics?|letra|full|short|inst|instrumental|karaoke)$/i.test(v)) {
    return false;
  }
  return true;
}

/**
 * Descompone el título de un upload (cover, MV, "歌ってみた") en el título de
 * la canción y, si se puede, el artista ORIGINAL bajo el que está catalogada
 * la letra.
 *
 * Conservadora por diseño: ante la duda devuelve el título limpio SIN artista.
 * Un artista equivocado envenena la búsqueda; uno ausente solo la deja igual
 * que antes.
 */
export function extractCoverOriginal(title: string): CoverTitleParse {
  const raw = (title ?? '').trim();
  if (!raw) return { clean: '', isCover: false, isVideo: false };

  const isCover = COVER_MARKER_RE.test(raw);
  const hasMv = MV_MARKER_RE.test(raw);
  let work = raw;
  let artist: string | undefined;
  let coverArtist: string | undefined;

  // 1. "(Original: X)" — la señal más fuerte y la menos ambigua.
  const original = work.match(ORIGINAL_TAIL_RE);
  if (original?.[1]) {
    const candidate = cleanArtistName(original[1]);
    if (looksLikeArtist(candidate)) artist = candidate;
    work = work.replace(ORIGINAL_TAIL_RE, ' ');
  }

  // 2. "covered by X" → X es el INTÉRPRETE, no el original. Se extrae para
  //    quitarlo del título (y para diagnóstico), nunca para buscar.
  const covered = work.match(COVERED_BY_RE);
  if (covered?.[1]) {
    const candidate = cleanArtistName(covered[1]);
    if (looksLikeArtist(candidate)) coverArtist = candidate;
    work = work.replace(COVERED_BY_RE, ' ');
  }

  // 3. Adornos entre corchetes en cualquier posición: (MV), 【歌ってみた】, [cover].
  work = work.replace(BRACKET_NOISE_RE, ' ');
  // Corchetes que quedaron vacíos tras sacarles el contenido.
  work = work.replace(/[([{【「『〔]\s*[)\]}】」』〕]/g, ' ');
  work = collapse(work);

  // 4. Convención "Canción / Artista" (dominante en YouTube japonés). Exige
  //    espacio alrededor de la barra: así "AC/DC" y "24/7" quedan intactos.
  if (!artist) {
    const slash = work.match(/^(.+?)\s+\/\s+(.+)$/);
    if (slash) {
      const left = collapse(slash[1]);
      const right = cleanArtistName(slash[2]);
      if (left.length >= 2 && looksLikeArtist(right)) {
        work = left;
        // Si el intérprete del cover ya se conoce y coincide con el lado
        // derecho, ese lado NO es el original: es quien lo cantó.
        if (!coverArtist || cleanArtistName(right) !== coverArtist) artist = right;
      }
    }
  }

  // 5. Cola "- X Version": solo si X parece un nombre y no un arreglo.
  const versionTail = work.match(VERSION_TAIL_RE);
  if (versionTail?.[1]) {
    const candidate = cleanArtistName(versionTail[1]);
    const qualifier = candidate.toLowerCase();
    if (!VERSION_QUALIFIERS.has(qualifier) && looksLikeArtist(candidate)) {
      if (!artist) artist = candidate;
      work = collapse(work.replace(VERSION_TAIL_RE, ' '));
    } else if (VERSION_QUALIFIERS.has(qualifier)) {
      // "(Acoustic Version)": no hay artista, pero la cola sobra igual.
      work = collapse(work.replace(VERSION_TAIL_RE, ' '));
    }
  }

  // 6. Marca de cover suelta que no venía entre corchetes ("Lemon cover").
  work = collapse(
    work.replace(/\s*[-–—|]?\s*\b(?:cover(?:ed)?(?:\s*ver\.?)?)\b\s*$/i, ' '),
  );

  const clean = collapse(work) || raw;
  return {
    clean,
    ...(artist ? { artist } : {}),
    ...(coverArtist ? { coverArtist } : {}),
    isCover,
    isVideo: hasMv,
  };
}
