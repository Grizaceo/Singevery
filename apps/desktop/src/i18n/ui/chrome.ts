// ============================================================================
// ui/chrome.ts — textos de la interfaz: barras, controles de ventana, pestañita, pastilla y redimensionado.
//
// Claves con el prefijo 'chrome.'. `esChrome` debe tener exactamente las mismas
// claves que `enChrome` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enChrome = {
} as const;

export const esChrome: { [K in keyof typeof enChrome]: string } = {
};
