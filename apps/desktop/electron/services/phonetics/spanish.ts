// ============================================================================
// spanish.ts — conversor grafema → IPA para español.
//
// El español tiene la ortografía más regular de las cuatro lenguas que soporta
// esta capa: salvo la norma (seseo o distinción) y el yeísmo, todo se deduce
// de la letra y su contexto. Por eso este motor no aproxima: transcribe.
//
// Convenciones fijadas:
//   - Transcripción ANCHA con alófonos que sí importan al cantar:
//     b/d/g son oclusivas [b d g] tras pausa o nasal y aproximantes [β ð ɣ]
//     en el resto. Es lo que hace que el español suene español y es 100 %
//     derivable del contexto.
//   - Norma configurable: 'seseo' (c/z ante e,i → /s/, americana, por defecto)
//     o 'distincion' (→ /θ/, castellana, la habitual en dicción clásica).
//   - YEÍSMO siempre: ll → /ʝ/. La distinción /ʎ/ es hoy minoritaria y no está
//     en la norma de ninguno de los dos grandes estándares de canto.
//   - Diptongos crecientes: i/u átonas ante vocal → /j/, /w/ ("bien" /bjen/,
//     "cuatro" /kwatɾo/). Las tildes los rompen: "día" → /dia/, no /dja/.
//   - Asimilación nasal: n → [ŋ] ante velar, [m] ante bilabial.
//   - s → [z] ante consonante sonora ("mismo" /mizmo/, "desde" /dezðe/).
//   - SIN marca de acento tónico: al cantar, la melodía manda sobre la
//     prosodia. Se transcribe el segmento, no el ritmo.
//   - h muda; letras no españolas pasan intactas.
//
// Límite declarado: la transcripción es PALABRA A PALABRA, así que no aplica
// fenómenos de encadenamiento ("un beso" sale /un beso/ y no [um beso]). Es la
// misma frontera que la liaison en francés y se documenta en vez de fingirla.
// ============================================================================

import { isVowel, mapWords, normalizeWord, stripDiacritics } from './shared';

/** Norma de pronunciación del español para c/z ante e, i. */
export type SpanishVariant = 'seseo' | 'distincion';

/** Consonantes que provocan sonorización de /s/ que las precede. */
const VOICED_FOR_S = new Set(['b', 'v', 'd', 'g', 'l', 'm', 'n', 'ñ', 'r', 'y']);

/** Nasales que hacen que b/d/g se realicen oclusivas. */
const NASALS = new Set(['m', 'n', 'ñ']);

/** ¿La letra en `w[k]`, ignorando tildes, es e o i? */
function frontAt(word: string, k: number): boolean {
  const ch = word[k];
  if (!ch) return false;
  const base = stripDiacritics(ch);
  return base === 'e' || base === 'i';
}

function wordToIpa(word: string, variant: SpanishVariant): string {
  const sibilant = variant === 'seseo' ? 's' : 'θ';
  const out: string[] = [];
  let i = 0;

  while (i < word.length) {
    const c = word[i];
    const next = word[i + 1];
    const prev = word[i - 1];
    const initial = i === 0;

    // --- Dígrafos y secuencias, de más larga a más corta -------------------
    if (c === 'c' && next === 'h') {
      out.push('tʃ');
      i += 2;
      continue;
    }
    if (c === 'l' && next === 'l') {
      out.push('ʝ');
      i += 2;
      continue;
    }
    if (c === 'r' && next === 'r') {
      out.push('r');
      i += 2;
      continue;
    }
    if (c === 'q' && next === 'u' && frontAt(word, i + 2)) {
      // "que", "quiero": la u es ortográfica, no se pronuncia.
      out.push('k');
      i += 2;
      continue;
    }
    if (c === 'g' && next === 'u' && frontAt(word, i + 2)) {
      // "guerra", "guitarra": u muda.
      out.push(initial || NASALS.has(prev ?? '') ? 'g' : 'ɣ');
      i += 2;
      continue;
    }
    if (c === 'g' && next === 'ü') {
      // "pingüino", "vergüenza": la diéresis devuelve la u como semiconsonante.
      out.push(initial || NASALS.has(prev ?? '') ? 'gw' : 'ɣw');
      i += 2;
      continue;
    }

    // --- Consonantes simples ----------------------------------------------
    switch (c) {
      case 'g':
        out.push(frontAt(word, i + 1) ? 'x' : initial || NASALS.has(prev ?? '') ? 'g' : 'ɣ');
        i += 1;
        continue;
      case 'c':
        out.push(frontAt(word, i + 1) ? sibilant : 'k');
        i += 1;
        continue;
      case 'z':
        // Ante consonante sonora se sonoriza igual que la s ("juzgar").
        out.push(
          variant === 'seseo' && next && VOICED_FOR_S.has(next) ? 'z' : sibilant,
        );
        i += 1;
        continue;
      case 'b':
      case 'v':
        out.push(initial || NASALS.has(prev ?? '') ? 'b' : 'β');
        i += 1;
        continue;
      case 'd':
        out.push(initial || prev === 'n' || prev === 'l' ? 'd' : 'ð');
        i += 1;
        continue;
      case 'j':
        out.push('x');
        i += 1;
        continue;
      case 'x':
        // "xilófono" /s/ en inicial; "examen" /ks/ en el resto.
        out.push(initial ? 's' : 'ks');
        i += 1;
        continue;
      case 'h':
        // Muda. La u que la sigue ante vocal se vuelve /w/ por la regla de
        // diptongo ("hueso" → /weso/).
        i += 1;
        continue;
      case 'ñ':
        out.push('ɲ');
        i += 1;
        continue;
      case 'y':
        // Consonante ante vocal ("yo"), vocal en el resto ("hay", "y").
        out.push(isVowel(next) ? 'ʝ' : 'i');
        i += 1;
        continue;
      case 's':
        out.push(next && VOICED_FOR_S.has(next) ? 'z' : 's');
        i += 1;
        continue;
      case 'n': {
        const velar = next === 'g' || next === 'j' || next === 'k' || next === 'q';
        const velarC = next === 'c' && !frontAt(word, i + 2);
        const bilabial = next === 'b' || next === 'v' || next === 'p';
        out.push(velar || velarC ? 'ŋ' : bilabial ? 'm' : 'n');
        i += 1;
        continue;
      }
      case 'r':
        // Vibrante múltiple en inicial y tras n, l, s; simple en el resto.
        out.push(initial || prev === 'n' || prev === 'l' || prev === 's' ? 'r' : 'ɾ');
        i += 1;
        continue;
      case 'q':
        out.push('k');
        i += 1;
        continue;
      case 'w':
        out.push('w');
        i += 1;
        continue;
      case 'l':
      case 'm':
      case 'p':
      case 't':
      case 'f':
      case 'k':
        out.push(c);
        i += 1;
        continue;
      default:
        break;
    }

    // --- Vocales -----------------------------------------------------------
    const base = stripDiacritics(c);
    const accented = c !== base;

    if (base === 'i') {
      // Semiconsonante solo si es átona y abre diptongo creciente.
      out.push(!accented && isVowel(next) && !isVowel(prev) ? 'j' : 'i');
      i += 1;
      continue;
    }
    if (base === 'u') {
      out.push(!accented && isVowel(next) && !isVowel(prev) ? 'w' : 'u');
      i += 1;
      continue;
    }
    if (base === 'a' || base === 'e' || base === 'o') {
      out.push(base);
      i += 1;
      continue;
    }
    if (c === 'ü') {
      out.push('u');
      i += 1;
      continue;
    }

    // Letra ajena al español (nombres propios, marcas): se deja tal cual.
    out.push(c);
    i += 1;
  }

  return out.join('');
}

/**
 * Transcribe una línea de letra española a IPA.
 *
 * Solo transforma palabras; espacios, comas y cualquier otro script quedan
 * intactos, así que una línea con inglés incrustado conserva su forma.
 */
export function spanishToIpa(text: string, variant: SpanishVariant = 'seseo'): string {
  return mapWords(text, (word) => wordToIpa(normalizeWord(word), variant));
}
