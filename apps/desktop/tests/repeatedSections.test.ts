// Secciones repetidas en la cuarentena de snaps: una letra con estribillo
// cada ~72,8 s (caso real "Crack a Bottle") hace que anclas "coherentes"
// desplazadas un período parezcan seeks. Regla: error >20 s o error que cae
// en un período de repetición (o su doble) exige 3 anclas coherentes.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

import { StateStore } from '../electron/core/stateStore';
import { repeatPeriodsMs } from '../electron/core/syncTiming';
import type { LyricsService } from '../electron/services/lyrics/lyricsService';
import type { TimedLyrics, TrackMatch } from '../src/types';

const PERIOD = 72_800;

// Letra sintética: dos líneas de estribillo repetidas 3 veces, separadas
// exactamente PERIOD ms → repeatPeriodsMs debe detectar [72800].
const LYRICS: TimedLyrics = {
  synced: true,
  source: 'test',
  lines: [
    { start_ms: 0, text: 'verso inicial de la cancion' },
    { start_ms: 10_000, text: 'estribillo uno dos tres' },
    { start_ms: 20_000, text: 'estribillo dos tres cuatro' },
    { start_ms: 82_800, text: 'estribillo uno dos tres' },
    { start_ms: 92_800, text: 'estribillo dos tres cuatro' },
    { start_ms: 155_600, text: 'estribillo uno dos tres' },
    { start_ms: 165_600, text: 'estribillo dos tres cuatro' },
  ],
};

function makeState() {
  const getLyrics = vi.fn(async () => LYRICS);
  const lyricsService = {
    getLyrics,
    describeCachedTrack: () => null,
    getProviderNames: () => ['test'],
  } as unknown as LyricsService;
  const state = new StateStore(null, undefined, lyricsService);
  return { state, getLyrics };
}

function match(title: string, artist: string, positionMs: number, at: number): TrackMatch {
  return {
    track: { provider: 'shazam', provider_track_id: title, title, artist },
    confidence: 1,
    position_ms: positionMs,
    matched_at: at,
    sample_offset_ms: 0,
  };
}

const TITLE = 'Crack a Bottle';
const ARTIST = 'Artist';

/** Carga la letra con el reloj anclado en 100 000 ms @ T0 (reloj de pared). */
async function loadAt(state: StateStore, t0: number): Promise<void> {
  await state.loadLyricsByMetadata(TITLE, ARTIST, 100_000, t0);
}

/** position_ms que produce un error `errorMs` respecto a la letra mostrada. */
function posFor(state: StateStore, at: number, errorMs: number, t0: number): number {
  // displayed(at) = 100000 + (at - t0); el match con matched_at=at proyecta
  // position_ms tal cual (sin recordStartedAt ni calibración extra).
  return Math.round(100_000 + (at - t0) + state.getSyncOffsetMs() + errorMs);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('repeatPeriodsMs (función pura)', () => {
  it('detecta el período del estribillo repetido', () => {
    expect(repeatPeriodsMs(LYRICS.lines)).toEqual([PERIOD]);
  });

  it('devuelve [] sin repeticiones o con textos demasiado cortos', () => {
    expect(repeatPeriodsMs([{ text: 'hola', start_ms: 0 }, { text: 'chau', start_ms: 5000 }])).toEqual([]);
    expect(
      repeatPeriodsMs([
        { text: 'linea unica del verso', start_ms: 0 },
        { text: 'otra linea distinta', start_ms: 5000 },
      ]),
    ).toEqual([]);
  });

  it('ignora puntuación y mayúsculas al comparar textos', () => {
    const lines = [
      { text: '¡EStribillo, UNO dos tres!', start_ms: 10_000 },
      { text: 'estribillo uno dos tres', start_ms: 82_800 },
      { text: 'estribillo   uno   dos   tres', start_ms: 155_600 },
      { text: 'estribillo dos tres cuatro', start_ms: 20_000 },
      { text: 'estribillo dos tres cuatro', start_ms: 92_800 },
    ];
    expect(repeatPeriodsMs(lines)).toEqual([PERIOD]);
  });
});

describe('StateStore — cuarentena de snaps con secciones repetidas', () => {
  it('UNA ancla atípica a +72 800 ms no mueve el reloj', async () => {
    vi.useFakeTimers();
    const t0 = 1_000_000;
    vi.setSystemTime(t0);
    const { state } = makeState();
    await loadAt(state, t0);

    // Ritmo constante: anclas cada ~18 s sin error (se descartan por deadband
    // y limpian cualquier pendiente).
    for (const at of [t0, t0 + 18_000, t0 + 36_000]) {
      vi.setSystemTime(at);
      await state.applyMatch(match(TITLE, ARTIST, posFor(state, at, 0, t0), at));
    }

    // Una atípica: error +72 800 = exactamente el período del estribillo.
    const atBad = t0 + 54_000;
    vi.setSystemTime(atBad);
    const before = state.getDisplayedPosition();
    await state.applyMatch(match(TITLE, ARTIST, posFor(state, atBad, PERIOD, t0), atBad));
    // Quedó en cuarentena: la posición mostrada sigue la del reloj de pared.
    expect(state.getDisplayedPosition()).toBe(before);

    // La siguiente ancla normal (vuelve a la línea temporal) descarta la pendiente.
    const atOk = t0 + 72_000;
    vi.setSystemTime(atOk);
    await state.applyMatch(match(TITLE, ARTIST, posFor(state, atOk, 0, t0), atOk));
    const expectedWall = 100_000 + (atOk - t0);
    expect(Math.round(state.getDisplayedPosition())).toBe(expectedWall);
  });

  it('DOS anclas consecutivas a +145 600 ms (el doble del período) no mueven el reloj', async () => {
    vi.useFakeTimers();
    const t0 = 1_000_000;
    vi.setSystemTime(t0);
    const { state } = makeState();
    await loadAt(state, t0);

    const doble = 2 * PERIOD;
    const ats = [t0 + 18_000, t0 + 36_000];
    for (const at of ats) {
      vi.setSystemTime(at);
      await state.applyMatch(match(TITLE, ARTIST, posFor(state, at, doble, t0), at));
    }

    // La segunda fue coherente con la pendiente pero el snap es sospechoso
    // (2× período): faltan anclas. El reloj no se movió.
    const wallNow = 100_000 + (ats[1] - t0);
    expect(Math.round(state.getDisplayedPosition())).toBe(wallNow);
  });

  it('TRES anclas coherentes a +30 000 ms (seek real) sí mueven el reloj', async () => {
    vi.useFakeTimers();
    const t0 = 1_000_000;
    vi.setSystemTime(t0);
    const { state } = makeState();
    await loadAt(state, t0);

    // Error >20 s → snap sospechoso: hacen falta 3 anclas coherentes.
    const ats = [t0 + 18_000, t0 + 36_000, t0 + 54_000];
    for (const at of ats) {
      vi.setSystemTime(at);
      await state.applyMatch(match(TITLE, ARTIST, posFor(state, at, 30_000, t0), at));
    }

    // La tercera confirmó el seek: la letra saltó ~+30 s respecto al reloj.
    const displayed = Math.round(state.getDisplayedPosition());
    const wallNow = 100_000 + (ats[2] - t0);
    expect(displayed).toBeGreaterThan(wallNow + 20_000);
    expect(displayed).toBeLessThan(wallNow + 40_000);
  });
});
