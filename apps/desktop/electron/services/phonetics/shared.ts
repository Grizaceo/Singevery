// ============================================================================
// shared.ts — utilidades comunes a los motores IPA de alfabeto latino.
//
// Los motores (spanish, italian, french, german) son funciones PURAS y
// SÍNCRONAS: sin red, sin dependencias, sin estado. Cada uno traduce grafemas a
// IPA palabra por palabra; este módulo aporta el troceado y los predicados
// compartidos para que ninguno reinvente el tokenizador.
// ============================================================================

/**
 * Una "palabra" a efectos fonéticos: letras latinas (con diacríticos), más el
 * apóstrofo, que en italiano y francés une la elisión con la palabra siguiente
 * (`l'amore`, `j'ai`) y por tanto NO es un límite de palabra fonético.
 *
 * Rango: ASCII + Latin-1 Supplement + œ/Œ (fuera del rango contiguo).
 */
export const WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿŒœ'’]+/g;

/**
 * Aplica `fn` a cada palabra dejando intacto TODO lo demás: espacios, comas,
 * signos, dígitos y cualquier otro script. Así una línea bilingüe
 * ("Bailando, oh oh") conserva su forma y solo cambian las palabras.
 */
export function mapWords(text: string, fn: (word: string) => string): string {
  return text.replace(WORD_RE, (word) => fn(word));
}

/**
 * Normaliza una palabra antes de convertirla: minúsculas y sin apóstrofos.
 *
 * Quitar el apóstrofo es lo fonéticamente correcto en las lenguas que eliden:
 * `l'amore` se canta /lamoːre/ como una sola secuencia, no /l/ + pausa +
 * /amoːre/.
 */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/['’]/g, '');
}

/** Vocales latinas básicas (sin diacríticos). */
export const BASE_VOWELS = 'aeiou';

/** ¿Es una vocal, con o sin diacrítico? */
export function isVowel(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[aeiouáàâäãéèêëíìîïóòôöõúùûüýÿæœ]/.test(ch);
}

/** ¿Es una letra consonántica? */
export function isConsonant(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[a-zñçß]/.test(ch) && !isVowel(ch);
}

/**
 * Quita los diacríticos de una letra (á → a). Se usa para decidir reglas que
 * dependen de la vocal base y no de su acento (p. ej. "c" ante e/i incluye
 * "cé" y "cí").
 */
export function stripDiacritics(ch: string): string {
  return ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** ¿La letra, ignorando acentos, es "e" o "i"? (regla de palatalización). */
export function isFrontVowel(ch: string | undefined): boolean {
  if (!ch) return false;
  const base = stripDiacritics(ch);
  return base === 'e' || base === 'i' || base === 'y';
}
