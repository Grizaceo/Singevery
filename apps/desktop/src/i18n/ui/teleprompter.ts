// ============================================================================
// ui/teleprompter.ts — textos de la interfaz: teleprompter, líneas, cabecera de pista y etiquetas de estado.
//
// Claves con el prefijo 'teleprompter.'. `esTeleprompter` debe tener exactamente las mismas
// claves que `enTeleprompter` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enTeleprompter = {
} as const;

export const esTeleprompter: { [K in keyof typeof enTeleprompter]: string } = {
};
