// ============================================================================
// titleDistinctiveness.ts — ¿qué tan identificable es un título por sí solo?
//
// El SMTC de Windows entrega el título de la sesión de medios. A veces ese
// título ALCANZA para saber qué suena ("Bohemian Rhapsody", "過去を喰らう") y a
// veces no: "Awake", "Alone", "Lucky Star" existen decenas de veces en el
// catálogo y además son títulos típicos de uploads mal etiquetados.
//
// Regla que implementa este módulo: un título GENÉRICO nunca puede lockear la
// pista — solo vale como pista (hint) que el reconocimiento por audio confirma
// o descarta. Un título DISTINTIVO sí puede.
//
// Heurísticas (todas locales, función pura):
//   - longitud en palabras: una frase larga es casi única aunque sus palabras
//     no lo sean ("Never Gonna Give You Up");
//   - alfabeto: kana/kanji/hangul concentran mucha más información por
//     carácter que el ASCII, y casi nunca aparecen en títulos genéricos;
//   - entropía de caracteres: la variedad delata nombres propios y palabras
//     raras frente a repeticiones vacías;
//   - palabras comunes: penalizan, pero cada vez menos según crece la frase.
// ============================================================================

/** Bajo este puntaje el título no puede lockear la pista. */
export const DISTINCTIVE_TITLE_THRESHOLD = 0.5;

/**
 * Vocabulario de alta frecuencia (en/es) + palabras que aparecen en títulos
 * genéricos. No pretende ser un diccionario: solo marcar lo que NO distingue.
 */
const COMMON_WORDS = new Set([
  // inglés funcional y de alta frecuencia
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at', 'by',
  'for', 'with', 'from', 'up', 'down', 'out', 'off', 'over', 'again', 'all',
  'i', 'me', 'my', 'you', 'your', 'we', 'us', 'he', 'she', 'it', 'they', 'them',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'do', 'don', 'dont', 'can',
  'will', 'would', 'never', 'not', 'no', 'yes', 'so', 'just', 'now', 'then',
  'go', 'going', 'gonna', 'come', 'get', 'got', 'give', 'take', 'make', 'let',
  'know', 'want', 'need', 'feel', 'say', 'tell', 'see', 'look', 'stay', 'run',
  // sustantivos/adjetivos omnipresentes en títulos
  'love', 'heart', 'life', 'time', 'night', 'day', 'sun', 'moon', 'star', 'stars',
  'sky', 'rain', 'fire', 'light', 'dark', 'home', 'way', 'dream', 'dreams',
  'girl', 'boy', 'man', 'woman', 'baby', 'god', 'world', 'song', 'music',
  'alone', 'awake', 'alive', 'free', 'lost', 'gone', 'blue', 'red', 'black',
  'white', 'gold', 'new', 'old', 'good', 'bad', 'happy', 'sad', 'lucky', 'true',
  'one', 'two', 'three', 'first', 'last', 'only', 'more', 'less', 'forever',
  'again', 'still', 'always', 'maybe', 'why', 'how', 'what', 'who', 'where',
  // español
  'el', 'la', 'los', 'las', 'un', 'una', 'y', 'o', 'de', 'del', 'que', 'en',
  'con', 'sin', 'por', 'para', 'mi', 'tu', 'su', 'yo', 'te', 'me', 'se', 'nos',
  'amor', 'vida', 'noche', 'dia', 'sol', 'luna', 'cielo', 'mar', 'corazon',
  'tiempo', 'solo', 'sola', 'nunca', 'siempre', 'todo', 'nada', 'mas', 'bien',
  'sueno', 'suenos', 'fuego', 'agua', 'casa', 'ella', 'el',
]);

/** Kana, kanji, hangul, bopomofo: alfabetos de alta densidad informativa. */
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯㄀-ㄯ]/gu;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '');
}

/** Palabras ASCII normalizadas (las de alfabetos CJK se cuentan aparte). */
function asciiWords(title: string): string[] {
  return stripDiacritics(title)
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/'/g, ''))
    .filter((word) => word.length > 0);
}

/** Entropía de Shannon en bits por carácter (variedad del texto). */
export function charEntropyBits(value: string): number {
  const chars = [...value.toLowerCase().replace(/\s+/g, '')];
  if (chars.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of chars) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / chars.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** Base por cantidad de palabras: una frase larga ya es casi única. */
function wordCountBase(count: number): number {
  if (count <= 0) return 0.1;
  if (count === 1) return 0.18;
  if (count === 2) return 0.42;
  if (count === 3) return 0.6;
  if (count === 4) return 0.72;
  return 0.8;
}

/**
 * Puntúa 0..1 cuán identificable es un título por sí mismo.
 * 0 = inútil ("", "1"), ~0.1-0.3 = genérico ("Alone", "Lucky Star"),
 * ≥0.5 = distintivo ("Bohemian Rhapsody", "アイドル").
 */
export function scoreTitleDistinctiveness(title: string): number {
  const trimmed = (title ?? '').trim();
  if (!trimmed) return 0;

  const compact = trimmed.replace(/\s+/g, '');
  const cjkChars = (trimmed.match(CJK_RE) ?? []).length;
  const words = asciiWords(trimmed);

  // Un par de caracteres nunca identifica nada, sea cual sea el alfabeto.
  if (compact.length <= 2 && cjkChars < 2) return clamp01(compact.length * 0.03);

  let score: number;
  if (cjkChars >= 2) {
    // Escritura japonesa/china/coreana: cada carácter carga mucha más
    // información y prácticamente no aparece en títulos genéricos ASCII.
    score = 0.5 + Math.min(0.3, cjkChars * 0.05);
  } else {
    score = wordCountBase(words.length);
  }

  // Variedad de caracteres: nombres propios y palabras raras la suben.
  const entropy = charEntropyBits(trimmed);
  score += clamp01((entropy - 2.5) / 2) * 0.12;

  // Títulos largos son difíciles de colisionar.
  if (compact.length >= 25) score += 0.08;

  if (words.length > 0) {
    const commonCount = words.filter((word) => COMMON_WORDS.has(word)).length;
    const commonRatio = commonCount / words.length;
    // La penalización se diluye al crecer la frase: cinco palabras comunes
    // seguidas ("Never Gonna Give You Up") sí identifican una canción.
    const penalty = (0.6 * commonRatio) / Math.max(1, words.length - 1);
    score *= 1 - penalty;

    // Una palabra larga fuera del vocabulario común sugiere nombre propio.
    if (words.some((word) => word.length >= 7 && !COMMON_WORDS.has(word))) {
      score += 0.12;
    }
    // Puro número ("1", "2024") no identifica nada.
    if (words.every((word) => /^\d+$/.test(word)) && cjkChars === 0) {
      score = Math.min(score, 0.1);
    }
  }

  return clamp01(score);
}

/**
 * true si el título alcanza para lockear la pista sin confirmación por audio.
 * Los genéricos se usan solo como hint.
 */
export function isDistinctiveTitle(
  title: string,
  threshold: number = DISTINCTIVE_TITLE_THRESHOLD,
): boolean {
  return scoreTitleDistinctiveness(title) >= threshold;
}
