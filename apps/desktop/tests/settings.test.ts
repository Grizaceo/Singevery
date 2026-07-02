import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Directorio userData por test; se asigna en beforeEach. El factory de vi.mock
// solo cierra sobre la variable; getPath se llama al invocar createPersistentSettings.
let userDataDir = '';
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
}));

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  createPersistentSettings,
  DEFAULT_CALIBRATION_OFFSET_MS,
  NULL_OFFSET_STORE,
  NULL_CALIBRATION_STORE,
} from '../electron/services/settings';

describe('settings persistente (P2.8)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espejo-settings-'));
    userDataDir = dir;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('la calibración por defecto es DEFAULT_CALIBRATION_OFFSET_MS', () => {
    const { calibrationStore } = createPersistentSettings();
    expect(calibrationStore.get()).toBe(DEFAULT_CALIBRATION_OFFSET_MS);
  });

  it('persiste y recarga la calibración global y el offset por pista en el mismo archivo', () => {
    const s1 = createPersistentSettings();
    s1.calibrationStore.set(420);
    s1.offsetStore.set('artist::title', 150);

    // Una segunda instancia recarga el mismo archivo.
    const s2 = createPersistentSettings();
    expect(s2.calibrationStore.get()).toBe(420);
    expect(s2.offsetStore.get('artist::title')).toBe(150);
  });

  it('borrar el offset por pista (a 0) lo elimina del mapa', () => {
    const s1 = createPersistentSettings();
    s1.offsetStore.set('artist::title', 150);
    s1.offsetStore.set('artist::title', 0);
    expect(s1.offsetStore.get('artist::title')).toBe(0);

    const s2 = createPersistentSettings();
    expect(s2.offsetStore.get('artist::title')).toBe(0);
  });

  it('NULL_CALIBRATION_STORE devuelve el default y no persiste', () => {
    expect(NULL_CALIBRATION_STORE.get()).toBe(DEFAULT_CALIBRATION_OFFSET_MS);
    NULL_CALIBRATION_STORE.set(999);
    expect(NULL_CALIBRATION_STORE.get()).toBe(DEFAULT_CALIBRATION_OFFSET_MS);
  });

  it('NULL_OFFSET_STORE siempre devuelve 0', () => {
    expect(NULL_OFFSET_STORE.get('x::y')).toBe(0);
  });

  it('persiste ajustes de display y proveedor de reconocimiento', () => {
    const s1 = createPersistentSettings();
    s1.displayStore.set({ opacity: 0.8, fontScale: 1.2, alignment: 'left', mirrorMode: true });
    s1.recognitionProviderStore.set('shazam');

    const s2 = createPersistentSettings();
    expect(s2.displayStore.get()).toEqual({
      opacity: 0.8,
      fontScale: 1.2,
      alignment: 'left',
      mirrorMode: true,
    });
    expect(s2.recognitionProviderStore.get()).toBe('shazam');
  });

  it('persiste bounds de ventana', () => {
    const s1 = createPersistentSettings();
    s1.windowBoundsStore.set({ x: 100, y: 80, width: 800, height: 600 });
    const s2 = createPersistentSettings();
    expect(s2.windowBoundsStore.get()).toEqual({ x: 100, y: 80, width: 800, height: 600 });
  });
});