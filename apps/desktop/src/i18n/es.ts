// ============================================================================
// es.ts — textos de la interfaz en español.
//
// Debe contener TODAS las claves de `en`: el tipo `Record<MessageKey, string>`
// obliga a la completitud en compilación. Los textos son los que la app ya
// mostraba, copiados tal cual.
// ============================================================================

import type { MessageKey } from './index';

export const es: Record<MessageKey, string> = {
  // ---- Estado del widget (RenderModel.current_line) ------------------------
  'status.idle': 'Esperando música...',
  'status.listening': 'Escuchando...',
  'status.identifying': 'Identificando...',
  'status.fetchingLyrics': 'Buscando letra...',
  'status.noLyrics': 'Sin letra disponible',
  'status.noLyricsRetrying': 'Sin letra aún · reintentando...',
  'status.error': 'Error al buscar letra',
  'status.errorRetrying': 'Error al buscar letra · reintentando...',

  // ---- Genéricos ------------------------------------------------------------
  'common.unknownError': 'Error desconocido',
  'common.importedLyricsTitle': 'Letra importada',
  'common.localFile': 'Archivo local',
  'common.importedReference': 'Referencia importada',
  'common.referenceFallback': 'Referencia',
  'common.unknownVersion': 'desconocida',

  // ---- Diálogos nativos (títulos, botones y filtros) ------------------------
  'dialogs.importLyrics': 'Importar letra propia o autorizada',
  'dialogs.lyricsFiles': 'Letras LRC o texto',
  'dialogs.allFiles': 'Todos los archivos',
  'dialogs.exportReference': 'Exportar melodía de referencia',
  'dialogs.importReference': 'Importar melodía de referencia',
  'dialogs.referenceFilter': 'Referencia de Singevery',
  'dialogs.exportPractice': 'Exportar líneas de repaso',
  'dialogs.csvFile': 'Archivo CSV',
  'dialogs.exportDiagnostics': 'Exportar diagnóstico de Singevery',
  'dialogs.diagnosticsJson': 'Diagnóstico JSON',
  'dialogs.saveTicket': 'Guardar ticket de Singevery',
  'dialogs.ticketJson': 'Ticket JSON',

  // ---- Errores devueltos por IPC (los ve el usuario) -------------------------
  'errors.stateStoreNotInitialized': 'StateStore no inicializado',
  'errors.windowNotReady': 'La ventana todavía no está lista',
  'errors.notAFile': 'La selección no es un archivo',
  'errors.fileTooLarge': 'El archivo supera el máximo permitido de 2 MB',
  'errors.importLyricsFailed': 'No se pudo importar la letra',
  'errors.unauthorizedOrigin': 'Origen no autorizado',
  'errors.storeUnavailable': 'El almacén no está disponible',
  'errors.saveFailed': 'Error al guardar',
  'errors.openFolderFailed': 'No se pudo abrir la carpeta',
  'errors.referenceGone': 'La referencia ya no existe',
  'errors.referenceTooLarge': 'El archivo es demasiado grande para ser una referencia',
  'errors.exportFailed': 'Error al exportar',
  'errors.importFailed': 'Error al importar',
  'errors.practiceInvalid': 'La colección de repaso no es válida',
  'errors.exportPracticeFailed': 'No se pudo exportar el repaso',
  'errors.recognitionStopped': 'Reconocimiento detenido',
  'errors.appNotInitialized': 'App no inicializada',
  'errors.saveDiagnosticsFailed': 'No se pudo guardar el diagnóstico',
  'errors.saveTicketFailed': 'No se pudo guardar el ticket',
  'errors.supportPortalFailed': 'No se pudo abrir el portal de soporte',
  'errors.destinationNotAllowed': 'Destino no permitido: {url}',
  'errors.documentNotFound': 'No se encontró {file}',
  'errors.runtimeUnavailable': 'Runtime no disponible',
  'errors.modelPathUnavailable': 'Ruta de modelo no disponible',
  'errors.downloadFailed': 'Descarga fallida',
  'errors.noLyricsLoaded': 'No hay letra cargada',
  'errors.trackChangedDuringTranslation': 'La canción cambió durante la traducción',
  'errors.lyricsFileNoLines': 'El archivo no contiene líneas de letra',

  // Ticket de soporte
  'errors.supportInvalidFormat': 'El reporte no tiene un formato válido',
  'errors.supportInvalidCategory': 'Selecciona una categoría válida',
  'errors.supportSummaryTooShort': 'Resume el problema en al menos 5 caracteres',
  'errors.supportDescribeRequired': 'Describe qué ocurrió',

  // Referencias de melodía (validación de archivos)
  'errors.referenceNoArrays': 'La curva no tiene arrays t y f.',
  'errors.referenceArrayMismatch': 'Los arrays de tiempo y frecuencia miden distinto.',
  'errors.referenceTooManyPoints': 'La curva tiene {count} puntos y el máximo es {max}.',
  'errors.referenceNoUsablePoints': 'La curva no tiene puntos utilizables.',
  'errors.referenceFileTooLarge': 'El archivo es demasiado grande.',
  'errors.referenceInvalidJson': 'El archivo no es un JSON válido.',
  'errors.referenceNotSingevery': 'El archivo no es una referencia de Singevery.',
  'errors.referenceNewerVersion':
    'La referencia viene de una versión más nueva de Singevery. Actualiza la app.',
  'errors.referenceNoReference': 'El archivo no contiene ninguna referencia.',

  // Descarga del modelo de traducción local
  'errors.downloadInProgress': 'Ya hay una descarga en curso',
  'errors.downloadHttp': 'HTTP {status} al descargar el modelo',
  'errors.serverNoBody': 'El servidor no envió cuerpo',
  'errors.downloadEncoding': 'Codificación no válida para descargar el modelo',
  'errors.contentLengthInvalid': 'Content-Length inválido',
  'errors.partialIdentity': 'El servidor no confirmó la identidad/rango del modelo parcial',
  'errors.contentRangeMismatch': 'Content-Range no coincide con el modelo parcial',
  'errors.modelExceedsSize': 'El modelo excede el tamaño anunciado',
  'errors.downloadIncomplete': 'Descarga incompleta del modelo',
  'errors.notGguf': 'El archivo descargado no es un modelo GGUF',

  // Runtime LLM embebido
  'errors.llmLaunchFailed': 'No se pudo lanzar el runtime: {detail}',
  'errors.llmClosed': 'El runtime se cerró (code {code})',
  'errors.llmHealthTimeout': 'El runtime no respondió en {seconds} s',
  'errors.llmRepeatedClose':
    'El runtime se cerró repetidamente; revisa el modelo o usa Ollama/LM Studio',

  // Letras
  'errors.lyricsAllSourcesFailed': 'No se pudo consultar ninguna fuente de letras.',
  'errors.lyricsBudgetExhausted': 'presupuesto agotado',

  // Reconocimiento
  'errors.recognitionCancelled': 'Reconocimiento cancelado',
  'errors.auddTimeout': 'AudD no respondió en {seconds} s',
  'errors.auddInvalidFormat': 'AudD respondió con un formato inválido: {detail}',
  'errors.auddInvalidCredential':
    'AudD #900: credencial inválida (cache de sesión; cambia el token o reinicia)',
  'errors.auddError': 'Error de AudD',
  'errors.shazamTimeout': 'Shazam no respondió en {seconds} s',
  'errors.shazamFingerprint': 'Shazam: no se pudo generar huella ({detail})',

  // ---- Traducción ------------------------------------------------------------
  'translation.apiKeyMissing': 'Falta la API key de traducción (Ajustes → Traducción)',
  'translation.cancelled': 'Traducción cancelada',
  'translation.failed': 'Error de traducción',
  'translation.sameLanguage':
    'La letra ya parece estar en el idioma de destino. Cambia el idioma en ' +
    'Ajustes → Traducción si querías otro.',
  'translation.quotaExhausted':
    'MyMemory: se agotó la cuota gratuita de hoy. Añade tu email en Ajustes → ' +
    'Traducción para subirla, o usa DeepL/Google con tu propia clave.',
  'translation.emptyResponse': 'MyMemory devolvió una respuesta vacía',
  'translation.providerTimeout': '{provider} no respondió en {seconds} s',
  'translation.localEndpointRemote':
    'El endpoint local debe estar en esta máquina (localhost/127.0.0.1). ' +
    'Para un servidor remoto usa un proveedor externo.',
  'translation.localModelUnknown':
    'El runtime local no conoce el modelo "{model}". Descárgalo primero ' +
    '(con Ollama: ollama pull {model}).',
  'translation.localHttpError': 'Modelo local {status}',
  'translation.localEmptyResponse': 'El modelo local devolvió una respuesta vacía',
  'translation.localTimeout':
    'El modelo local no terminó en {seconds} s. ' +
    'Prueba con un modelo más pequeño, o con GPU.',
  'translation.localConnectFailed':
    'No se pudo conectar con el modelo local en {endpoint}. ' +
    '¿Está el runtime abierto? (por ejemplo, que Ollama esté corriendo)',
  'translation.localFormatError':
    'El modelo local no respetó el formato pedido (se esperaban {count} líneas ' +
    'numeradas y sin omisiones). Reintenta o selecciona otro modelo de traducción.',
  'translation.echoNotTranslated':
    'El proveedor devolvió el texto sin traducir ({pct}% de las ' +
    'líneas iguales al original). Puede que la letra ya esté en el idioma de destino, ' +
    'o que el proveedor no soporte ese par de idiomas.',
  'translation.budgetExceeded':
    'La traducción tardó más de {seconds} s y se canceló. ' +
    'Inténtalo otra vez o cambia de proveedor en Ajustes → Traducción.',
  'translation.providerLineCount':
    '{provider} devolvió {got} líneas, se esperaban {expected}',

  // ---- IPA: nombre del idioma, exactitud y salvedad --------------------------
  'ipa.lang.es': 'español',
  'ipa.lang.it': 'italiano',
  'ipa.lang.fr': 'francés',
  'ipa.lang.de': 'alemán',
  'ipa.lang.en': 'inglés (EE. UU.)',
  'ipa.lang.ja': 'japonés',
  'ipa.accuracy.exact': 'exacta',
  'ipa.accuracy.approx': 'aproximada',
  'ipa.caveat.es':
    'Norma configurable en Ajustes (seseo o distinción). Sin marca de acento tónico ni encadenamiento entre palabras.',
  'ipa.caveat.it':
    'e/o abiertas o cerradas solo se distinguen cuando la palabra lleva tilde; z se transcribe sorda.',
  'ipa.caveat.fr':
    'Sin liaison entre palabras; el final -ent verbal y algunos timbres son aproximados.',
  'ipa.caveat.de':
    'La cantidad de la vocal ante ⟨ch⟩ es léxica y se resuelve breve; los préstamos conservan su fonética original.',
  'ipa.caveat.en':
    'Pronunciación de diccionario (CMUdict, inglés general estadounidense) en forma de cita: no refleja las reducciones del habla rápida ni el flap de la t, y las palabras que no están en el diccionario quedan sin transcribir.',
  'ipa.caveat.ja':
    'Convención fonológica estándar a partir del kana: no refleja la realización de cada cantante, y la lectura de los kanji depende del analizador morfológico (puede equivocarse).',
};
