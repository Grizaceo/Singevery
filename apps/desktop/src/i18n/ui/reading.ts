// ============================================================================
// ui/reading.ts — textos de la interfaz: controles de lectura, reconocimiento, búsqueda manual y guía IPA (componente).
//
// Claves con el prefijo 'reading.'. `esReading` debe tener exactamente las mismas
// claves que `enReading` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enReading = {
  // ---- ReadingControls: chrome ----------------------------------------------
  'reading.modeTitle': 'Reading mode',
  'reading.translateOff':
    'Translation: off — click to show it under the current line',
  'reading.translateBelow':
    'Translation below the current line — click to see it side by side',
  'reading.translateSide':
    'Side-by-side text: lyrics and translation in columns — click to turn off',
  'reading.translating': 'Translating…',
  'reading.modeUnavailable': '{title} — not available for this song',
  'reading.ipaGuideButton': 'IPA symbol guide',
  'reading.helpTitle': 'Reading mode help',
  'reading.helpAria': 'Reading modes help',
  'reading.helpHiragana': 'Review your kana at',
  'reading.configureApiKey': 'Set up API key',

  // ---- ReadingControls: títulos de modos de lectura --------------------------
  'reading.mode.jaOriginal.title': 'Original (kanji/kana, no aids)',
  'reading.mode.jaKana.title':
    'Kana (everything in hiragana — great if you don\'t read kanji yet)',
  'reading.mode.jaFurigana.title':
    'Furigana (hiragana above kanji — not romaji)',
  'reading.mode.jaRomaji.title': 'Romaji (Latin below the Japanese)',
  'reading.mode.jaFuriganaRomaji.title':
    'Furigana + romaji (kanji with kana on top, Latin below)',
  'reading.mode.jaIpa.title': 'IPA (actual phonetics: し → /ɕi/, not "shi")',
  'reading.mode.jaFuriganaIpa.title':
    'Furigana + IPA (kanji with kana on top, IPA phonetics below)',
  'reading.mode.latinOriginal.title': 'Original text',
  'reading.mode.latinIpa.title':
    'IPA (phonetics: how each letter really sounds when sung)',
  'reading.mode.genericOriginal.title': 'Original (no readings)',
  'reading.mode.ruby.title':
    'Ruby (reading on top: pinyin, romanization, etc.)',
  'reading.mode.genericRomaji.title': 'Latin transliteration',
  'reading.mode.rubyRomaji.title': 'Ruby + Latin transliteration',

  // ---- ReadingControls: ayuda (HELP_EXAMPLES) -------------------------------
  'reading.help.ja': 'Reading modes (Japanese)',
  'reading.help.ko': 'Reading modes (Korean)',
  'reading.help.zh': 'Reading modes (Chinese)',
  'reading.help.cyrillic': 'Reading modes (Russian/Cyrillic)',
  'reading.help.generic': 'Reading modes',

  'reading.helpLabel.original': 'Original',
  'reading.helpLabel.kana': 'Kana',
  'reading.helpLabel.furigana': 'Furigana',
  'reading.helpLabel.romaji': 'Romaji',
  'reading.helpLabel.ipa': 'IPA',
  'reading.helpLabel.furiganaIpa': 'Furigana + IPA',
  'reading.helpLabel.ruby': 'Ruby',
  'reading.helpLabel.romanization': 'Romanization',
  'reading.helpLabel.pinyin': 'Pinyin',
  'reading.helpLabel.note': 'Note',

  'reading.helpSample.furiganaJa': '私 with わたし above the kanji',
  'reading.helpSample.furiganaIpaJa':
    '私 with わたし above and ɰatasaɕi below',
  'reading.helpSample.koRuby': '안녕하세요 with annyeonghaseyo on top',
  'reading.helpSample.zhRuby': '你 with nǐ on top',
  'reading.helpSample.cyrillicRuby': 'Привет with Privet on top',
  'reading.helpSample.otherOriginal': 'Original text',
  'reading.helpSample.otherRuby': 'Latin reading on top when possible',
  'reading.helpSample.otherRomaji': 'Latin transliteration',
  'reading.helpSample.latinOriginal': 'Lyrics as-is',
  'reading.helpSample.latinNote':
    'Latin-script languages have no ruby or romanization',

  // ---- RecognitionControls ---------------------------------------------------
  'reading.rec.inputLevel': 'Input level: {value}%',
  'reading.rec.inputLevelAria': 'Input audio level',
  'reading.rec.systemTitle':
    'Captures the audio playing on the system (speakers)',
  'reading.rec.systemAria': 'Capture system audio',
  'reading.rec.micTitle': 'Captures audio from the microphone',
  'reading.rec.micAria': 'Capture microphone',
  'reading.rec.stopAria': 'Stop recognition',
  'reading.rec.searchTitle':
    'The app can\'t recognize the song — search by title/artist',
  'reading.rec.wrongTitle':
    'The song shown isn\'t the one playing — search manually',
  'reading.rec.wrongAria': 'Flag the song as wrong and search',
  'reading.rec.auddWarningTitle':
    'AudD rejected the credential (error #900). Check AUDD_API_TOKEN in ' +
    'the .env next to the app, or remove it to recognize with Shazam only.',
  'reading.rec.auddWarning':
    'Invalid AudD token: check .env or use Shazam only',

  // ---- ManualSearch ----------------------------------------------------------
  'reading.search.title': 'Search for a song manually',
  'reading.search.subtitle':
    'The app isn\'t recognizing the song well. Type it in to find the lyrics.',
  'reading.search.titleLabel': 'Title',
  'reading.search.titlePlaceholder': 'e.g. Bailando Solo',
  'reading.search.artistLabel': 'Artist (optional)',
  'reading.search.artistPlaceholder': 'e.g. Los Bunkers',
  'reading.search.busy': 'Searching…',
  'reading.search.submit': 'Find lyrics',
  'reading.search.retryTitle':
    'Identify the song from the audio again (keeps position and pause)',
  'reading.search.retry': 'Retry recognition',
  'reading.search.close': 'Close',
  'reading.search.errorTitle': 'Enter the song title.',
  'reading.search.errorNotFound': 'No lyrics found.',
  'reading.search.errorGeneric': 'Error searching for lyrics.',
} as const;

export const esReading: { [K in keyof typeof enReading]: string } = {
  // ---- ReadingControls: chrome ----------------------------------------------
  'reading.modeTitle': 'Modo de lectura',
  'reading.translateOff':
    'Traducción: desactivada — clic para mostrarla bajo la línea actual',
  'reading.translateBelow':
    'Traducción bajo la línea actual — clic para verla lado a lado',
  'reading.translateSide':
    'Texto paralelo: letra y traducción en columnas — clic para desactivar',
  'reading.translating': 'Traduciendo…',
  'reading.modeUnavailable': '{title} — no disponible para esta canción',
  'reading.ipaGuideButton': 'Guía de símbolos IPA',
  'reading.helpTitle': 'Ayuda sobre modos de lectura',
  'reading.helpAria': 'Ayuda modos de lectura',
  'reading.helpHiragana': 'Repasa tus kanas en',
  'reading.configureApiKey': 'Configurar API key',

  // ---- ReadingControls: títulos de modos de lectura --------------------------
  'reading.mode.jaOriginal.title': 'Original (kanji/kana sin ayudas)',
  'reading.mode.jaKana.title':
    'Kana (todo en hiragana — ideal si aún no lees kanji)',
  'reading.mode.jaFurigana.title':
    'Furigana (hiragana encima de kanji, no es romaji)',
  'reading.mode.jaRomaji.title': 'Romaji (latín debajo del japonés)',
  'reading.mode.jaFuriganaRomaji.title':
    'Furigana + romaji (kanji con kana arriba y latín abajo)',
  'reading.mode.jaIpa.title': 'IPA (fonética real: し → /ɕi/, no "shi")',
  'reading.mode.jaFuriganaIpa.title':
    'Furigana + IPA (kanji con kana arriba y fonética IPA abajo)',
  'reading.mode.latinOriginal.title': 'Texto original',
  'reading.mode.latinIpa.title':
    'IPA (fonética: cómo suena de verdad cada letra al cantarla)',
  'reading.mode.genericOriginal.title': 'Original (sin lecturas)',
  'reading.mode.ruby.title':
    'Ruby (lectura encima: pinyin, romanización, etc.)',
  'reading.mode.genericRomaji.title': 'Romanización latina',
  'reading.mode.rubyRomaji.title': 'Ruby + romanización latina',

  // ---- ReadingControls: ayuda (HELP_EXAMPLES) -------------------------------
  'reading.help.ja': 'Modos de lectura (japonés)',
  'reading.help.ko': 'Modos de lectura (coreano)',
  'reading.help.zh': 'Modos de lectura (chino)',
  'reading.help.cyrillic': 'Modos de lectura (ruso/cirílico)',
  'reading.help.generic': 'Modos de lectura',

  'reading.helpLabel.original': 'Original',
  'reading.helpLabel.kana': 'Kana',
  'reading.helpLabel.furigana': 'Furigana',
  'reading.helpLabel.romaji': 'Romaji',
  'reading.helpLabel.ipa': 'IPA',
  'reading.helpLabel.furiganaIpa': 'Furigana + IPA',
  'reading.helpLabel.ruby': 'Ruby',
  'reading.helpLabel.romanization': 'Romanización',
  'reading.helpLabel.pinyin': 'Pinyin',
  'reading.helpLabel.note': 'Nota',

  'reading.helpSample.furiganaJa': '私 con わたし encima del kanji',
  'reading.helpSample.furiganaIpaJa':
    '私 con わたし encima y ɰatasaɕi debajo',
  'reading.helpSample.koRuby': '안녕하세요 con annyeonghaseyo encima',
  'reading.helpSample.zhRuby': '你 con nǐ encima',
  'reading.helpSample.cyrillicRuby': 'Привет con Privet encima',
  'reading.helpSample.otherOriginal': 'Texto original',
  'reading.helpSample.otherRuby': 'Lectura latina encima cuando es posible',
  'reading.helpSample.otherRomaji': 'Transliteración latina',
  'reading.helpSample.latinOriginal': 'Letra tal cual',
  'reading.helpSample.latinNote':
    'En idiomas latinos no hay ruby ni romanización',

  // ---- RecognitionControls ---------------------------------------------------
  'reading.rec.inputLevel': 'Nivel de entrada: {value}%',
  'reading.rec.inputLevelAria': 'Nivel de audio de entrada',
  'reading.rec.systemTitle':
    'Captura el audio que suena en el sistema (altavoces)',
  'reading.rec.systemAria': 'Capturar audio del sistema',
  'reading.rec.micTitle': 'Captura audio desde el micrófono',
  'reading.rec.micAria': 'Capturar micrófono',
  'reading.rec.stopAria': 'Detener reconocimiento',
  'reading.rec.searchTitle':
    'La app no reconoce la canción — búscala por título/artista',
  'reading.rec.wrongTitle':
    'La canción mostrada no es la que suena — buscar manualmente',
  'reading.rec.wrongAria': 'Señalar que la canción no es la correcta y buscar',
  'reading.rec.auddWarningTitle':
    'AudD rechazó la credencial (error #900). Revisa AUDD_API_TOKEN en ' +
    'el .env junto a la app o quítalo para reconocer solo con Shazam.',
  'reading.rec.auddWarning':
    'Token de AudD inválido: revisa .env o usa solo Shazam',

  // ---- ManualSearch ----------------------------------------------------------
  'reading.search.title': 'Buscar canción manualmente',
  'reading.search.subtitle':
    'La app no reconoce bien la canción. Escríbela para buscar la letra.',
  'reading.search.titleLabel': 'Título',
  'reading.search.titlePlaceholder': 'p. ej. Bailando Solo',
  'reading.search.artistLabel': 'Artista (opcional)',
  'reading.search.artistPlaceholder': 'p. ej. Los Bunkers',
  'reading.search.busy': 'Buscando…',
  'reading.search.submit': 'Buscar letra',
  'reading.search.retryTitle':
    'Reintenta identificar la canción desde el audio (preserva posición y pausa)',
  'reading.search.retry': 'Reintentar reconocimiento',
  'reading.search.close': 'Cerrar',
  'reading.search.errorTitle': 'Escribe el título de la canción.',
  'reading.search.errorNotFound': 'No se encontró la letra.',
  'reading.search.errorGeneric': 'Error al buscar la letra.',
};
