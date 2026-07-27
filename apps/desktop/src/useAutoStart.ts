import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'espejo.autoStart';

/**
 * ¿Empezar a escuchar el audio del sistema al abrir la app?
 *
 * Por defecto sí: es la fuente que mejor sincroniza y la que se usa casi
 * siempre, así que obligar a pulsar SING cada vez era fricción pura. Se puede
 * desactivar porque implica capturar el audio del equipo desde el arranque, y
 * eso no debería ser una decisión invisible para quien instala la app.
 *
 * El micrófono NUNCA arranca solo: es una fuente que el usuario elige a mano.
 */
export function useAutoStart(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(() => {
    try {
      // Ausente = primera ejecución → activado.
      return localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
      return true;
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
