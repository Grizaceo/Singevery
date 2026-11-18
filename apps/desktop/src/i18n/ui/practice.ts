// ============================================================================
// ui/practice.ts — textos de la interfaz: práctica, monitor de afinación, tira de melodía y ticket de soporte.
//
// Claves con el prefijo 'practice.'. `esPractice` debe tener exactamente las mismas
// claves que `enPractice` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enPractice = {
} as const;

export const esPractice: { [K in keyof typeof enPractice]: string } = {
};
