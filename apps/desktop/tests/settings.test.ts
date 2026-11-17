import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Directorio userData por test; se asigna en beforeEach. El factory de vi.mock
// solo cierra sobre la variable; getPath se llama al invocar createPersistentSettings.
let userDataDir = '';
const protection = vi.hoisted(() => ({ available: true, backend: 'gnome_libsecret', fail: false }));
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    isEncryptionAvailable: () => protection.available,
    getSelectedStorageBackend: () => protection.backend,
    encryptString: (text: string) => {
      if (protection.fail) throw new Error('keyring locked');
      return Buffer.from(text.split('').reverse().join(''));
    },
    decryptString: (text: Buffer) => text.toString().split('').reverse().join(''),
  },
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
    protection.available = true; protection.backend = 'gnome_libsecret'; protection.fail = false;
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
      backgroundOpacity: 1,
      legibilityBoost: true,
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
  it('migrates a legacy paid key without leaving plaintext in settings or backup', () => {
    const file = path.join(dir, 'espejo-settings.json');
    fs.writeFileSync(file, JSON.stringify({ translation: { provider: 'deepl', apiKey: 'paid-secret', targetLang: 'ja' } }));
    const settings = createPersistentSettings();
    expect(settings.translationStore.get().apiKey).toBe('paid-secret');
    for (const candidate of [file, file + '.bak']) {
      const text = fs.readFileSync(candidate, 'utf8');
      expect(text).not.toContain('paid-secret');
      expect(JSON.parse(text).translationSecret).toBeTruthy();
    }
    expect(createPersistentSettings().translationStore.get().apiKey).toBe('paid-secret');
  });

  it.each(['unavailable', 'locked', ...(process.platform === 'linux' ? ['basic_text'] : [])])('uses session-only storage when secure storage is %s', (mode) => {
    protection.available = mode !== 'unavailable';
    protection.backend = mode === 'basic_text' ? 'basic_text' : 'gnome_libsecret';
    protection.fail = mode === 'locked';
    const settings = createPersistentSettings();
    settings.translationStore.set({ provider: 'google', apiKey: 'private-key' });
    expect(settings.translationStore.get()).toMatchObject({ apiKey: 'private-key', credentialStorage: 'session' });
    expect(fs.readFileSync(path.join(dir, 'espejo-settings.json'), 'utf8')).not.toContain('private-key');
    expect(createPersistentSettings().translationStore.get().apiKey).toBe('');
  });

  it('recovers the last valid preferences from backup after a damaged main file', () => {
    const settings = createPersistentSettings();
    settings.displayStore.set({ textColor: '#123456' });
    settings.displayStore.set({ fontScale: 1.5 });
    fs.writeFileSync(path.join(dir, 'espejo-settings.json'), '{broken');
    expect(createPersistentSettings().displayStore.get().textColor).toBe('#123456');
  });

  it('clears a provider credential on switching so a paid key cannot become a MyMemory email', () => {
    const settings = createPersistentSettings();
    settings.translationStore.set({ provider: 'deepl', apiKey: 'paid-key' });
    settings.translationStore.set({ provider: 'mymemory' });
    expect(settings.translationStore.get().apiKey).toBe('');
    expect(createPersistentSettings().translationStore.get().apiKey).toBe('');
  });


  it('backgroundOpacity y legibilityBoost tienen defaults retrocompatibles', () => {
    // Ajustes de una versión anterior: el archivo no trae los campos nuevos.
    const s1 = createPersistentSettings();
    s1.displayStore.set({ opacity: 0.8 });

    const file = path.join(userDataDir, 'espejo-settings.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      display: Record<string, unknown>;
    };
    delete raw.display.backgroundOpacity;
    delete raw.display.legibilityBoost;
    fs.writeFileSync(file, JSON.stringify(raw), 'utf8');

    const s2 = createPersistentSettings();
    const display = s2.displayStore.get();
    expect(display.backgroundOpacity).toBe(1); // aspecto actual
    expect(display.legibilityBoost).toBe(true);
    expect(display.opacity).toBe(0.8); // lo demás se conserva
  });

  it('backgroundOpacity se clampea a 0–1 y legibilityBoost persiste', () => {
    const s = createPersistentSettings();

    s.displayStore.set({ backgroundOpacity: -0.5, legibilityBoost: false });
    expect(s.displayStore.get().backgroundOpacity).toBe(0);
    expect(s.displayStore.get().legibilityBoost).toBe(false);

    s.displayStore.set({ backgroundOpacity: 1.7 });
    expect(s.displayStore.get().backgroundOpacity).toBe(1);

    // Persiste entre sesiones.
    s.displayStore.set({ backgroundOpacity: 0.3, legibilityBoost: false });
    const s2 = createPersistentSettings();
    expect(s2.displayStore.get().backgroundOpacity).toBe(0.3);
    expect(s2.displayStore.get().legibilityBoost).toBe(false);
  });

  it('legibilityBoost con valor no booleano cae al default', () => {
    const s1 = createPersistentSettings();
    s1.displayStore.set({ textColor: '#ffffff' });

    const file = path.join(userDataDir, 'espejo-settings.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      display: Record<string, unknown>;
    };
    raw.display.legibilityBoost = 'si';
    fs.writeFileSync(file, JSON.stringify(raw), 'utf8');

    expect(createPersistentSettings().displayStore.get().legibilityBoost).toBe(true);
  });

  it('uiLanguage por defecto es inglés y persiste el cambio', () => {
    const s1 = createPersistentSettings();
    expect(s1.uiLanguageStore.get()).toBe('en');

    s1.uiLanguageStore.set('es');
    expect(s1.uiLanguageStore.get()).toBe('es');

    // Una segunda instancia recarga el mismo archivo.
    const s2 = createPersistentSettings();
    expect(s2.uiLanguageStore.get()).toBe('es');
  });

  it('uiLanguage con valor inválido o ausente cae al inglés', () => {
    const s1 = createPersistentSettings();
    s1.uiLanguageStore.set('es');

    const file = path.join(userDataDir, 'espejo-settings.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    raw.uiLanguage = 'fr';
    fs.writeFileSync(file, JSON.stringify(raw), 'utf8');
    expect(createPersistentSettings().uiLanguageStore.get()).toBe('en');

    // Un archivo de ajustes viejo sin el campo también cae al inglés.
    delete raw.uiLanguage;
    fs.writeFileSync(file, JSON.stringify(raw), 'utf8');
    expect(createPersistentSettings().uiLanguageStore.get()).toBe('en');
  });
});