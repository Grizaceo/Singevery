// Defensas contra la posición que reporta el reproductor del SO.
//
// La Position de SMTC es un snapshot que el sidecar proyecta a "ahora". Con un
// navegador (que solo la refresca en play/pausa/seek) esa proyección puede
// sumar tiempo que el vídeo no reprodujo, o venir del timeline de la canción
// anterior. Aceptarla tal cual disparaba un salto duro hacia adelante: la letra
// corría más rápido de lo debido, sobre todo justo tras cambiar de canción.
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

import { StateStore } from '../electron/core/stateStore';
import type { LyricsService } from '../electron/services/lyrics/lyricsService';
import type { TimedLyrics } from '../src/types';

const LYRICS: TimedLyrics = {
  lines: [
    { start_ms: 0, text: 'uno' },
    { start_ms: 60_000, text: 'dos' },
  ],
  source: 'lrclib',
  synced: true,
};

function makeState() {
  const lyricsService = {
    getLyrics: vi.fn(async () => LYRICS),
    describeCachedTrack: () => null,
    getProviderNames: () => ['lrclib'],
  } as unknown as LyricsService;
  return new StateStore(null, undefined, lyricsService);
}

/** Pista de 3 minutos ya cargada y sonando. */
async function playingTrack(durationMs: number | null = 180_000) {
  const state = makeState();
  await state.loadLyricsByMetadata('Cancion', 'Artista', 0, Date.now(), null, durationMs);
  return state;
}

describe('StateStore — posiciones externas imposibles', () => {
  it('descarta una posición más allá del final de la pista', async () => {
    const state = await playingTrack(180_000);
    const at = Date.now();
    const before = state.getDisplayedPosition(at);

    // Proyección desbocada del sidecar: 5 minutos en una canción de 3.
    state.applyExternalPosition(300_000, true, at);

    expect(state.getDisplayedPosition(at)).toBeCloseTo(before, -2);
  });

  it('acepta una posición dentro de la pista', async () => {
    const state = await playingTrack(180_000);
    const at = Date.now();

    state.applyExternalPosition(90_000, true, at);

    expect(state.getDisplayedPosition(at)).toBeGreaterThan(80_000);
  });

  it('tolera que la duración del SO y la del reconocedor difieran unos segundos', async () => {
    const state = await playingTrack(180_000);
    const at = Date.now();

    // 2s pasado el final declarado: dentro de la holgura, se acepta.
    state.applyExternalPosition(182_000, true, at);

    expect(state.getDisplayedPosition(at)).toBeGreaterThan(170_000);
  });

  it('sin duración conocida no se filtra nada (no se puede saber)', async () => {
    const state = await playingTrack(null);
    const at = Date.now();

    state.applyExternalPosition(300_000, true, at);

    expect(state.getDisplayedPosition(at)).toBeGreaterThan(290_000);
  });

  it('un evento sin duración no borra la que ya se conocía', async () => {
    const state = await playingTrack(180_000);
    // El sidecar omite la duración mientras su timeline sigue siendo el viejo.
    await state.applyExternalTrack('Cancion', 'Artista', { durationMs: null, positionMs: 1_000 });

    const at = Date.now();
    const before = state.getDisplayedPosition(at);
    state.applyExternalPosition(300_000, true, at);
    expect(state.getDisplayedPosition(at)).toBeCloseTo(before, -2);
  });
});

describe('StateStore — quién pausó manda sobre quién reanuda', () => {
  it('el silencio NO levanta una pausa del reproductor', async () => {
    const state = await playingTrack();
    state.setPlaybackState(false); // el usuario pausó el vídeo
    expect(state.isClockPaused()).toBe(true);

    // En modo "audio del sistema" el loopback capta TODO: una notificación,
    // otra pestaña, un anuncio. Nada de eso significa que el vídeo siga.
    state.reportAudioLevel(0.5);
    expect(state.isClockPaused()).toBe(true);
  });

  it('el reproductor sí levanta su propia pausa', async () => {
    const state = await playingTrack();
    state.setPlaybackState(false);
    expect(state.isClockPaused()).toBe(true);

    state.setPlaybackState(true);
    expect(state.isClockPaused()).toBe(false);
  });

  it('la pausa por silencio se levanta con la señal (fallback sin reproductor)', async () => {
    const state = await playingTrack();
    const t0 = Date.now();
    state.reportAudioLevel(0, t0);
    state.reportAudioLevel(0, t0 + 500); // silencio sostenido → congela
    expect(state.isClockPaused()).toBe(true);

    state.reportAudioLevel(0.5, t0 + 1_000);
    expect(state.isClockPaused()).toBe(false);
  });

  it('si el reproductor confirma una pausa que empezó por silencio, pasa a mandar él', async () => {
    const state = await playingTrack();
    const t0 = Date.now();
    state.reportAudioLevel(0, t0);
    state.reportAudioLevel(0, t0 + 500);
    expect(state.isClockPaused()).toBe(true);

    state.setPlaybackState(false, t0 + 600); // el SO confirma: está en pausa
    // Ahora un ruido cualquiera ya no la levanta.
    state.reportAudioLevel(0.5, t0 + 1_000);
    expect(state.isClockPaused()).toBe(true);
  });

  it('cargar una pista nueva limpia la pausa venga de donde venga', async () => {
    const state = await playingTrack();
    state.setPlaybackState(false);
    expect(state.isClockPaused()).toBe(true);

    await state.loadLyricsByMetadata('Otra', 'Artista', 0, Date.now(), null, 200_000);
    expect(state.isClockPaused()).toBe(false);
  });
});
