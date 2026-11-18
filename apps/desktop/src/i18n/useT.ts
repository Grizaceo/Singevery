// ============================================================================
// useT.ts — hooks de idioma para los componentes del renderer.
//
// Los componentes llaman `const t = useT()` y usan `t('clave')`. El hook se
// suscribe al contexto de idioma: cuando el usuario cambia el idioma en
// Ajustes, el provider actualiza el contexto y todo componente que llamó
// useT() se vuelve a renderizar con los textos nuevos.
//
// Código que no es componente (hooks con mensajes, helpers) puede importar
// `t` directamente de './index': lee el idioma activo en el momento de
// llamarse, así que basta con no cachear el texto en una constante de módulo.
// ============================================================================

import { createContext, useContext } from 'react';
import { getLocale, t, type Locale } from './index';

export const LocaleContext = createContext<Locale>(getLocale());

/** Devuelve `t` y suscribe el componente a los cambios de idioma. */
export function useT(): typeof t {
  useContext(LocaleContext);
  return t;
}

/** Idioma activo de la interfaz ('en' | 'es'). */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}
