// ============================================================================
// ui/reading.ts — textos de la interfaz: controles de lectura, reconocimiento, búsqueda manual y guía IPA (componente).
//
// Claves con el prefijo 'reading.'. `esReading` debe tener exactamente las mismas
// claves que `enReading` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enReading = {
} as const;

export const esReading: { [K in keyof typeof enReading]: string } = {
};
