// ============================================================================
// italian.ts — conversor grafema → IPA para italiano.
//
// El italiano es casi tan regular como el español, con dos ambigüedades que NO
// se pueden resolver por regla porque son léxicas, no ortográficas:
//
//   1. e/o abiertas o cerradas: "pesca" es /ˈpeska/ (pescar) o /ˈpɛska/ (fruta).
//      La ortografía no lo marca salvo cuando lleva tilde. Aquí: è → /ɛ/,
//      é → /e/, ò → /ɔ/, ó → /o/, y sin tilde se transcribe CERRADA por
//      defecto. Es una decisión declarada, no un descuido.
//   2. z sorda o sonora: "zio" /ts/ frente a "zero" /dz/. Por defecto /ts/.
//
// Lo que sí se resuelve entero y es lo que más importa al cantar:
//   - GEMINACIÓN. La consonante doble italiana es larga de verdad y ocupa
//     tiempo musical ("nonna" ≠ "nona"). Se marca con /ː/.
//   - Palatalización de c/g ante e, i, y la i ortográfica muda de cia/gio.
//   - gli → /ʎ/, gn → /ɲ/, sc ante e/i → /ʃ/.
//   - s intervocálica sonora (/z/), norma estándar del canto.
//   - Toda vocal escrita se pronuncia: el italiano no reduce átonas, que es
//     justamente por lo que se canta tan bien.
// ============================================================================

import { isVowel, mapWords, normalizeWord, stripDiacritics } from './shared';

/** Consonantes ante las que la s se sonoriza ("sbaglio", "smettere"). */
const VOICED_FOR_S = new Set(['b', 'd', 'g', 'l', 'm', 'n', 'r', 'v']);

/** Vocales con tilde que fijan el timbre abierto/cerrado. */
const ACCENTED_VOWELS: Record<string, string> = {
  à: 'a',
  è: 'ɛ',
  é: 'e',
  ì: 'i',
  í: 'i',
  ò: 'ɔ',
  ó: 'o',
  ù: 'u',
  ú: 'u',
};

function isFront(ch: string | undefined): boolean {
  if (!ch) return false;
  const base = stripDiacritics(ch);
  return base === 'e' || base === 'i';
}

/**
 * IPA de una consonante simple en `i`, mirando el contexto que hay DESPUÉS de
 * ella en `afterIndex`. Se separa del bucle porque las consonantes dobles
 * palatalizan según lo que sigue al par completo ("faccio" → /fatʃː o/, no
 * /fakː…/).
 */
function consonantIpa(word: string, i: number, afterIndex: number): string {
  const c = word[i];
  const after = word[afterIndex];
  const prev = word[i - 1];

  switch (c) {
    case 'c':
      return isFront(after) ? 'tʃ' : 'k';
    case 'g':
      return isFront(after) ? 'dʒ' : 'g';
    case 'z':
      return 'ts';
    case 's':
      // Sonora entre vocales y ante consonante sonora; sorda en el resto.
      if (isVowel(prev) && isVowel(after)) return 'z';
      if (after && VOICED_FOR_S.has(after)) return 'z';
      return 's';
    case 'q':
      return 'k';
    case 'h':
      return '';
    default:
      return c;
  }
}

function wordToIpa(word: string): string {
  const out: string[] = [];
  let i = 0;

  while (i < word.length) {
    const c = word[i];
    const next = word[i + 1];
    const next2 = word[i + 2];
    const prev = word[i - 1];

    // --- Grupos de tres o más ---------------------------------------------
    if (c === 's' && next === 'c' && next2 === 'h') {
      out.push('sk');
      i += 3;
      continue;
    }
    if (c === 's' && next === 'c' && next2 === 'i' && isVowel(word[i + 3])) {
      // "sciare", "lascio": la i es ortográfica y no suena.
      out.push('ʃ');
      i += 3;
      continue;
    }
    if (c === 's' && next === 'c' && isFront(next2)) {
      // "scena", "sci": la vocal siguiente se procesa aparte.
      out.push('ʃ');
      i += 2;
      continue;
    }
    if (c === 'g' && next === 'l' && next2 === 'i') {
      // gli + vocal → /ʎ/ con i muda ("figlia"); gli final → /ʎi/ ("gli").
      out.push(isVowel(word[i + 3]) ? 'ʎ' : 'ʎi');
      i += 3;
      continue;
    }
    if (c === 'g' && next === 'n') {
      out.push('ɲ');
      i += 2;
      continue;
    }
    if (c === 'g' && next === 'h') {
      out.push('g');
      i += 2;
      continue;
    }
    if (c === 'g' && next === 'i' && isVowel(next2)) {
      // "giorno", "giallo": i muda.
      out.push('dʒ');
      i += 2;
      continue;
    }
    if (c === 'c' && next === 'h') {
      out.push('k');
      i += 2;
      continue;
    }
    if (c === 'c' && next === 'i' && isVowel(next2)) {
      // "ciao", "bacio": i muda.
      out.push('tʃ');
      i += 2;
      continue;
    }
    if (c === 'q' && next === 'u') {
      out.push('kw');
      i += 2;
      continue;
    }

    // --- Consonante doble = geminada ---------------------------------------
    if (c === next && !isVowel(c) && /[a-z]/.test(c)) {
      const ipa = consonantIpa(word, i, i + 2);
      out.push(ipa ? `${ipa}ː` : '');
      // "faccio", "oggi", "ghiaccio": si la geminada palataliza gracias a una
      // i seguida de vocal, esa i es ortográfica y tampoco suena.
      const mutedI = (c === 'c' || c === 'g') && word[i + 2] === 'i' && isVowel(word[i + 3]);
      i += mutedI ? 3 : 2;
      continue;
    }

    // --- Consonante simple --------------------------------------------------
    if (!isVowel(c) && /[a-z]/.test(c)) {
      out.push(consonantIpa(word, i, i + 1));
      i += 1;
      continue;
    }

    // --- Vocales ------------------------------------------------------------
    if (ACCENTED_VOWELS[c]) {
      out.push(ACCENTED_VOWELS[c]);
      i += 1;
      continue;
    }
    if (c === 'i') {
      // Semiconsonante ante vocal ("piano" /pjano/), vocal plena si no.
      out.push(isVowel(next) && !isVowel(prev) ? 'j' : 'i');
      i += 1;
      continue;
    }
    if (c === 'u') {
      out.push(isVowel(next) && !isVowel(prev) ? 'w' : 'u');
      i += 1;
      continue;
    }
    if (c === 'a' || c === 'e' || c === 'o') {
      // Sin tilde: timbre cerrado por convención declarada.
      out.push(c);
      i += 1;
      continue;
    }

    out.push(c);
    i += 1;
  }

  return out.join('');
}

/** Transcribe una línea de letra italiana a IPA. */
export function italianToIpa(text: string): string {
  return mapWords(text, (word) => wordToIpa(normalizeWord(word)));
}
