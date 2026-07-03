import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'espejo.showTranslation';

/** Toggle de traducción línea a línea, persistido en localStorage. */
export function useTranslationToggle(): [
  boolean,
  (enabled: boolean) => void,
  { loading: boolean; error: string | null },
] {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [enabled]);

  const set = useCallback(async (next: boolean) => {
    setEnabled(next);
    setError(null);
    if (!next || !window.api?.requestTranslation) return;

    setLoading(true);
    try {
      const result = await window.api.requestTranslation();
      if (!result.ok) {
        setError(result.error ?? 'No se pudo traducir');
        setEnabled(false);
      }
    } catch {
      setError('Error al solicitar traducción');
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  return [enabled, set, { loading, error }];
}
