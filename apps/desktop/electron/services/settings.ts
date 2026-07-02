// ============================================================================
// settings.ts — persistencia de ajustes (sync, display, reconocimiento, ventana).
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { RecognitionProviderMode } from './recognition/provider';

/** Almacén de offsets por pista. El StateStore depende de esta interfaz. */
export interface OffsetStore {
  get(trackKey: string): number;
  set(trackKey: string, offsetMs: number): void;
}

/** Almacén de la calibración global de sincronización (latencia). */
export interface CalibrationStore {
  get(): number;
  set(offsetMs: number): void;
}

export type TextAlignment = 'left' | 'center' | 'right';

export interface DisplaySettings {
  opacity: number;
  fontScale: number;
  alignment: TextAlignment;
  mirrorMode: boolean;
}

export interface DisplayStore {
  get(): DisplaySettings;
  set(partial: Partial<DisplaySettings>): void;
}

export interface RecognitionProviderStore {
  get(): RecognitionProviderMode;
  set(mode: RecognitionProviderMode): void;
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
  windowBoundsStore: WindowBoundsStore;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  opacity: 1.0,
  fontScale: 1.0,
  alignment: 'center',
  mirrorMode: false,
};

export const DEFAULT_RECOGNITION_PROVIDER: RecognitionProviderMode = 'auto';

/** Implementación en memoria (no persiste). Útil como fallback y en tests. */
export const NULL_OFFSET_STORE: OffsetStore = {
  get: () => 0,
  set: () => {},
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
  windowBounds?: WindowBounds | null;
}

function clampOpacity(value: number): number {
  return Math.min(1, Math.max(0.2, value));
}

function clampFontScale(value: number): number {
  return Math.min(2, Math.max(0.6, value));
}

function normalizeDisplay(raw?: Partial<DisplaySettings>): DisplaySettings {
  return {
    opacity: clampOpacity(typeof raw?.opacity === 'number' ? raw.opacity : DEFAULT_DISPLAY_SETTINGS.opacity),
    fontScale: clampFontScale(typeof raw?.fontScale === 'number' ? raw.fontScale : DEFAULT_DISPLAY_SETTINGS.fontScale),
    alignment:
      raw?.alignment === 'left' || raw?.alignment === 'right' || raw?.alignment === 'center'
        ? raw.alignment
        : DEFAULT_DISPLAY_SETTINGS.alignment,
    mirrorMode: !!raw?.mirrorMode,
  };
}

function normalizeRecognitionProvider(value: unknown): RecognitionProviderMode {
  if (value === 'shazam' || value === 'audd' || value === 'auto') return value;
  return DEFAULT_RECOGNITION_PROVIDER;
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

/** Valida que los bounds intersecten algún display (multi-monitor). */
export function isWindowBoundsValid(
  bounds: WindowBounds,
  displays: Array<{ x: number; y: number; width: number; height: number }>,
): boolean {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return displays.some((d) => {
    const dRight = d.x + d.width;
    const dBottom = d.y + d.height;
    return bounds.x < dRight && right > d.x && bounds.y < dBottom && bottom > d.y;
  });
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
  let windowBounds: WindowBounds | null = null;

  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as SettingsShape;
      if (parsed && typeof parsed.trackOffsets === 'object' && parsed.trackOffsets) {
        trackOffsets = { ...parsed.trackOffsets };
      }
      if (typeof parsed.calibrationOffsetMs === 'number') {
        calibrationOffsetMs = parsed.calibrationOffsetMs;
      }
      display = normalizeDisplay(parsed.display);
      recognitionProvider = normalizeRecognitionProvider(parsed.recognitionProvider);
      windowBounds = normalizeWindowBounds(parsed.windowBounds);
    }
  } catch (err) {
    console.error('[settings] no se pudo leer el archivo de ajustes, empezando limpio:', err);
  }

  const persist = (): void => {
    try {
      const payload: SettingsShape = {
        trackOffsets,
        calibrationOffsetMs,
        display,
        recognitionProvider,
        windowBounds,
      };
      fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.error('[settings] no se pudo guardar los ajustes:', err);
    }
  };

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
    windowBoundsStore,
  };
}
