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
      textColor: '#ffffff',
      textColorMode: 'manual',
      handleColor: '#000000',
      handleScale: 1,
      handlePositionX: 0.5,
      lyricsWindowSize: 2,
    });
    expect(s2.recognitionProviderStore.get()).toBe('shazam');
  });

  it('persiste y normaliza la personalización del handle', () => {
    const s1 = createPersistentSettings();
    s1.displayStore.set({ handleColor: '#FDE047', handleScale: 5, handlePositionX: -0.2 });

    const s2 = createPersistentSettings();
    const display = s2.displayStore.get();
    expect(display.handleColor).toBe('#fde047'); // hex normalizado a minúsculas
    expect(display.handleScale).toBe(2); // clamp superior
    expect(display.handlePositionX).toBe(0); // clamp inferior
  });

  it('persiste bounds de ventana', () => {
    const s1 = createPersistentSettings();
    s1.windowBoundsStore.set({ x: 100, y: 80, width: 800, height: 600 });
    const s2 = createPersistentSettings();
    expect(s2.windowBoundsStore.get()).toEqual({ x: 100, y: 80, width: 800, height: 600 });
  });

  it('persiste color de letra y modo auto-contraste', () => {
    const s1 = createPersistentSettings();
    s1.displayStore.set({ textColor: '#fde047', textColorMode: 'auto' });

    const s2 = createPersistentSettings();
    expect(s2.displayStore.get().textColor).toBe('#fde047');
    expect(s2.displayStore.get().textColorMode).toBe('auto');
  });

  it('acota las líneas visibles a un rango usable', () => {
    const s = createPersistentSettings();
    expect(s.displayStore.get().lyricsWindowSize).toBe(2); // por defecto

    s.displayStore.set({ lyricsWindowSize: 4 });
    expect(s.displayStore.get().lyricsWindowSize).toBe(4);

    // Sin contexto no se ve lo que viene; con demasiado no se lee nada.
    s.displayStore.set({ lyricsWindowSize: 0 });
    expect(s.displayStore.get().lyricsWindowSize).toBe(1);
    s.displayStore.set({ lyricsWindowSize: 99 });
    expect(s.displayStore.get().lyricsWindowSize).toBe(5);

    // Persiste entre sesiones.
    s.displayStore.set({ lyricsWindowSize: 3 });
    expect(createPersistentSettings().displayStore.get().lyricsWindowSize).toBe(3);
  });

  it('ignora ajustes de versiones anteriores sin romperse', () => {
    // El modo TV se retiró: un archivo de ajustes viejo trae `remote` y otras
    // claves que ya no existen. Deben ignorarse sin perder lo demás.
    const s1 = createPersistentSettings();
    s1.displayStore.set({ textColor: '#22d3ee' });

    const file = path.join(userDataDir, 'espejo-settings.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    raw.remote = { enabled: true };
    raw.claveInventada = 42;
    fs.writeFileSync(file, JSON.stringify(raw), 'utf8');

    const s2 = createPersistentSettings();
    expect(s2.displayStore.get().textColor).toBe('#22d3ee');
    expect((s2 as unknown as Record<string, unknown>).remoteSettingsStore).toBeUndefined();
  });
});