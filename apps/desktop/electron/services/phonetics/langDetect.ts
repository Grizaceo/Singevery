// ============================================================================
// langDetect.ts — identificación de idioma dentro del alfabeto latino.
//
// El resto de la app detecta SCRIPT (kana, hangul, cirílico…). Para el IPA de
// lenguas romances y del alemán eso no basta: español, italiano, francés,
// alemán, inglés y portugués comparten alfabeto. Este módulo decide CUÁL de
// ellos es, de forma determinista, offline y sin dependencias.
//
// Principio de diseño: PREFIERE NO RESPONDER antes que responder mal.
// Transcribir una canción inglesa con reglas españolas produce basura con
// aspecto de dato fiable, que es el peor resultado posible en una herramienta
// de aprendizaje. Por eso `detectLatinLanguage` exige puntaje mínimo Y ventaja
// sobre el segundo, y devuelve null si no se cumple.
//
// Inglés y portugués se modelan aunque NO tengan motor IPA: existen justamente
// para ganar la votación y provocar ese null.
// ============================================================================

/** Idiomas que el detector sabe distinguir. */
export type DetectedLang = 'es' | 'it' | 'fr' | 'de' | 'en' | 'pt';

/** Idiomas con motor IPA implementado. */
export type IpaLang = 'es' | 'it' | 'fr' | 'de';

export const IPA_LANGS: readonly IpaLang[] = ['es', 'it', 'fr', 'de'] as const;

/** ¿Este idioma detectado tiene motor IPA? */
export function hasIpaEngine(lang: DetectedLang | null): lang is IpaLang {
  return lang !== null && (IPA_LANGS as readonly string[]).includes(lang);
}

// ---------------------------------------------------------------------------
// Perfiles por idioma.
//
// Tres tipos de evidencia, con peso distinto:
//   - stop:   palabras funcionales frecuentes (y algunas de letra de canción).
//   - chars:  caracteres cuya sola presencia es casi decisiva.
//   - grams:  secuencias ortográficas típicas.
//
// Se cuentan evidencias DISTINTAS, no repeticiones: un estribillo repetido
// veinte veces no debe pesar veinte veces.
// ---------------------------------------------------------------------------

interface Profile {
  stop: readonly string[];
  chars: readonly string[];
  grams: readonly string[];
}

const PROFILES: Record<DetectedLang, Profile> = {
  es: {
    stop: [
      'que', 'de', 'la', 'el', 'y', 'no', 'en', 'un', 'una', 'por', 'con',
      'para', 'como', 'más', 'pero', 'ya', 'me', 'te', 'se', 'mi', 'tu', 'su',
      'los', 'las', 'del', 'al', 'es', 'son', 'está', 'estoy', 'soy', 'eres',
      'tengo', 'tiene', 'quiero', 'quiere', 'sé', 'ver', 'ir', 'sin', 'muy',
      'porque', 'cuando', 'donde', 'siempre', 'nunca', 'nada', 'todo', 'todos',
      'amor', 'corazón', 'vida', 'noche', 'cielo', 'mundo', 'voy', 'vas',
      'hoy', 'aquí', 'así', 'yo', 'él', 'ella', 'nos', 'ni', 'o',
    ],
    chars: ['ñ', '¿', '¡'],
    grams: ['ción', 'll', 'rr', 'ando', 'iendo', 'dad', 'qué', 'ía', 'áis'],
  },
  it: {
    stop: [
      'che', 'di', 'il', 'la', 'e', 'non', 'un', 'una', 'per', 'con', 'come',
      'più', 'ma', 'mi', 'ti', 'si', 'lo', 'le', 'gli', 'del', 'della', 'al',
      'alla', 'nel', 'nella', 'sono', 'sei', 'è', 'ho', 'hai', 'ha', 'voglio',
      'sempre', 'mai', 'niente', 'tutto', 'tutti', 'quando', 'dove', 'perché',
      'amore', 'cuore', 'vita', 'notte', 'cielo', 'mondo', 'io', 'tu', 'lei',
      'noi', 'anche', 'ancora', 'così', 'solo', 'senza', 'questo', 'quella',
    ],
    chars: ['ù', 'ì'],
    grams: ['gli', 'gn', 'zz', 'cch', 'sci', 'ggi', 'sce', 'tti', 'zione'],
  },
  fr: {
    stop: [
      'que', 'de', 'le', 'la', 'et', 'un', 'une', 'pour', 'avec', 'comme',
      'plus', 'mais', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'ne',
      'pas', 'des', 'les', 'du', 'au', 'aux', 'est', 'sont', 'suis', 'es',
      'ai', 'as', 'veux', 'veut', 'toujours', 'jamais', 'rien', 'tout', 'tous',
      'quand', 'où', 'parce', 'amour', 'coeur', 'cœur', 'vie', 'nuit', 'ciel',
      'monde', 'moi', 'toi', 'sans', 'dans', 'sur', 'très', 'être', 'faire',
    ],
    chars: ['ç', 'œ', 'ê', 'â', 'î', 'û', 'è'],
    grams: ['eau', 'oux', 'eux', 'ais', 'ait', 'oi', 'ent', 'ez', 'aient'],
  },
  de: {
    stop: [
      'und', 'der', 'die', 'das', 'ich', 'du', 'er', 'sie', 'wir', 'ihr',
      'nicht', 'ein', 'eine', 'einen', 'mit', 'für', 'auf', 'aus', 'von',
      'zu', 'im', 'am', 'ist', 'sind', 'bin', 'bist', 'war', 'hat', 'habe',
      'hast', 'wird', 'kann', 'will', 'mich', 'dich', 'sich', 'mir', 'dir',
      'wenn', 'wie', 'was', 'wo', 'immer', 'nie', 'nichts', 'alles', 'nur',
      'liebe', 'herz', 'leben', 'nacht', 'himmel', 'welt', 'noch', 'schon',
      'aber', 'auch', 'so', 'es', 'den', 'dem',
    ],
    chars: ['ß', 'ä', 'ö'],
    grams: ['sch', 'ung', 'ich', 'cht', 'tz', 'eit', 'lich', 'chen', 'ck'],
  },
  en: {
    stop: [
      'the', 'and', 'you', 'i', 'is', 'to', 'of', 'in', 'it', 'that', 'my',
      'me', 'we', 'be', 'do', 'don', 'can', 'will', 'just', 'like', 'know',
      'love', 'baby', 'never', 'always', 'were', 'was', 'are', 'your', 'all',
      'not', 'but', 'with', 'for', 'this', 'they', 'have', 'got', 'get',
      'want', 'need', 'feel', 'heart', 'night', 'time', 'girl', 'boy', 'oh',
      'yeah', 'gonna', 'wanna', 'ain', 'she', 'he', 'him', 'her', 'them',
    ],
    chars: [],
    grams: ['ing', 'th', 'wh', 'sh', 'ough', 'igh', 'ck', 'ay', 'ee'],
  },
  pt: {
    stop: [
      'que', 'de', 'o', 'a', 'e', 'não', 'um', 'uma', 'para', 'com', 'como',
      'mais', 'mas', 'eu', 'você', 'ele', 'ela', 'nós', 'meu', 'minha', 'seu',
      'os', 'as', 'do', 'da', 'no', 'na', 'é', 'são', 'está', 'sou', 'tem',
      'quero', 'sempre', 'nunca', 'nada', 'tudo', 'quando', 'onde', 'porque',
      'amor', 'coração', 'vida', 'noite', 'céu', 'mundo', 'muito', 'já',
      'também', 'aqui', 'assim', 'ser', 'ter', 'fazer', 'até', 'pelo',
    ],
    chars: ['ã', 'õ'],
    grams: ['ção', 'ões', 'lh', 'nh', 'ão', 'inho', 'mente', 'ss'],
  },
};

const W_STOP = 3;
const W_CHAR = 4;
const W_GRAM = 2;

/**
 * Puntaje mínimo del ganador. Por debajo de esto la muestra es demasiado corta
 * o demasiado ambigua (interjecciones, scat, "na na na") para arriesgar.
 */
const MIN_SCORE = 12;

/** Ventaja mínima sobre el segundo. 1.4 = el ganador saca un 40 % más. */
const MIN_RATIO = 1.4;

const TOKEN_RE = /[a-zà-öø-ÿœ]+/g;

/**
 * Puntúa cada idioma sobre el texto dado. Exportada para poder inspeccionarla
 * en los tests y en diagnósticos: si una canción se detecta mal, esto dice por
 * qué.
 */
export function scoreLanguages(text: string): Record<DetectedLang, number> {
  const lower = text.toLowerCase();
  const tokens = new Set(lower.match(TOKEN_RE) ?? []);

  const scores = {} as Record<DetectedLang, number>;
  for (const lang of Object.keys(PROFILES) as DetectedLang[]) {
    const profile = PROFILES[lang];
    let score = 0;
    for (const word of profile.stop) if (tokens.has(word)) score += W_STOP;
    for (const ch of profile.chars) if (lower.includes(ch)) score += W_CHAR;
    for (const gram of profile.grams) if (lower.includes(gram)) score += W_GRAM;
    scores[lang] = score;
  }
  return scores;
}

/**
 * Decide el idioma de una canción a partir de todas sus líneas.
 *
 * Devuelve null cuando no hay evidencia suficiente, cuando el ganador no saca
 * ventaja clara al segundo, o cuando el ganador es un idioma sin motor IPA
 * (inglés, portugués). null significa "no anotes IPA", no "es inglés".
 */
export function detectLatinLanguage(lines: readonly string[]): IpaLang | null {
  const text = lines.join('\n').trim();
  if (!text) return null;

  const scores = scoreLanguages(text);
  const ranked = (Object.entries(scores) as [DetectedLang, number][]).sort(
    (a, b) => b[1] - a[1],
  );

  const [winner, winnerScore] = ranked[0];
  const runnerUpScore = ranked[1]?.[1] ?? 0;

  if (winnerScore < MIN_SCORE) return null;
  if (runnerUpScore > 0 && winnerScore < runnerUpScore * MIN_RATIO) return null;
  if (!hasIpaEngine(winner)) return null;

  return winner;
}
