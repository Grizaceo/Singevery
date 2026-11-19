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

import { englishToIpa, isEnglishDictionaryLoaded, loadEnglishDictionary } from './english';
import { frenchToIpa } from './french';
import { germanToIpa } from './german';
import { italianToIpa } from './italian';
import { spanishToIpa, type SpanishVariant } from './spanish';
import { t, type MessageKey } from '../../../src/i18n';
import type { IpaLang } from './langDetect';

export { detectLatinLanguage, scoreLanguages, hasIpaEngine, IPA_LANGS } from './langDetect';
export type { DetectedLang, IpaLang } from './langDetect';
export type { SpanishVariant } from './spanish';
export { loadEnglishDictionary, isEnglishDictionaryLoaded };

export interface LatinIpaOptions {
  /** Norma del español: seseo americano (por defecto) o distinción castellana. */
  spanishVariant?: SpanishVariant;
}

const IPA_LABEL_KEYS: Record<IpaLang, MessageKey> = {
  es: 'ipa.lang.es',
  it: 'ipa.lang.it',
  fr: 'ipa.lang.fr',
  de: 'ipa.lang.de',
  en: 'ipa.lang.en',
};

const IPA_CAVEAT_KEYS: Record<IpaLang, MessageKey> = {
  es: 'ipa.caveat.es',
  it: 'ipa.caveat.it',
  fr: 'ipa.caveat.fr',
  de: 'ipa.caveat.de',
  en: 'ipa.caveat.en',
};

/**
 * Etiqueta legible del idioma para la UI. Se resuelve con t() en el momento:
 * el idioma de la interfaz puede cambiar sin reiniciar la app.
 */
export function ipaLangLabel(lang: IpaLang): string {
  return t(IPA_LABEL_KEYS[lang]);
}

/** Idiomas cuya transcripción IPA es exacta por regla (el resto, aproximada). */
const EXACT_IPA_LANGS: ReadonlySet<IpaLang> = new Set(['es', 'it']);

/**
 * Cuánto se puede confiar en la transcripción de cada idioma, como texto ya
 * traducido. NO es decoración: la app se va a usar para aprender, y presentar
 * una aproximación con la misma autoridad que una regla exacta es
 * exactamente el tipo de afirmación que no se debe hacer. La UI lo muestra.
 */
export function ipaLangAccuracy(lang: IpaLang): string {
  return t(EXACT_IPA_LANGS.has(lang) ? 'ipa.accuracy.exact' : 'ipa.accuracy.approx');
}

/** Qué queda fuera en cada idioma, en una línea, para mostrarlo al usuario. */
export function ipaLangCaveat(lang: IpaLang): string {
  return t(IPA_CAVEAT_KEYS[lang]);
}

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
    case 'en':
      return englishToIpa(text);
  }
}

export { spanishToIpa, italianToIpa, frenchToIpa, germanToIpa, englishToIpa };
