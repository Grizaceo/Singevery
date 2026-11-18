// ============================================================================
// en.ts — textos de la interfaz en inglés (idioma por defecto).
//
// Claves planas con puntos, agrupadas por área. `es.ts` debe tener EXACTAMENTE
// las mismas claves: el tipo `Record<MessageKey, string>` lo exige en
// compilación y `tests/i18n.test.ts` lo verifica en runtime.
// ============================================================================

import { enSettingsDisplay } from './ui/settingsDisplay';
import { enSettingsMore } from './ui/settingsMore';
import { enChrome } from './ui/chrome';
import { enApp } from './ui/app';
import { enReading } from './ui/reading';
import { enPractice } from './ui/practice';
import { enTeleprompter } from './ui/teleprompter';
import { enHooks } from './ui/hooks';

const core = {
  // ---- Estado del widget (RenderModel.current_line) ------------------------
  'status.idle': 'Waiting for music...',
  'status.listening': 'Listening...',
  'status.identifying': 'Identifying...',
  'status.fetchingLyrics': 'Searching for lyrics...',
  'status.noLyrics': 'No lyrics available',
  'status.noLyricsRetrying': 'No lyrics yet · retrying...',
  'status.error': 'Error searching for lyrics',
  'status.errorRetrying': 'Error searching for lyrics · retrying...',

  // ---- Genéricos ------------------------------------------------------------
  'common.unknownError': 'Unknown error',
  'common.importedLyricsTitle': 'Imported lyrics',
  'common.localFile': 'Local file',
  'common.importedReference': 'Imported reference',
  'common.referenceFallback': 'Reference',
  'common.unknownVersion': 'unknown',

  // ---- Diálogos nativos (títulos, botones y filtros) ------------------------
  'dialogs.importLyrics': 'Import your own or authorized lyrics',
  'dialogs.lyricsFiles': 'LRC or text lyrics',
  'dialogs.allFiles': 'All files',
  'dialogs.exportReference': 'Export reference melody',
  'dialogs.importReference': 'Import reference melody',
  'dialogs.referenceFilter': 'Singevery reference',
  'dialogs.exportPractice': 'Export review lines',
  'dialogs.csvFile': 'CSV file',
  'dialogs.exportDiagnostics': 'Export Singevery diagnostics',
  'dialogs.diagnosticsJson': 'Diagnostics JSON',
  'dialogs.saveTicket': 'Save Singevery ticket',
  'dialogs.ticketJson': 'Ticket JSON',

  // ---- Errores devueltos por IPC (los ve el usuario) -------------------------
  'errors.stateStoreNotInitialized': 'StateStore not initialized',
  'errors.windowNotReady': 'The window is not ready yet',
  'errors.notAFile': 'The selection is not a file',
  'errors.fileTooLarge': 'The file exceeds the allowed maximum of 2 MB',
  'errors.importLyricsFailed': 'Could not import the lyrics',
  'errors.unauthorizedOrigin': 'Unauthorized origin',
  'errors.storeUnavailable': 'The store is not available',
  'errors.saveFailed': 'Error saving',
  'errors.openFolderFailed': 'Could not open the folder',
  'errors.referenceGone': 'The reference no longer exists',
  'errors.referenceTooLarge': 'The file is too large to be a reference',
  'errors.exportFailed': 'Error exporting',
  'errors.importFailed': 'Error importing',
  'errors.practiceInvalid': 'The review collection is not valid',
  'errors.exportPracticeFailed': 'Could not export the review',
  'errors.recognitionStopped': 'Recognition stopped',
  'errors.appNotInitialized': 'App not initialized',
  'errors.saveDiagnosticsFailed': 'Could not save the diagnostics',
  'errors.saveTicketFailed': 'Could not save the ticket',
  'errors.supportPortalFailed': 'Could not open the support portal',
  'errors.destinationNotAllowed': 'Destination not allowed: {url}',
  'errors.documentNotFound': '{file} was not found',
  'errors.runtimeUnavailable': 'Runtime not available',
  'errors.modelPathUnavailable': 'Model path not available',
  'errors.downloadFailed': 'Download failed',
  'errors.noLyricsLoaded': 'No lyrics loaded',
  'errors.trackChangedDuringTranslation': 'The song changed during translation',
  'errors.lyricsFileNoLines': 'The file contains no lyric lines',

  // Ticket de soporte
  'errors.supportInvalidFormat': 'The report has an invalid format',
  'errors.supportInvalidCategory': 'Select a valid category',
  'errors.supportSummaryTooShort': 'Summarize the problem in at least 5 characters',
  'errors.supportDescribeRequired': 'Describe what happened',

  // Referencias de melodía (validación de archivos)
  'errors.referenceNoArrays': 'The curve has no t and f arrays.',
  'errors.referenceArrayMismatch': 'The time and frequency arrays have different lengths.',
  'errors.referenceTooManyPoints': 'The curve has {count} points and the maximum is {max}.',
  'errors.referenceNoUsablePoints': 'The curve has no usable points.',
  'errors.referenceFileTooLarge': 'The file is too large.',
  'errors.referenceInvalidJson': 'The file is not valid JSON.',
  'errors.referenceNotSingevery': 'The file is not a Singevery reference.',
  'errors.referenceNewerVersion':
    'The reference comes from a newer version of Singevery. Update the app.',
  'errors.referenceNoReference': 'The file contains no reference.',

  // Descarga del modelo de traducción local
  'errors.downloadInProgress': 'A download is already in progress',
  'errors.downloadHttp': 'HTTP {status} while downloading the model',
  'errors.serverNoBody': 'The server sent no body',
  'errors.downloadEncoding': 'Invalid encoding for downloading the model',
  'errors.contentLengthInvalid': 'Invalid Content-Length',
  'errors.partialIdentity': 'The server did not confirm the partial model identity/range',
  'errors.contentRangeMismatch': 'Content-Range does not match the partial model',
  'errors.modelExceedsSize': 'The model exceeds the announced size',
  'errors.downloadIncomplete': 'Incomplete model download',
  'errors.notGguf': 'The downloaded file is not a GGUF model',

  // Runtime LLM embebido
  'errors.llmLaunchFailed': 'Could not launch the runtime: {detail}',
  'errors.llmClosed': 'The runtime exited (code {code})',
  'errors.llmHealthTimeout': 'The runtime did not respond within {seconds} s',
  'errors.llmRepeatedClose':
    'The runtime kept closing; check the model or use Ollama/LM Studio',

  // Letras
  'errors.lyricsAllSourcesFailed': 'Could not reach any lyrics source.',
  'errors.lyricsBudgetExhausted': 'budget exhausted',

  // Reconocimiento
  'errors.recognitionCancelled': 'Recognition cancelled',
  'errors.auddTimeout': 'AudD did not respond within {seconds} s',
  'errors.auddInvalidFormat': 'AudD returned an invalid format: {detail}',
  'errors.auddInvalidCredential':
    'AudD #900: invalid credential (session cache; change the token or restart)',
  'errors.auddError': 'AudD error',
  'errors.shazamTimeout': 'Shazam did not respond within {seconds} s',
  'errors.shazamFingerprint': 'Shazam: could not generate fingerprint ({detail})',

  // ---- Traducción ------------------------------------------------------------
  'translation.apiKeyMissing': 'Missing translation API key (Settings → Translation)',
  'translation.cancelled': 'Translation cancelled',
  'translation.failed': 'Translation error',
  'translation.sameLanguage':
    'The lyrics already seem to be in the target language. Change the language in ' +
    'Settings → Translation if you wanted another one.',
  'translation.quotaExhausted':
    'MyMemory: today\'s free quota is exhausted. Add your email in Settings → ' +
    'Translation to raise it, or use DeepL/Google with your own key.',
  'translation.emptyResponse': 'MyMemory returned an empty response',
  'translation.providerTimeout': '{provider} did not respond within {seconds} s',
  'translation.localEndpointRemote':
    'The local endpoint must be on this machine (localhost/127.0.0.1). ' +
    'For a remote server use an external provider.',
  'translation.localModelUnknown':
    'The local runtime does not know the model "{model}". Download it first ' +
    '(with Ollama: ollama pull {model}).',
  'translation.localHttpError': 'Local model {status}',
  'translation.localEmptyResponse': 'The local model returned an empty response',
  'translation.localTimeout':
    'The local model did not finish within {seconds} s. ' +
    'Try a smaller model, or a GPU.',
  'translation.localConnectFailed':
    'Could not connect to the local model at {endpoint}. ' +
    'Is the runtime running? (for example, is Ollama running)',
  'translation.localFormatError':
    'The local model did not follow the requested format (expected {count} ' +
    'numbered lines with no omissions). Try again or pick another translation model.',
  'translation.echoNotTranslated':
    'The provider returned the text untranslated ({pct}% of the ' +
    'lines identical to the original). The lyrics may already be in the target ' +
    'language, or the provider may not support that language pair.',
  'translation.budgetExceeded':
    'Translation took longer than {seconds} s and was cancelled. ' +
    'Try again or switch provider in Settings → Translation.',
  'translation.providerLineCount':
    '{provider} returned {got} lines, expected {expected}',

  // ---- IPA: nombre del idioma, exactitud y salvedad --------------------------
  'ipa.lang.es': 'Spanish',
  'ipa.lang.it': 'Italian',
  'ipa.lang.fr': 'French',
  'ipa.lang.de': 'German',
  'ipa.lang.en': 'English (US)',
  'ipa.lang.ja': 'Japanese',
  'ipa.accuracy.exact': 'exact',
  'ipa.accuracy.approx': 'approximate',
  'ipa.caveat.es':
    'Accent rule configurable in Settings (seseo or distinction). No stress mark or linking between words.',
  'ipa.caveat.it':
    'Open/close e/o only distinguished when the word carries an accent; z is transcribed voiceless.',
  'ipa.caveat.fr':
    'No liaison between words; the verbal -ent ending and some vowels are approximated.',
  'ipa.caveat.de':
    'Vowel length before ⟨ch⟩ is lexical and resolved as short; loanwords keep their original phonetics.',
  'ipa.caveat.en':
    'Dictionary pronunciation (CMUdict, general American English) in citation form: it does not reflect reductions of fast speech or the flap t, and words missing from the dictionary are left untranscribed.',
  'ipa.caveat.ja':
    'Standard phonological convention from kana: it does not reflect each singer\'s realization, and kanji readings depend on the morphological analyzer (it can be wrong).',

  // ---- Ajustes: contenedor y pestañas (SettingsPanel) ---------------------------
  'settings.dialogLabel': 'Teleprompter settings',
  'settings.title': 'Settings',
  'settings.close': 'Close settings',
  'settings.tabsLabel': 'Settings categories',
  'settings.tab.display': 'Display',
  'settings.tab.audio': 'Audio',
  'settings.tab.other': 'Other',
} as const;

// Catálogo completo: núcleo + un archivo por área de la interfaz (src/i18n/ui/).
export const en = {
  ...core,
  ...enSettingsDisplay,
  ...enSettingsMore,
  ...enChrome,
  ...enApp,
  ...enReading,
  ...enPractice,
  ...enTeleprompter,
  ...enHooks,
} as const;
