import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `electron` no existe fuera del runtime de Electron: lo mockeamos para poder
// importar StateStore (y settings.ts) en un test de Node puro.
vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

import { StateStore } from '../electron/core/stateStore';
import type { CalibrationStore } from '../electron/services/settings';
import type { LyricsService } from '../electron/services/lyrics/lyricsService';

// StateStore usa Date.now() internamente; controlamos el reloj con fake timers.
describe('StateStore — pausa del reloj por silencio', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeStore(): StateStore {
    // window=null: emit() está guardado contra null; offsetStore por defecto = NULL.
    return new StateStore(null);
  }

  it('avanza con el reloj de pared cuando hay señal', () => {
    const s = makeStore();
    s.nudgePosition(10_000); // posición = 10s en t=0
    vi.setSystemTime(2_000);
    expect(s.getDisplayedPosition()).toBe(12_000);
  });

  it('congela la posición tras silencio sostenido', () => {
    const s = makeStore();
    s.nudgePosition(10_000); // t=0 → pos 10s
    vi.setSystemTime(2_000); // pos 12s

    s.reportAudioLevel(0, 2_000); // empieza el silencio (aún no pausa)
    expect(s.isClockPaused()).toBe(false);
    s.reportAudioLevel(0, 2_500); // silencio sostenido ≥400ms → pausa
    expect(s.isClockPaused()).toBe(true);

    // Congelado en ~12s aunque pase el tiempo de pared.
    vi.setSystemTime(8_000);
    expect(s.getDisplayedPosition(8_000)).toBeCloseTo(12_000, -1);
  });

  it('reanuda sin salto cuando vuelve la señal', () => {
    const s = makeStore();
    s.nudgePosition(10_000);
    vi.setSystemTime(2_000);
    s.reportAudioLevel(0, 2_000);
    s.reportAudioLevel(0, 2_500); // pausa, congelado en 12s

    vi.setSystemTime(8_000);
    s.reportAudioLevel(0.5, 8_000); // vuelve la señal → reanuda desde 12s
    expect(s.isClockPaused()).toBe(false);

    vi.setSystemTime(10_000); // +2s desde la reanudación
    expect(s.getDisplayedPosition(10_000)).toBeCloseTo(14_000, -1);
  });

  it('no pausa por un bache puntual de nivel', () => {
    const s = makeStore();
    s.nudgePosition(10_000);
    s.reportAudioLevel(0, 0); // silencio empieza
    s.reportAudioLevel(0.5, 100); // vuelve señal antes del hold → nunca pausó
    expect(s.isClockPaused()).toBe(false);
  });
});

describe('StateStore — calibración global (P2.8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeCalibration(initial: number): {
    store: CalibrationStore;
    state: StateStore;
  } {
    let value = initial;
    const store: CalibrationStore = {
      get: () => value,
      set: (v) => {
        value = v;
      },
    };
    const state = new StateStore(null, undefined, undefined, store);
    return { store, state };
  }

  it('carga la calibración inicial desde el store', () => {
    const { state } = makeCalibration(450);
    expect(state.getCalibrationOffsetMs()).toBe(450);
  });

  it('adjustCalibrationOffset desplaza la letra en vivo y persiste', () => {
    const { store, state } = makeCalibration(300);
    state.nudgePosition(10_000); // posición 10s
    expect(state.getDisplayedPosition()).toBe(10_000);

    state.adjustCalibrationOffset(50);
    // La calibración subió a 350 y se persistió.
    expect(state.getCalibrationOffsetMs()).toBe(350);
    expect(store.get()).toBe(350);
    // La letra se desplazó +50ms (adelantada).
    expect(state.getDisplayedPosition()).toBe(10_050);
  });
});

describe('StateStore — líneas de letra visibles', () => {
  it('propaga lyricsWindowSize al motor y se refleja en el RenderModel', async () => {
    const LYRICS = {
      lines: Array.from({ length: 21 }, (_, i) => ({ start_ms: i * 1000, text: `linea ${i}` })),
      source: 'lrclib',
      synced: true,
    };
    const lyricsService = { getLyrics: vi.fn(async () => LYRICS) } as unknown as LyricsService;

    let windowSize = 2;
    const displayStore = {
      get: () => ({
        opacity: 1,
        fontScale: 1,
        alignment: 'center' as const,
        mirrorMode: false,
        textColor: '#ffffff',
        textColorMode: 'manual' as const,
        handleColor: '#000000',
        handleScale: 1,
        handlePositionX: 0.5,
        lyricsWindowSize: windowSize,
      }),
      set: () => {},
    };

    const state = new StateStore(null, undefined, lyricsService, undefined, displayStore);
    await state.loadLyricsByMetadata('C', 'A', 10_000, Date.now());

    // Con el valor por defecto: 2 líneas de contexto por lado.
    const emitted: { previous: number; next: number }[] = [];
    const capture = (): void => {
      const m = (state as unknown as { engine: { getRenderModel: (p: number) => {
        previous_lines: unknown[]; next_lines: unknown[] } } }).engine.getRenderModel(10_000);
      emitted.push({ previous: m.previous_lines.length, next: m.next_lines.length });
    };
    capture();
    expect(emitted[0]).toEqual({ previous: 2, next: 2 });

    // Al subir el ajuste, applyDisplaySettings lo lleva al motor.
    windowSize = 5;
    state.applyDisplaySettings();
    capture();
    expect(emitted[1]).toEqual({ previous: 5, next: 5 });
    state.stop();
  });
});

describe('StateStore — latencia global ("todas van un poco atrasadas")', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  /** OffsetStore en memoria con soporte de entries/rebase. */
  function makeOffsetStore() {
    let offsets: Record<string, number> = {};
    return {
      get: (k: string) => offsets[k] ?? 0,
      set: (k: string, ms: number) => {
        if (ms === 0) delete offsets[k];
        else offsets[k] = ms;
      },
      entries: () => ({ ...offsets }),
      rebase: (delta: number) => {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(offsets)) {
          const r = v - delta;
          if (Math.abs(r) >= 25) next[k] = r;
        }
        offsets = next;
      },
      raw: () => offsets,
    };
  }

  function makeCalibrationStore(initial = 0) {
    let value = initial;
    return { get: () => value, set: (v: number) => { value = v; }, current: () => value };
  }

  it('aplicar a todas: mueve el ajuste a la calibración sin que la letra salte', async () => {
    const offsetStore = makeOffsetStore();
    const calibrationStore = makeCalibrationStore(300);
    const lyricsService = { getLyrics: vi.fn(async () => null) } as unknown as LyricsService;
    const state = new StateStore(null, offsetStore, lyricsService, calibrationStore);

    await state.loadLyricsByMetadata('Cancion', 'Artista', 10_000, 0);
    state.adjustSyncOffset(1_500); // el usuario adelanta la letra 1.5s
    const displayedBefore = state.getDisplayedPosition(0);

    const calibration = state.applyOffsetToAllTracks();

    // La calibración global absorbió el ajuste…
    expect(calibration).toBe(1_800);
    expect(calibrationStore.current()).toBe(1_800);
    // …el offset de la pista vuelve a 0 (no se cuenta dos veces)…
    expect(state.getSyncOffsetMs()).toBe(0);
    expect(offsetStore.raw()).toEqual({});
    // …y la letra NO se movió de donde estaba.
    expect(state.getDisplayedPosition(0)).toBe(displayedBefore);
    state.stop();
  });

  it('rebasa los ajustes ya guardados de otras pistas al promover', async () => {
    const offsetStore = makeOffsetStore();
    offsetStore.set('a::1', 1_400);
    offsetStore.set('b::2', 1_600);
    const calibrationStore = makeCalibrationStore(0);
    const lyricsService = { getLyrics: vi.fn(async () => null) } as unknown as LyricsService;
    const state = new StateStore(null, offsetStore, lyricsService, calibrationStore);

    await state.loadLyricsByMetadata('Cancion', 'Artista', 0, 0);
    state.adjustSyncOffset(1_500);
    state.applyOffsetToAllTracks();

    // 1.5s pasaron a ser globales: lo que queda por pista es solo el residuo
    // propio de cada una (±100ms), no el desfase común.
    expect(calibrationStore.current()).toBe(1_500);
    expect(offsetStore.raw()['a::1']).toBe(-100);
    expect(offsetStore.raw()['b::2']).toBe(100);
    state.stop();
  });

  it('aprende la latencia sola tras corregir varias pistas en el mismo sentido', async () => {
    const offsetStore = makeOffsetStore();
    const calibrationStore = makeCalibrationStore(0);
    const lyricsService = { getLyrics: vi.fn(async () => null) } as unknown as LyricsService;
    const state = new StateStore(null, offsetStore, lyricsService, calibrationStore);

    // Tres canciones distintas, todas adelantadas ~1.5s por el usuario.
    await state.loadLyricsByMetadata('Uno', 'A', 0, 0);
    state.adjustSyncOffset(1_500);
    expect(calibrationStore.current()).toBe(0); // aún no hay evidencia suficiente

    await state.loadLyricsByMetadata('Dos', 'B', 0, 0);
    state.adjustSyncOffset(1_400);
    expect(calibrationStore.current()).toBe(0);

    await state.loadLyricsByMetadata('Tres', 'C', 0, 0);
    state.adjustSyncOffset(1_600);

    // Tres pistas coherentes: la mediana pasa a ser latencia global.
    expect(calibrationStore.current()).toBe(1_500);
    state.stop();
  });

  it('NO confunde ajustes contradictorios con latencia global', async () => {
    const offsetStore = makeOffsetStore();
    const calibrationStore = makeCalibrationStore(0);
    const lyricsService = { getLyrics: vi.fn(async () => null) } as unknown as LyricsService;
    const state = new StateStore(null, offsetStore, lyricsService, calibrationStore);

    // Correcciones de distinto signo = problemas de cada letra, no del equipo.
    await state.loadLyricsByMetadata('Uno', 'A', 0, 0);
    state.adjustSyncOffset(1_500);
    await state.loadLyricsByMetadata('Dos', 'B', 0, 0);
    state.adjustSyncOffset(-1_200);
    await state.loadLyricsByMetadata('Tres', 'C', 0, 0);
    state.adjustSyncOffset(900);

    expect(calibrationStore.current()).toBe(0);
    state.stop();
  });

  it('no aprende de ajustes pequeños (ruido de afinado fino)', async () => {
    const offsetStore = makeOffsetStore();
    const calibrationStore = makeCalibrationStore(0);
    const lyricsService = { getLyrics: vi.fn(async () => null) } as unknown as LyricsService;
    const state = new StateStore(null, offsetStore, lyricsService, calibrationStore);

    for (const [title, delta] of [['Uno', 100], ['Dos', 150], ['Tres', 100]] as const) {
      await state.loadLyricsByMetadata(title, 'A', 0, 0);
      state.adjustSyncOffset(delta);
    }
    expect(calibrationStore.current()).toBe(0);
    state.stop();
  });
});

describe('StateStore — metadata para búsqueda de letras', () => {
  it('applyMatch propaga album y duration_ms al LyricsService', async () => {
    const getLyrics = vi.fn(async () => null);
    const lyricsService = { getLyrics } as unknown as LyricsService;
    const state = new StateStore(null, undefined, lyricsService);

    await state.applyMatch({
      track: {
        provider: 'shazam',
        provider_track_id: 'x',
        title: 'Tren al Sur',
        artist: 'Los Prisioneros',
        album: 'Corazones',
        duration_ms: 312000,
      },
      confidence: 1,
      position_ms: 0,
      matched_at: Date.now(),
    });

    expect(getLyrics).toHaveBeenCalledWith({
      title: 'Tren al Sur',
      artist: 'Los Prisioneros',
      album: 'Corazones',
      durationMs: 312000,
    });
  });

  it('applyExternalTrack no relanza la búsqueda para la misma pista sin letra', async () => {
    const getLyrics = vi.fn(async () => null); // sin letra disponible
    const lyricsService = { getLyrics } as unknown as LyricsService;
    const state = new StateStore(null, undefined, lyricsService);

    const first = await state.applyExternalTrack('Sin Letra', 'Artista X', { positionMs: 0 });
    expect(first).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // SMTC repite el evento 'track' para la misma canción: no debe re-buscar.
    const second = await state.applyExternalTrack('Sin Letra', 'Artista X', { positionMs: 5000 });
    expect(second).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // Una pista DISTINTA sí dispara una búsqueda nueva.
    await state.applyExternalTrack('Otra Cancion', 'Artista X', { positionMs: 0 });
    expect(getLyrics).toHaveBeenCalledTimes(2);
  });
});

describe('StateStore — loop YouTube vs Spotify (identidad difusa de pista)', () => {
  const LYRICS = {
    lines: [
      { start_ms: 0, text: 'hola' },
      { start_ms: 3000, text: 'mundo' },
    ],
    source: 'lrclib',
    synced: true,
  };

  function makeState() {
    const getLyrics = vi.fn(async () => LYRICS);
    const forgetTrack = vi.fn(async () => {});
    const lyricsService = { getLyrics, forgetTrack } as unknown as LyricsService;
    const state = new StateStore(null, undefined, lyricsService);
    return { state, getLyrics };
  }

  it('el track "sucio" del SMTC de YouTube NO recarga la letra que cargó AudD', async () => {
    const { state, getLyrics } = makeState();
    // AudD identificó con metadata canónica y la letra quedó cargada.
    await state.loadLyricsByMetadata('Houdini', 'Dua Lipa');
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // El navegador (YouTube) reporta la MISMA canción con título de video y
    // canal como artista: antes esto disparaba loadLyricsByMetadata → la letra
    // desaparecía ("Buscando letra...") y entraba en loop con el loop de AudD.
    const changed = await state.applyExternalTrack(
      'Dua Lipa - Houdini (Official Music Video)',
      'DuaLipaVEVO',
      { positionMs: 30_000, at: Date.now() },
    );
    expect(changed).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1); // sin recarga

    // Y los eventos repetidos del navegador tampoco (vía alias cacheado).
    const again = await state.applyExternalTrack(
      'Dua Lipa - Houdini (Official Music Video)',
      'DuaLipaVEVO',
      { positionMs: 31_000, at: Date.now() },
    );
    expect(again).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);
  });

  it('applyMatch con metadata canónica NO recarga la letra cargada desde SMTC sucio', async () => {
    const { state, getLyrics } = makeState();
    // SMTC (YouTube) cargó primero, con metadata de video.
    await state.applyExternalTrack('Dua Lipa - Houdini (Official Music Video)', 'DuaLipaVEVO', {
      positionMs: 10_000,
    });
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // El loop de corrección de AudD identifica la misma canción "limpia".
    const changed = await state.applyMatch({
      track: {
        provider: 'audd',
        provider_track_id: 'x',
        title: 'Houdini',
        artist: 'Dua Lipa',
      },
      confidence: 1,
      position_ms: 12_000,
      matched_at: Date.now(),
    });
    expect(changed).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1); // corrección, no recarga
  });

  it('una sesión en pausa no roba la letra de la pista que suena', async () => {
    const { state, getLyrics } = makeState();
    await state.loadLyricsByMetadata('Houdini', 'Dua Lipa');

    // Windows parpadea a la sesión de Spotify EN PAUSA con otra canción vieja.
    const changed = await state.applyExternalTrack('Vieja Cancion', 'Otro Artista', {
      positionMs: 0,
      playing: false,
    });
    expect(changed).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // La misma canción distinta pero SONANDO sí cambia la letra.
    const playingChange = await state.applyExternalTrack('Vieja Cancion', 'Otro Artista', {
      positionMs: 0,
      playing: true,
    });
    expect(playingChange).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(2);
  });
});

describe('StateStore — arbitraje de fuentes (reconocimiento system vs SMTC)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const LYRICS = {
    lines: [
      { start_ms: 0, text: 'hola' },
      { start_ms: 3000, text: 'mundo' },
    ],
    source: 'lrclib',
    synced: true,
  };

  function makeState() {
    const getLyrics = vi.fn(async () => LYRICS);
    const forgetTrack = vi.fn(async () => {});
    const lyricsService = { getLyrics, forgetTrack } as unknown as LyricsService;
    const state = new StateStore(null, undefined, lyricsService);
    return { state, getLyrics };
  }

  it('con reconocimiento system activo, una sesión SMTC irreconocible NO recarga ni mueve la letra', async () => {
    const { state, getLyrics } = makeState();
    state.setRecognitionSource('system');
    // AudD identificó y cargó la letra.
    await state.loadLyricsByMetadata('Houdini', 'Dua Lipa', 10_000, 0);
    expect(getLyrics).toHaveBeenCalledTimes(1);
    const posBefore = state.getDisplayedPosition(0);

    // Sesión SMTC con metadata que ningún matching puede reconocer (pestaña
    // de gameplay, título de video exótico, sesión zombie del sidecar viejo).
    const changed = await state.applyExternalTrack('mi directo épico #47', 'Canal Random', {
      positionMs: 500_000,
      at: 0,
      playing: true,
    });
    expect(changed).toBe(false); // identidad bloqueada: AudD es la verdad
    expect(getLyrics).toHaveBeenCalledTimes(1); // sin recarga → sin loop

    // Sus posiciones y play/pausa quedan como NO confiables: no tiran la letra.
    state.applyExternalPosition(500_000, true, 0);
    expect(state.getDisplayedPosition(0)).toBe(posBefore);
    state.setPlaybackState(false, 0);
    expect(state.isClockPaused()).toBe(false);
  });

  it('la corroboración SMTC+AudD confirma un cambio real de canción sin histéresis', async () => {
    const { state, getLyrics } = makeState();
    state.setRecognitionSource('system');
    await state.loadLyricsByMetadata('Houdini', 'Dua Lipa', 10_000, 0);

    // El usuario cambia de video: SMTC reporta la nueva pista con metadata
    // sucia → bloqueada (aún no se confía en ella).
    await state.applyExternalTrack(
      'Artista Nuevo - Nueva Canción (Video Oficial)',
      'ArtistaNuevoVEVO',
      { positionMs: 5_000, at: 0, playing: true },
    );
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // El siguiente match de AudD trae la misma canción "limpia": dos fuentes
    // independientes coinciden → cambia YA (sin esperar 2 ciclos).
    const changed = await state.applyMatch({
      track: {
        provider: 'audd',
        provider_track_id: 'x',
        title: 'Nueva Cancion',
        artist: 'Artista Nuevo',
      },
      confidence: 1,
      position_ms: 6_000,
      matched_at: 0,
    });
    expect(changed).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(2);

    // Y la sesión SMTC vuelve a ser confiable vía alias (comparación exacta).
    const again = await state.applyExternalTrack(
      'Artista Nuevo - Nueva Canción (Video Oficial)',
      'ArtistaNuevoVEVO',
      { positionMs: 30_000, at: 0, playing: true },
    );
    expect(again).toBe(false);
    expect(getLyrics).toHaveBeenCalledTimes(2);
    expect(state.getDisplayedPosition(0)).toBe(30_000); // su posición ya aplica
  });

  it('sin reconocimiento activo, SMTC conserva el mando de la identidad', async () => {
    const { state, getLyrics } = makeState();
    // (sin setRecognitionSource: flujo pasivo puro, p. ej. Spotify sin SING)
    await state.loadLyricsByMetadata('Houdini', 'Dua Lipa', 10_000, 0);
    const changed = await state.applyExternalTrack('Otra Cosa', 'Otro Artista', {
      positionMs: 0,
      at: 0,
      playing: true,
    });
    expect(changed).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(2);
  });

  it('pide re-identificar de inmediato cuando bloquea un cambio de pista', async () => {
    const { state } = makeState();
    const resync = vi.fn();
    state.setResyncRequester(resync);
    state.setRecognitionSource('system');
    await state.loadLyricsByMetadata('Houdini', 'Dua Lipa', 10_000, 0);

    // El SO reporta otra pista: no se puede confirmar por metadata, pero es
    // señal de que algo cambió → identificar por audio YA (no esperar ~18s).
    await state.applyExternalTrack('Cancion Nueva Rara', 'Canal X', {
      positionMs: 0,
      at: Date.now(),
      playing: true,
    });
    expect(resync).toHaveBeenCalledTimes(1);

    // El mismo evento repetido no encadena capturas.
    await state.applyExternalTrack('Cancion Nueva Rara', 'Canal X', {
      positionMs: 1_000,
      at: Date.now(),
      playing: true,
    });
    expect(resync).toHaveBeenCalledTimes(1);

    // Una pista distinta dentro del throttle tampoco dispara otra.
    await state.applyExternalTrack('Otra Distinta', 'Canal Y', {
      positionMs: 0,
      at: Date.now(),
      playing: true,
    });
    expect(resync).toHaveBeenCalledTimes(1);

    // Pasado el throttle, un cambio nuevo sí vuelve a pedir resync.
    vi.setSystemTime(Date.now() + 11_000);
    await state.applyExternalTrack('Tercera Cancion', 'Canal Z', {
      positionMs: 0,
      at: Date.now(),
      playing: true,
    });
    expect(resync).toHaveBeenCalledTimes(2);
    state.stop();
  });

  it('no pide resync si SMTC coincide con la pista actual', async () => {
    const { state } = makeState();
    const resync = vi.fn();
    state.setResyncRequester(resync);
    state.setRecognitionSource('system');
    await state.loadLyricsByMetadata('Houdini', 'Dua Lipa', 10_000, 0);

    await state.applyExternalTrack('Dua Lipa - Houdini (Official Music Video)', 'DuaLipaVEVO', {
      positionMs: 12_000,
      at: Date.now(),
      playing: true,
    });
    expect(resync).not.toHaveBeenCalled();
    state.stop();
  });

  it('al parar el reconocimiento, SMTC recupera el mando', async () => {
    const { state, getLyrics } = makeState();
    state.setRecognitionSource('system');
    await state.loadLyricsByMetadata('Houdini', 'Dua Lipa', 10_000, 0);

    const blocked = await state.applyExternalTrack('Cosa Rara', 'Canal X', {
      positionMs: 0,
      at: 0,
      playing: true,
    });
    expect(blocked).toBe(false);

    state.setRecognitionSource(null); // usuario paró SING
    const allowed = await state.applyExternalTrack('Cosa Rara', 'Canal X', {
      positionMs: 0,
      at: 0,
      playing: true,
    });
    expect(allowed).toBe(true);
    expect(getLyrics).toHaveBeenCalledTimes(2);
  });
});

describe('StateStore — auto-reintento de búsqueda (sin panel de rescate)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reintenta solo tras NO_LYRICS, limpiando la caché, y para al encontrar letra', async () => {
    const LYRICS = { lines: [{ start_ms: 0, text: 'hola' }], source: 'lrclib', synced: true };
    const getLyrics = vi
      .fn()
      .mockResolvedValueOnce(null) // primer intento: sin letra
      .mockResolvedValue(LYRICS); // reintento: la encuentra
    const forgetTrack = vi.fn(async () => {});
    const lyricsService = { getLyrics, forgetTrack } as unknown as LyricsService;
    const state = new StateStore(null, undefined, lyricsService);

    await state.loadLyricsByMetadata('Cancion', 'Artista');
    expect(getLyrics).toHaveBeenCalledTimes(1);

    // El primer reintento está programado (backoff corto).
    await vi.advanceTimersByTimeAsync(4_100);
    expect(forgetTrack).toHaveBeenCalledTimes(1);
    expect(getLyrics).toHaveBeenCalledTimes(2);

    // Con letra encontrada no quedan reintentos pendientes.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getLyrics).toHaveBeenCalledTimes(2);
    state.stop();
  });

  it('acota los reintentos y no queda en loop infinito', async () => {
    const getLyrics = vi.fn(async () => null); // nunca hay letra
    const forgetTrack = vi.fn(async () => {});
    const lyricsService = { getLyrics, forgetTrack } as unknown as LyricsService;
    const state = new StateStore(null, undefined, lyricsService);

    await state.loadLyricsByMetadata('Cancion', 'Artista');
    await vi.advanceTimersByTimeAsync(300_000);
    // 1 búsqueda inicial + 2 reintentos como máximo.
    expect(getLyrics).toHaveBeenCalledTimes(3);
    state.stop();
  });

  it('cancela el reintento pendiente si cambia la pista', async () => {
    const LYRICS = { lines: [{ start_ms: 0, text: 'hola' }], source: 'lrclib', synced: true };
    const getLyrics = vi.fn(async (q: { title: string }) => (q.title === 'Otra' ? LYRICS : null));
    const forgetTrack = vi.fn(async () => {});
    const lyricsService = { getLyrics, forgetTrack } as unknown as LyricsService;
    const state = new StateStore(null, undefined, lyricsService);

    await state.loadLyricsByMetadata('Cancion', 'Artista'); // falla, programa reintento
    await state.loadLyricsByMetadata('Otra', 'Artista'); // cambia la pista
    const callsAfterChange = getLyrics.mock.calls.length;

    await vi.advanceTimersByTimeAsync(300_000);
    // El reintento de 'Cancion' no debe dispararse tras el cambio.
    expect(getLyrics.mock.calls.length).toBe(callsAfterChange);
    state.stop();
  });
});
