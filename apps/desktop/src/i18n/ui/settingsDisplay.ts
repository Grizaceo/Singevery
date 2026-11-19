// ============================================================================
// ui/settingsDisplay.ts — textos de la interfaz: Ajustes → pestaña Display (src/settings/DisplayTab.tsx).
//
// Claves con el prefijo 'settingsDisplay.'. `esSettingsDisplay` debe tener exactamente las mismas
// claves que `enSettingsDisplay` (lo exige el tipo). El español es el texto que la app
// ya mostraba, copiado tal cual.
// ============================================================================

export const enSettingsDisplay = {
  'settingsDisplay.group.lyrics': 'Lyrics',
  'settingsDisplay.size': 'Size ({value}×)',
  'settingsDisplay.textOpacity': 'Lyrics opacity ({value}%)',
  'settingsDisplay.hint.currentLine':
    'The line being sung never drops below 60% so it stays readable.',
  'settingsDisplay.backgroundOpacity': 'Background opacity ({value}%)',
  'settingsDisplay.legibilityBoost':
    'Thicken the text outline when the background is very transparent',
  'settingsDisplay.color.label': 'Color',
  'settingsDisplay.color.white': 'White',
  'settingsDisplay.color.yellow': 'Yellow',
  'settingsDisplay.color.cyan': 'Cyan',
  'settingsDisplay.color.green': 'Green',
  'settingsDisplay.color.pink': 'Pink',
  'settingsDisplay.color.black': 'Black',
  'settingsDisplay.color.violet': 'Violet',
  'settingsDisplay.customColor': 'Custom color',
  'settingsDisplay.linesVisible': 'Visible lines ({value} above and below)',
  'settingsDisplay.hint.linesWindow':
    'More lines give you margin when the timing is a bit off and you end up singing from the preview. The text shrinks automatically to fit.',
  'settingsDisplay.alignment.label': 'Alignment',
  'settingsDisplay.hint.alignment':
    'Lyrics are centered by default; the side-by-side layout only activates with parallel translation mode.',
  'settingsDisplay.group.widget': 'Widget',
  'settingsDisplay.widgetHint':
    'The tab used to move the overlay, and which controls are shown.',
  'settingsDisplay.handleColorAria': 'Handle {color}',
  'settingsDisplay.customHandleColor': 'Custom handle color',
  'settingsDisplay.handlePosition': 'Horizontal position ({value}%)',
  'settingsDisplay.position.left': 'Left',
  'settingsDisplay.position.center': 'Center',
  'settingsDisplay.position.right': 'Right',
  'settingsDisplay.visibleButtons': 'Visible buttons',
  'settingsDisplay.readingModes': 'Reading modes (原 か ふ A IPA…)',
  'settingsDisplay.translate': 'Translation (T)',
  'settingsDisplay.importLyrics': 'Import lyrics (↥)',
  'settingsDisplay.settings': 'Settings (⚙)',
  'settingsDisplay.autoGhost':
    'Switch to click-through after a period of inactivity',
  'settingsDisplay.after': 'After',
  'settingsDisplay.hint.autoGhost':
    "If you don't touch the widget for that long, it lets clicks pass through to the app behind it (click-through mode). To bring it back: double-click the tab, or press Ctrl+Alt+T.",
  'settingsDisplay.openOnRecognize':
    'Open automatically when a song is recognized (from SING)',
  'settingsDisplay.hint.openOnRecognize':
    "It opens in click-through mode so it never steals your clicks. When off, it stays as SING (with a green dot) until you click it.",
  'settingsDisplay.group.readingExtras': 'Reading extras',
  'settingsDisplay.pinyinTones': 'Tone marks in Chinese pinyin (nǐ hǎo vs ni hao)',
  'settingsDisplay.spanishIpa':
    'Spanish IPA with Castilian distinction (caza /ˈkaθa/ vs seseo /ˈkasa/)',
  'settingsDisplay.mirrorMode': 'Mirror mode (for projecting onto glass)',
  'settingsDisplay.autoColor':
    'Automatic color based on the background (experimental)',
  'settingsDisplay.hint.autoColor':
    'It analyzes the brightness of the screen under the widget every few seconds; the image is processed locally and discarded. It may cause slight flickering, and the widget does not appear in recordings while active.',
} as const;

export const esSettingsDisplay: { [K in keyof typeof enSettingsDisplay]: string } = {
  'settingsDisplay.group.lyrics': 'Letra',
  'settingsDisplay.size': 'Tamaño ({value}×)',
  'settingsDisplay.textOpacity': 'Opacidad de la letra ({value}%)',
  'settingsDisplay.hint.currentLine':
    'La línea que se canta nunca baja del 60 % para seguir siendo legible.',
  'settingsDisplay.backgroundOpacity': 'Opacidad del fondo ({value}%)',
  'settingsDisplay.legibilityBoost':
    'Reforzar contorno del texto cuando el fondo es muy transparente',
  'settingsDisplay.color.label': 'Color',
  'settingsDisplay.color.white': 'Blanco',
  'settingsDisplay.color.yellow': 'Amarillo',
  'settingsDisplay.color.cyan': 'Cian',
  'settingsDisplay.color.green': 'Verde',
  'settingsDisplay.color.pink': 'Rosa',
  'settingsDisplay.color.black': 'Negro',
  'settingsDisplay.color.violet': 'Violeta',
  'settingsDisplay.customColor': 'Color personalizado',
  'settingsDisplay.linesVisible': 'Líneas visibles ({value} arriba y abajo)',
  'settingsDisplay.hint.linesWindow':
    'Más líneas dan margen cuando la sincronía va algo corrida y terminas cantando desde la previsualización. El texto se achica solo para que quepa.',
  'settingsDisplay.alignment.label': 'Alineación',
  'settingsDisplay.hint.alignment':
    'La letra se muestra centrada por defecto; el layout lado a lado solo se activa con la traducción en modo paralelo.',
  'settingsDisplay.group.widget': 'Widget',
  'settingsDisplay.widgetHint':
    'La pestañita para mover el overlay y qué controles se ven.',
  'settingsDisplay.handleColorAria': 'Handle {color}',
  'settingsDisplay.customHandleColor': 'Color personalizado del handle',
  'settingsDisplay.handlePosition': 'Posición horizontal ({value}%)',
  'settingsDisplay.position.left': 'Izquierda',
  'settingsDisplay.position.center': 'Centro',
  'settingsDisplay.position.right': 'Derecha',
  'settingsDisplay.visibleButtons': 'Botones visibles',
  'settingsDisplay.readingModes': 'Modos de lectura (原 か ふ A IPA…)',
  'settingsDisplay.translate': 'Traducción (T)',
  'settingsDisplay.importLyrics': 'Importar letra (↥)',
  'settingsDisplay.settings': 'Ajustes (⚙)',
  'settingsDisplay.autoGhost': 'Volverse intangible tras un rato sin usarlo',
  'settingsDisplay.after': 'Después de',
  'settingsDisplay.hint.autoGhost':
    'Si no tocas el widget durante ese tiempo, deja pasar los clics a la app de atrás (modo fantasma). Para recuperarlo: doble clic en la pestañita, o Ctrl+Alt+T.',
  'settingsDisplay.openOnRecognize':
    'Abrirse solo al reconocer una canción (desde SING)',
  'settingsDisplay.hint.openOnRecognize':
    'Se abre en modo intangible para no atrapar tus clics. Desactivado, se queda como SING (con un punto verde) hasta que lo pulses.',
  'settingsDisplay.group.readingExtras': 'Extras de lectura',
  'settingsDisplay.pinyinTones': 'Tonos en el pinyin chino (nǐ hǎo vs ni hao)',
  'settingsDisplay.spanishIpa':
    'IPA del español con distinción castellana (caza /ˈkaθa/ vs seseo /ˈkasa/)',
  'settingsDisplay.mirrorMode': 'Modo espejo (para proyectar sobre un cristal)',
  'settingsDisplay.autoColor': 'Color automático según el fondo (experimental)',
  'settingsDisplay.hint.autoColor':
    'Analiza el brillo de la pantalla bajo el widget cada pocos segundos; la imagen se procesa localmente y se descarta. Puede producir un ligero parpadeo, y el widget no aparece en grabaciones mientras esté activo.',
};