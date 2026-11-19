// ============================================================================
// ui/teleprompter.ts — textos de la interfaz: teleprompter, líneas, cabecera de pista y etiquetas de estado.
//
// Claves con el prefijo 'teleprompter.'. `esTeleprompter` debe tener exactamente las mismas
// claves que `enTeleprompter` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enTeleprompter = {
  'teleprompter.sideBySide.lyrics': 'Lyrics',
  'teleprompter.sideBySide.translation': 'Translation',
  'teleprompter.hiddenLyrics': 'Hidden lyrics',
  'teleprompter.translationLine': 'Translation: {text}',
  // Etiquetas cortas de estado en la cabecera de la pista (TrackHeader).
  'teleprompter.status.idle': 'Waiting',
  'teleprompter.status.listening': 'Listening',
  'teleprompter.status.identifying': 'Identifying',
  'teleprompter.status.fetchingLyrics': 'Finding lyrics',
  'teleprompter.status.noLyrics': 'No lyrics',
  'teleprompter.status.error': 'Error',
} as const;

export const esTeleprompter: { [K in keyof typeof enTeleprompter]: string } = {
  'teleprompter.sideBySide.lyrics': 'Letra',
  'teleprompter.sideBySide.translation': 'Traducción',
  'teleprompter.hiddenLyrics': 'Letra oculta',
  'teleprompter.translationLine': 'Traducción: {text}',
  'teleprompter.status.idle': 'Esperando',
  'teleprompter.status.listening': 'Escuchando',
  'teleprompter.status.identifying': 'Identificando',
  'teleprompter.status.fetchingLyrics': 'Buscando letra',
  'teleprompter.status.noLyrics': 'Sin letra',
  'teleprompter.status.error': 'Error',
};
