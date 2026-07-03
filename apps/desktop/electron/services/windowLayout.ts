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

/** Valida que los bounds intersecten algún display (multi-monitor). */
export function isWindowBoundsValid(
  bounds: Rect,
  displays: Array<{ x: number; y: number; width: number; height: number }>,
): boolean {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return displays.some((d) => {
    const dRight = d.x + d.width;
    const dBottom = d.y + d.height;
    return bounds.x < dRight && right > d.x && bounds.y < dBottom && bottom > d.y;
  });
}

/** El centro de la ventana debe caer dentro de algún display (evita monitores apagados). */
export function isWindowBoundsVisible(
  bounds: Rect,
  displays: Array<{ x: number; y: number; width: number; height: number }>,
): boolean {
  if (!isWindowBoundsValid(bounds, displays)) return false;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return displays.some((d) => {
    const right = d.x + d.width;
    const bottom = d.y + d.height;
    return cx >= d.x && cx < right && cy >= d.y && cy < bottom;
  });
}

/**
 * Resuelve bounds iniciales: usa saved si visible; si no, centrado en workArea.
 * En dev ignora saved (siempre monitor primario) para evitar ventanas perdidas.
 */
export function resolveInitialWindowBounds(
  saved: Rect | null,
  displays: Array<{ x: number; y: number; width: number; height: number }>,
  primaryWorkArea: Rect,
  defaultWidth: number,
  defaultHeight: number,
  devMode = false,
): Rect {
  if (!devMode && saved && isWindowBoundsVisible(saved, displays)) {
    return saved;
  }
  return expandedBounds(primaryWorkArea, defaultWidth, defaultHeight);
}
