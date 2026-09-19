import { describe, it, expect } from 'vitest';
import { DisplayAppearance } from '../electron/core/displayAppearance';
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_READING_SETTINGS,
  type DisplaySettings,
  type DisplayStore,
  type ReadingStore,
} from '../electron/services/settings';
import { getPinyinToneType, getSpanishVariant } from '../electron/services/romanize';

function makeDisplayStore(initial: Partial<DisplaySettings> = {}): DisplayStore {
  let settings: DisplaySettings = { ...DEFAULT_DISPLAY_SETTINGS, ...initial };
  return {
    get: () => settings,
    set: (partial) => {
      settings = { ...settings, ...partial };
    },
  };
}

function makeReadingStore(): ReadingStore {
  let settings = { ...DEFAULT_READING_SETTINGS };
  return {
    get: () => settings,
    set: (partial) => {
      settings = { ...settings, ...partial };
    },
  };
}

describe('DisplayAppearance', () => {
  it('en modo manual, usa el color y calcula la viñeta según luminosidad', () => {
    const appearance = new DisplayAppearance(
      makeDisplayStore({ textColorMode: 'manual', textColor: '#000000' }),
      makeReadingStore(),
    );
    expect(appearance.resolveTextAppearance()).toEqual({
      text_color: '#000000',
      text_vignette_light: true, // negro es "oscuro" → viñeta clara
    });
  });

  it('en modo auto, sin contraste calculado aún, cae a blanco sin viñeta', () => {
    const appearance = new DisplayAppearance(
      makeDisplayStore({ textColorMode: 'auto' }),
      makeReadingStore(),
    );
    expect(appearance.resolveTextAppearance()).toEqual({
      text_color: '#ffffff',
      text_vignette_light: false,
    });
  });

  it('en modo auto, usa el color fijado por setAutoContrast hasta que se limpia', () => {
    const appearance = new DisplayAppearance(
      makeDisplayStore({ textColorMode: 'auto' }),
      makeReadingStore(),
    );
    appearance.setAutoContrast('#123456', true);
    expect(appearance.resolveTextAppearance()).toEqual({
      text_color: '#123456',
      text_vignette_light: true,
    });
    appearance.clearAutoContrast();
    expect(appearance.resolveTextAppearance()).toEqual({
      text_color: '#ffffff',
      text_vignette_light: false,
    });
  });

  it('isManualTextColor refleja el modo persistido', () => {
    const store = makeDisplayStore({ textColorMode: 'auto' });
    const appearance = new DisplayAppearance(store, makeReadingStore());
    expect(appearance.isManualTextColor()).toBe(false);
    store.set({ textColorMode: 'manual' });
    expect(appearance.isManualTextColor()).toBe(true);
  });

  it('resuelve la apariencia del handle desde el DisplayStore', () => {
    const appearance = new DisplayAppearance(
      makeDisplayStore({ handleColor: '#ff0000', handleScale: 1.5, handlePositionX: 0.25 }),
      makeReadingStore(),
    );
    expect(appearance.resolveHandleAppearance()).toEqual({
      handle_color: '#ff0000',
      handle_scale: 1.5,
      handle_position_x: 0.25,
    });
  });

  it('applyReadingSettings propaga pinyin y variante del español a romanize.ts', () => {
    const readingStore = makeReadingStore();
    readingStore.set({ pinyinToneType: 'symbol', spanishVariant: 'distincion' });
    const appearance = new DisplayAppearance(makeDisplayStore(), readingStore);
    appearance.applyReadingSettings();
    expect(getPinyinToneType()).toBe('symbol');
    expect(getSpanishVariant()).toBe('distincion');
  });
});
