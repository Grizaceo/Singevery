// ============================================================================
// settings.ts — persistencia de ajustes (sync, display, reconocimiento, ventana).
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import type { RecognitionProviderMode } from './recognition/provider';
import type { ReadingSettings, TranslationSettings } from '../../src/types';
import { DEFAULT_LOCAL_ENDPOINT, DEFAULT_LOCAL_MODEL } from './translate';
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from '../../src/i18n';

/** Almacén de offsets por pista. El StateStore depende de esta interfaz. */
export interface OffsetStore {
  get(trackKey: string): number;
  set(trackKey: string, offsetMs: number): void;
  /** Offsets guardados (clave → ms). Sirve para detectar latencia global:
   *  varias pistas corregidas en el MISMO sentido no son un problema por
   *  pista, es un desfase del equipo. */
  entries?(): Record<string, number>;
  /** Resta `deltaMs` a todos los offsets guardados. Se usa al promover un
   *  desfase a la calibración global, para que no se cuente dos veces. */
  rebase?(deltaMs: number): void;
}

/** Almacén de la calibración global de sincronización (latencia). */
export interface CalibrationStore {
  get(): number;
  set(offsetMs: number): void;
}

export type TextAlignment = 'left' | 'center' | 'right';
export type TextColorMode = 'manual' | 'auto';

export interface DisplaySettings {
  /** Opacidad de la LETRA (0.2–1). El fondo tiene su propio control. */
  opacity: number;
  /** Opacidad de la viñeta/fondo detrás de la letra (0–1; 1 = aspecto actual). */
  backgroundOpacity: number;
  /** Reforzar el contorno del texto cuando el fondo queda muy transparente. */
  legibilityBoost: boolean;
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
  /**
   * Cuántas líneas de contexto se muestran ARRIBA y ABAJO de la actual.
   * 2 = el clásico (una adyacente + una lejana a cada lado). Subirlo da más
   * margen cuando la sincronía va algo corrida y se termina cantando desde
   * las líneas de previsualización.
   */
  lyricsWindowSize: number;
}

export interface DisplayStore {
  get(): DisplaySettings;
  set(partial: Partial<DisplaySettings>): void;
}

export interface RecognitionProviderStore {
  get(): RecognitionProviderMode;
  set(mode: RecognitionProviderMode): void;
}

export interface TranslationStore {
  get(): TranslationSettings;
  set(partial: Partial<TranslationSettings>): void;
}

export interface ReadingStore {
  get(): ReadingSettings;
  set(partial: Partial<ReadingSettings>): void;
}

/** Idioma de la interfaz (ajuste `uiLanguage`). */
export interface UiLanguageStore {
  get(): Locale;
  set(locale: Locale): void;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowBoundsStore {
  get(): WindowBounds | null;
  set(bounds: WindowBounds | null): void;
}

export interface AppSettings {
  offsetStore: OffsetStore;
  calibrationStore: CalibrationStore;
  displayStore: DisplayStore;
  recognitionProviderStore: RecognitionProviderStore;
  translationStore: TranslationStore;
  readingStore: ReadingStore;
  uiLanguageStore: UiLanguageStore;
  windowBoundsStore: WindowBoundsStore;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  opacity: 1.0,
  backgroundOpacity: 1.0,
  legibilityBoost: true,
  fontScale: 1.0,
  alignment: 'center',
  mirrorMode: false,
  textColor: '#ffffff',
  textColorMode: 'manual',
  handleColor: '#000000',
  handleScale: 1.0,
  handlePositionX: 0.5,
  lyricsWindowSize: 2,
};

export const DEFAULT_RECOGNITION_PROVIDER: RecognitionProviderMode = 'auto';

export const DEFAULT_TRANSLATION_SETTINGS: TranslationSettings = {
  // Sin clave: la traducción tiene que funcionar sin que el usuario consiga
  // credenciales. El modelo local y DeepL/Google son mejoras opcionales.
  provider: 'mymemory',
  apiKey: '',
  targetLang: 'es',
  localEndpoint: DEFAULT_LOCAL_ENDPOINT,
  localModel: DEFAULT_LOCAL_MODEL,
};

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  pinyinToneType: 'none',
  spanishVariant: 'seseo',
};

/** Implementación en memoria (no persiste). Útil como fallback y en tests. */
export const NULL_OFFSET_STORE: OffsetStore = {
  get: () => 0,
  set: () => {},
  entries: () => ({}),
  rebase: () => {},
};

export const DEFAULT_CALIBRATION_OFFSET_MS = 300;

export const NULL_CALIBRATION_STORE: CalibrationStore = {
  get: () => DEFAULT_CALIBRATION_OFFSET_MS,
  set: () => {},
};

export const NULL_DISPLAY_STORE: DisplayStore = {
  get: () => ({ ...DEFAULT_DISPLAY_SETTINGS }),
  set: () => {},
};

export const NULL_RECOGNITION_PROVIDER_STORE: RecognitionProviderStore = {
  get: () => DEFAULT_RECOGNITION_PROVIDER,
  set: () => {},
};

export const NULL_TRANSLATION_STORE: TranslationStore = {
  get: () => ({ ...DEFAULT_TRANSLATION_SETTINGS }),
  set: () => {},
};

export const NULL_READING_STORE: ReadingStore = {
  get: () => ({ ...DEFAULT_READING_SETTINGS }),
  set: () => {},
};

export const NULL_UI_LANGUAGE_STORE: UiLanguageStore = {
  get: () => DEFAULT_LOCALE,
  set: () => {},
};

export const NULL_WINDOW_BOUNDS_STORE: WindowBoundsStore = {
  get: () => null,
  set: () => {},
};

const SETTINGS_FILE = 'espejo-settings.json';

interface SettingsShape {
  trackOffsets?: Record<string, number>;
  calibrationOffsetMs?: number;
  display?: Partial<DisplaySettings>;
  recognitionProvider?: RecognitionProviderMode;
  translation?: Partial<TranslationSettings>;
  translationSecret?: string;
  reading?: Partial<ReadingSettings>;
  uiLanguage?: unknown;
  windowBounds?: WindowBounds | null;
}

function clampOpacity(value: number): number {
  return Math.min(1, Math.max(0.2, value));
}

/** Opacidad del fondo: aquí sí se permite llegar a 0 (ventana limpia). */
function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampFontScale(value: number): number {
  return Math.min(2, Math.max(0.6, value));
}

function clampHandleScale(value: number): number {
  return Math.min(2, Math.max(0.6, value));
}

function clampHandlePosition(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 1..5 líneas de contexto por lado: con 0 se pierde el "qué viene", y por
 *  encima de 5 el texto se vuelve ilegible en una ventana normal. */
function clampWindowSize(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const match = value.trim().match(/^#([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function normalizeTextColorMode(value: unknown): TextColorMode {
  return value === 'auto' ? 'auto' : 'manual';
}

function normalizeDisplay(raw?: Partial<DisplaySettings>): DisplaySettings {
  return {
    opacity: clampOpacity(typeof raw?.opacity === 'number' ? raw.opacity : DEFAULT_DISPLAY_SETTINGS.opacity),
    backgroundOpacity: clampUnit(
      typeof raw?.backgroundOpacity === 'number'
        ? raw.backgroundOpacity
        : DEFAULT_DISPLAY_SETTINGS.backgroundOpacity,
    ),
    legibilityBoost:
      typeof raw?.legibilityBoost === 'boolean'
        ? raw.legibilityBoost
        : DEFAULT_DISPLAY_SETTINGS.legibilityBoost,
    fontScale: clampFontScale(typeof raw?.fontScale === 'number' ? raw.fontScale : DEFAULT_DISPLAY_SETTINGS.fontScale),
    alignment:
      raw?.alignment === 'left' || raw?.alignment === 'right' || raw?.alignment === 'center'
        ? raw.alignment
        : DEFAULT_DISPLAY_SETTINGS.alignment,
    mirrorMode: !!raw?.mirrorMode,
    textColor: normalizeHexColor(raw?.textColor, DEFAULT_DISPLAY_SETTINGS.textColor),
    textColorMode: normalizeTextColorMode(raw?.textColorMode),
    handleColor: normalizeHexColor(raw?.handleColor, DEFAULT_DISPLAY_SETTINGS.handleColor),
    handleScale: clampHandleScale(
      typeof raw?.handleScale === 'number' ? raw.handleScale : DEFAULT_DISPLAY_SETTINGS.handleScale,
    ),
    handlePositionX: clampHandlePosition(
      typeof raw?.handlePositionX === 'number'
        ? raw.handlePositionX
        : DEFAULT_DISPLAY_SETTINGS.handlePositionX,
    ),
    lyricsWindowSize: clampWindowSize(
      typeof raw?.lyricsWindowSize === 'number'
        ? raw.lyricsWindowSize
        : DEFAULT_DISPLAY_SETTINGS.lyricsWindowSize,
    ),
  };
}

function normalizeRecognitionProvider(value: unknown): RecognitionProviderMode {
  if (value === 'shazam' || value === 'audd' || value === 'auto') return value;
  return DEFAULT_RECOGNITION_PROVIDER;
}

function normalizeTranslationSettings(raw?: Partial<TranslationSettings>): TranslationSettings {
  return {
    provider:
      raw?.provider === 'google' ||
      raw?.provider === 'deepl' ||
      raw?.provider === 'mymemory' ||
      raw?.provider === 'local'
        ? raw.provider
        : DEFAULT_TRANSLATION_SETTINGS.provider,
    localEndpoint:
      typeof raw?.localEndpoint === 'string' && raw.localEndpoint.trim()
        ? raw.localEndpoint.trim()
        : DEFAULT_TRANSLATION_SETTINGS.localEndpoint,
    localModel:
      typeof raw?.localModel === 'string' && raw.localModel.trim()
        ? raw.localModel.trim()
        : DEFAULT_TRANSLATION_SETTINGS.localModel,
    apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : DEFAULT_TRANSLATION_SETTINGS.apiKey,
    targetLang:
      typeof raw?.targetLang === 'string' && raw.targetLang.trim()
        ? raw.targetLang.trim().toLowerCase()
        : DEFAULT_TRANSLATION_SETTINGS.targetLang,
  };
}

function normalizeReadingSettings(raw?: Partial<ReadingSettings>): ReadingSettings {
  return {
    pinyinToneType: raw?.pinyinToneType === 'symbol' ? 'symbol' : 'none',
    spanishVariant: raw?.spanishVariant === 'distincion' ? 'distincion' : 'seseo',
  };
}

function normalizeWindowBounds(raw: unknown): WindowBounds | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as WindowBounds;
  if (
    typeof b.x !== 'number' ||
    typeof b.y !== 'number' ||
    typeof b.width !== 'number' ||
    typeof b.height !== 'number'
  ) {
    return null;
  }
  if (b.width < 320 || b.height < 200) return null;
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
  };
}

/** Reject the Linux basic_text backend: it does not protect a paid API key. */
function secureCredentialsAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
  } catch { return false; }
}

function atomicWrite(file: string, contents: string): void {
  const temporary = `${file}.tmp`;
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, contents, 'utf8'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
  if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
}

/**
 * Crea los almacenes persistentes respaldados en espejo-settings.json.
 * Sincrónico: llamar tras `app.whenReady()`.
 */
export function createPersistentSettings(): AppSettings {
  const file = path.join(app.getPath('userData'), SETTINGS_FILE);

  let trackOffsets: Record<string, number> = {};
  let calibrationOffsetMs = DEFAULT_CALIBRATION_OFFSET_MS;
  let display = { ...DEFAULT_DISPLAY_SETTINGS };
  let recognitionProvider: RecognitionProviderMode = DEFAULT_RECOGNITION_PROVIDER;
  let translation = { ...DEFAULT_TRANSLATION_SETTINGS };
  let reading = { ...DEFAULT_READING_SETTINGS };
  let uiLanguage: Locale = DEFAULT_LOCALE;
  let windowBounds: WindowBounds | null = null;
  let translationSecret: string | undefined;
  let loaded = false;
  let canProtectCredentials = secureCredentialsAvailable();

  for (const candidate of [file, `${file}.bak`]) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as SettingsShape;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Formato de ajustes inválido');
        if (parsed && typeof parsed.trackOffsets === 'object' && parsed.trackOffsets) {
          trackOffsets = { ...parsed.trackOffsets };
        }
        if (typeof parsed.calibrationOffsetMs === 'number') {
          calibrationOffsetMs = parsed.calibrationOffsetMs;
        }
        display = normalizeDisplay(parsed.display);
        recognitionProvider = normalizeRecognitionProvider(parsed.recognitionProvider);
        translation = normalizeTranslationSettings(parsed.translation);
        translationSecret = typeof parsed.translationSecret === 'string' ? parsed.translationSecret : undefined;
        if (translationSecret && canProtectCredentials) {
          try { translation.apiKey = safeStorage.decryptString(Buffer.from(translationSecret, 'base64')); }
          catch { canProtectCredentials = false; console.warn('[settings] No se pudo desbloquear la clave de traducción'); }
        }
        reading = normalizeReadingSettings(parsed.reading);
        // Archivos de ajustes viejos no traen el campo: caen al inglés.
        uiLanguage = normalizeLocale(parsed.uiLanguage);
        windowBounds = normalizeWindowBounds(parsed.windowBounds);
        loaded = true;
        break;
      }
    } catch (err) {
      console.error('[settings] no se pudo leer el archivo de ajustes:', err);
    }
  }

  const serialize = (): string => {
    const paidKey = translation.provider !== 'mymemory';
    if (paidKey && translation.apiKey && canProtectCredentials) {
      try { translationSecret = safeStorage.encryptString(translation.apiKey).toString('base64'); }
      catch { canProtectCredentials = false; }
    }
    const payload: SettingsShape = {
      trackOffsets,
      calibrationOffsetMs,
      display,
      recognitionProvider,
      translation: { ...translation, apiKey: paidKey ? '' : translation.apiKey },
      translationSecret: paidKey ? translationSecret : undefined,
      reading,
      uiLanguage,
      windowBounds,
    };
    return JSON.stringify(payload, null, 2);
  };
  let previous = serialize();
  const persist = (): void => {
    try {
      const next = serialize();
      atomicWrite(`${file}.bak`, previous);
      atomicWrite(file, next);
      previous = next;
    } catch (err) {
      console.error('[settings] no se pudo guardar los ajustes:', err);
    }
  };

  // Migrate legacy plaintext credentials immediately, including the backup.
  if (loaded) persist();

  const offsetStore: OffsetStore = {
    get: (trackKey) => trackOffsets[trackKey] ?? 0,
    set: (trackKey, offsetMs) => {
      if (offsetMs === 0) {
        delete trackOffsets[trackKey];
      } else {
        trackOffsets[trackKey] = offsetMs;
      }
      persist();
    },
    entries: () => ({ ...trackOffsets }),
    rebase: (deltaMs) => {
      if (!deltaMs) return;
      for (const key of Object.keys(trackOffsets)) {
        const next = trackOffsets[key] - deltaMs;
        // Residuos por debajo de la resolución de ajuste no valen la pena.
        if (Math.abs(next) < 25) delete trackOffsets[key];
        else trackOffsets[key] = next;
      }
      persist();
    },
  };

  const calibrationStore: CalibrationStore = {
    get: () => calibrationOffsetMs,
    set: (offsetMs) => {
      calibrationOffsetMs = offsetMs;
      persist();
    },
  };

  const displayStore: DisplayStore = {
    get: () => ({ ...display }),
    set: (partial) => {
      display = normalizeDisplay({ ...display, ...partial });
      persist();
    },
  };

  const recognitionProviderStore: RecognitionProviderStore = {
    get: () => recognitionProvider,
    set: (mode) => {
      recognitionProvider = normalizeRecognitionProvider(mode);
      persist();
    },
  };

  const translationStore: TranslationStore = {
    get: () => ({ ...translation, credentialStorage: canProtectCredentials ? 'secure' : 'session' }),
    set: (partial) => {
      if (partial.apiKey !== undefined || (partial.provider && partial.provider !== translation.provider)) {
        translationSecret = undefined;
      }
      const changedProvider = partial.provider && partial.provider !== translation.provider;
      translation = normalizeTranslationSettings({ ...translation, ...(changedProvider ? { apiKey: '' } : {}), ...partial });
      persist();
    },
  };

  const readingStore: ReadingStore = {
    get: () => ({ ...reading }),
    set: (partial) => {
      reading = normalizeReadingSettings({ ...reading, ...partial });
      persist();
    },
  };

  const uiLanguageStore: UiLanguageStore = {
    get: () => uiLanguage,
    set: (locale) => {
      uiLanguage = normalizeLocale(locale);
      persist();
    },
  };

  const windowBoundsStore: WindowBoundsStore = {
    get: () => (windowBounds ? { ...windowBounds } : null),
    set: (bounds) => {
      windowBounds = bounds ? normalizeWindowBounds(bounds) : null;
      persist();
    },
  };

  return {
    offsetStore,
    calibrationStore,
    displayStore,
    recognitionProviderStore,
    translationStore,
    readingStore,
    uiLanguageStore,
    windowBoundsStore,
  };
}
