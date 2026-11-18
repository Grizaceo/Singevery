// ============================================================================
// ui/hooks.ts — textos de la interfaz: mensajes de los hooks y de src/audio.
//
// Claves con el prefijo 'hooks.'. `esHooks` debe tener exactamente las mismas
// claves que `enHooks` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enHooks = {
} as const;

export const esHooks: { [K in keyof typeof enHooks]: string } = {
};
