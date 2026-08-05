// ============================================================================
// french.ts — conversor grafema → IPA para francés.  APROXIMADO A PROPÓSITO.
//
// El francés no es transcribible al 100 % por reglas: la ortografía guarda
// letras que dejaron de sonar hace siglos y la pronunciación depende de
// categoría gramatical y de la palabra siguiente. Este motor cubre lo regular
// y DECLARA lo que no cubre, en vez de fingir precisión.
//
// Lo que sí resuelve:
//   - Vocales nasales (an/en → /ɑ̃/, in/ain/ein → /ɛ̃/, on → /ɔ̃/, un → /œ̃/,
//     ien → /jɛ̃/, oin → /wɛ̃/), incluida la regla de que la nasal se deshace
//     ante vocal o ante nasal doble ("bonne" /bɔn/, no /bɔ̃/).
//   - Dígrafos vocálicos: eau/au /o/, ou /u/, oi /wa/, ai/ei /ɛ/, eu /ø/,
//     ui /ɥi/.
//   - Consonantes finales mudas, con la excepción clásica C-R-F-L.
//   - ch /ʃ/, gn /ɲ/, j y g+e,i /ʒ/, ç /s/, s intervocálica /z/, r /ʁ/,
//     -ill- /ij/, -il final /j/.
//   - E MUDA FINAL COMO /ə/: al hablar desaparece, pero AL CANTAR casi siempre
//     recibe nota propia. Esta es una decisión deliberada de dominio: la app
//     es para cantar, no para conversar.
//
// Errores sistemáticos conocidos (documentados, no ocultos):
//   1. LIAISON. "les amis" se canta /le.za.mi/; aquí sale /le a.mi/. Requiere
//      mirar la palabra siguiente y saber si la liaison es obligatoria.
//   2. Final "-ent": se transcribe /ɑ̃/ solo en "-ment" (vraiment, comment) y
//      mudo en el resto (chantent, parlent). Falla en verbos como "aiment" y
//      en sustantivos como "argent".
//   3. e/o abiertas o cerradas en sílaba interna: se elige un timbre por
//      defecto.
// ============================================================================

import { isVowel, mapWords, normalizeWord } from './shared';

/** Consonantes finales normalmente mudas. C, R, F y L quedan fuera (CaReFuL). */
const SILENT_FINALS = new Set(['d', 'g', 'm', 'n', 'p', 's', 't', 'x', 'z']);

/** Consonantes ante las que la s se sonoriza. */
const VOICED_AFTER_S = new Set(['b', 'd', 'g', 'j', 'l', 'm', 'n', 'r', 'v']);

/**
 * Excepciones clásicas donde -ill- suena /il/ y no /ij/. Es una lista cerrada
 * y corta: la regla general acierta en el resto.
 */
const ILL_AS_L = new Set(['ville', 'villes', 'mille', 'milles', 'tranquille', 'tranquilles']);

function isFront(ch: string | undefined): boolean {
  return ch === 'e' || ch === 'i' || ch === 'y' || ch === 'é' || ch === 'è' || ch === 'ê';
}

/** ¿La n/m en `k` cierra una vocal nasal? Falso si le sigue vocal o nasal. */
function closesNasal(word: string, k: number): boolean {
  const after = word[k + 1];
  if (!after) return true;
  if (isVowel(after)) return false;
  if (after === 'n' || after === 'm') return false;
  return true;
}

function wordToIpa(word: string): string {
  const out: string[] = [];
  const last = word.length - 1;
  let i = 0;

  // Final "-ent": /ɑ̃/ tras "-ment" (adverbios y sustantivos), mudo en el
  // resto (3.ª persona del plural). Ver error sistemático 2 en la cabecera.
  let end = word.length;
  const verbalEnt = word.length >= 5 && word.endsWith('ent') && word[word.length - 4] !== 'm';
  if (verbalEnt) {
    // "chantent" → /ʃɑ̃t/: al caer la desinencia, la consonante del radical
    // SÍ suena, así que no se aplica además la poda de finales mudas.
    end = word.length - 3;
  } else {
    // Poda de la cola muda: "temps" /tɑ̃/, "beaucoup" /boku/. Se detiene si la
    // n/m cierra una vocal nasal, que sí se pronuncia ("chansons" /ʃɑ̃sɔ̃/).
    while (end > 1 && SILENT_FINALS.has(word[end - 1])) {
      const letter = word[end - 1];
      if ((letter === 'n' || letter === 'm') && isVowel(word[end - 2])) break;
      end -= 1;
    }
  }

  while (i < end) {
    const c = word[i];
    const next = word[i + 1];
    const next2 = word[i + 2];
    const prev = word[i - 1];

    // --- Nasales y dígrafos vocálicos, de más largo a más corto ------------
    if (c === 'o' && next === 'i' && next2 === 'n' && closesNasal(word, i + 2)) {
      out.push('wɛ̃');
      i += 3;
      continue;
    }
    if (c === 'i' && next === 'e' && next2 === 'n' && closesNasal(word, i + 2)) {
      out.push('jɛ̃');
      i += 3;
      continue;
    }
    if (c === 'e' && next === 'a' && next2 === 'u') {
      out.push('o');
      i += 3;
      continue;
    }
    if (c === 'o' && next === 'e' && next2 === 'u') {
      // "coeur", "soeur": grafía suelta de œu.
      out.push('œ');
      i += 3;
      continue;
    }
    if ((c === 'a' || c === 'e') && next === 'i' && (next2 === 'n' || next2 === 'm') && closesNasal(word, i + 2)) {
      // "pain", "faim", "plein", "sein".
      out.push('ɛ̃');
      i += 3;
      continue;
    }
    if ((c === 'a' || c === 'e') && (next === 'n' || next === 'm') && closesNasal(word, i + 1)) {
      out.push('ɑ̃');
      i += 2;
      continue;
    }
    if ((c === 'i' || c === 'y') && (next === 'n' || next === 'm') && closesNasal(word, i + 1)) {
      out.push('ɛ̃');
      i += 2;
      continue;
    }
    if (c === 'o' && (next === 'n' || next === 'm') && closesNasal(word, i + 1)) {
      out.push('ɔ̃');
      i += 2;
      continue;
    }
    if (c === 'u' && (next === 'n' || next === 'm') && closesNasal(word, i + 1)) {
      out.push('œ̃');
      i += 2;
      continue;
    }
    if (c === 'a' && next === 'u') {
      out.push('o');
      i += 2;
      continue;
    }
    if (c === 'o' && next === 'u') {
      // "oui", "ouest": ante vocal es semiconsonante.
      out.push(isVowel(next2) ? 'w' : 'u');
      i += 2;
      continue;
    }
    if (c === 'o' && next === 'i') {
      out.push('wa');
      i += 2;
      continue;
    }
    if ((c === 'a' || c === 'e') && next === 'i') {
      out.push('ɛ');
      i += 2;
      continue;
    }
    if ((c === 'e' || c === 'œ') && next === 'u') {
      out.push('ø');
      i += 2;
      continue;
    }
    if (c === 'u' && next === 'i') {
      out.push('ɥi');
      i += 2;
      continue;
    }

    // --- Consonantes: grupos ------------------------------------------------
    if (c === 'c' && next === 'h') {
      out.push('ʃ');
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
    if (c === 'g' && next === 'n') {
      out.push('ɲ');
      i += 2;
      continue;
    }
    if (c === 'q' && next === 'u') {
      out.push('k');
      i += 2;
      continue;
    }
    if (c === 'g' && next === 'u' && isFront(next2)) {
      out.push('g');
      i += 2;
      continue;
    }
    if (c === 'i' && next === 'l' && next2 === 'l' && !ILL_AS_L.has(word)) {
      // "fille" /fij/, "briller" /bʁije/. Excepciones cerradas abajo.
      out.push('ij');
      i += 3;
      continue;
    }
    if (c === 'i' && next === 'l' && i + 1 === last && isVowel(prev)) {
      // "travail", "soleil": -il final tras vocal suena /j/.
      out.push('j');
      i += 2;
      continue;
    }
    if (c === 's' && next === 's') {
      out.push('s');
      i += 2;
      continue;
    }
    // Consonante doble francesa = una sola ("belle" /bɛl/, "donner" /dɔne/).
    if (c === next && !isVowel(c) && /[a-z]/.test(c)) {
      i += 1;
      continue;
    }

    // --- Consonantes simples ------------------------------------------------
    if (!isVowel(c) && /[a-zç]/.test(c)) {
      // Muda al final de palabra, salvo C-R-F-L.
      if (i === last && SILENT_FINALS.has(c)) {
        i += 1;
        continue;
      }
      switch (c) {
        case 'c':
          out.push(isFront(next) ? 's' : 'k');
          break;
        case 'ç':
          out.push('s');
          break;
        case 'g':
          out.push(isFront(next) ? 'ʒ' : 'g');
          break;
        case 'j':
          out.push('ʒ');
          break;
        case 's':
          out.push(isVowel(prev) && isVowel(next) ? 'z' : next && VOICED_AFTER_S.has(next) ? 'z' : 's');
          break;
        case 'x':
          out.push('ks');
          break;
        case 'r':
          out.push('ʁ');
          break;
        case 'h':
          break;
        case 'w':
          out.push('w');
          break;
        case 'y':
          out.push(isVowel(next) ? 'j' : 'i');
          break;
        default:
          out.push(c);
      }
      i += 1;
      continue;
    }

    // --- Vocales simples ----------------------------------------------------
    switch (c) {
      case 'e': {
        // E final (o ante -s final) → /ə/: muda al hablar, cantada al cantar.
        const finalE = i === last || (i === last - 1 && (word[last] === 's' || word[last] === 'z'));
        if (finalE) {
          out.push('ə');
          i += 1;
          continue;
        }
        // Sílaba trabada ("mer", "belle", "cette") → /ɛ/; libre → /ə/.
        const closed = next !== undefined && !isVowel(next) && (next2 === undefined || !isVowel(next2));
        out.push(closed ? 'ɛ' : 'ə');
        i += 1;
        continue;
      }
      case 'é':
        out.push('e');
        i += 1;
        continue;
      case 'è':
      case 'ê':
        out.push('ɛ');
        i += 1;
        continue;
      case 'a':
        out.push('a');
        i += 1;
        continue;
      case 'à':
        out.push('a');
        i += 1;
        continue;
      case 'â':
        out.push('ɑ');
        i += 1;
        continue;
      case 'i':
      case 'î':
      case 'ï': {
        // Semiconsonante ante vocal ("pied" /pje/), PERO no ante la e muda
        // final: "vie" es /vi(ə)/, no /vjə/.
        const beforeMuteE = next === 'e' && (i + 1 === last || (i + 2 === last && word[last] === 's'));
        out.push(isVowel(next) && !isVowel(prev) && !beforeMuteE ? 'j' : 'i');
        i += 1;
        continue;
      }
      case 'o':
        out.push('ɔ');
        i += 1;
        continue;
      case 'ô':
        out.push('o');
        i += 1;
        continue;
      case 'u':
      case 'û':
      case 'ù':
        out.push('y');
        i += 1;
        continue;
      case 'œ':
        out.push('œ');
        i += 1;
        continue;
      default:
        out.push(c);
        i += 1;
        continue;
    }
  }

  return out.join('');
}

/** Transcribe una línea de letra francesa a IPA (aproximación declarada). */
export function frenchToIpa(text: string): string {
  return mapWords(text, (word) => wordToIpa(normalizeWord(word)));
}
