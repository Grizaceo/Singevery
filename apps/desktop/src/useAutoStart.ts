import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'espejo.autoStart';

/**
 * ¿Empezar a escuchar el audio del sistema al abrir la app?
 *
 * Por defecto no: una instalación nueva exige que la persona pulse SING o lo
 * habilite explícitamente en Ajustes. Los usuarios que ya eligieron un valor
 * conservan su preferencia.
 *
 * El micrófono NUNCA arranca solo: es una fuente que el usuario elige a mano.
 */
export function useAutoStart(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      /* localStorage no disponible */
    }
  }, [enabled]);

  return [enabled, useCallback((next: boolean) => setEnabled(next), [])];
}
