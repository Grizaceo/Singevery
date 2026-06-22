// ============================================================================
// settings.ts — persistencia de ajustes de sincronización.
//
// Dos ajustes persisten en disco (espejo-settings.json dentro de userData):
//   - trackOffsets: offset crónico POR PISTA ("AudD se adelanta/atrasa X ms
//     en esta canción"). Clave = normalizeTrackKey(artist, title).
//   - calibrationOffsetMs: compensación de latencia GLOBAL (el SYNC_OFFSET_MS
//     de syncTiming.ts, por defecto 300ms). Ahora calibrable y persistido
//     (P2.8) en vez de una constante hardcodeada.
//
// Ambos viven en el mismo archivo y se persisten juntos con una sola
// escritura, para evitar que dos almacenes independientes se pisen entre sí.
//
// Implementado con `fs` sobre app.getPath('userData') a propósito: evita
// depender de electron-store v10 (ESM puro), que al compilarse a CommonJS
// rompe con ERR_REQUIRE_ESM.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

/** Almacén de offsets por pista. El StateStore depende de esta interfaz. */
export interface OffsetStore {
  get(trackKey: string): number;
  set(trackKey: string, offsetMs: number): void;
}

/** Almacén de la calibración global de sincronización (latencia AudD). */
export interface CalibrationStore {
  get(): number;
  set(offsetMs: number): void;
}

/** Implementación en memoria (no persiste). Útil como fallback y en tests. */
export const NULL_OFFSET_STORE: OffsetStore = {
  get: () => 0,
  set: () => {},
};

/**
 * Calibración por defecto (ms): compensación de latencia de grabación +
 * identificación de AudD. Coincide con SYNC_OFFSET_MS en syncTiming.ts.
 * Se mantiene aquí (y no importando de syncTiming) para evitar un ciclo de
 * dependencias en los tests que mockean electron.
 */
export const DEFAULT_CALIBRATION_OFFSET_MS = 300;

/** Implementación en memoria de la calibración: devuelve siempre el default. */
export const NULL_CALIBRATION_STORE: CalibrationStore = {
  get: () => DEFAULT_CALIBRATION_OFFSET_MS,
  set: () => {},
};

const SETTINGS_FILE = 'espejo-settings.json';

interface SettingsShape {
  trackOffsets?: Record<string, number>;
  calibrationOffsetMs?: number;
}

interface PersistentSettings {
  offsetStore: OffsetStore;
  calibrationStore: CalibrationStore;
}

/**
 * Crea los almacenes persistentes (offsets por pista + calibración global)
 * respaldados en un único JSON dentro de userData. Comparten el estado en
 * memoria y una sola escritura. Sincrónico: llamar tras `app.whenReady()`.
 */
export function createPersistentSettings(): PersistentSettings {
  const file = path.join(app.getPath('userData'), SETTINGS_FILE);

  let trackOffsets: Record<string, number> = {};
  let calibrationOffsetMs = DEFAULT_CALIBRATION_OFFSET_MS;
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as SettingsShape;
      if (parsed && typeof parsed.trackOffsets === 'object' && parsed.trackOffsets) {
        trackOffsets = { ...parsed.trackOffsets };
      }
      if (typeof parsed.calibrationOffsetMs === 'number') {
        calibrationOffsetMs = parsed.calibrationOffsetMs;
      }
    }
  } catch (err) {
    console.error('[settings] no se pudo leer el archivo de ajustes, empezando limpio:', err);
  }

  const persist = (): void => {
    try {
      const payload: SettingsShape = { trackOffsets, calibrationOffsetMs };
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

  return { offsetStore, calibrationStore };
}