// ============================================================================
// ui/app.ts — textos de la interfaz: App.tsx, bienvenida beta y controles de sincronización.
//
// Claves con el prefijo 'app.'. `esApp` debe tener exactamente las mismas
// claves que `enApp` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enApp = {
  // ---- App.tsx: badge de modo tangible --------------------------------------
  'app.tangible.title': 'Interactive mode',
  'app.tangible.toRelease': 'to release',
  'app.tangible.toMove': 'to move',
  'app.tangible.arrows': 'arrows',

  // ---- App.tsx: aviso de modo intangible -------------------------------------
  'app.ghostNotice.autoOpen':
    'Opened in click-through mode so it wouldn’t get in the way · double-click the tab to use it · ',
  'app.ghostNotice.idle':
    'Click-through after inactivity · double-click the tab to go back · ',
  'app.ghostNotice.forceTangible': 'forces interactive mode',

  // ---- BetaWelcome.tsx --------------------------------------------------------
  'app.beta.kicker': 'Beta for teacher evaluation',
  'app.beta.title': 'Welcome to Singevery',
  'app.beta.introBefore':
    'This version lets you try synced lyrics, reading, recognition, and pitch support. On a fresh install it won’t listen until you press ',
  'app.beta.introAfter': '.',
  'app.beta.step1Title': 'Play a song',
  'app.beta.step1Desc': 'Press SING to recognize system audio.',
  'app.beta.step2Title': 'Try voice and reading',
  'app.beta.step2Desc': 'Turn on the mic or tuner only when you want to practice.',
  'app.beta.step3Title': 'Tell us what breaks',
  'app.beta.step3Desc':
    'Settings → Help & beta prepares a ticket you review before sending.',
  'app.beta.privacy':
    'Tickets and diagnostics are saved on your device first; they are never uploaded automatically.',
  'app.beta.guideError': 'Could not open the beta guide',
  'app.beta.openGuide': 'Open testing guide',
  'app.beta.viewSettings': 'View settings',
  'app.beta.start': 'Get started',

  // ---- SyncHoldBadge.tsx ------------------------------------------------------
  'app.syncHold.manualTitle':
    'Manual mode: lyrics stay still until you press Sync',
  'app.syncHold.manual': 'manual',
  'app.syncHold.unsynced': 'lyrics not synced',

  // ---- SyncControls.tsx -------------------------------------------------------
  'app.sync.resume': 'Sync',
  'app.sync.resumeTitle': 'Resume following the song automatically',
  'app.sync.resumeAria': 'Sync: resume following the song automatically',
  'app.sync.toggleTitle':
    'Adjust lyric sync (line jumps, offset, calibration). The mouse wheel also adjusts the drift.',
  'app.sync.toggleAria': 'Adjust sync',
  'app.sync.panelAria': 'Sync settings',
  'app.sync.prevLine': 'Go back one line',
  'app.sync.nextLine': 'Skip forward one line',
  'app.sync.lineLabel': 'line',
  'app.sync.delayTitle': 'Delay lyrics {ms}ms (this track)',
  'app.sync.delayAria': 'Delay lyrics',
  'app.sync.offsetTitle': 'Sync offset (this track)',
  'app.sync.advanceTitle': 'Advance lyrics {ms}ms (this track)',
  'app.sync.advanceAria': 'Advance lyrics',
  'app.sync.applyAllTitle':
    'This offset happens on every song: apply it globally so upcoming songs are already in sync',
  'app.sync.applyAllAria': 'Apply this adjustment to all songs',
  'app.sync.decreaseCalibTitle': 'Decrease global calibration {ms}ms',
  'app.sync.decreaseCalibAria': 'Decrease calibration',
  'app.sync.calibTitle': 'Global latency calibration',
  'app.sync.increaseCalibTitle': 'Increase global calibration {ms}ms',
  'app.sync.increaseCalibAria': 'Increase calibration',
  'app.sync.calibrationLabel': 'calibration',
} as const;

export const esApp: { [K in keyof typeof enApp]: string } = {
  // ---- App.tsx: badge de modo tangible --------------------------------------
  'app.tangible.title': 'Modo tangible',
  'app.tangible.toRelease': 'para soltar',
  'app.tangible.toMove': 'para mover',
  'app.tangible.arrows': 'flechas',

  // ---- App.tsx: aviso de modo intangible -------------------------------------
  'app.ghostNotice.autoOpen':
    'Se abrió en modo intangible para no interrumpirte · doble clic en la pestañita para usarlo · ',
  'app.ghostNotice.idle':
    'Intangible por inactividad · doble clic en la pestañita para volver · ',
  'app.ghostNotice.forceTangible': 'fuerza el modo tangible',

  // ---- BetaWelcome.tsx --------------------------------------------------------
  'app.beta.kicker': 'Beta para evaluación docente',
  'app.beta.title': 'Bienvenido a Singevery',
  'app.beta.introBefore':
    'Esta versión sirve para probar letras sincronizadas, lectura, reconocimiento y apoyo de afinación. En una instalación nueva no escucha hasta que pulses ',
  'app.beta.introAfter': '.',
  'app.beta.step1Title': 'Reproduce una canción',
  'app.beta.step1Desc': 'Pulsa SING para reconocer el audio del sistema.',
  'app.beta.step2Title': 'Prueba voz y lectura',
  'app.beta.step2Desc':
    'Activa el micrófono o el afinador sólo cuando quieras practicar.',
  'app.beta.step3Title': 'Cuéntanos qué falla',
  'app.beta.step3Desc':
    'Ajustes → Ayuda y beta prepara un ticket que tú revisas antes de enviar.',
  'app.beta.privacy':
    'Los tickets y diagnósticos se guardan primero en tu equipo; no se suben automáticamente.',
  'app.beta.guideError': 'No se pudo abrir la guía beta',
  'app.beta.openGuide': 'Abrir guía de prueba',
  'app.beta.viewSettings': 'Ver ajustes',
  'app.beta.start': 'Empezar',

  // ---- SyncHoldBadge.tsx ------------------------------------------------------
  'app.syncHold.manualTitle':
    'Modo manual: la letra no se mueve sola hasta pulsar Sincronizar',
  'app.syncHold.manual': 'manual',
  'app.syncHold.unsynced': 'letra sin sincronía',

  // ---- SyncControls.tsx -------------------------------------------------------
  'app.sync.resume': 'Sincronizar',
  'app.sync.resumeTitle': 'Volver a seguir la canción automáticamente',
  'app.sync.resumeAria': 'Sincronizar: volver a seguir la canción automáticamente',
  'app.sync.toggleTitle':
    'Ajustar sincronización de la letra (saltos, offset, calibración). La rueda del mouse también ajusta el desfase.',
  'app.sync.toggleAria': 'Ajustar sincronización',
  'app.sync.panelAria': 'Ajustes de sincronización',
  'app.sync.prevLine': 'Retroceder una línea',
  'app.sync.nextLine': 'Adelantar una línea',
  'app.sync.lineLabel': 'línea',
  'app.sync.delayTitle': 'Atrasar letra {ms}ms (esta pista)',
  'app.sync.delayAria': 'Atrasar letra',
  'app.sync.offsetTitle': 'Offset de sincronización (esta pista)',
  'app.sync.advanceTitle': 'Adelantar letra {ms}ms (esta pista)',
  'app.sync.advanceAria': 'Adelantar letra',
  'app.sync.applyAllTitle':
    'Este desfase pasa en todas las canciones: aplicarlo de forma global para que las próximas ya salgan sincronizadas',
  'app.sync.applyAllAria': 'Aplicar este ajuste a todas las canciones',
  'app.sync.decreaseCalibTitle': 'Reducir calibración global {ms}ms',
  'app.sync.decreaseCalibAria': 'Reducir calibración',
  'app.sync.calibTitle': 'Calibración global de latencia',
  'app.sync.increaseCalibTitle': 'Aumentar calibración global {ms}ms',
  'app.sync.increaseCalibAria': 'Aumentar calibración',
  'app.sync.calibrationLabel': 'calibración',
};
