// ============================================================================
// ui/settingsMore.ts — textos de la interfaz: Ajustes → pestañas Audio y Otros (AudioTab, OtherTab, ReferencesSection).
//
// Claves con el prefijo 'settingsMore.'. `esSettingsMore` debe tener exactamente las mismas
// claves que `enSettingsMore` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enSettingsMore = {
  'settingsMore.onOpen': 'On startup',
  'settingsMore.autoStartLabel': 'Start listening to system audio',
  'settingsMore.autoStartHint':
    "If you turn this off, you'll need to press SING (or Ctrl+Alt+S) every time. The microphone never activates on its own. On a fresh install this option is off by default.",
  'settingsMore.micSection': 'Microphone',
  'settingsMore.micHint':
    'The selected device is used for microphone practice and the pitch meter. Song recognition uses system audio, not this microphone.',
  'settingsMore.micDevice': 'Device',
  'settingsMore.micDefault': 'System default',
  'settingsMore.micFallback': 'Microphone {value}',
  'settingsMore.micNoDevices':
    "No devices found: listing them requires microphone permission (it's requested the first time you use practice).",
  'settingsMore.micNoiseGroup': 'Noise control',
  'settingsMore.micNoiseReduction': 'Noise reduction',
  'settingsMore.micEchoCancellation': 'Echo cancellation',
  'settingsMore.micAutoGain': 'Automatic gain',
  'settingsMore.micLiveLevel': 'Live level',
  'settingsMore.micLevelAria': 'Microphone level',
  'settingsMore.engine': 'Recognition engine',
  'settingsMore.providerAutoHint': 'Free Shazam first, AudD as fallback',
  'settingsMore.providerShazamHint': 'Unofficial client, no API key',
  'settingsMore.providerAuddHint': 'Requires AUDD_API_TOKEN',
  'settingsMore.micErrorLinuxDenied':
    "Microphone permission denied. Check that the input isn't blocked in your system audio settings.",
  'settingsMore.micErrorDenied': 'Microphone permission denied. Grant access in Windows Settings.',
  'settingsMore.micErrorOpen':
    "Couldn't open the microphone. Make sure another app isn't using it.",

  'settingsMore.translationSection': 'Translation',
  'settingsMore.translationHint':
    "Only affects the widget's T button. Recognizing the song and showing the lyrics works without any setup.",
  'settingsMore.providerMymemoryLabel': 'MyMemory',
  'settingsMore.providerLocalLabel': 'Local model',
  'settingsMore.providerDeeplLabel': 'DeepL',
  'settingsMore.providerGoogleLabel': 'Google',
  'settingsMore.providerMymemoryHint': 'No key needed, ready to use',
  'settingsMore.providerLocalHint': 'On your machine, no limits',
  'settingsMore.providerDeeplHint': 'Best quality, with your key',
  'settingsMore.providerGoogleHint': 'With your key',
  'settingsMore.localModelHintPre':
    'Translate with a model on your own machine: no daily limit, no internet, and lyrics are never sent anywhere. The main model is ',
  'settingsMore.localModelHintPost':
    " (initial download of about 1.13 GB). The bundled runtime uses it once it's set up. You can also point llama.cpp, LM Studio, Jan, or Ollama at a different model; your manual settings are respected.",
  'settingsMore.fieldModel': 'Model',
  'settingsMore.fieldRuntimeAddress': 'Runtime endpoint',
  'settingsMore.localModelHint2':
    "If no bundled runtime is available, set the address and model alias of your local server. Speed depends on your CPU/GPU and the length of the lyrics.",
  'settingsMore.fieldYourEmail': 'Your email (optional)',
  'settingsMore.emailPlaceholder': 'you@example.com',
  'settingsMore.mymemoryHint':
    'MyMemory works with nothing configured, capped at ~5,000 characters per day (about 3 songs). A valid email raises it to 50,000 (~30 songs). It is not sent anywhere else.',
  'settingsMore.keySecure': "The key is stored encrypted with your system's secure storage.",
  'settingsMore.keySession':
    "The key is only used during this session. To keep it, enable your system's secure storage.",
  'settingsMore.targetLang': 'Target language',
  'settingsMore.accuracySection': 'Accuracy',
  'settingsMore.accuracyHint':
    'Was the identified song the one playing? Your feedback is saved to the local log (matchlog.jsonl) and helps measure and improve recognition in future versions. If it got it wrong, the app re-identifies right away.',
  'settingsMore.feedbackYes': 'That was correct',
  'settingsMore.feedbackNo': 'It got it wrong',
  'settingsMore.accuracyStats':
    '{pct}% accuracy · {matched} identifications · {correct} correct / {wrong} incorrect (your feedback)',
  'settingsMore.accuracyEmpty': 'No data yet: identify a song and come back here.',
  'settingsMore.helpSection': 'Help & beta',
  'settingsMore.betaGuide': 'Tester guide',
  'settingsMore.exportDiag': 'Export diagnostics',
  'settingsMore.privacy': 'Privacy',
  'settingsMore.diagHint':
    'The diagnostics capture the version, technical state, and redacted logs. No audio or full lyrics are included.',
  'settingsMore.diagPreparing': 'Preparing diagnostics…',
  'settingsMore.diagSaved': 'Saved to {path}',
  'settingsMore.diagSavedFallback': 'the file you chose',
  'settingsMore.diagExportError': "Couldn't export diagnostics",
  'settingsMore.feedbackCorrectMsg': 'Thanks — logged as a correct match.',
  'settingsMore.feedbackWrongMsg': 'Thanks — logged, and the app is re-identifying.',
  'settingsMore.feedbackSaveError': "Couldn't save your feedback",
  'settingsMore.privacyOpenError': "Couldn't open the privacy notice",
  'settingsMore.betaOpenError': "Couldn't open the beta guide",

  'settingsMore.refTitle': 'Reference melodies',
  'settingsMore.refHintPre':
    'Record the played or sung line once, done right, and it becomes the student reference instead of the melody the app guesses on its own. ',
  'settingsMore.refHintStrong': 'Only the note curve is saved, never the audio',
  'settingsMore.refHintPost':
    ', and it never leaves this computer: to share it, export it and send the file.',
  'settingsMore.takeName': 'Name',
  'settingsMore.takeNamePlaceholder': 'Chorus, bars 12-20…',
  'settingsMore.instrument': 'Instrument',
  'settingsMore.instrumentVoice': 'Voice',
  'settingsMore.instrumentBass': 'Bass',
  'settingsMore.instrumentGuitar': 'Guitar',
  'settingsMore.instrumentKeyboard': 'Keyboard',
  'settingsMore.instrumentOther': 'Other',
  'settingsMore.recordedBy': 'Recorded by (optional)',
  'settingsMore.authorPlaceholder': 'Prof. Smith',
  'settingsMore.takeDuration': 'Take duration',
  'settingsMore.recording': 'Recording… {seconds}s',
  'settingsMore.analyzing': 'Analyzing…',
  'settingsMore.recordRef': 'Record reference',
  'settingsMore.importFile': 'Import file',
  'settingsMore.noTrackHint':
    'With no song recognized, the take is saved as a standalone exercise, not linked to any track.',
  'settingsMore.refSaved': 'Reference saved.',
  'settingsMore.refActivePre': 'Active for this song: ',
  'settingsMore.refActivePost': '. It replaces the automatic melody.',
  'settingsMore.savedOnDevice': 'Saved on this device ({count})',
  'settingsMore.openFolderTitle':
    'Open the folder where reference melodies are stored (teacher + automatic karaoke) in your file browser',
  'settingsMore.openFolder': 'Open references folder',
  'settingsMore.noneYet': 'None yet.',
  'settingsMore.standaloneExercise': ' · standalone exercise',
  'settingsMore.export': 'Export',
  'settingsMore.delete': 'Delete',
  'settingsMore.defaultRefName': 'Reference',
} as const;

export const esSettingsMore: { [K in keyof typeof enSettingsMore]: string } = {
  'settingsMore.onOpen': 'Al abrir',
  'settingsMore.autoStartLabel': 'Empezar a escuchar el audio del sistema',
  'settingsMore.autoStartHint':
    'Si lo desactivas, tendrás que pulsar SING (o Ctrl+Alt+S) cada vez. El micrófono nunca se activa solo. En una instalación nueva esta opción viene desactivada.',
  'settingsMore.micSection': 'Micrófono',
  'settingsMore.micHint':
    'El dispositivo elegido se usa para la práctica con micrófono y el medidor de tono. El reconocimiento de canciones usa el audio del sistema, no este micrófono.',
  'settingsMore.micDevice': 'Dispositivo',
  'settingsMore.micDefault': 'Predeterminado del sistema',
  'settingsMore.micFallback': 'Micrófono {value}',
  'settingsMore.micNoDevices':
    'No se ven dispositivos: el listado requiere permiso de micrófono (se pide al usar la práctica por primera vez).',
  'settingsMore.micNoiseGroup': 'Ajustes de oclusión ambiental',
  'settingsMore.micNoiseReduction': 'Reducción de ruido',
  'settingsMore.micEchoCancellation': 'Cancelación de eco',
  'settingsMore.micAutoGain': 'Ganancia automática',
  'settingsMore.micLiveLevel': 'Nivel en vivo',
  'settingsMore.micLevelAria': 'Nivel de micrófono',
  'settingsMore.engine': 'Motor de reconocimiento',
  'settingsMore.providerAutoHint': 'Shazam gratis primero, AudD como respaldo',
  'settingsMore.providerShazamHint': 'Cliente no oficial, sin API key',
  'settingsMore.providerAuddHint': 'Requiere AUDD_API_TOKEN',
  'settingsMore.micErrorLinuxDenied':
    'Permiso de micrófono denegado. Revisa que la entrada no esté bloqueada en la configuración de audio del sistema.',
  'settingsMore.micErrorDenied':
    'Permiso de micrófono denegado. Concede acceso en Ajustes de Windows.',
  'settingsMore.micErrorOpen':
    'No se pudo abrir el micrófono. Revisa que no esté en uso por otra app.',

  'settingsMore.translationSection': 'Traducción',
  'settingsMore.translationHint':
    'Afecta solo al botón T del widget. Reconocer la canción y mostrar la letra funciona sin configurar nada.',
  'settingsMore.providerMymemoryLabel': 'MyMemory',
  'settingsMore.providerLocalLabel': 'Modelo local',
  'settingsMore.providerDeeplLabel': 'DeepL',
  'settingsMore.providerGoogleLabel': 'Google',
  'settingsMore.providerMymemoryHint': 'Sin clave, listo para usar',
  'settingsMore.providerLocalHint': 'En tu equipo, sin límites',
  'settingsMore.providerDeeplHint': 'Mejor calidad, con tu clave',
  'settingsMore.providerGoogleHint': 'Con tu clave',
  'settingsMore.localModelHintPre':
    'Traduce con un modelo en tu propio equipo: sin límite diario, sin internet y sin mandar las letras a nadie. El modelo principal es ',
  'settingsMore.localModelHintPost':
    ' (descarga inicial de unos 1,13 GB). El runtime integrado lo usa cuando está preparado. También puedes configurar llama.cpp, LM Studio, Jan u Ollama con otro modelo; se respetan tus ajustes manuales.',
  'settingsMore.fieldModel': 'Modelo',
  'settingsMore.fieldRuntimeAddress': 'Dirección del runtime',
  'settingsMore.localModelHint2':
    'Sin runtime integrado disponible, configura la dirección y el alias de tu servidor local. La velocidad depende de tu CPU/GPU y de la longitud de la letra.',
  'settingsMore.fieldYourEmail': 'Tu email (opcional)',
  'settingsMore.emailPlaceholder': 'tucorreo@ejemplo.com',
  'settingsMore.mymemoryHint':
    'MyMemory funciona sin nada, con un tope de ~5.000 caracteres al día (unas 3 canciones). Poner un email válido lo sube a 50.000 (~30 canciones). No se envía a ningún otro sitio.',
  'settingsMore.keySecure':
    'La clave se guarda cifrada con el almacén seguro de tu sistema.',
  'settingsMore.keySession':
    'La clave se usa sólo durante esta sesión. Para conservarla, habilita el almacén seguro de tu sistema.',
  'settingsMore.targetLang': 'Idioma destino',
  'settingsMore.accuracySection': 'Precisión',
  'settingsMore.accuracyHint':
    '¿La canción identificada era la que sonaba? Tu feedback se guarda en la bitácora local (matchlog.jsonl) y sirve para medir y mejorar el reconocimiento en las próximas versiones. Si te equivocaste, la app re-identifica al momento.',
  'settingsMore.feedbackYes': 'Estaba bien',
  'settingsMore.feedbackNo': 'Se equivocó',
  'settingsMore.accuracyStats':
    '{pct}% de acierto · {matched} identificaciones · {correct} bien / {wrong} mal (tu feedback)',
  'settingsMore.accuracyEmpty':
    'Aún no hay datos: identifica una canción y vuelve aquí.',
  'settingsMore.helpSection': 'Ayuda y beta',
  'settingsMore.betaGuide': 'Guía para testers',
  'settingsMore.exportDiag': 'Exportar diagnóstico',
  'settingsMore.privacy': 'Privacidad',
  'settingsMore.diagHint':
    'El diagnóstico guarda versión, estado técnico y logs redactados. No incluye audio ni letras completas.',
  'settingsMore.diagPreparing': 'Preparando diagnóstico…',
  'settingsMore.diagSaved': 'Guardado en {path}',
  'settingsMore.diagSavedFallback': 'el archivo elegido',
  'settingsMore.diagExportError': 'No se pudo exportar el diagnóstico',
  'settingsMore.feedbackCorrectMsg': 'Gracias — quedó registrado como acierto.',
  'settingsMore.feedbackWrongMsg':
    'Gracias — quedó registrado y la app está re-identificando.',
  'settingsMore.feedbackSaveError': 'No se pudo guardar el feedback',
  'settingsMore.privacyOpenError': 'No se pudo abrir el aviso de privacidad',
  'settingsMore.betaOpenError': 'No se pudo abrir la guía beta',

  'settingsMore.refTitle': 'Melodías de referencia',
  'settingsMore.refHintPre':
    'Graba la línea tocada o cantada bien una vez y queda como referencia del alumno, en lugar de la melodía que la app deduce sola. ',
  'settingsMore.refHintStrong': 'Se guarda solo la curva de notas, nunca el audio',
  'settingsMore.refHintPost':
    ', y no sale de este computador: para pasársela a alguien, expórtala y mándale el archivo.',
  'settingsMore.takeName': 'Nombre de la toma',
  'settingsMore.takeNamePlaceholder': 'Estribillo, compases 12-20…',
  'settingsMore.instrument': 'Instrumento',
  'settingsMore.instrumentVoice': 'Voz',
  'settingsMore.instrumentBass': 'Bajo',
  'settingsMore.instrumentGuitar': 'Guitarra',
  'settingsMore.instrumentKeyboard': 'Teclado',
  'settingsMore.instrumentOther': 'Otro',
  'settingsMore.recordedBy': 'Quién graba (opcional)',
  'settingsMore.authorPlaceholder': 'Profe Marcelo',
  'settingsMore.takeDuration': 'Duración de la toma',
  'settingsMore.recording': 'Grabando… {seconds}s',
  'settingsMore.analyzing': 'Analizando…',
  'settingsMore.recordRef': 'Grabar referencia',
  'settingsMore.importFile': 'Importar archivo',
  'settingsMore.noTrackHint':
    'Sin canción reconocida la toma se guarda como ejercicio suelto, sin quedar asociada a ningún tema.',
  'settingsMore.refSaved': 'Referencia guardada.',
  'settingsMore.refActivePre': 'Para esta canción está activa ',
  'settingsMore.refActivePost': '. Reemplaza a la melodía automática.',
  'settingsMore.savedOnDevice': 'Guardadas en este equipo ({count})',
  'settingsMore.openFolderTitle':
    'Abre en el explorador la carpeta donde se guardan las melodías de referencia (profesor + karaoke automático)',
  'settingsMore.openFolder': 'Abrir carpeta de referencias',
  'settingsMore.noneYet': 'Todavía no hay ninguna.',
  'settingsMore.standaloneExercise': ' · ejercicio suelto',
  'settingsMore.export': 'Exportar',
  'settingsMore.delete': 'Borrar',
  'settingsMore.defaultRefName': 'Referencia',
};
