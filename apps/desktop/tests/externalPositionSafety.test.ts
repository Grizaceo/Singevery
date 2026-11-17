// Seguridad de posiciones externas (SMTC/MPRIS): la posición del reproductor
// del SO es la verdad, pero una fuente rota puede alternar valores imposibles
// (0,1000,0,1000…) y cada uno disparaba un snap → la letra saltaba sin parar.
// La cuarentena de StateStore exige confirmación por muestras coherentes
// consecutivas antes de aplicar retrocesos grandes o saltos adelante.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

import { StateStore } from '../electron/core/stateStore';
import type { LyricsService } from '../electron/services/lyrics/lyricsService';
import type { TimedLyrics, TrackMatch } from '../src/types';

const LYRICS: TimedLyrics = {
  lines: [
    { start_ms: 0, text: 'uno' },
    { start_ms: 60_000, text: 'dos' },
  ],
  source: 'lrclib',
  synced: true,
};

function makeState() {
  const getLyrics = vi.fn(async () => LYRICS);
  const lyricsService = { getLyrics } as unknown as LyricsService;
  return { state: new StateStore(null, undefined, lyricsService), getLyrics };
}

function match(title: string, artist: string): TrackMatch {
  return {
    track: { provider: 'shazam', provider_track_id: title, title, artist },
    confidence: 1,
    position_ms: 10_000,
    matched_at: 0,
  };
}

describe('StateStore — cuarentena de posiciones externas', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('una fuente que alterna 0/1000 no mueve la letra (caso real del log)', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const s = new StateStore(null);
    s.nudgePosition(95_000); // la canción va en 95 s
    s.resumeAutoSync(); // nudge activa el hold manual: soltarlo para probar la cuarentena
    // Primera posición externa: establece la línea base (~95 s).
    s.applyExternalPosition(95_000, true, 0);

    // Posiciones imposibles cada 1 s mientras "suena": 0,1000,0,1000,0.
    const seq = [0, 1_000, 0, 1_000, 0];
    seq.forEach((pos, i) => s.applyExternalPosition(pos, true, (i + 1) * 1_000));

    // La letra siguió su reloj: ~95 s + elapsed, sin ningún snap.
    expect(s.getDisplayedPosition(5_000)).toBeCloseTo(100_000, -2);
    // Y la fuente fue diagnosticada como retroceso sin confirmar.
    const logs = log.mock.calls.flat().join('\n');
    expect(logs).toContain('posición descartada (retroceso sin confirmar)');
  });

  it('un seek real hacia atrás se aplica tras 2 posiciones coherentes', () => {
    const s = new StateStore(null);
    s.nudgePosition(30_000);
    s.resumeAutoSync(); // libera el hold manual del nudge
    s.applyExternalPosition(30_000, true, 0); // línea base

    s.applyExternalPosition(5_000, true, 1_000); // retroceso → cuarentena
    expect(s.getDisplayedPosition(1_000)).toBeCloseTo(31_000, -2); // aún no se mueve
    s.applyExternalPosition(6_000, true, 2_000); // coherente → 1/2
    expect(s.getDisplayedPosition(2_000)).toBeCloseTo(32_000, -2); // sigue sin moverse
    s.applyExternalPosition(7_000, true, 3_000); // coherente → 2/2: seek real
    expect(s.getDisplayedPosition(3_000)).toBeCloseTo(7_000, -2);
  });

  it('un seek real hacia adelante se aplica tras 1 posición coherente', () => {
    const s = new StateStore(null);
    s.nudgePosition(30_000);
    s.resumeAutoSync(); // libera el hold manual del nudge
    s.applyExternalPosition(30_000, true, 0);

    s.applyExternalPosition(90_000, true, 1_000); // salto > DRIFT_SNAP_MS → cuarentena
    expect(s.getDisplayedPosition(1_000)).toBeCloseTo(31_000, -2);
    s.applyExternalPosition(91_000, true, 2_000); // coherente con la pendiente → aplica
    expect(s.getDisplayedPosition(2_000)).toBeCloseTo(91_000, -2);
  });

  it('una posición incoherente descarta la pendiente y la letra se recupera', () => {
    const s = new StateStore(null);
    s.nudgePosition(30_000);
    s.resumeAutoSync(); // libera el hold manual del nudge
    s.applyExternalPosition(30_000, true, 0);

    s.applyExternalPosition(5_000, true, 1_000); // retroceso → cuarentena
    // Vuelve a la posición real: incoherente con la pendiente → se descarta
    // y esta muestra se aplica por la vía normal (retroceso leve → rampa).
    s.applyExternalPosition(30_500, true, 2_000);
    const pos = s.getDisplayedPosition(2_000);
    expect(pos).toBeGreaterThan(25_000);
    expect(pos).toBeLessThan(35_000);
  });

  it('justo tras un evento de pista nuevo se acepta la primera posición tal cual', async () => {
    const { state } = makeState();
    await state.loadLyricsByMetadata('Primera', 'Artista', 60_000, 0);
    state.applyExternalPosition(60_000, true, 100); // línea base de la pista A

    // Evento de pista nuevo del SO: la pista B arranca reportando 30 s.
    const changed = await state.applyExternalTrack('Segunda', 'Artista2', {
      positionMs: 30_000,
      at: 200,
      source: 'mpris:spotify',
    });
    expect(changed).toBe(true);

    // Dentro de la gracia de arranque (≤3 s), una posición que sería un
    // retroceso enorme NO entra en cuarentena: se acepta tal cual (el
    // reproductor está reportando el inicio real de la pista nueva).
    state.applyExternalPosition(0, true, 400);
    expect(state.getDisplayedPosition(400)).toBeLessThan(2_000);
  });

  it('pasada la gracia de arranque, el retroceso vuelve a cuarentena', async () => {
    const { state } = makeState();
    await state.applyExternalTrack('Primera', 'Artista', { positionMs: 30_000, at: 0 });

    // Fuera de la ventana de 3 s: el mismo retroceso sí se pone en cuarentena.
    state.applyExternalPosition(0, true, 4_000);
    expect(state.getDisplayedPosition(4_000)).toBeGreaterThan(20_000);
  });
});

describe('StateStore — observabilidad de eventos externos e identidad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const pistaExternaLogs = (log: ReturnType<typeof vi.spyOn>): string[] =>
    log.mock.calls
      .flat()
      .map(String)
      .filter((l) => l.includes('[smtc] pista externa'));

  it('log [smtc] pista externa solo cuando cambia la clave, con fuente y decisión', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { state } = makeState();

    await state.applyExternalTrack('Cancion Uno', 'Artista', { at: 0 });
    await state.applyExternalTrack('Cancion Uno', 'Artista', { at: 1_000 }); // mismo evento: no repite
    await state.applyExternalTrack('Cancion Dos', 'Otro', { at: 2_000, source: 'mpris:spotify' });

    const lines = pistaExternaLogs(log);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('title="Cancion Uno"');
    expect(lines[0]).toContain('decisión=nueva');
    expect(lines[1]).toContain('fuente=mpris:spotify');
    expect(lines[1]).toContain('decisión=nueva');
  });

  it('registra la decisión "coincide" cuando el evento es la pista en curso', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { state } = makeState();
    await state.loadLyricsByMetadata('Cancion Uno', 'Artista', 0, 0);

    await state.applyExternalTrack('Cancion Uno', 'Artista', { at: 100 });

    const lines = pistaExternaLogs(log);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('decisión=coincide');
    expect(lines[0]).toContain('fuente=smtc');
  });

  it('log [identidad] cambio a "<key>" motivo=histéresis al confirmar por reconocimiento', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { state } = makeState();
    await state.loadLyricsByMetadata('Pina Colada', 'Rupert Holmes', 0, 0);

    // Primera identificación distinta: histéresis, aún no cambia.
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(false);
    // Segunda consecutiva: confirma → debe loguear el motivo.
    expect(await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'))).toBe(true);

    const logs = log.mock.calls.flat().join('\n');
    expect(logs).toContain('[identidad] cambio a "los prisioneros::tren al sur" motivo=histéresis');
  });

  it('log [identidad] motivo=sin-letra cuando no hay letra que proteger', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const getLyrics = vi.fn(async () => null);
    const state = new StateStore(null, undefined, { getLyrics } as unknown as LyricsService);

    await state.applyMatch(match('Tren al Sur', 'Los Prisioneros'));

    const logs = log.mock.calls.flat().join('\n');
    expect(logs).toContain('motivo=sin-letra');
  });

  it('los ajustes manuales quedan en log [manual]', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { state } = makeState();
    await state.loadLyricsByMetadata('Cancion', 'Artista', 10_000, 0);

    state.nudgePosition(500);
    state.adjustSyncOffset(100);
    state.adjustCalibrationOffset(50);
    state.seekToLine(1);
    state.applyOffsetToAllTracks();

    const logs = log.mock.calls.flat().join('\n');
    expect(logs).toContain('[manual] nudge delta=500ms');
    expect(logs).toContain('[manual] sync-offset delta=100ms');
    expect(logs).toContain('[manual] calibration delta=50ms');
    expect(logs).toContain('[manual] seek-line direction=1');
    expect(logs).toContain('[manual] offset-a-todas');
  });
});
