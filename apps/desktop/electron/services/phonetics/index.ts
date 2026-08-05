// ============================================================================
// phonetics/index.ts — punto único de entrada al IPA de alfabeto latino.
//
// El japonés vive aparte (`services/ipa.ts`, kana → IPA): su entrada no son
// grafemas latinos sino el kana que ya produjo kuroshiro. Este módulo cubre las
// lenguas que comparten alfabeto y por eso necesitan primero saber CUÁL son.
//
// Flujo completo:
//   letra → detectLatinLanguage(todas las líneas) → latinToIpa(línea, idioma)
//
// La detección se hace UNA vez por canción, no por línea: una línea suelta
// ("oh oh oh") no tiene evidencia suficiente, y cambiar de motor a mitad de
// canción produciría transcripciones incoherentes entre versos.
// ============================================================================

import { frenchToIpa } from './french';
import { germanToIpa } from './german';
import { italianToIpa } from './italian';
import { spanishToIpa, type SpanishVariant } from './spanish';
import type { IpaLang } from './langDetect';

export { detectLatinLanguage, scoreLanguages, hasIpaEngine, IPA_LANGS } from './langDetect';
export type { DetectedLang, IpaLang } from './langDetect';
export type { SpanishVariant } from './spanish';

export interface LatinIpaOptions {
  /** Norma del español: seseo americano (por defecto) o distinción castellana. */
  spanishVariant?: SpanishVariant;
}

/** Nombre legible del idioma, para la UI y los tooltips. */
export const LANG_LABEL: Record<IpaLang, string> = {
  es: 'español',
  it: 'italiano',
  fr: 'francés',
  de: 'alemán',
};

/**
 * Cuánto se puede confiar en la transcripción de cada idioma.
 *
 * Esto NO es decoración: la app se va a usar para aprender, y presentar una
 * aproximación con la misma autoridad que una regla exacta es exactamente el
 * tipo de afirmación que no se debe hacer. La UI muestra este valor.
 */
export const LANG_ACCURACY: Record<IpaLang, 'exacta' | 'aproximada'> = {
  es: 'exacta',
  it: 'exacta',
  fr: 'aproximada',
  de: 'aproximada',
};

/** Qué queda fuera en cada idioma, en una línea, para mostrarlo al usuario. */
export const LANG_CAVEAT: Record<IpaLang, string> = {
  es: 'Norma configurable en Ajustes (seseo o distinción). Sin marca de acento tónico ni encadenamiento entre palabras.',
  it: 'e/o abiertas o cerradas solo se distinguen cuando la palabra lleva tilde; z se transcribe sorda.',
  fr: 'Sin liaison entre palabras; el final -ent verbal y algunos timbres son aproximados.',
  de: 'La cantidad de la vocal ante ⟨ch⟩ es léxica y se resuelve breve; los préstamos conservan su fonética original.',
};

/**
 * Transcribe una línea al IPA del idioma indicado.
 *
 * Devuelve cadena vacía si no hay nada que transcribir, para que quien llame
 * pueda decidir no guardar el campo.
 */
export function latinToIpa(text: string, lang: IpaLang, options: LatinIpaOptions = {}): string {
  if (!text.trim()) return '';
  switch (lang) {
    case 'es':
      return spanishToIpa(text, options.spanishVariant ?? 'seseo');
    case 'it':
      return italianToIpa(text);
    case 'fr':
      return frenchToIpa(text);
    case 'de':
      return germanToIpa(text);
  }
}

export { spanishToIpa, italianToIpa, frenchToIpa, germanToIpa };
