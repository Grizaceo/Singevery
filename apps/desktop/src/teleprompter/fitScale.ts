// ============================================================================
// fitScale.ts — el HUD se ajusta al tamaño REAL de la ventana.
//
// Caso real (17-11): al achicar la ventana a 500×330 la línea actual seguía en
// 4rem y el panel medía 612 px de alto: la letra quedaba cortada arriba y
// abajo. Las tallas eran rem fijos que no miraban el tamaño de la ventana.
//
// Dos capas:
//   1. Escala por viewport: proporcional al tamaño de referencia (760×560, el
//      preset "L"); nunca agranda (eso lo decide el usuario con fontScale).
//   2. Corrección medida: si aun así el contenido no cabe (líneas largas,
//      lectura + traducción), se achica en proporción a lo que sobra. Solo
//      baja dentro de un mismo contexto (tamaño de ventana + canción + modo),
//      así la letra no "respira" línea a línea; al cambiar el contexto vuelve
//      a empezar.
// ============================================================================
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export const FIT_REF_WIDTH = 760;
export const FIT_REF_HEIGHT = 560;
/** Por debajo de esto el texto deja de leerse; mejor recortar que ilegible. */
export const FIT_MIN = 0.3;

/** Escala por tamaño de ventana (0.3–1). Pura. */
export function viewportFitScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const scale = Math.min(width / FIT_REF_WIDTH, height / FIT_REF_HEIGHT);
  return Math.min(1, Math.max(FIT_MIN, scale));
}

/**
 * Factor (≤1) para que `needed` quepa en `available`. 1 si ya cabe (con 1 %
 * de tolerancia para no oscilar por redondeos). Un 3 % extra de holgura
 * evita quedar justo en el borde. Pura.
 */
export function overflowCorrection(needed: number, available: number): number {
  if (!(available > 0) || !(needed > 0) || needed <= available * 1.01) return 1;
  return (available / needed) * 0.97;
}

/**
 * Escala efectiva del HUD: viewport × corrección medida.
 * @param containerRef contenedor de altura fija (100vh)
 * @param contentRef   contenido que debe caber (el panel de letra)
 * @param contextKey   cambia cuando cambia lo que se muestra (canción, modo
 *                     de lectura, traducción, contexto, tamaño de fuente)
 */
export function useFitScale(
  containerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  contextKey: string,
): number {
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = (): void => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const base = viewportFitScale(viewport.w, viewport.h);
  const key = `${viewport.w}x${viewport.h}|${contextKey}`;
  const [guard, setGuard] = useState<{ key: string; value: number }>({ key, value: 1 });
  const guardValue = guard.key === key ? guard.value : 1;
  const fit = Math.max(FIT_MIN, base * guardValue);

  // Tras CADA render (sin dependencias a propósito: el contenido cambia con
  // cada línea): si no cabe, achicar en proporción. No hay bucle infinito:
  // setGuard solo actúa si baja, y tiene piso en FIT_MIN.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const style = getComputedStyle(container);
    const availableH =
      container.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0');
    const availableW =
      container.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
    const correction = Math.min(
      overflowCorrection(content.scrollHeight, availableH),
      overflowCorrection(content.scrollWidth, availableW),
    );
    if (correction >= 1 || fit <= FIT_MIN) return;
    setGuard((prev) => {
      const current = prev.key === key ? prev.value : 1;
      const next = Math.max(FIT_MIN / base, current * correction);
      return next < current ? { key, value: next } : prev.key === key ? prev : { key, value: current };
    });
  });

  return fit;
}
