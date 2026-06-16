// ============================================================================
// settings.ts — persistencia del offset de sincronización por pista.
//
// El offset crónico ("AudD se adelanta/atrasa sistemáticamente X ms en esta
// canción") se guarda en disco para que el ajuste fino del usuario sobreviva al
// reinicio. Clave = normalizeTrackKey(artist, title).
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

/** Implementación en memoria (no persiste). Útil como fallback y en tests. */
export const NULL_OFFSET_STORE: OffsetStore = {
  get: () => 0,
  set: () => {},
};

const SETTINGS_FILE = 'espejo-settings.json';

interface SettingsShape {
  trackOffsets?: Record<string, number>;
}

/**
 * Crea un OffsetStore respaldado en un JSON dentro de userData. Mantiene un
 * mapa en memoria y lo vuelca completo en cada `set`. Sincrónico: debe llamarse
 * después de `app.whenReady()` (cuando getPath('userData') ya es válido).
 */
export function createPersistentOffsetStore(): OffsetStore {
  const file = path.join(app.getPath('userData'), SETTINGS_FILE);

  let map: Record<string, number> = {};
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as SettingsShape;
      if (parsed && typeof parsed.trackOffsets === 'object' && parsed.trackOffsets) {
        map = { ...parsed.trackOffsets };
      }
    }
  } catch (err) {
    console.error('[settings] no se pudo leer el archivo de ajustes, empezando limpio:', err);
  }

  const persist = (): void => {
    try {
      const payload: SettingsShape = { trackOffsets: map };
      fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.error('[settings] no se pudo guardar el offset:', err);
    }
  };

  return {
    get: (trackKey) => map[trackKey] ?? 0,
    set: (trackKey, offsetMs) => {
      if (offsetMs === 0) {
        delete map[trackKey];
      } else {
        map[trackKey] = offsetMs;
      }
      persist();
    },
  };
}
