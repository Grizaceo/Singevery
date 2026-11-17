// ============================================================================
// useFitBar — compacta una barra de controles cuando no cabe a lo ancho.
//
// Caso real (17-11): con la ventana en 340 px la barra superior necesitaba
// 417 px y los botones de la derecha quedaban cortados. Se mide con zoom 1 y,
// si no cabe, se aplica `zoom` (reduce el layout, no solo el dibujo) hasta un
// mínimo legible.
// ============================================================================
import { useEffect, useLayoutEffect, type RefObject } from 'react';

export const BAR_MIN_ZOOM = 0.6;

/** Zoom (≤1) para que `needed` px quepan en `available`. Pura. */
export function barZoom(needed: number, available: number): number {
  if (!(available > 0) || !(needed > available)) return 1;
  return Math.max(BAR_MIN_ZOOM, Math.floor((available / needed) * 100) / 100);
}

/**
 * Decide cómo acomodar la barra (pura): una sola fila con zoom si cabe con el
 * zoom mínimo; si ni así, se permite envolver en varias filas con el zoom
 * mínimo (mejor dos filas legibles que una fila ilegible).
 */
export function barLayout(neededSingleRow: number, available: number): { singleRow: boolean; zoom: number } {
  if (!(available > 0) || !(neededSingleRow > available)) return { singleRow: true, zoom: 1 };
  if (neededSingleRow * BAR_MIN_ZOOM <= available) {
    return { singleRow: true, zoom: barZoom(neededSingleRow, available) };
  }
  return { singleRow: false, zoom: BAR_MIN_ZOOM };
}

function fit(el: HTMLElement): void {
  // Medir como UNA fila sin zoom: con flex-wrap la barra envolvía en vez de
  // desbordar y nunca se compactaba (caso real a 330 px: los botones de
  // reconocimiento quedaban apilados en columna).
  el.classList.add('fit-single-row');
  el.style.zoom = '1';
  const { singleRow, zoom } = barLayout(el.scrollWidth, el.clientWidth);
  el.classList.toggle('fit-single-row', singleRow);
  el.style.zoom = zoom === 1 ? '' : String(zoom);
}

export function useFitBar(ref: RefObject<HTMLElement | null>): void {
  // Tras cada render (el contenido de la barra cambia con la canción y el modo).
  useLayoutEffect(() => {
    if (ref.current) fit(ref.current);
  });
  useEffect(() => {
    const onResize = (): void => {
      if (ref.current) fit(ref.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ref]);
}
