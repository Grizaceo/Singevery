// ============================================================================
// react.tsx — I18nProvider: sincroniza el idioma del renderer con el ajuste
// persistido `uiLanguage` del proceso main.
//
// Al montar pide el idioma con window.api.getUiLanguage() y se suscribe a
// onUiLanguageChanged. Cada cambio llama setLocale() (para que `t` devuelva el
// idioma nuevo) y actualiza el contexto, que vuelve a renderizar a quienes
// usan useT(). Sin window.api (tests, navegador) se queda en el idioma por
// defecto.
// ============================================================================

import { useEffect, useState, type ReactNode } from 'react';
import { getLocale, normalizeLocale, setLocale, type Locale } from './index';
import { LocaleContext } from './useT';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.api : undefined;
    if (!api?.getUiLanguage) return;
    let alive = true;
    const apply = (language: unknown) => {
      const next = normalizeLocale(language);
      setLocale(next);
      if (alive) setLocaleState(next);
    };
    api
      .getUiLanguage()
      .then((r) => {
        if (r.ok) apply(r.language);
      })
      .catch(() => {});
    const off = api.onUiLanguageChanged?.(apply);
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
