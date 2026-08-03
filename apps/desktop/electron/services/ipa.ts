// ============================================================================
// ipa.ts — Conversor kana → IPA (Fase 1, determinista).
//
// Reglas deterministas sobre el kana que YA produce kuroshiro (kanji→kana
// resuelto). Sin red, sin dependencias, función pura y síncrona.
//
// Convenciones fijadas en docs/PLAN_IPA_2026-08-03.md:
//   - Palatalización yōon: /kʲa/ (con ʲ), no /kja/.
//   - ざ/ず/ぜ/ぞ: /dz/ (convención NHK), no /z/.
//   - ん: /m/ antes de p,b; /n/ antes de t,d,n; /ŋ/ antes de k,g;
//     /ɲ/ antes de palatales (ɕ/tɕ/dʑ/ʲ); /ɴ/ final o ante vocal.
//   - を: /o/ (partícula; kuromoji la resuelve a お en la práctica).
//   - Chōon: ー /ː/; おう/おお → /oː/; えい → /eː/; vocales repetidas → larga.
//     (ortográfico, no morfológico — documentado: おもう → oːmoː)
//   - Sokuon っ: geminación duplicando la 1ª letra de la consonante siguiente
//     (いっち → ittɕi, いっし → iɕɕi); ante vocal o final → /ʔ/.
//   - Katakana extranjero: ヴァ→va, ティ→ti, ファ→ɸa, シェ→ɕe, …
//   - Caracteres NO kana (latín, kanji, emoji, puntuación): pasan INTACTOS.
// ============================================================================

/** Tipo de segmento furigana (contrato compartido con romanize.ts). */
export interface FuriganaSegment {
  base: string;
  rt?: string;
}

type Unit =
  | { kind: 'mora'; ipa: string }
  | { kind: 'n' }
  | { kind: 'sokuon' }
  | { kind: 'choon' }
  | { kind: 'raw'; text: string };

// ---------------------------------------------------------------------------
// Tabla exhaustiva de moras (hiragana; katakana se normaliza antes).
// ---------------------------------------------------------------------------

const MORA = new Map<string, string>([
  // Vocales
  ['あ', 'a'], ['い', 'i'], ['う', 'ɯ'], ['え', 'e'], ['お', 'o'],
  ['ぁ', 'a'], ['ぃ', 'i'], ['ぅ', 'ɯ'], ['ぇ', 'e'], ['ぉ', 'o'],
  // Gojūon
  ['か', 'ka'], ['き', 'ki'], ['く', 'kɯ'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'ɕi'], ['す', 'sɯ'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'tɕi'], ['つ', 'tsɯ'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ɲi'], ['ぬ', 'nɯ'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'çi'], ['ふ', 'ɸɯ'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mɯ'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ja'], ['ゆ', 'jɯ'], ['よ', 'jo'],
  ['ら', 'ɾa'], ['り', 'ɾi'], ['る', 'ɾɯ'], ['れ', 'ɾe'], ['ろ', 'ɾo'],
  ['わ', 'ɰa'], ['を', 'o'],
  // Yōon simples (ya/yu/yo solos)
  ['ゃ', 'ja'], ['ゅ', 'jɯ'], ['ょ', 'jo'], ['ゎ', 'ɰa'],
  // Dakuon / handakuon
  ['が', 'ɡa'], ['ぎ', 'ɡi'], ['ぐ', 'ɡɯ'], ['げ', 'ɡe'], ['ご', 'ɡo'],
  ['ざ', 'dza'], ['じ', 'dʑi'], ['ず', 'dzɯ'], ['ぜ', 'dze'], ['ぞ', 'dzo'],
  ['だ', 'da'], ['ぢ', 'dʑi'], ['づ', 'dzɯ'], ['で', 'de'], ['ど', 'do'],
  ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bɯ'], ['べ', 'be'], ['ぼ', 'bo'],
  ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pɯ'], ['ぺ', 'pe'], ['ぽ', 'po'],
  // Raros (test adversarial)
  ['ゐ', 'i'], ['ゑ', 'e'],
  // ヴ (katakana vu) — hiragana equivalente ゔ
  ['ゔ', 'vɯ'],
  // Yōon (kana + ゃゅょ)
  ['きゃ', 'kʲa'], ['きゅ', 'kʲɯ'], ['きょ', 'kʲo'],
  ['しゃ', 'ɕa'], ['しゅ', 'ɕɯ'], ['しょ', 'ɕo'],
  ['ちゃ', 'tɕa'], ['ちゅ', 'tɕɯ'], ['ちょ', 'tɕo'],
  ['にゃ', 'ɲa'], ['にゅ', 'ɲɯ'], ['にょ', 'ɲo'],
  ['ひゃ', 'ça'], ['ひゅ', 'çɯ'], ['ひょ', 'ço'],
  ['みゃ', 'mʲa'], ['みゅ', 'mʲɯ'], ['みょ', 'mʲo'],
  ['りゃ', 'ɾʲa'], ['りゅ', 'ɾʲɯ'], ['りょ', 'ɾʲo'],
  ['ぎゃ', 'ɡʲa'], ['ぎゅ', 'ɡʲɯ'], ['ぎょ', 'ɡʲo'],
  ['じゃ', 'dʑa'], ['じゅ', 'dʑɯ'], ['じょ', 'dʑo'],
  ['ぢゃ', 'dʑa'], ['ぢゅ', 'dʑɯ'], ['ぢょ', 'dʑo'],
  ['びゃ', 'bʲa'], ['びゅ', 'bʲɯ'], ['びょ', 'bʲo'],
  ['ぴゃ', 'pʲa'], ['ぴゅ', 'pʲɯ'], ['ぴょ', 'pʲo'],
  // てゃ/でゃ (préstamos, tʲ/dʲ)
  ['てゃ', 'tʲa'], ['てゅ', 'tʲɯ'], ['てょ', 'tʲo'],
  ['でゃ', 'dʲa'], ['でゅ', 'dʲɯ'], ['でょ', 'dʲo'],
]);

// Katakana extranjero: combinaciones de 2 caracteres que no existen en
// hiragana. Se prueban ANTES de la mora simple (ティ no es て+ぃ).
const KATAKANA_EXT = new Map<string, string>([
  ['ヴァ', 'va'], ['ヴィ', 'vi'], ['ヴェ', 've'], ['ヴォ', 'vo'],
  ['ヴュ', 'vʲɯ'], ['ヴョ', 'vʲo'],
  ['ファ', 'ɸa'], ['フィ', 'ɸi'], ['フェ', 'ɸe'], ['フォ', 'ɸo'],
  ['フュ', 'ɸʲɯ'],
  ['ティ', 'ti'], ['ディ', 'di'],
  ['トゥ', 'tɯ'], ['ドゥ', 'dɯ'],
  ['シェ', 'ɕe'],
  ['チェ', 'tɕe'],
  ['ジェ', 'dʑe'],
  ['ツァ', 'tsa'], ['ツィ', 'tsi'], ['ツェ', 'tse'], ['ツォ', 'tso'],
  ['スィ', 'si'], ['ズィ', 'dzi'],
  ['ウィ', 'ɰi'], ['ウェ', 'ɰe'], ['ウォ', 'ɰo'],
  ['クァ', 'kɰa'], ['クィ', 'kɰi'], ['クェ', 'kɰe'], ['クォ', 'kɰo'],
  ['グァ', 'ɡɰa'], ['グィ', 'ɡɰi'], ['グェ', 'ɡɰe'], ['グォ', 'ɡɰo'],
  ['ヷ', 'va'], ['ヸ', 'vi'], ['ヹ', 've'], ['ヺ', 'vo'],
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;

/** katakana → hiragana (offset fijo; el resto intacto). */
function toHiragana(ch: string): string {
  const c = ch.codePointAt(0);
  if (c === undefined) return ch;
  if (c >= KATAKANA_START && c <= KATAKANA_END) {
    return String.fromCodePoint(c - 0x60);
  }
  return ch;
}

const KANA_RE = /^[\u3040-\u30ff]$/;

function isKana(ch: string): boolean {
  return KANA_RE.test(ch);
}

const SMALL_YOON = new Set(['ゃ', 'ゅ', 'ょ', 'ャ', 'ュ', 'ョ']);

const VOWEL_IPA = new Set(['a', 'i', 'ɯ', 'e', 'o']);

/** ん contextual según el inicio del IPA de la unidad siguiente. */
function resolveN(nextIpa: string | undefined): string {
  if (!nextIpa) return 'ɴ';
  const c = nextIpa[0];
  // Palatales: ɕ (し), tɕ (ち), dʑ (じ/ぢ), ɲ (に), ç (ひ), j (や/ゆ/よ) → ɲ.
  // NOTA: kʲ/ɡʲ (きゃ/ぎゃ) NO son palatales aquí — son velares palatalizadas
  // → caen en la regla velar /ŋ/ (きんぎょ → kiŋɡʲo, no kiɲɡʲo).
  const palatal =
    c === 'ɕ' ||
    (c === 't' && nextIpa[1] === 'ɕ') ||
    (c === 'd' && nextIpa[1] === 'ʑ') ||
    c === 'ɲ' ||
    c === 'ç' ||
    c === 'j';
  if (palatal) return 'ɲ';
  if (c === 'm' || c === 'p' || c === 'b') return 'm';
  if (c === 'n' || c === 't' || c === 'd') return 'n';
  if (c === 'k' || c === 'ɡ') return 'ŋ';
  return 'ɴ';
}

// ---------------------------------------------------------------------------
// Tokenizer: kana → unidades (moras, ん, っ, ー, raw)
// ---------------------------------------------------------------------------

function tokenize(input: string): Unit[] {
  const units: Unit[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === 'っ' || ch === 'ッ') {
      units.push({ kind: 'sokuon' });
      i++;
      continue;
    }
    if (ch === 'ー') {
      units.push({ kind: 'choon' });
      i++;
      continue;
    }
    if (ch === 'ん' || ch === 'ン') {
      units.push({ kind: 'n' });
      i++;
      continue;
    }
    if (!isKana(ch)) {
      units.push({ kind: 'raw', text: ch });
      i++;
      continue;
    }

    // Par extranjero katakana (2 chars): ティ, ヴァ, ファ, …
    const rawPair = input.slice(i, i + 2);
    const extIpa = KATAKANA_EXT.get(rawPair);
    if (extIpa) {
      units.push({ kind: 'mora', ipa: extIpa });
      i += 2;
      continue;
    }

    // Entrada extranjera katakana de 1 char (ヷ ヸ ヹ ヺ — raras)
    const extSingle = KATAKANA_EXT.get(ch);
    if (extSingle) {
      units.push({ kind: 'mora', ipa: extSingle });
      i++;
      continue;
    }

    const h = toHiragana(ch);

    // Yōon: kana + ゃゅょ
    const nextCh = input[i + 1] ?? '';
    if (SMALL_YOON.has(nextCh)) {
      const pair = h + toHiragana(nextCh);
      const ipa = MORA.get(pair);
      if (ipa) {
        units.push({ kind: 'mora', ipa });
        i += 2;
        continue;
      }
    }

    // Mora simple
    const ipa = MORA.get(h);
    if (ipa) {
      units.push({ kind: 'mora', ipa });
      i++;
      continue;
    }

    units.push({ kind: 'raw', text: ch });
    i++;
  }
  return units;
}

/** Fusión chōon ortográfico sobre moras adyacentes.
 *
 *  Reglas (ortográficas, no morfológicas — documentado en el plan):
 *   - A termina en 'o' + B = ɯ  →  ...oː   (と+う → toː, きょ+う → kʲoː)
 *   - A termina en 'e' + B = i  →  ...eː   (せ+い → seː)
 *   - A termina en misma vocal que B  →  ...Vː  (お+お → oː, い+い → iː)
 *   - Cualquier otro par queda sin fusionar (あ+う → aɯ, い+う → iɯ).
 *   B debe ser mora de vocal pura; A puede ser CV o vocal sola.
 */
function mergeLongVowels(units: Unit[]): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.kind === 'mora') {
      const next = units[i + 1];
      if (next?.kind === 'mora' && VOWEL_IPA.has(next.ipa)) {
        const aEnd = u.ipa[u.ipa.length - 1];
        const b = next.ipa;
        let mergedIpa: string | null = null;
        if (aEnd === b) mergedIpa = u.ipa.slice(0, -1) + b + 'ː';
        else if (aEnd === 'o' && b === 'ɯ') mergedIpa = u.ipa.slice(0, -1) + 'oː';
        else if (aEnd === 'e' && b === 'i') mergedIpa = u.ipa.slice(0, -1) + 'eː';
        if (mergedIpa) {
          out.push({ kind: 'mora', ipa: mergedIpa });
          i++; // consumir B
          continue;
        }
      }
    }
    out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Convierte kana (hiragana o katakana) a IPA.
 *
 * - Puro y síncrono: cero IO, cero async, cero dependencias.
 * - Caracteres no-kana (latín, kanji, emoji, puntuación) pasan intactos.
 * - Caracteres kana no reconocidos pasan intactos (fallback: nunca vacío).
 */
export function kanaToIpa(input: string): string {
  if (!input) return '';
  let units = tokenize(input);
  units = mergeLongVowels(units);

  let out = '';
  let pendingGem = false;

  for (let i = 0; i < units.length; i++) {
    const u = units[i];

    if (u.kind === 'raw') {
      out += pendingGem ? 'ʔ' + u.text : u.text;
      pendingGem = false;
      continue;
    }
    if (u.kind === 'sokuon') {
      // La geminación se resuelve con la siguiente unidad; si ya hay una
      // pendiente (っっ), se emite parada glotal.
      out += pendingGem ? 'ʔ' : '';
      pendingGem = true;
      continue;
    }
    if (u.kind === 'choon') {
      out += pendingGem ? 'ʔː' : 'ː';
      pendingGem = false;
      continue;
    }
    if (u.kind === 'n') {
      const next = units[i + 1];
      const nextIpa = next?.kind === 'mora' ? next.ipa : undefined;
      out += pendingGem ? 'ʔ' + resolveN(nextIpa) : resolveN(nextIpa);
      pendingGem = false;
      continue;
    }

    // Mora
    let ipa = u.ipa;
    if (pendingGem) {
      const first = ipa[0];
      if (first && !VOWEL_IPA.has(first) && first !== 'ː') {
        // Geminación: duplicar la 1ª letra de la consonante (tɕ → ttɕ, ɕ → ɕɕ)
        ipa = first + ipa;
      } else {
        // っ ante vocal → parada glotal
        ipa = 'ʔ' + ipa;
      }
      pendingGem = false;
    }
    out += ipa;
  }

  // っ final de palabra → parada glotal
  if (pendingGem) out += 'ʔ';
  return out;
}

/**
 * Convierte los rt de segmentos furigana a IPA (P2: ruby IPA).
 * Morfemas sin rt o con rt no-kana pasan intactos.
 */
export function ipaForRuby(segments: FuriganaSegment[]): FuriganaSegment[] {
  return segments.map((s) => {
    if (!s.rt) return s;
    const rtIpa = kanaToIpa(s.rt);
    return { base: s.base, rt: rtIpa };
  });
}
