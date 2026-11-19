// ============================================================================
// ui/hooks.ts — textos de la interfaz: mensajes de los hooks y de src/audio.
//
// Claves con el prefijo 'hooks.'. `esHooks` debe tener exactamente las mismas
// claves que `enHooks` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enHooks = {
  // ---- Reconocimiento (useRecognition) ------------------------------------
  'hooks.apiUnavailable': 'API not available — run npm run dev:electron',
  'hooks.micPermissionPrompt': 'Allow microphone access…',
  'hooks.capturingSystemAudio': 'Capturing system audio…',
  'hooks.recordingMic': 'Recording microphone ({seconds}s)…',
  'hooks.recordingSystem': 'Recording system audio ({seconds}s)…',
  'hooks.noAudioCapturedMic': 'No audio captured — check the microphone permission.',
  'hooks.noAudioCapturedSystem':
    'No system audio captured — make sure an audio output is active, or use the microphone.',
  'hooks.micNoSignal':
    'No microphone signal — raise the volume, move closer to the speakers, or play some music.',
  'hooks.systemAudioSilent': 'System audio is silent — raise the volume or play something.',
  'hooks.newSongDetected': 'New song detected…',
  'hooks.checkingSongChange': 'Checking for a song change…',
  'hooks.syncedCorrecting': 'In sync · correcting live…',
  'hooks.identifyingSong': 'Identifying song…',
  'hooks.notRecognizedLowSignal':
    'Not recognized — low signal, raise the volume or move closer. Retrying…',
  'hooks.notRecognizedRetrying': 'Song not recognized, retrying…',
  'hooks.identifyError': 'Error identifying the song',
  'hooks.noMatchRetrying': 'No match, retrying…',
  'hooks.captureError': 'Capture error',

  // ---- Traducción (useTranslationToggle) ----------------------------------
  'hooks.translateConsent':
    'To translate, the full lyrics text will be sent to the configured external provider. No audio is sent. Continue and remember this choice?',
  'hooks.translationFailed': 'Could not translate',
  'hooks.translationRequestError': 'Error requesting translation',

  // ---- Micrófono (usePitchMonitor / audio/capture) -------------------------
  'hooks.webAudioUnavailable': 'Web Audio not available',
  'hooks.micPermissionDenied': 'Microphone permission denied — enable it for the widget.',
  'hooks.micNotFound': 'No microphone available.',
  'hooks.micOpenFailed': 'Could not open the microphone.',
  'hooks.systemAudioNoTracks': 'Could not capture system audio (no audio tracks)',
  'hooks.recordAudioError': 'Error recording audio',

  // ---- Referencia automática (useMelodyReference) --------------------------
  'hooks.melodyNoSystemAudio':
    'No system audio arrived (30 s). The reference is captured automatically from the playing song — play the song and press ♪ again (your microphone is not used).',
  'hooks.melodySilentCapture':
    'No system audio captured (silence). The reference comes from the song’s audio — play it and try again.',
  'hooks.systemAudioCapturePermission':
    'Could not capture system audio. Check that the app has capture permission.',
  'hooks.melodyNoClearMelody':
    'Could not extract a clear melody from the capture. Try again during a section with prominent vocals.',
  'hooks.autoKaraokeLabel': 'Auto karaoke',
  'hooks.referenceSaveDiskError': 'Could not save the reference to disk.',
  'hooks.melodyCaptureError': 'Error capturing the reference.',

  // ---- Referencia del profesor (useTeacherReference) -----------------------
  'hooks.teacherNoMelody':
    'No clear melody detected. Check the microphone and play or sing louder and more sustained.',
  'hooks.referenceSaveError': 'Could not save the reference.',
  'hooks.referenceRecordError': 'Error recording the reference.',
  'hooks.referenceExportError': 'Could not export.',
  'hooks.referenceImportError': 'Could not import.',
  'hooks.instrument.voice': 'Voice',
  'hooks.instrument.bass': 'Bass',
  'hooks.instrument.guitar': 'Guitar',
  'hooks.instrument.keyboard': 'Keyboard',
  'hooks.instrument.other': 'Other',

  // ---- Líneas guardadas (useSavedLines) ------------------------------------
  'hooks.untitledTrack': 'Untitled track',
  'hooks.unknownArtist': 'Unknown artist',
  'hooks.csv.artist': 'Artist',
  'hooks.csv.track': 'Track',
  'hooks.csv.positionMs': 'Position (ms)',
  'hooks.csv.lyrics': 'Lyrics',
  'hooks.csv.reading': 'Reading',
  'hooks.csv.ipa': 'IPA',
  'hooks.csv.translation': 'Translation',
  'hooks.csv.savedAt': 'Saved',
} as const;

export const esHooks: { [K in keyof typeof enHooks]: string } = {
  // ---- Reconocimiento (useRecognition) ------------------------------------
  'hooks.apiUnavailable': 'API no disponible — usa npm run dev:electron',
  'hooks.micPermissionPrompt': 'Permite acceso al micrófono…',
  'hooks.capturingSystemAudio': 'Capturando audio del sistema…',
  'hooks.recordingMic': 'Grabando micrófono ({seconds}s)…',
  'hooks.recordingSystem': 'Grabando audio sistema ({seconds}s)…',
  'hooks.noAudioCapturedMic': 'No se capturó audio — revisa el permiso del micrófono.',
  'hooks.noAudioCapturedSystem':
    'No se capturó audio del sistema — revisa que haya una salida de audio activa o usa el micrófono.',
  'hooks.micNoSignal':
    'Sin señal del micrófono — sube el volumen, acércalo a los parlantes o reproduce música.',
  'hooks.systemAudioSilent': 'Audio del sistema en silencio — sube el volumen o reproduce algo.',
  'hooks.newSongDetected': 'Nueva canción detectada…',
  'hooks.checkingSongChange': 'Comprobando cambio de canción…',
  'hooks.syncedCorrecting': 'Sincronizado · corrigiendo en vivo…',
  'hooks.identifyingSong': 'Identificando canción…',
  'hooks.notRecognizedLowSignal':
    'No se reconoció — señal baja, sube el volumen o acércate. Reintentando…',
  'hooks.notRecognizedRetrying': 'No se reconoció la canción, reintentando…',
  'hooks.identifyError': 'Error al identificar',
  'hooks.noMatchRetrying': 'Sin coincidencia, reintentando…',
  'hooks.captureError': 'Error de captura',

  // ---- Traducción (useTranslationToggle) ----------------------------------
  'hooks.translateConsent':
    'Para traducir, el texto completo de la letra se enviará al proveedor externo configurado. No se envía audio. ¿Quieres continuar y recordar esta decisión?',
  'hooks.translationFailed': 'No se pudo traducir',
  'hooks.translationRequestError': 'Error al solicitar traducción',

  // ---- Micrófono (usePitchMonitor / audio/capture) -------------------------
  'hooks.webAudioUnavailable': 'Web Audio no disponible',
  'hooks.micPermissionDenied': 'Permiso de micrófono denegado — habilítalo para el widget.',
  'hooks.micNotFound': 'No se encontró un micrófono disponible.',
  'hooks.micOpenFailed': 'No se pudo abrir el micrófono.',
  'hooks.systemAudioNoTracks': 'No se pudo capturar audio del sistema (sin tracks de audio)',
  'hooks.recordAudioError': 'Error al grabar audio',

  // ---- Referencia automática (useMelodyReference) --------------------------
  'hooks.melodyNoSystemAudio':
    'No llegó audio del sistema (30 s). La referencia se captura sola de la canción sonando — reproduce la canción y pulsa ♪ de nuevo (no usa tu micrófono).',
  'hooks.melodySilentCapture':
    'No se capturó audio del sistema (silencio). La referencia sale del audio de la canción — reprodúcela y vuelve a intentar.',
  'hooks.systemAudioCapturePermission':
    'No se pudo capturar el audio del sistema. Revisa que la app tenga permiso de captura.',
  'hooks.melodyNoClearMelody':
    'No se pudo extraer una melodía clara de la captura. Reintenta en una parte con voz prominente.',
  'hooks.autoKaraokeLabel': 'Karaoke automático',
  'hooks.referenceSaveDiskError': 'No se pudo guardar la referencia en disco.',
  'hooks.melodyCaptureError': 'Error al capturar la referencia.',

  // ---- Referencia del profesor (useTeacherReference) -----------------------
  'hooks.teacherNoMelody':
    'No se detectó una melodía clara. Revisa el micrófono y toca o canta más fuerte y sostenido.',
  'hooks.referenceSaveError': 'No se pudo guardar la referencia.',
  'hooks.referenceRecordError': 'Error al grabar la referencia.',
  'hooks.referenceExportError': 'No se pudo exportar.',
  'hooks.referenceImportError': 'No se pudo importar.',
  'hooks.instrument.voice': 'Voz',
  'hooks.instrument.bass': 'Bajo',
  'hooks.instrument.guitar': 'Guitarra',
  'hooks.instrument.keyboard': 'Teclado',
  'hooks.instrument.other': 'Otro',

  // ---- Líneas guardadas (useSavedLines) ------------------------------------
  'hooks.untitledTrack': 'Pista sin título',
  'hooks.unknownArtist': 'Artista desconocido',
  'hooks.csv.artist': 'Artista',
  'hooks.csv.track': 'Canción',
  'hooks.csv.positionMs': 'Posición (ms)',
  'hooks.csv.lyrics': 'Letra',
  'hooks.csv.reading': 'Lectura',
  'hooks.csv.ipa': 'IPA',
  'hooks.csv.translation': 'Traducción',
  'hooks.csv.savedAt': 'Guardada',
};
