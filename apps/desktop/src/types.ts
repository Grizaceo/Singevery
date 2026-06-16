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
}

/** Segmento de furigana: texto base + lectura en kana (rt) opcional. */
export interface FuriganaSegment {
  base: string;
  rt?: string;
}

/** Una línea de letra con timestamps en milisegundos. */
export interface LyricLine {
  start_ms: number;
  end_ms?: number | null;
  /** Texto original (kanji/kana, hangul, etc). Nunca se destruye. */
  text: string;
  /** Lectura para ruby (furigana japonés). Solo si aporta sobre `text`. */
  furigana?: FuriganaSegment[];
  /** Romanización latina (hepburn JP / pinyin ZH / translit KO). */
  romaji?: string;
}

/** Letras con timestamps. `synced=false` indica letra plana (sin LRC). */
export interface TimedLyrics {
  lines: LyricLine[];
  source: string; // ej: "lrclib", "musixmatch"
  synced: boolean;
}

/** Una línea lista para mostrar: original + ayudas de lectura. */
export interface RenderLine {
  text: string;
  furigana?: FuriganaSegment[];
  romaji?: string;
}

/** Modo de lectura elegido por el usuario (estado del renderer, persistido). */
export type ReadingMode = 'original' | 'furigana' | 'romaji' | 'furigana_romaji';

/** Estado que el main envía al renderer por IPC ~10 veces por segundo. */
export interface RenderModel {
  previous_lines: RenderLine[];
  current_line: RenderLine;
  next_lines: RenderLine[];

  font_scale: number;
  opacity: number;
  alignment: "left" | "center" | "right";
  mirror_mode: boolean;

  track_title?: string;
  track_artist?: string;
  status: Status;
}

/** Fuente de audio para reconocimiento. */
export type AudioSource = 'microphone' | 'system';

/** API expuesta por el preload script al renderer. */
export interface DesktopApi {
  onRenderModel: (cb: (model: RenderModel) => void) => () => void;
  loadLyrics: (title: string, artist: string) => Promise<{ ok: boolean; error?: string }>;
  setRecognitionPhase: (phase: 'LISTENING' | 'IDENTIFYING' | null) => Promise<{ ok: boolean }>;
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

  // Sync: seek manual + offset crónico
  nudgeSync: (deltaMs: number) => Promise<{ ok: boolean }>;
  seekLine: (direction: -1 | 1) => Promise<{ ok: boolean }>;
  adjustSyncOffset: (deltaMs: number) => Promise<{ ok: boolean; offsetMs: number }>;
  getSyncOffset: () => Promise<{ ok: boolean; offsetMs: number }>;

  // Window controls
  minimize: () => Promise<{ ok: boolean }>;
  close: () => Promise<{ ok: boolean }>;
  setSize: (width: number, height: number) => Promise<{ ok: boolean }>;
  getSize: () => Promise<{ ok: boolean; width: number; height: number }>;
}
