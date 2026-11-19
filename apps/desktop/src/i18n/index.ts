// ============================================================================
// i18n — módulo compartido de textos de la interfaz.
//
// TS puro: sin DOM ni React, importable desde el proceso main (Electron) y
// desde el renderer (Vite). Cada proceso mantiene su propia instancia del
// estado `current`; el main lo sincroniza con el ajuste persistido `uiLanguage`
// y lo propaga al renderer por IPC.
//
// Uso: t('status.listening') o t('errors.referenceTooManyPoints', { count, max }).
// Los placeholders son `{nombre}` y se sustituyen con `params`.
// ============================================================================

import { en } from './en';
import { es } from './es';

export type Locale = 'en' | 'es';
export type MessageKey = keyof typeof en;

export const DEFAULT_LOCALE: Locale = 'en';

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, es };

let current: Locale = DEFAULT_LOCALE;

/** Idiomas admitidos por la configuración. */
export function normalizeLocale(value: unknown): Locale {
  // Solo el español exacto (o variantes regionales es-*) mantiene el idioma
  // original de la app; cualquier otra cosa cae al inglés por defecto.
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'es' || v.startsWith('es-')) return 'es';
  }
  return 'en';
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/**
 * Devuelve el texto de `key` en el idioma activo, sustituyendo los
 * placeholders `{nombre}` con `params`. Fallback: idioma activo → inglés →
 * la propia clave (así un texto nunca queda vacío ni rompe la UI).
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text = MESSAGES[current][key] ?? MESSAGES.en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
