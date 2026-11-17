import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_GHOST_KEY,
  AutoGhostTimer,
  autoGhostEligible,
  isHudActivity,
  readAutoGhostPrefs,
  writeAutoGhostPrefs,
  autoOpenAction,
} from '../src/autoGhost';

// localStorage no existe en el entorno node de vitest: stub mínimo.
const store = new Map<string, string>();
const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;

beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
});

afterEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = originalLocalStorage;
  vi.useRealTimers();
});

describe('preferencias de intangible automático', () => {
  it('devuelve los defaults sin nada guardado', () => {
    expect(readAutoGhostPrefs()).toEqual({ enabled: true, idleSeconds: 60, openOnRecognize: true });
  });

  it('hace roundtrip write/read', () => {
    writeAutoGhostPrefs({ enabled: false, idleSeconds: 120, openOnRecognize: false });
    expect(readAutoGhostPrefs()).toEqual({ enabled: false, idleSeconds: 120, openOnRecognize: false });
    expect(store.get(AUTO_GHOST_KEY)).toBe(
      '{"enabled":false,"idleSeconds":120,"openOnRecognize":false}',
    );
  });

  it('ajusta idleSeconds a la opción permitida más cercana', () => {
    store.set(AUTO_GHOST_KEY, JSON.stringify({ enabled: true, idleSeconds: 100 }));
    expect(readAutoGhostPrefs().idleSeconds).toBe(120);
    store.set(AUTO_GHOST_KEY, JSON.stringify({ enabled: true, idleSeconds: 20 }));
    expect(readAutoGhostPrefs().idleSeconds).toBe(15);
  });

  it('cae a defaults con valores no válidos', () => {
    store.set(AUTO_GHOST_KEY, JSON.stringify({ enabled: 'sí', idleSeconds: 'mucho' }));
    expect(readAutoGhostPrefs()).toEqual({ enabled: true, idleSeconds: 60, openOnRecognize: true });
    store.set(AUTO_GHOST_KEY, '{no es json');
    expect(readAutoGhostPrefs()).toEqual({ enabled: true, idleSeconds: 60, openOnRecognize: true });
  });
});

describe('apertura automática desde la pastilla', () => {
  it('las prefs guardadas antes de existir la opción la dejan activada', () => {
    store.set(AUTO_GHOST_KEY, JSON.stringify({ enabled: false, idleSeconds: 30 }));
    expect(readAutoGhostPrefs()).toEqual({ enabled: false, idleSeconds: 30, openOnRecognize: true });
  });

  it('con la pastilla y una canción nueva, abre en fantasma', () => {
    expect(autoOpenAction({ collapsed: true, newTrack: true, openOnRecognize: true })).toBe(
      'open-ghost',
    );
  });

  it('desactivada, se queda como pastilla', () => {
    expect(autoOpenAction({ collapsed: true, newTrack: true, openOnRecognize: false })).toBe(
      'stay',
    );
  });

  it('sin pastilla o sin canción nueva no hace nada', () => {
    expect(autoOpenAction({ collapsed: false, newTrack: true, openOnRecognize: true })).toBe(
      'none',
    );
    expect(autoOpenAction({ collapsed: true, newTrack: false, openOnRecognize: true })).toBe(
      'none',
    );
  });
});

describe('autoGhostEligible', () => {
  const libre = {
    collapsed: false,
    tangible: false,
    settingsOpen: false,
    welcomeOpen: false,
    manualSearchOpen: false,
    ghost: false,
  };

  it('es elegible solo con todo apagado', () => {
    expect(autoGhostEligible(libre)).toBe(true);
  });

  it.each([
    'collapsed',
    'tangible',
    'settingsOpen',
    'welcomeOpen',
    'manualSearchOpen',
    'ghost',
  ] as const)('no es elegible con %s activo', (flag) => {
    expect(autoGhostEligible({ ...libre, [flag]: true })).toBe(false);
  });
});

describe('isHudActivity', () => {
  it('los eventos de interacción siempre cuentan', () => {
    for (const type of ['pointerdown', 'mousedown', 'wheel', 'keydown', 'contextmenu']) {
      expect(isHudActivity(type, false)).toBe(true);
      expect(isHudActivity(type, true)).toBe(true);
    }
  });

  it('el mousemove solo cuenta sin click-through', () => {
    expect(isHudActivity('mousemove', false)).toBe(true);
    expect(isHudActivity('mousemove', true)).toBe(false);
    expect(isHudActivity('pointermove', false)).toBe(true);
    expect(isHudActivity('pointermove', true)).toBe(false);
  });

  it('otros eventos no cuentan', () => {
    expect(isHudActivity('focus', false)).toBe(false);
    expect(isHudActivity('resize', true)).toBe(false);
  });
});

describe('AutoGhostTimer', () => {
  const IDLE = 60_000;

  function setup() {
    vi.useFakeTimers();
    const onFire = vi.fn();
    const timer = new AutoGhostTimer(onFire);
    const config = { enabled: true, idleMs: IDLE, eligible: true };
    return { timer, onFire, config };
  }

  it('dispara tras idleMs de inactividad', () => {
    const { timer, onFire, config } = setup();
    timer.update(config);
    vi.advanceTimersByTime(IDLE - 1);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
    timer.dispose();
  });

  it('la actividad reinicia la cuenta', () => {
    const { timer, onFire, config } = setup();
    timer.update(config);
    vi.advanceTimersByTime(IDLE - 1000);
    timer.activity();
    vi.advanceTimersByTime(IDLE - 1);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
    timer.dispose();
  });

  it('no dispara si no es elegible', () => {
    const { timer, onFire, config } = setup();
    timer.update({ ...config, eligible: false });
    vi.advanceTimersByTime(IDLE * 2);
    expect(onFire).not.toHaveBeenCalled();
    timer.dispose();
  });

  it('al volver a ser elegible cuenta de cero', () => {
    const { timer, onFire, config } = setup();
    timer.update({ ...config, eligible: false });
    vi.advanceTimersByTime(IDLE);
    timer.update(config);
    vi.advanceTimersByTime(IDLE - 1);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
    timer.dispose();
  });

  it('deshabilitado no dispara', () => {
    const { timer, onFire, config } = setup();
    timer.update({ ...config, enabled: false });
    vi.advanceTimersByTime(IDLE * 2);
    expect(onFire).not.toHaveBeenCalled();
    timer.dispose();
  });

  it('dispara una sola vez por período de inactividad', () => {
    const { timer, onFire, config } = setup();
    timer.update(config);
    vi.advanceTimersByTime(IDLE);
    expect(onFire).toHaveBeenCalledTimes(1);
    // Ni avanzando más ni repitiendo update con la misma config rearma.
    vi.advanceTimersByTime(IDLE * 3);
    timer.update(config);
    vi.advanceTimersByTime(IDLE * 2);
    expect(onFire).toHaveBeenCalledTimes(1);
    // La actividad sí abre un período nuevo.
    timer.activity();
    vi.advanceTimersByTime(IDLE);
    expect(onFire).toHaveBeenCalledTimes(2);
    timer.dispose();
  });
});
