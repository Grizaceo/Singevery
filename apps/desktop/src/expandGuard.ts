// ============================================================================
// expandGuard.ts — clics que llegan justo después de expandir la pastilla.
//
// Un doble clic en SING expandía la ventana con el primer clic y el segundo
// caía sobre el widget ya expandido. En Wayland los botones del ratón no
// traen coordenadas: Chromium usa la última posición conocida del cursor
// dentro de la ventana, que era la de la pastilla. En el widget expandido ese
// mismo punto es el botón Cerrar (o Colapsar), así que el doble clic cerraba
// la app. Durante un instante tras expandir se descartan los clics.
// ============================================================================

/** Margen tras expandir en que se ignoran los clics (cubre un doble clic). */
export const EXPAND_GUARD_MS = 600;

/** Eventos de puntero que se descartan durante el margen. */
export const GUARDED_POINTER_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
] as const;

/** true si `now` cae dentro del margen que empezó en `expandedAt` (ms). */
export function withinExpandGuard(
  now: number,
  expandedAt: number | null,
  guardMs: number = EXPAND_GUARD_MS,
): boolean {
  if (expandedAt === null) return false;
  const elapsed = now - expandedAt;
  return elapsed >= 0 && elapsed < guardMs;
}
