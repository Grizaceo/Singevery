import { describe, it, expect, afterEach } from 'vitest';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import {
  DEFAULT_LOCALE,
  getLocale,
  normalizeLocale,
  setLocale,
  t,
  type MessageKey,
} from '../src/i18n';

/** Placeholders `{nombre}` de una plantilla. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe('i18n', () => {
  afterEach(() => {
    setLocale(DEFAULT_LOCALE);
  });

  it('en y es tienen exactamente las mismas claves', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('ningún texto está vacío', () => {
    for (const [key, text] of Object.entries(en)) {
      expect(text.trim(), `en:${key}`).not.toBe('');
    }
    for (const [key, text] of Object.entries(es)) {
      expect(text.trim(), `es:${key}`).not.toBe('');
    }
  });

  it('cada clave usa los mismos placeholders en ambos idiomas', () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('el idioma por defecto es inglés', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(getLocale()).toBe('en');
    expect(t('status.listening')).toBe(en['status.listening']);
  });

  it('t devuelve el texto del idioma activo y sustituye parámetros', () => {
    setLocale('es');
    expect(t('status.listening')).toBe('Escuchando...');
    expect(t('errors.referenceTooManyPoints', { count: 7, max: 100 })).toBe(
      'La curva tiene 7 puntos y el máximo es 100.',
    );
    setLocale('en');
    expect(t('errors.referenceTooManyPoints', { count: 7, max: 100 })).toBe(
      'The curve has 7 points and the maximum is 100.',
    );
  });

  it('cae a inglés si falta la clave en el idioma activo, y a la clave si falta en ambos', () => {
    setLocale('es');
    // Todas las claves existen hoy; el fallback se ejercita con una clave
    // inventada casteada: debe devolver la propia clave, nunca vacío.
    const missing = 'clave.que.no.existe' as MessageKey;
    expect(t(missing)).toBe('clave.que.no.existe');
  });

  it('normalizeLocale acepta español y variantes, y cae a inglés con lo demás', () => {
    expect(normalizeLocale('es')).toBe('es');
    expect(normalizeLocale('es-ES')).toBe('es');
    expect(normalizeLocale(' ES ')).toBe('es');
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale(42)).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
  });
});
