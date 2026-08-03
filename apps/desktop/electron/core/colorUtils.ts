// ============================================================================
// colorUtils — utilidades de color del widget (auto-contraste).
// Extraído de stateStore.ts (modularización god file, 2026-08-03).
// ============================================================================

/** Umbral de luminancia relativa: por debajo = color de texto "oscuro". */
export function isColorDark(hex: string): boolean {
  const match = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return false;
  const n = parseInt(match[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.45;
}
