// ============================================================================
// ui/app.ts — textos de la interfaz: App.tsx, bienvenida beta y controles de sincronización.
//
// Claves con el prefijo 'app.'. `esApp` debe tener exactamente las mismas
// claves que `enApp` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enApp = {
} as const;

export const esApp: { [K in keyof typeof enApp]: string } = {
};
