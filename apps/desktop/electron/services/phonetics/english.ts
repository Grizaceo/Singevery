// ============================================================================
// english.ts — conversor diccionario → IPA para inglés (EE. UU.).
//
// A diferencia de los motores romances, el inglés no se transcribe por
// reglas: se consulta CMUdict (vía el paquete cmu-pronouncing-dictionary,
// ~4,7 MB de ARPAbet) y se convierte fonema a fonema. Por eso este módulo
// tiene estado: el diccionario se carga PEREZOSAMENTE con
// `loadEnglishDictionary()` (await import dentro de una función async,
// nunca en el tope del módulo) la primera vez que hace falta.
//
// Convenciones fijadas:
//   - Inglés general ESTADOUNIDENSE: R es /ɹ/, T intervocálica sigue siendo
//     /t/ (sin flap), las vocales son las del diccionario.
//   - Marca de acento de diccionario: ˈ primario y ˌ secundario delante del
//     ataque de la sílaba (el sufijo más largo del grupo consonántico previo
//     a la vocal que sea un ataque legal del inglés). Solo en palabras con
//     ≥2 vocales; en palabra llana se marca solo la primera.
//   - Palabra fuera del diccionario (OOV): se devuelve TAL CUAL. Es mejor un
//     "skrrt" sin transcribir que una invención con aspecto de dato fiable.
//   - "runnin'" → se busca "running" y el ŋ final pasa a n (la -in' cantada).
//   - Variantes "word(2)" del diccionario: se usa la primera pronunciación.
// ============================================================================

import { mapWords } from './shared';

/** Diccionario ARPAbet cargado (null hasta que loadEnglishDictionary resuelve). */
let dictionary: Record<string, string> | null = null;
let loadingPromise: Promise<void> | null = null;

/**
 * Carga perezosa del diccionario CMU. Idempotente: llamadas concurrentes
 * comparten la misma importación. Si falla, la promesa se descarta para que
 * la próxima canción pueda reintentarlo.
 */
export async function loadEnglishDictionary(): Promise<void> {
  if (dictionary) return;
  if (!loadingPromise) {
    loadingPromise = (async () => {
      const mod = await import('cmu-pronouncing-dictionary');
      dictionary = mod.dictionary;
    })();
  }
  try {
    await loadingPromise;
  } catch (err) {
    loadingPromise = null;
    throw err;
  }
}

/** ¿Está el diccionario en memoria? (englishToIpa devuelve '' si no lo está). */
export function isEnglishDictionaryLoaded(): boolean {
  return dictionary !== null;
}

/** Solo para tests: inyecta un diccionario de prueba o descarga el real. */
export function __setEnglishDictionaryForTests(dict: Record<string, string> | null): void {
  dictionary = dict;
  loadingPromise = null;
}

// ---------------------------------------------------------------------------
// ARPAbet → IPA
// ---------------------------------------------------------------------------

/** Consonantes ARPAbet → IPA (inglés general estadounidense). */
const CONS_IPA: Record<string, string> = {
  B: 'b',
  CH: 'tʃ',
  D: 'd',
  DH: 'ð',
  F: 'f',
  G: 'ɡ',
  HH: 'h',
  JH: 'dʒ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  P: 'p',
  R: 'ɹ',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ',
};

/**
 * Vocales ARPAbet → IPA. AH y ER dependen del acento: la vocal reducida
 * (estrés 0) es schwa /ə/ y el r coloreado /ɚ/; con acento son /ʌ/ y /ɝ/.
 */
const VOWEL_IPA: Record<string, string> = {
  AA: 'ɑ',
  AE: 'æ',
  AO: 'ɔ',
  AW: 'aʊ',
  AY: 'aɪ',
  EH: 'ɛ',
  EY: 'eɪ',
  IH: 'ɪ',
  IY: 'i',
  OW: 'oʊ',
  OY: 'ɔɪ',
  UH: 'ʊ',
  UW: 'u',
};

function vowelIpa(base: string, stress: number): string {
  if (base === 'AH') return stress === 0 ? 'ə' : 'ʌ';
  if (base === 'ER') return stress === 0 ? 'ɚ' : 'ɝ';
  return VOWEL_IPA[base] ?? base;
}

interface Phone {
  /** Símbolo IPA del fonema. */
  ipa: string;
  /** ¿Es vocal? (en ARPAbet las vocales llevan dígito de acento). */
  vowel: boolean;
  /** Nivel de acento: 0 ninguna, 1 primaria, 2 secundaria. */
  stress: number;
  /** Símbolo ARPAbet (para detectar ataques legales). */
  arpabet: string;
}

function parseArpabet(arpabet: string): Phone[] {
  return arpabet
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const vowel = /[012]$/.test(token);
      if (vowel) {
        const base = token.slice(0, -1);
        const stress = Number(token[token.length - 1]);
        return { ipa: vowelIpa(base, stress), vowel: true, stress, arpabet: base };
      }
      return { ipa: CONS_IPA[token] ?? token.toLowerCase(), vowel: false, stress: 0, arpabet: token };
    });
}

/**
 * Ataques (onsets) legales del inglés en símbolos ARPAbet: cualquier
 * consonante simple salvo NG (la ŋ nunca abre sílaba) y los grupos de la
 * lista. Se usa para decidir dónde cae la marca de acento.
 */
const SIMPLE_ONSETS = [
  'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N', 'P', 'R',
  'S', 'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH',
];
const CLUSTER_ONSETS = [
  'P R', 'P L', 'B R', 'B L', 'T R', 'D R', 'K R', 'K L', 'G R', 'G L',
  'F R', 'F L', 'TH R', 'SH R',
  'S P', 'S T', 'S K', 'S M', 'S N', 'S L', 'S W',
  'T W', 'K W', 'D W', 'G W',
  'P Y', 'B Y', 'F Y', 'V Y', 'M Y', 'K Y', 'HH Y',
  'S P R', 'S P L', 'S T R', 'S K R', 'S K W', 'S K Y',
];
const ONSETS = new Set([...SIMPLE_ONSETS, ...CLUSTER_ONSETS]);

/**
 * Índice de fonema delante del cual va la marca de acento de la vocal en
 * `vowelIdx`: el sufijo más largo del grupo consonántico previo que sea un
 * ataque legal. Si no hay consonantes (o ninguna combinación legal), la marca
 * va justo delante de la vocal.
 */
function stressMarkIndex(phones: Phone[], vowelIdx: number): number {
  let groupStart = vowelIdx;
  while (groupStart > 0 && !phones[groupStart - 1].vowel) groupStart--;
  const groupLen = vowelIdx - groupStart;
  for (let len = groupLen; len >= 1; len--) {
    const candidate = phones
      .slice(vowelIdx - len, vowelIdx)
      .map((p) => p.arpabet)
      .join(' ');
    if (ONSETS.has(candidate)) return vowelIdx - len;
  }
  return vowelIdx;
}

/** Convierte los fonemas ARPAbet en la cadena IPA con marcas ˈ/ˌ. */
function phonesToIpa(phones: Phone[]): string {
  const vowelCount = phones.reduce((n, p) => n + (p.vowel ? 1 : 0), 0);
  const firstVowelIdx = phones.findIndex((p) => p.vowel);
  // marks[i] = marca a insertar delante del fonema i.
  const marks = new Map<number, string>();
  if (vowelCount >= 2) {
    phones.forEach((p, idx) => {
      if (!p.vowel || p.stress === 0) return;
      const mark = p.stress === 1 ? 'ˈ' : 'ˌ';
      // Estrés en la primera vocal de la palabra: la marca va al inicio.
      marks.set(idx === firstVowelIdx ? 0 : stressMarkIndex(phones, idx), mark);
    });
  }

  let out = '';
  phones.forEach((p, idx) => {
    const mark = marks.get(idx);
    if (mark) out += mark;
    out += p.ipa;
  });
  return out;
}

/** Búsqueda en el diccionario con las variantes declaradas en la cabecera. */
function lookup(word: string): { arpabet?: string; dropFinalNg?: boolean } {
  if (!dictionary) return {};
  // Apóstrofo tipográfico → recto, minúsculas. NO se quitan los apóstrofos:
  // 'cause, don't e i'm son entradas reales del diccionario.
  const normalized = word.toLowerCase().replace(/’/g, "'");
  // Variantes "word(2)": CMUdict lista pronunciaciones alternativas así.
  const key = normalized.replace(/\(\d+\)$/, '');
  if (Object.hasOwn(dictionary, key)) return { arpabet: dictionary[key] };

  // -in' cantada (runnin', somethin'): se busca la forma completa en -ing y
  // la ŋ final se relaja a n en el IPA resultante.
  if (key.endsWith("in'")) {
    const full = `${key.slice(0, -3)}ing`;
    if (Object.hasOwn(dictionary, full)) {
      return { arpabet: dictionary[full], dropFinalNg: true };
    }
  }

  // Sin apóstrofos iniciales/finales (''til, rock 'n' roll → 'n' queda OOV).
  const stripped = key.replace(/^['’]+|['’]+$/g, '');
  if (stripped && stripped !== key && Object.hasOwn(dictionary, stripped)) {
    return { arpabet: dictionary[stripped] };
  }
  return {};
}

function wordToIpa(word: string): string {
  const found = lookup(word);
  // OOV: la palabra pasa tal cual (con su mayúscula original).
  if (!found.arpabet) return word;
  let ipa = phonesToIpa(parseArpabet(found.arpabet));
  if (found.dropFinalNg && ipa.endsWith('ŋ')) ipa = `${ipa.slice(0, -1)}n`;
  return ipa;
}

/**
 * Transcribe una línea de letra inglesa a IPA.
 *
 * SÍNCRONA pero depende del estado: si `loadEnglishDictionary()` no se ha
 * ejecutado (o falló), devuelve '' y quien llama decide no anotar. Solo
 * transforma palabras; puntuación, espacios y dígitos quedan intactos.
 *
 * NOTA: no usa `normalizeWord` de ./shared porque ese helper elimina los
 * apóstrofos y aquí son parte de la entrada del diccionario ('cause, i'm).
 */
export function englishToIpa(text: string): string {
  if (!dictionary || !text.trim()) return '';
  return mapWords(text, wordToIpa);
}
