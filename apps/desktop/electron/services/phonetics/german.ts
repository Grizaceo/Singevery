// ============================================================================
// german.ts — conversor grafema → IPA para alemán.
//
// El alemán es bastante más regular que el francés: casi todo se decide por
// contexto ortográfico. Lo que aquí se resuelve y le importa a un cantante:
//
//   - ICH-LAUT vs ACH-LAUT: "ich" /ɪç/ frente a "Nacht" /naxt/. Es el error
//     de dicción más típico de un hispanohablante y es 100 % contextual.
//   - CANTIDAD VOCÁLICA. En alemán largo/breve cambia el timbre además de la
//     duración: "Staat" /aː/ frente a "Stadt" /a/. Se decide contando las
//     consonantes que siguen: h de alargamiento o vocal doble → larga; una
//     consonante o final de palabra → larga; dos o más → breve.
//   - GOLPE GLÓTICO inicial (/ʔ/). El alemán separa las palabras que empiezan
//     por vocal, y omitirlo es lo que hace que un Lied suene "ligado a la
//     italiana". Se marca porque es una decisión de ataque que el cantante
//     ejecuta.
//   - Ensordecimiento final: "Tag" /taːk/, "und" /ʊnt/.
//   - sp-/st- iniciales → /ʃp/, /ʃt/; s ante vocal → /z/; v → /f/; w → /v/.
//   - Terminaciones átonas: -er → /ɐ/, -e → /ə/.
//
// Aproximaciones declaradas: no se distingue el prefijo separable (donde el
// golpe glótico va dentro de la palabra, "beobachten"), ni los préstamos del
// francés y el inglés, que mantienen su propia fonética.
// ============================================================================

import { mapWords, normalizeWord } from './shared';

/** Vocales alemanas incluidas las modificadas. */
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'ä', 'ö', 'ü', 'y']);

/** Timbre por cantidad: [larga, breve]. */
const VOWEL_QUALITY: Record<string, [string, string]> = {
  a: ['aː', 'a'],
  e: ['eː', 'ɛ'],
  i: ['iː', 'ɪ'],
  o: ['oː', 'ɔ'],
  u: ['uː', 'ʊ'],
  ä: ['ɛː', 'ɛ'],
  ö: ['øː', 'œ'],
  ü: ['yː', 'ʏ'],
  y: ['yː', 'ʏ'],
};

/** Vocales posteriores: son las únicas que producen ach-Laut /x/. */
const BACK_BEFORE_CH = new Set(['a', 'o', 'u']);

function isGermanVowel(ch: string | undefined): boolean {
  return ch !== undefined && VOWELS.has(ch);
}

/**
 * ¿La vocal en `i` es larga? Cuenta las consonantes hasta la siguiente vocal.
 * `h` inmediata es signo de alargamiento, no consonante.
 */
function isLongVowel(word: string, i: number): boolean {
  const next = word[i + 1];
  if (next === 'h') return true;
  if (next === word[i]) return true; // aa, ee, oo
  if (word[i] === 'i' && next === 'e') return true; // ie
  let k = i + 1;
  let consonants = 0;
  while (k < word.length && !isGermanVowel(word[k])) {
    consonants += 1;
    k += 1;
  }
  if (k >= word.length) return consonants <= 1; // final: "da" largo, "Tag" largo
  return consonants <= 1;
}

function wordToIpa(word: string): string {
  const out: string[] = [];
  const last = word.length - 1;
  let i = 0;

  // Golpe glótico ante palabra que empieza por vocal.
  if (isGermanVowel(word[0])) out.push('ʔ');

  while (i < word.length) {
    const c = word[i];
    const next = word[i + 1];
    const next2 = word[i + 2];
    const prev = word[i - 1];
    const initial = i === 0;

    // --- Grupos consonánticos, de más largo a más corto --------------------
    if (c === 's' && next === 'c' && next2 === 'h') {
      out.push('ʃ');
      i += 3;
      continue;
    }
    if (c === 't' && next === 's' && next2 === 'c' && word[i + 3] === 'h') {
      out.push('tʃ');
      i += 4;
      continue;
    }
    if (c === 'c' && next === 'h' && next2 === 's') {
      out.push('ks');
      i += 3;
      continue;
    }
    if (c === 'c' && next === 'h') {
      // ach-Laut SOLO tras a, o, u (incluido el de "au"); ich-Laut en todo lo
      // demás: tras vocal palatal ("ich"), tras consonante ("durch", "Milch")
      // y en el sufijo -chen ("Mädchen").
      out.push(BACK_BEFORE_CH.has(prev ?? '') ? 'x' : 'ç');
      i += 2;
      continue;
    }
    if ((c === 's') && (next === 'p' || next === 't') && initial) {
      out.push(next === 'p' ? 'ʃp' : 'ʃt');
      i += 2;
      continue;
    }
    if (c === 'c' && next === 'k') {
      out.push('k');
      i += 2;
      continue;
    }
    if (c === 't' && next === 'z') {
      out.push('ts');
      i += 2;
      continue;
    }
    if (c === 'd' && next === 't') {
      // "Stadt" /ʃtat/: grupo histórico que suena como una sola t.
      out.push('t');
      i += 2;
      continue;
    }
    if (c === 'n' && next === 'g') {
      out.push('ŋ');
      i += 2;
      continue;
    }
    if (c === 'p' && next === 'h') {
      out.push('f');
      i += 2;
      continue;
    }
    if (c === 't' && next === 'h') {
      out.push('t');
      i += 2;
      continue;
    }
    if (c === 'q' && next === 'u') {
      out.push('kv');
      i += 2;
      continue;
    }
    if (c === 's' && next === 's') {
      out.push('s');
      i += 2;
      continue;
    }
    // Consonante doble alemana = una sola consonante (marca la vocal breve
    // anterior, que ya se calculó al procesar la vocal).
    if (c === next && !isGermanVowel(c) && /[a-zß]/.test(c)) {
      i += 1;
      continue;
    }

    // --- Vocales -------------------------------------------------------------
    if (isGermanVowel(c)) {
      // Diptongos.
      if ((c === 'e' || c === 'a') && next === 'i') {
        out.push('aɪ');
        i += 2;
        continue;
      }
      if ((c === 'e' && next === 'u') || (c === 'ä' && next === 'u')) {
        out.push('ɔʏ');
        i += 2;
        continue;
      }
      if (c === 'a' && next === 'u') {
        out.push('aʊ');
        i += 2;
        continue;
      }
      // -er final átono → /ɐ/.
      if (c === 'e' && next === 'r' && i + 1 === last && i > 0) {
        out.push('ɐ');
        i += 2;
        continue;
      }
      // -e final átona → /ə/ (y en -en, -el, -es).
      if (c === 'e' && i > 0 && (i === last || ((next === 'n' || next === 'l' || next === 's') && i + 1 === last))) {
        out.push('ə');
        i += 1;
        continue;
      }

      const long = isLongVowel(word, i);
      const quality = VOWEL_QUALITY[c];
      out.push(quality ? quality[long ? 0 : 1] : c);

      // Consumir la marca de alargamiento para que no suene como consonante.
      if (next === 'h') i += 2;
      else if (next === c) i += 2;
      else if (c === 'i' && next === 'e') i += 2;
      else i += 1;
      continue;
    }

    // --- Consonantes simples -------------------------------------------------
    const finalPosition = i === last;
    switch (c) {
      case 'b':
        out.push(finalPosition ? 'p' : 'b');
        break;
      case 'd':
        out.push(finalPosition ? 't' : 'd');
        break;
      case 'g':
        out.push(finalPosition ? 'k' : 'g');
        break;
      case 's':
        // Sonora ante vocal ("Sonne"), sorda en el resto.
        out.push(isGermanVowel(next) ? 'z' : 's');
        break;
      case 'ß':
        out.push('s');
        break;
      case 'v':
        out.push('f');
        break;
      case 'w':
        out.push('v');
        break;
      case 'z':
        out.push('ts');
        break;
      case 'j':
        out.push('j');
        break;
      case 'r':
        out.push('ʁ');
        break;
      case 'c':
        out.push('k');
        break;
      case 'h':
        // Aspirada solo al inicio de palabra o de sílaba tras consonante.
        if (initial || !isGermanVowel(prev)) out.push('h');
        break;
      default:
        out.push(c);
    }
    i += 1;
  }

  return out.join('');
}

/** Transcribe una línea de letra alemana a IPA. */
export function germanToIpa(text: string): string {
  return mapWords(text, (word) => wordToIpa(normalizeWord(word)));
}
