// ============================================================================
// ui/practice.ts — textos de la interfaz: práctica, monitor de afinación, tira de melodía y ticket de soporte.
//
// Claves con el prefijo 'practice.'. `esPractice` debe tener exactamente las mismas
// claves que `enPractice` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enPractice = {
  'practice.csvExported': 'CSV exported',
  'practice.exportError': 'Export failed',
  'practice.revealLyrics': 'Show current lyrics',
  'practice.hideLyricsForEar': 'Hide lyrics to practice by ear',
  'practice.removeLineFromReview': 'Remove line from review',
  'practice.saveLineForReview': 'Save line for review',
  'practice.reviewSavedLines': 'Review saved lines',
  'practice.reviewSavedLinesAria': 'Review {count} saved lines',
  'practice.reviewCount': 'Review {count}',
  'practice.savedLinesAria': 'Lines saved for review',
  'practice.localReview': 'Local review',
  'practice.lineCountOf200': '{count} of 200 lines',
  'practice.exporting': 'Exporting…',
  'practice.exportCsv': 'Export CSV',
  'practice.closeReview': 'Close review',
  'practice.removeLineAria': 'Remove {text}',
  'practice.removeFromReview': 'Remove from review',
  'practice.localOnly': 'Stored only on this device.',
  'practice.guide':
    'Vocal practice: sing and compare your pitch with the song melody. ' +
    'The first time with a song, play it and press ♪: the app captures ~24 s of system audio (loopback), ' +
    'extracts the melody and saves it to a folder on your PC (Settings → Other → Open references folder). ' +
    'Next times with that song, karaoke works directly — no need to capture again. ' +
    'If it is paused, the app waits for it to play (up to 30 s) and captures on its own. ' +
    'For best practice accuracy: quiet room, microphone 15–30 cm away, sing clearly (do not whisper). ' +
    'The reference is the app’s automatic interpretation, not the official score. ' +
    'Right-click ♪: recapture this song’s reference.',
  'practice.refErrorLabel': 'Reference error: {error}',
  'practice.pitchMonitorActive': 'Pitch monitor active — click to stop',
  'practice.vocalPractice': 'Vocal practice (♪)',
  'practice.capturingReference': 'capturing reference…',
  'practice.firstTimeCapture': '1st time: play the song and press ♪',
  'practice.cat.installation': 'Installation or update',
  'practice.cat.startup': 'Startup or window',
  'practice.cat.recognition': 'Song recognition',
  'practice.cat.lyrics': 'Lyrics or sync',
  'practice.cat.pitch': 'Pitch or practice',
  'practice.cat.translation': 'Translation or reading',
  'practice.cat.other': 'Other',
  'practice.preparingTicket': 'Preparing ticket…',
  'practice.ticketFailed': 'Could not prepare the ticket',
  'practice.ticketSavedOpened':
    'Ticket {id} saved. GitHub and the file folder are open: review the JSON and attach it only if you agree.',
  'practice.ticketSavedPath': 'Ticket {id} saved to {path}. {warning}',
  'practice.chosenFile': 'the chosen file',
  'practice.githubOpenFailed': 'Could not open GitHub; you can send it manually.',
  'practice.reportProblem': 'Report a problem',
  'practice.formHint':
    'Creates a local JSON and opens a pre-filled issue on GitHub. Nothing is attached automatically: review ' +
    'the file before sharing it. The issue will be public if the repository is public.',
  'practice.testerLabel': 'Tester name or alias (file only)',
  'practice.testerPlaceholder': 'E.g. Ms. Ana',
  'practice.categoryLabel': 'Category',
  'practice.summaryLabel': 'Summary',
  'practice.summaryPlaceholder': 'E.g. The tuner jumps an octave',
  'practice.actualLabel': 'What happened?',
  'practice.stepsLabel': 'Steps to reproduce (optional)',
  'practice.stepsPlaceholder': '1. I opened…\n2. I pressed…\n3. It happened…',
  'practice.expectedLabel': 'What did you expect? (optional)',
  'practice.diagnosticsLabel': 'Include redacted diagnostics and recent logs in the JSON',
  'practice.diagnosticsHint': 'May include song metadata, never audio or full lyrics.',
  'practice.preparing': 'Preparing…',
  'practice.submitTicket': 'Save ticket and open GitHub',
} as const;

export const esPractice: { [K in keyof typeof enPractice]: string } = {
  'practice.csvExported': 'CSV exportado',
  'practice.exportError': 'Error al exportar',
  'practice.revealLyrics': 'Revelar letra actual',
  'practice.hideLyricsForEar': 'Ocultar letra para practicar de oído',
  'practice.removeLineFromReview': 'Quitar línea de repaso',
  'practice.saveLineForReview': 'Guardar línea para repasar',
  'practice.reviewSavedLines': 'Repasar líneas guardadas',
  'practice.reviewSavedLinesAria': 'Repasar {count} líneas guardadas',
  'practice.reviewCount': 'Repaso {count}',
  'practice.savedLinesAria': 'Líneas guardadas para repaso',
  'practice.localReview': 'Repaso local',
  'practice.lineCountOf200': '{count} de 200 líneas',
  'practice.exporting': 'Exportando…',
  'practice.exportCsv': 'Exportar CSV',
  'practice.closeReview': 'Cerrar repaso',
  'practice.removeLineAria': 'Quitar {text}',
  'practice.removeFromReview': 'Quitar del repaso',
  'practice.localOnly': 'Se guarda sólo en este equipo.',
  'practice.guide':
    'Práctica vocal: canta y compara tu tono con la melodía de la canción. ' +
    'La primera vez con una canción, ponla a SONAR y pulsa ♪: la app captura ~24 s del audio del sistema (loopback), ' +
    'extrae la melodía y la guarda en una carpeta de tu PC (Ajustes → Otros → Abrir carpeta de referencias). ' +
    'Las siguientes veces con esa canción, el karaoke funciona directo — sin repetir la captura. ' +
    'Si está pausada, la app espera a que suene (hasta 30 s) y captura sola. ' +
    'Para mejor precisión al practicar: cuarto silencioso, micrófono a 15-30 cm, canta claro (no susurres). ' +
    'La referencia es una interpretación automática de la app, no la partitura oficial. ' +
    'Clic derecho en ♪: recapturar la referencia de esta canción.',
  'practice.refErrorLabel': 'Error de referencia: {error}',
  'practice.pitchMonitorActive': 'Monitor de tono activo — clic para detener',
  'practice.vocalPractice': 'Práctica vocal (♪)',
  'practice.capturingReference': 'capturando referencia…',
  'practice.firstTimeCapture': '1ª vez: pon la canción a sonar y pulsa ♪',
  'practice.cat.installation': 'Instalación o actualización',
  'practice.cat.startup': 'Inicio o ventana',
  'practice.cat.recognition': 'Reconocimiento de canción',
  'practice.cat.lyrics': 'Letra o sincronización',
  'practice.cat.pitch': 'Afinación o práctica',
  'practice.cat.translation': 'Traducción o lectura',
  'practice.cat.other': 'Otro',
  'practice.preparingTicket': 'Preparando ticket…',
  'practice.ticketFailed': 'No se pudo preparar el ticket',
  'practice.ticketSavedOpened':
    'Ticket {id} guardado. GitHub y la carpeta del archivo están abiertos: revisa el JSON y adjúntalo sólo si estás de acuerdo.',
  'practice.ticketSavedPath': 'Ticket {id} guardado en {path}. {warning}',
  'practice.chosenFile': 'el archivo elegido',
  'practice.githubOpenFailed': 'No se pudo abrir GitHub; puedes enviarlo manualmente.',
  'practice.reportProblem': 'Reportar un problema',
  'practice.formHint':
    'Crea un JSON local y abre un issue prellenado en GitHub. Nada se adjunta por sí solo: revisa ' +
    'el archivo antes de compartirlo. El issue será público si el repositorio es público.',
  'practice.testerLabel': 'Nombre o alias del tester (sólo en el archivo)',
  'practice.testerPlaceholder': 'Ej. Profe Ana',
  'practice.categoryLabel': 'Categoría',
  'practice.summaryLabel': 'Resumen',
  'practice.summaryPlaceholder': 'Ej. El afinador salta una octava',
  'practice.actualLabel': '¿Qué ocurrió?',
  'practice.stepsLabel': 'Pasos para repetirlo (opcional)',
  'practice.stepsPlaceholder': '1. Abrí…\n2. Pulsé…\n3. Ocurrió…',
  'practice.expectedLabel': '¿Qué esperabas? (opcional)',
  'practice.diagnosticsLabel': 'Incluir diagnóstico y logs recientes redactados en el JSON',
  'practice.diagnosticsHint': 'Puede incluir metadatos de canciones, nunca audio ni letras completas.',
  'practice.preparing': 'Preparando…',
  'practice.submitTicket': 'Guardar ticket y abrir GitHub',
};
