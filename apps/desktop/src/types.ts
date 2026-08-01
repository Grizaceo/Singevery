// ============================================================================
// Tipos del dominio — porte de libs/common/types.py a TypeScript.
// Compartidos entre el proceso main de Electron y el renderer React.
//
// Nota: se mantiene snake_case en RenderModel para preservar el contrato
// existente (apps/ui_kiosk/src/types.ts) y la serialización del daemon
// Python original.
// ============================================================================

/** Estado del widget. Refleja el ciclo de vida del reconocimiento. */
export type Status =
  | "IDLE"
  | "LISTENING"
  | "IDENTIFYING"
  | "FETCHING_LYRICS"
  | "DISPLAYING"
  | "NO_LYRICS"
  | "ERROR";

/** Referencia canónica a una canción. Origen de verdad para buscar letras. */
export interface TrackRef {
  provider: string;
  provider_track_id: string;
  title: string;
  artist: string;
  album?: string | null;
  duration_ms?: number | null;
  isrc?: string | null;
}

/** Resultado de reconocer audio. */
export interface TrackMatch {
  track: TrackRef;
  confidence: number; // 0.0 a 1.0
  position_ms: number; // posición estimada dentro de la canción
  matched_at: number; // timestamp local (ms desde epoch) del match
  /**
   * A qué instante DE LA GRABACIÓN se refiere `position_ms`, en ms desde que
   * empezó a grabarse el chunk. Es el punto de referencia sin el cual no se
   * puede anclar el reloj:
   *   - AudD (`timecode`) apunta al inicio del archivo enviado → 0.
   *   - Shazam (`matches[].offset`) apunta al final de la ventana de audio que
   *     cubre la huella enviada → `samplems` de esa huella.
   * Si falta, se asume 0 (inicio de la grabación).
   */
  sample_offset_ms?: number;
}

/** Segmento ruby: texto base + lectura encima (rt) opcional. */
export interface FuriganaSegment {
  base: string;
  rt?: string;
}

/** Palabra con timestamp (Enhanced LRC / A2 — karaoke palabra-por-palabra). */
export interface LyricWord {
  start_ms: number;
  /** Fin de la palabra; se infiere del inicio de la siguiente (o del fin de línea). */
  end_ms?: number | null;
  /** Texto de la palabra, incluyendo el espacio que la separa de la siguiente. */
  text: string;
}

/** Una línea de letra con timestamps en milisegundos. */
export interface LyricLine {
  start_ms: number;
  end_ms?: number | null;
  /** Texto original (kanji/kana, hangul, cirílico, etc). Nunca se destruye. */
  text: string;
  /** Segmentos ruby: lectura encima del texto (furigana JP, pinyin ZH, etc.). */
  furigana?: FuriganaSegment[];
  /** Romanización latina (hepburn JP / pinyin ZH / RR KO / latín sobre cirílico). */
  romaji?: string;
  /** Texto en hiragana (modo kana, solo japonés). */
  kana?: string;
  /** Traducción al idioma destino configurado por el usuario. */
  translation?: string;
  /**
   * Timestamps por palabra (Enhanced LRC, marcadores <mm:ss.xx> inline).
   * Cuando existe, el resaltado avanza por palabra en vez de por tiempo lineal.
   */
  words?: LyricWord[];
}

/** Letras con timestamps. `synced=false` indica letra plana (sin LRC). */
export interface TimedLyrics {
  lines: LyricLine[];
  source: string; // ej: "lrclib", "musixmatch"
  synced: boolean;
  /** Versión del pipeline de anotaciones (furigana, kana, ruby multi-idioma). */
  annotationsVersion?: number;
  /** Idioma destino de las traducciones cacheadas en `lines[].translation`. */
  translationLang?: string;
}

/** Una línea lista para mostrar: original + ayudas de lectura. */
export interface RenderLine {
  text: string;
  furigana?: FuriganaSegment[];
  romaji?: string;
  kana?: string;
  translation?: string;
  /** Palabras con timestamp (A2). Solo se usa para el resaltado por palabra. */
  words?: LyricWord[];
  /**
   * Timestamps de la línea (ms desde inicio de la canción). Se propagan al
   * renderer para alinear la melodía de referencia (pitch) con cada línea.
   */
  start_ms?: number;
  end_ms?: number | null;
}

/** Modo de lectura elegido por el usuario (estado del renderer, persistido). */
export type ReadingMode = 'original' | 'furigana' | 'romaji' | 'furigana_romaji' | 'kana';

/**
 * Cómo se muestra la traducción (estado del renderer, persistido):
 *   - 'off'   sin traducción.
 *   - 'below' una línea traducida bajo la línea actual (comportamiento previo).
 *   - 'side'  texto paralelo: letra a la izquierda y traducción a la derecha,
 *             ambas columnas iluminándose al mismo ritmo, en todas las líneas
 *             visibles (para asociar tramos con su significado).
 */
export type TranslationView = 'off' | 'below' | 'side';

/**
 * - 'mymemory': sin credenciales, es el que hace que la traducción funcione
 *   recién instalada la app.
 * - 'local': un modelo corriendo en el propio equipo (TranslateGemma y
 *   compañía) a través de un runtime con API compatible con OpenAI.
 * - 'deepl' / 'google': mejor calidad de servicio, requieren clave.
 */
export type TranslationProvider = 'mymemory' | 'local' | 'deepl' | 'google';

export interface TranslationSettings {
  provider: TranslationProvider;
  apiKey: string;
  targetLang: string;
  /** Proveedor 'local': URL del runtime (Ollama, LM Studio, llama.cpp…). */
  localEndpoint: string;
  /** Proveedor 'local': nombre del modelo a pedirle al runtime. */
  localModel: string;
}

export interface ReadingSettings {
  pinyinToneType: 'none' | 'symbol';
}

export type TextAlignment = 'left' | 'center' | 'right';
export type TextColorMode = 'manual' | 'auto';

export type RecognitionProviderMode = 'auto' | 'shazam' | 'audd';

export interface DisplaySettings {
  opacity: number;
  fontScale: number;
  alignment: TextAlignment;
  mirrorMode: boolean;
  textColor: string;
  textColorMode: TextColorMode;
  /** Color base del handle del overlay (hex #rrggbb). */
  handleColor: string;
  /** Escala del handle (1 = tamaño original). */
  handleScale: number;
  /** Posición horizontal del handle en la ventana (0 = izquierda, 1 = derecha). */
  handlePositionX: number;
  /** Líneas de contexto mostradas arriba y abajo de la actual (1..5). */
  lyricsWindowSize: number;
}

/** Estado que el main envía al renderer por IPC ~10 veces por segundo. */
export interface RenderModel {
  previous_lines: RenderLine[];
  current_line: RenderLine;
  next_lines: RenderLine[];

  font_scale: number;
  opacity: number;
  alignment: "left" | "center" | "right";
  mirror_mode: boolean;
  /** Color efectivo de la letra (manual o resuelto por auto-contraste). */
  text_color: string;
  /** true = viñeta clara (texto oscuro sobre fondo claro). */
  text_vignette_light?: boolean;

  /** Personalización del handle del overlay (color/tamaño/posición). */
  handle_color?: string;
  handle_scale?: number;
  handle_position_x?: number;

  track_title?: string;
  track_artist?: string;
  status: Status;
  /**
   * Avance fraccional (0..1) dentro de la línea actual, para el resaltado
   * interpolado (karaoke por tiempo). Undefined/0 cuando no aplica (sin
   * letra, IDLE, o duración desconocida). El modo palabra (A2) lo reemplaza
   * por saltos exactos por palabra.
   */
  current_line_progress?: number;
  /**
   * Índice de la palabra activa dentro de current_line.words (A2). -1/undefined
   * si la línea no tiene palabras o ninguna ha empezado todavía.
   */
  current_word_index?: number;
  /** Avance 0..1 dentro de la palabra activa (A2). */
  current_word_progress?: number;
  /**
   * true = sección densa (rap / líneas muy seguidas): el motor está
   * adelantando el highlight y el teleprompter realza la línea siguiente
   * para que se pueda leer con anticipación.
   */
  fast_pace?: boolean;
  /**
   * Posición actual de la canción en ms (para alinear la melodía de
   * referencia del pitch con los timestamps de las líneas).
   */
  position_ms?: number;
}

/** Fuente de audio para reconocimiento. */
export type AudioSource = 'microphone' | 'system';

/** API expuesta por el preload script al renderer. */
export interface DesktopApi {
  onRenderModel: (cb: (model: RenderModel) => void) => () => void;
  onSingCommand: (cb: () => void) => () => void;
  /**
   * El main pide re-identificar YA (sin esperar el ciclo de corrección): el
   * reproductor del SO avisó de un cambio de pista que el arbitraje no pudo
   * confirmar por metadata. Acorta la detección de canción nueva.
   */
  onResyncCommand: (cb: () => void) => () => void;
  /**
   * Modo tangible forzado por atajo global (Ctrl+Alt+T). Existe porque con un
   * juego a pantalla completa el overlay no recibe el hover del mouse y sin
   * esto quedaría inagarrable.
   */
  onTangibleCommand: (cb: (locked: boolean) => void) => () => void;
  loadLyrics: (title: string, artist: string) => Promise<{ ok: boolean; error?: string }>;
  retryLyrics: (title: string, artist: string) => Promise<{ ok: boolean; error?: string }>;
  setRecognitionPhase: (phase: 'LISTENING' | 'IDENTIFYING' | null) => Promise<{ ok: boolean }>;
  setRecognitionSource: (source: AudioSource | null) => Promise<{ ok: boolean }>;
  identifyAudio: (
    audio: ArrayBuffer,
    mimeType: string,
    recordStartedAt: number,
  ) => Promise<{ ok: boolean; matched: boolean; error?: string }>;
  correctAudio: (
    audio: ArrayBuffer,
    mimeType: string,
    recordStartedAt: number,
  ) => Promise<{ ok: boolean; matched: boolean; changed?: boolean; error?: string }>;
  stopRecognition: () => Promise<{ ok: boolean }>;
  reportLevel: (level: number) => Promise<{ ok: boolean }>;
  cacheStats: () => Promise<{ ok: boolean; entries: number; negatives: number; bytes: number }>;
  cacheClear: () => Promise<{ ok: boolean }>;

  // Sync: seek manual + offset crónico por pista
  nudgeSync: (deltaMs: number) => Promise<{ ok: boolean }>;
  seekLine: (direction: -1 | 1) => Promise<{ ok: boolean }>;
  adjustSyncOffset: (deltaMs: number) => Promise<{ ok: boolean; offsetMs: number }>;
  getSyncOffset: () => Promise<{ ok: boolean; offsetMs: number }>;

  // Calibración global de latencia (SYNC_OFFSET_MS persistido, P2.8)
  adjustSyncCalibration: (deltaMs: number) => Promise<{ ok: boolean; offsetMs: number }>;
  getSyncCalibration: () => Promise<{ ok: boolean; offsetMs: number }>;
  /** Promueve el ajuste de la pista actual a la calibración global. */
  applyOffsetToAllTracks: () => Promise<{
    ok: boolean;
    calibrationMs: number;
    offsetMs: number;
  }>;

  // Ajustes de visualización y reconocimiento (persistidos)
  getDisplaySettings: () => Promise<{ ok: boolean; display: DisplaySettings }>;
  setDisplaySettings: (
    partial: Partial<DisplaySettings>,
  ) => Promise<{ ok: boolean; display: DisplaySettings }>;
  getRecognitionProvider: () => Promise<{ ok: boolean; provider: RecognitionProviderMode }>;
  setRecognitionProvider: (
    provider: RecognitionProviderMode,
  ) => Promise<{ ok: boolean; provider: RecognitionProviderMode }>;

  getTranslationSettings: () => Promise<{ ok: boolean; translation: TranslationSettings }>;
  setTranslationSettings: (
    partial: Partial<TranslationSettings>,
  ) => Promise<{ ok: boolean; translation: TranslationSettings }>;

  getReadingSettings: () => Promise<{ ok: boolean; reading: ReadingSettings }>;
  setReadingSettings: (
    partial: Partial<ReadingSettings>,
  ) => Promise<{ ok: boolean; reading: ReadingSettings }>;

  requestTranslation: () => Promise<{ ok: boolean; error?: string }>;

  // Window controls
  close: () => Promise<{ ok: boolean }>;
  setSize: (width: number, height: number) => Promise<{ ok: boolean }>;
  getSize: () => Promise<{ ok: boolean; width: number; height: number }>;
  getPosition: () => Promise<{ ok: boolean; x: number; y: number }>;
  setPosition: (x: number, y: number) => Promise<{ ok: boolean }>;
  setClickThrough: (ignore: boolean) => Promise<{ ok: boolean }>;
  setCollapsed: (collapsed: boolean) => Promise<{ ok: boolean; collapsed: boolean }>;
}
