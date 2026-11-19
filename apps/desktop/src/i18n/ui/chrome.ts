// ============================================================================
// ui/chrome.ts — textos de la interfaz: barras, controles de ventana, pestañita, pastilla y redimensionado.
//
// Claves con el prefijo 'chrome.'. `esChrome` debe tener exactamente las mismas
// claves que `enChrome` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enChrome = {
  'chrome.topBar.importError': 'Could not import lyrics',
  'chrome.topBar.importStatus': '{count} lines · {mode}',
  'chrome.topBar.importSynced': 'synced',
  'chrome.topBar.importPlain': 'plain text',
  'chrome.topBar.importTitle': 'Import your own or authorized lyrics (LRC/TXT)',
  'chrome.topBar.importAria': 'Import LRC or TXT lyrics',
  'chrome.topBar.settingsTitle': 'Settings',
  'chrome.topBar.openSettings': 'Open settings',

  'chrome.windowControls.collapseTitle': 'Collapse to pill (SING)',
  'chrome.windowControls.collapseAria': 'Collapse to pill',
  'chrome.windowControls.close': 'Close',
  'chrome.windowControls.largeTitle': 'Large (760×560)',
  'chrome.windowControls.largeAria': 'Large size',

  'chrome.handle.dragClickTitle': 'Drag to move · click to toggle click-through mode',
  'chrome.handle.dragDoubleTitle': 'Drag to move · double-click to toggle click-through mode',
  'chrome.handle.aria': 'Move widget and show controls',

  'chrome.resizeGrip.title': 'Drag to resize',
  'chrome.resizeGrip.aria': 'Resize window',

  'chrome.pill.playing': 'SING — now playing “{title}” · click to open',
  'chrome.pill.idle': 'SING — find the song playing',
  'chrome.pill.dragTitle': 'Drag to move',
} as const;

export const esChrome: { [K in keyof typeof enChrome]: string } = {
  'chrome.topBar.importError': 'No se pudo importar',
  'chrome.topBar.importStatus': '{count} líneas · {mode}',
  'chrome.topBar.importSynced': 'sincronizada',
  'chrome.topBar.importPlain': 'texto plano',
  'chrome.topBar.importTitle': 'Importar letra propia o autorizada (LRC/TXT)',
  'chrome.topBar.importAria': 'Importar letra LRC o TXT',
  'chrome.topBar.settingsTitle': 'Ajustes',
  'chrome.topBar.openSettings': 'Abrir ajustes',

  'chrome.windowControls.collapseTitle': 'Colapsar a viñeta (SING)',
  'chrome.windowControls.collapseAria': 'Colapsar a viñeta',
  'chrome.windowControls.close': 'Cerrar',
  'chrome.windowControls.largeTitle': 'Grande (760×560)',
  'chrome.windowControls.largeAria': 'Tamaño grande',

  'chrome.handle.dragClickTitle': 'Arrastra para mover · click para modo transparente',
  'chrome.handle.dragDoubleTitle': 'Arrastra para mover · doble click para modo transparente',
  'chrome.handle.aria': 'Mover widget y mostrar controles',

  'chrome.resizeGrip.title': 'Arrastra para redimensionar',
  'chrome.resizeGrip.aria': 'Redimensionar ventana',

  'chrome.pill.playing': 'SING — suena «{title}» · clic para abrir',
  'chrome.pill.idle': 'SING — buscar la canción que suena',
  'chrome.pill.dragTitle': 'Arrastra para mover',
};
