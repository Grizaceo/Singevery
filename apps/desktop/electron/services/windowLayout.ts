// ============================================================================
// windowLayout — helpers puros de geometría de ventana (testeables).
// ============================================================================

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tamaño de la viñeta (pill) colapsada. */
export const PILL_WIDTH = 156;
export const PILL_HEIGHT = 48;

/**
 * Calcula los bounds de la pill: centrada horizontalmente y pegada arriba del
 * área de trabajo (workArea) del display, con un margen superior.
 */
export function pillBounds(
  workArea: Rect,
  pillW: number = PILL_WIDTH,
  pillH: number = PILL_HEIGHT,
  margin = 8,
): Rect {
  return {
    x: Math.round(workArea.x + (workArea.width - pillW) / 2),
    y: workArea.y + margin,
    width: pillW,
    height: pillH,
  };
}

/**
 * Bounds expandidos por defecto: centrados en el workArea. Fallback cuando no
 * hay bounds guardados al expandir (p. ej. expand sin colapsar previo).
 */
export function expandedBounds(
  workArea: Rect,
  width: number,
  height: number,
): Rect {
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}
