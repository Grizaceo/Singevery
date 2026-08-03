import { useCallback, useEffect, useState } from 'react';
import type { TranslationView } from './types';

const STORAGE_KEY = 'espejo.translationView';
/** Clave previa (booleana). Se migra a 'below' para no perder la preferencia. */
const LEGACY_STORAGE_KEY = 'espejo.showTranslation';
const EXTERNAL_CONSENT_KEY = 'singevery.translation-external-consent.v1';
const VALID: TranslationView[] = ['off', 'below', 'side'];

function load(): TranslationView {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as TranslationView | null;
    if (stored && VALID.includes(stored)) return stored;
    // Migración desde el toggle booleano antiguo.
    if (localStorage.getItem(LEGACY_STORAGE_KEY) === '1') return 'below';
  } catch {
    /* localStorage no disponible */
  }
  return 'off';
}

/**
 * Pide consentimiento para enviar la letra a un proveedor externo (una sola
 * vez, se recuerda). Devuelve true si se puede traducir (proveedor local,
 * ya aceptado, o el usuario aceptó ahora).
 */
export async function ensureExternalTranslationConsent(): Promise<boolean> {
  if (!window.api?.getTranslationSettings) return false;
  try {
    const settings = await window.api.getTranslationSettings();
    if (settings.translation.provider === 'local') return true;
    const alreadyAccepted = localStorage.getItem(EXTERNAL_CONSENT_KEY) === '1';
    if (alreadyAccepted) return true;
    const accepted = window.confirm(
      'Para traducir, el texto completo de la letra se enviará al proveedor externo ' +
        'configurado. No se envía audio. ¿Quieres continuar y recordar esta decisión?',
    );
    if (accepted) localStorage.setItem(EXTERNAL_CONSENT_KEY, '1');
    return accepted;
  } catch {
    return false;
  }
}

/**
 * Vista de traducción (off / debajo / lado a lado), persistida en localStorage.
 * Al activar cualquier modo con traducción se pide traducir la letra cargada;
 * si falla, vuelve a 'off' y expone el error.
 */
export function useTranslationView(): [
  TranslationView,
  (view: TranslationView) => void,
  { loading: boolean; error: string | null; translate: () => Promise<boolean> },
] {
  const [view, setView] = useState<TranslationView>(load);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  const translate = useCallback(async (): Promise<boolean> => {
    if (!window.api?.requestTranslation) return false;
    if (!(await ensureExternalTranslationConsent())) return false;

    setLoading(true);
    setError(null);
    try {
      const result = await window.api.requestTranslation();
      if (!result.ok) {
        setError(result.error ?? 'No se pudo traducir');
        return false;
      }
      return true;
    } catch {
      setError('Error al solicitar traducción');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const set = useCallback(
    async (next: TranslationView) => {
      setView(next);
      if (next === 'off') {
        setError(null);
        return;
      }
      const ok = await translate();
      if (!ok) setView('off');
    },
    [translate],
  );

  return [view, set, { loading, error, translate }];
}
