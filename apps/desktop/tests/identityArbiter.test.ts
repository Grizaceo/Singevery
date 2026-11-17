import { describe, it, expect, vi } from 'vitest';
import { IdentityArbiter } from '../electron/core/identityArbiter';

function makeArbiter(pausedByExternal = false) {
  const releaseExternalPause = vi.fn();
  const arbiter = new IdentityArbiter({
    isPausedByExternal: () => pausedByExternal,
    releaseExternalPause,
  });
  return { arbiter, releaseExternalPause };
}

describe('IdentityArbiter — confianza en la sesión externa (MPRIS/SMTC)', () => {
  it('sin reconocimiento activo, confía en la sesión externa por defecto', () => {
    const { arbiter } = makeArbiter();
    arbiter.setRecognitionSource(null, 'Título', 'Artista');
    expect(arbiter.externalTrusted).toBe(true);
  });

  it('con reconocimiento por sistema, solo confía si el título del SO coincide con la pista mostrada', () => {
    const { arbiter } = makeArbiter();
    arbiter.lastExternalTitle = { title: 'Otra canción', artist: 'Otro artista', at: 0 };
    arbiter.setRecognitionSource('system', 'Mi canción', 'Mi artista');
    expect(arbiter.externalTrusted).toBe(false);
  });

  it('en modo micrófono, nunca confía en la sesión externa', () => {
    const { arbiter } = makeArbiter();
    arbiter.lastExternalTitle = { title: 'Mi canción', artist: 'Mi artista', at: 0 };
    arbiter.setRecognitionSource('microphone', 'Mi canción', 'Mi artista');
    expect(arbiter.externalTrusted).toBe(false);
    expect(arbiter.externalInputSuppressed).toBe(true);
  });

  it('al dejar de confiar mientras el reloj está en pausa externa, libera la pausa', () => {
    const { arbiter, releaseExternalPause } = makeArbiter(true);
    arbiter.lastExternalTitle = { title: 'Otra canción', artist: 'Otro artista', at: 0 };
    arbiter.setRecognitionSource('system', 'Mi canción', 'Mi artista');
    expect(releaseExternalPause).toHaveBeenCalledTimes(1);
  });
});

describe('IdentityArbiter — osStillConfirmsCurrentTrack', () => {
  it('false sin título externo registrado', () => {
    const { arbiter } = makeArbiter();
    expect(arbiter.osStillConfirmsCurrentTrack('Mi canción', 'Mi artista', 1000)).toBe(false);
  });

  it('true cuando el título externo reciente coincide (difuso) con la pista mostrada', () => {
    const { arbiter } = makeArbiter();
    arbiter.lastExternalTitle = { title: 'Mi Artista - Mi Canción (Official Video)', artist: 'MiArtistaVEVO', at: 1000 };
    expect(arbiter.osStillConfirmsCurrentTrack('Mi Canción', 'Mi Artista', 1500)).toBe(true);
  });

  it('false si la sesión ya no está viva (pasó EXTERNAL_LIVENESS_MS)', () => {
    const { arbiter } = makeArbiter();
    arbiter.lastExternalTitle = { title: 'Mi Canción', artist: 'Mi Artista', at: 0 };
    expect(arbiter.osStillConfirmsCurrentTrack('Mi Canción', 'Mi Artista', 30_000)).toBe(false);
  });

  it('false con entrada externa suprimida (modo micrófono)', () => {
    const { arbiter } = makeArbiter();
    arbiter.lastExternalTitle = { title: 'Mi Canción', artist: 'Mi Artista', at: 1000 };
    arbiter.setRecognitionSource('microphone', 'Mi Canción', 'Mi Artista');
    expect(arbiter.osStillConfirmsCurrentTrack('Mi Canción', 'Mi Artista', 1500)).toBe(false);
  });
});

describe('IdentityArbiter — confirmTrackChange (histéresis)', () => {
  it('confirma de inmediato si no hay letra mostrándose', () => {
    const { arbiter } = makeArbiter();
    expect(arbiter.confirmTrackChange('clave-nueva', false, undefined, undefined)).toBe(true);
  });

  it('confirma de inmediato si la pista actual es provisional', () => {
    const { arbiter } = makeArbiter();
    arbiter.currentTrackProvisional = true;
    expect(arbiter.confirmTrackChange('clave-nueva', true, 'Actual', 'Artista')).toBe(true);
  });

  it('requiere CHANGE_CONFIRM_COUNT (2) hits cuando el SO no confirma la pista actual', () => {
    const { arbiter } = makeArbiter();
    expect(arbiter.confirmTrackChange('otra', true, 'Actual', 'Artista')).toBe(false);
    expect(arbiter.wrongSong?.consecutiveHits).toBe(1);
    expect(arbiter.confirmTrackChange('otra', true, 'Actual', 'Artista')).toBe(true);
    expect(arbiter.wrongSong).toBeNull();
  });

  it('exige WRONG_SONG_STRIKE_LIMIT (5) hits cuando el SO sigue confirmando la pista actual', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    try {
      const { arbiter } = makeArbiter();
      arbiter.lastExternalTitle = { title: 'Actual', artist: 'Artista', at: 1000 };
      arbiter.lastExternalActivityAt = 1000;
      for (let i = 0; i < 4; i++) {
        expect(arbiter.confirmTrackChange('otra', true, 'Actual', 'Artista')).toBe(false);
      }
      expect(arbiter.confirmTrackChange('otra', true, 'Actual', 'Artista')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('una pista distinta reinicia la racha', () => {
    const { arbiter } = makeArbiter();
    arbiter.confirmTrackChange('a', true, 'Actual', 'Artista');
    expect(arbiter.wrongSong?.songIdentified).toBe('a');
    arbiter.confirmTrackChange('b', true, 'Actual', 'Artista');
    expect(arbiter.wrongSong?.songIdentified).toBe('b');
    expect(arbiter.wrongSong?.consecutiveHits).toBe(1);
  });
});

describe('IdentityArbiter — desacuerdo reciente de conjeturas position_ms=0 (DE09)', () => {
  // Secuencia real: Shazam devolvió "Zenzenzense" y 7 s después "Be a flower",
  // ambos position_ms=0. Con identidad provisional, la segunda confirmaba al
  // instante y la app cambiaba de canción cada pocos segundos.
  it('una segunda conjetura position_ms=0 distinta NO se confirma aunque sea provisional', () => {
    vi.useFakeTimers();
    try {
      const { arbiter } = makeArbiter();
      arbiter.currentTrackProvisional = true;

      // Primer match: sin candidato previo no hay desacuerdo → provisional.
      vi.setSystemTime(1_000_000);
      expect(
        arbiter.confirmTrackChange('radwimps::zenzenzense', true, 'Actual', 'Artista', 0, 'pista::actual'),
      ).toBe(true);
      expect(arbiter.lastDecisionReason).toBe('provisional');

      // 7 s después, OTRA clave también con position_ms=0: la anterior no es
      // la pista actual en este arbitraje (sigue siendo el hint del SO) →
      // desacuerdo: exige la misma clave dos veces.
      vi.setSystemTime(1_007_000);
      expect(
        arbiter.confirmTrackChange('ryokuoushoku::be a flower', true, 'Actual', 'Artista', 0, 'pista::actual'),
      ).toBe(false);
      expect(arbiter.lastDecisionReason).toBe('desacuerdo-reciente');
      expect(arbiter.wrongSong?.songIdentified).toBe('ryokuoushoku::be a flower');
      expect(arbiter.wrongSong?.consecutiveHits).toBe(1);

      // La misma clave repetida confirma: el candidato previo ya coincide con
      // el match (no hay desacuerdo) y el atajo provisional vuelve a aplicar.
      // Neto: la clave nueva necesitó 2 coincidencias seguidas, como pide la
      // histéresis — sin el bloqueo se habría confirmado a la primera.
      expect(
        arbiter.confirmTrackChange('ryokuoushoku::be a flower', true, 'Actual', 'Artista', 0, 'pista::actual'),
      ).toBe(true);
      expect(arbiter.lastDecisionReason).toBe('provisional');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sin letra mostrándose (arranque en frío) el desacuerdo no bloquea', () => {
    vi.useFakeTimers();
    try {
      const { arbiter } = makeArbiter();
      arbiter.currentTrackProvisional = true;
      vi.setSystemTime(1_000_000);
      arbiter.confirmTrackChange('a::uno', true, 'Actual', 'Artista', 0, 'pista::actual');
      vi.setSystemTime(1_007_000);
      // hasLyrics=false → identificación inicial: cambio inmediato.
      expect(
        arbiter.confirmTrackChange('b::dos', false, 'Actual', 'Artista', 0, 'pista::actual'),
      ).toBe(true);
      expect(arbiter.lastDecisionReason).toBe('sin-letra');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pasada la ventana de 20 s el desacuerdo ya no aplica', () => {
    vi.useFakeTimers();
    try {
      const { arbiter } = makeArbiter();
      arbiter.currentTrackProvisional = true;
      vi.setSystemTime(1_000_000);
      arbiter.confirmTrackChange('a::uno', true, 'Actual', 'Artista', 0, 'pista::actual');
      vi.setSystemTime(1_025_000); // 25 s después
      // El candidato previo ya es viejo: provisional confirma al instante.
      expect(
        arbiter.confirmTrackChange('b::dos', true, 'Actual', 'Artista', 0, 'pista::actual'),
      ).toBe(true);
      expect(arbiter.lastDecisionReason).toBe('provisional');
    } finally {
      vi.useRealTimers();
    }
  });

  it('con position_ms>0 no hay desacuerdo: el atajo provisional sigue valiendo', () => {
    vi.useFakeTimers();
    try {
      const { arbiter } = makeArbiter();
      arbiter.currentTrackProvisional = true;
      vi.setSystemTime(1_000_000);
      arbiter.confirmTrackChange('a::uno', true, 'Actual', 'Artista', 0, 'pista::actual');
      vi.setSystemTime(1_007_000);
      expect(
        arbiter.confirmTrackChange('b::dos', true, 'Actual', 'Artista', 42_000, 'pista::actual'),
      ).toBe(true);
      expect(arbiter.lastDecisionReason).toBe('provisional');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('IdentityArbiter — cortes de audio (noteAudioBoundary / boundaryCorroborates)', () => {
  it('solo un hueco (gap) reciente y sin confirmación del SO corrobora', () => {
    const { arbiter } = makeArbiter();
    arbiter.noteAudioBoundary('gap', 1000);
    expect(arbiter.boundaryCorroborates(1500, 'Mi Canción', 'Mi Artista')).toBe(true);
  });

  it('novelty no corrobora (señal débil)', () => {
    const { arbiter } = makeArbiter();
    arbiter.noteAudioBoundary('novelty', 1000);
    expect(arbiter.boundaryCorroborates(1500, 'Mi Canción', 'Mi Artista')).toBe(false);
  });

  it('un gap viejo (fuera del TTL) no corrobora', () => {
    const { arbiter } = makeArbiter();
    arbiter.noteAudioBoundary('gap', 0);
    expect(arbiter.boundaryCorroborates(60_000, 'Mi Canción', 'Mi Artista')).toBe(false);
  });

  it('si el SO sigue confirmando la pista actual, el gap no corrobora un cambio', () => {
    const { arbiter } = makeArbiter();
    arbiter.lastExternalTitle = { title: 'Mi Canción', artist: 'Mi Artista', at: 900 };
    arbiter.noteAudioBoundary('gap', 1000);
    expect(arbiter.boundaryCorroborates(1500, 'Mi Canción', 'Mi Artista')).toBe(false);
  });
});

describe('IdentityArbiter — isChangeSuspected', () => {
  it('true solo mientras hay una racha de wrongSong en curso', () => {
    const { arbiter } = makeArbiter();
    expect(arbiter.isChangeSuspected()).toBe(false);
    arbiter.confirmTrackChange('otra', true, 'Actual', 'Artista');
    expect(arbiter.isChangeSuspected()).toBe(true);
    arbiter.confirmTrackChange('otra', true, 'Actual', 'Artista');
    expect(arbiter.isChangeSuspected()).toBe(false);
  });
});

describe('IdentityArbiter — maybeRequestResyncOnMiss', () => {
  const badCorrelation = { confidence: 0, peak: 0, runnerUp: 0, offsetMs: 0 };

  it('no pide resync si no hay requestResync (null)', () => {
    const { arbiter } = makeArbiter();
    expect(() => arbiter.maybeRequestResyncOnMiss(badCorrelation, 1000, true, null)).not.toThrow();
    expect(arbiter.mismatchResyncs).toBe(0);
  });

  it('no pide resync sin letra mostrándose', () => {
    const { arbiter } = makeArbiter();
    const requestResync = vi.fn();
    arbiter.maybeRequestResyncOnMiss(badCorrelation, 1000, false, requestResync);
    expect(requestResync).not.toHaveBeenCalled();
  });

  it('pide resync ante una desalineación estructural (confianza y pico bajos)', () => {
    const { arbiter } = makeArbiter();
    const requestResync = vi.fn();
    arbiter.maybeRequestResyncOnMiss(badCorrelation, 1000, true, requestResync);
    expect(requestResync).toHaveBeenCalledWith(1000);
    expect(arbiter.mismatchResyncs).toBe(1);
  });

  it('deja de pedir tras MISMATCH_RESYNC_LIMIT (2) intentos para la misma pista', () => {
    const { arbiter } = makeArbiter();
    const requestResync = vi.fn();
    arbiter.maybeRequestResyncOnMiss(badCorrelation, 1000, true, requestResync);
    arbiter.maybeRequestResyncOnMiss(badCorrelation, 2000, true, requestResync);
    expect(requestResync).toHaveBeenCalledTimes(2);
    arbiter.maybeRequestResyncOnMiss(badCorrelation, 3000, true, requestResync);
    expect(requestResync).toHaveBeenCalledTimes(2);
  });

  it('no pide resync si la correlación no es estructuralmente distinta', () => {
    const { arbiter } = makeArbiter();
    const requestResync = vi.fn();
    arbiter.maybeRequestResyncOnMiss({ confidence: 0.9, peak: 0.9, runnerUp: 0.1, offsetMs: 50 }, 1000, true, requestResync);
    expect(requestResync).not.toHaveBeenCalled();
  });
});
