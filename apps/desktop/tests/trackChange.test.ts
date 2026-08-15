// Detector local de corte de pista: el hueco de silencio entre canciones y el
// cambio brusco de timbre, vistos SIN red. Es lo que permite re-identificar en
// cuanto cambia la canción en vez de esperar el ciclo de corrección.
import { describe, it, expect } from 'vitest';
import {
  BOUNDARY_GAP_MIN_MS,
  createTrackChangeState,
  DEFAULT_TRACK_CHANGE_CONFIG,
  feedTrackChangeFrame,
  normalizeProfile,
  profileDistance,
  type AudioFrame,
  type BoundaryKind,
  type TrackChangeConfig,
} from '../src/audio/trackChange';

/** Paso de muestreo del monitor real (monitor.ts). */
const STEP_MS = 50;

/** Perfil grave (bombo/bajo) vs perfil agudo: dos timbres bien distintos. */
const BASS = [1, 0.8, 0.3, 0.1, 0.05, 0.02, 0.01, 0.01];
const TREBLE = [0.05, 0.1, 0.2, 0.4, 0.8, 1, 0.9, 0.7];

function timeline(startAt = 1_000_000) {
  let at = startAt;
  const out: AudioFrame[] = [];
  const api = {
    /** Añade `durationMs` de audio con ese nivel y perfil. */
    add(durationMs: number, level: number, bands: number[] = BASS) {
      for (let t = 0; t < durationMs; t += STEP_MS) {
        out.push({ at, level, bands: [...bands] });
        at += STEP_MS;
      }
      return api;
    },
    frames: () => out,
  };
  return api;
}

function run(
  frames: AudioFrame[],
  config: TrackChangeConfig = DEFAULT_TRACK_CHANGE_CONFIG,
): Array<{ at: number; kind: BoundaryKind }> {
  let state = createTrackChangeState();
  const events: Array<{ at: number; kind: BoundaryKind }> = [];
  for (const frame of frames) {
    const result = feedTrackChangeFrame(state, frame, config);
    state = result.state;
    if (result.boundary) events.push({ at: frame.at, kind: result.boundary });
  }
  return events;
}

describe('trackChange — hueco de silencio entre pistas', () => {
  it('un silencio largo seguido de música es un corte', () => {
    const events = run(
      timeline().add(8000, 0.25).add(600, 0.002).add(3000, 0.25).frames(),
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('gap');
  });

  it('un bache corto NO es un corte (es parte de la canción)', () => {
    const events = run(
      timeline().add(8000, 0.25).add(BOUNDARY_GAP_MIN_MS - 100, 0.002).add(3000, 0.25).frames(),
    );
    expect(events).toHaveLength(0);
  });

  it('el corte se emite al volver la música, no al empezar el silencio', () => {
    const frames = timeline(1_000_000).add(8000, 0.25).add(600, 0.002).add(3000, 0.25).frames();
    const events = run(frames);
    // 8000ms de música + 600ms de silencio → primer frame audible en +8600.
    expect(events[0].at).toBe(1_008_600);
  });

  it('un nivel en la zona muerta no cancela ni duplica el corte pendiente', () => {
    // Entre silenceLevel (0.012) y resumeLevel (0.03) no se decide nada: el
    // silencio sigue contando hasta que la música vuelve de verdad.
    const events = run(
      timeline().add(8000, 0.25).add(600, 0.002).add(1000, 0.02).add(3000, 0.25).frames(),
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('gap');
  });

  it('dos huecos seguidos dentro del periodo refractario emiten uno solo', () => {
    const events = run(
      timeline()
        .add(8000, 0.25)
        .add(600, 0.002)
        .add(2000, 0.25)
        .add(600, 0.002)
        .add(2000, 0.25)
        .frames(),
    );
    expect(events).toHaveLength(1);
  });

  it('pasado el periodo refractario, un hueco nuevo sí cuenta', () => {
    const events = run(
      timeline()
        .add(8000, 0.25)
        .add(600, 0.002)
        .add(10_000, 0.25)
        .add(600, 0.002)
        .add(2000, 0.25)
        .frames(),
    );
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.kind === 'gap')).toBe(true);
  });
});

describe('trackChange — novedad espectral (cortes sin hueco)', () => {
  it('un cambio de timbre sostenido es un corte débil', () => {
    const events = run(timeline().add(10_000, 0.25, BASS).add(4000, 0.25, TREBLE).frames());
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('novelty');
  });

  it('subir el volumen NO es un cambio de canción', () => {
    // Mismo reparto de energía entre bandas, tres veces más fuerte.
    const louder = BASS.map((b) => b * 3);
    const events = run(timeline().add(10_000, 0.2, BASS).add(6000, 0.6, louder).frames());
    expect(events).toHaveLength(0);
  });

  it('un timbre distinto pero fugaz no cuenta (un solo, un coro)', () => {
    const events = run(
      timeline().add(10_000, 0.25, BASS).add(400, 0.25, TREBLE).add(4000, 0.25, BASS).frames(),
    );
    expect(events).toHaveLength(0);
  });

  it('sin calentamiento del perfil no se emite nada', () => {
    // Apenas 2s de audio antes del cambio: el perfil "de la canción en curso"
    // todavía no es una referencia creíble.
    const events = run(timeline().add(2000, 0.25, BASS).add(4000, 0.25, TREBLE).frames());
    expect(events).toHaveLength(0);
  });

  it('el silencio no arrastra el perfil (su espectro no significa nada)', () => {
    // Un hueco entre dos tramos del MISMO timbre: solo el corte por silencio.
    const events = run(
      timeline().add(10_000, 0.25, BASS).add(600, 0.002, TREBLE).add(6000, 0.25, BASS).frames(),
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('gap');
  });
});

describe('trackChange — perfiles', () => {
  it('normalizeProfile reparte a suma 1 y descarta el silencio', () => {
    const p = normalizeProfile([1, 1, 2]);
    expect(p).toEqual([0.25, 0.25, 0.5]);
    expect(normalizeProfile([0, 0, 0])).toBeNull();
  });

  it('profileDistance ignora la escala y mide el reparto', () => {
    const a = normalizeProfile(BASS)!;
    const b = normalizeProfile(BASS.map((v) => v * 7))!;
    expect(profileDistance(a, b)).toBeCloseTo(0, 6);
    expect(profileDistance(a, normalizeProfile(TREBLE)!)).toBeGreaterThan(
      DEFAULT_TRACK_CHANGE_CONFIG.noveltyDistance,
    );
  });
});
