// Versiones distintas de la misma canción (extendida, remix, en vivo).
//
// Una letra SINCRONIZADA de otra versión es peor que una plana de la correcta:
// se muestra con timestamps de otra grabación y corre desfasada toda la
// canción, sin que nada lo detecte después (el reloj solo sabe ajustar la
// POSICIÓN, no cuestionar la letra). Antes ganaba igual, porque el bonus de
// "sincronizada" (+1000) aplastaba la penalización por duración.
import { describe, it, expect } from 'vitest';
import { pickBest, isOtherVersion, stripLrcTimestamps, VERSION_MISMATCH_S } from '../electron/services/lyrics/providers/lrclib';
import type { LyricsQuery } from '../electron/services/lyrics/types';

const QUERY: LyricsQuery = {
  title: 'Cancion',
  artist: 'Artista',
  album: null,
  durationMs: 210_000, // 3:30
};

const SYNCED_LRC = '[00:10.00]primera linea\n[00:20.00]segunda linea';

function entry(over: Partial<Record<string, unknown>> = {}) {
  return {
    trackName: 'Cancion',
    artistName: 'Artista',
    duration: 210,
    syncedLyrics: SYNCED_LRC,
    plainLyrics: 'primera linea\nsegunda linea',
    instrumental: false,
    ...over,
  };
}

describe('isOtherVersion', () => {
  it('un remaster o un fade distinto NO es otra versión', () => {
    expect(isOtherVersion(212, 210_000)).toBe(false);
    expect(isOtherVersion(204, 210_000)).toBe(false);
  });

  it('una extendida sí lo es', () => {
    expect(isOtherVersion(420, 210_000)).toBe(true);
  });

  it('sin alguna de las dos duraciones no se puede afirmar', () => {
    expect(isOtherVersion(null, 210_000)).toBe(false);
    expect(isOtherVersion(420, null)).toBe(false);
  });

  it('el umbral es el declarado', () => {
    expect(isOtherVersion(210 + VERSION_MISMATCH_S - 1, 210_000)).toBe(false);
    expect(isOtherVersion(210 + VERSION_MISMATCH_S + 1, 210_000)).toBe(true);
  });
});

describe('pickBest — la duración decide si los timestamps sirven', () => {
  it('la duración correcta se sirve sincronizada', () => {
    const raw = pickBest([entry()], QUERY);
    expect(raw?.synced).toBe(true);
    expect(raw?.lrc).toBe(SYNCED_LRC);
  });

  it('una versión de otra duración se sirve PLANA, no sincronizada', () => {
    // Único candidato: la letra sirve (es la canción), sus tiempos no.
    const raw = pickBest([entry({ duration: 420 })], QUERY);
    expect(raw?.synced).toBe(false);
    expect(raw?.plain).toContain('primera linea');
    expect(raw?.lrc).toBeUndefined();
  });

  it('la plana de la duración correcta gana a la sincronizada de otra versión', () => {
    const raw = pickBest(
      [
        entry({ duration: 420 }), // extendida, sincronizada
        entry({ duration: 210, syncedLyrics: null, plainLyrics: 'la buena' }),
      ],
      QUERY,
    );
    expect(raw?.synced).toBe(false);
    expect(raw?.plain).toBe('la buena');
  });

  it('entre dos sincronizadas gana la de la duración correcta', () => {
    const raw = pickBest(
      [
        entry({ duration: 420, syncedLyrics: '[00:00.00]extendida' }),
        entry({ duration: 209, syncedLyrics: '[00:00.00]correcta' }),
      ],
      QUERY,
    );
    expect(raw?.synced).toBe(true);
    expect(raw?.lrc).toContain('correcta');
  });

  it('si la otra versión solo tiene LRC, se sirve su texto sin los tiempos', () => {
    const raw = pickBest([entry({ duration: 420, plainLyrics: null })], QUERY);
    expect(raw?.synced).toBe(false);
    expect(raw?.plain).toBe('primera linea\nsegunda linea');
  });

  it('sin duración en la query nada cambia (no se puede comparar)', () => {
    const raw = pickBest([entry({ duration: 420 })], { ...QUERY, durationMs: null });
    expect(raw?.synced).toBe(true);
  });
});

describe('stripLrcTimestamps', () => {
  it('quita los marcadores y las líneas que quedan vacías', () => {
    expect(stripLrcTimestamps('[00:10.00]hola\n[00:12.50]\n[01:20.00]adios')).toBe('hola\nadios');
  });

  it('respeta el texto que no lleva marcador', () => {
    expect(stripLrcTimestamps('sin marca')).toBe('sin marca');
  });
});
