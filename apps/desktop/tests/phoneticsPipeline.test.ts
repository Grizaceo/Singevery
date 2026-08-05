import { describe, expect, it, beforeEach } from 'vitest';
import {
  analyzeLine,
  romanizeTimedLyrics,
  setSpanishVariant,
  getSpanishVariant,
  ANNOTATIONS_VERSION,
} from '../electron/services/romanize';
import type { TimedLyrics } from '../src/types';

/**
 * Integración de la capa fonética con el pipeline de anotaciones: comprueba
 * que una canción en alfabeto latino llega a tener `ipa` en sus líneas sin que
 * nadie tenga que decirle el idioma a mano.
 */

function lyrics(lines: string[]): TimedLyrics {
  return {
    lines: lines.map((text, index) => ({ text, start_ms: index * 3000, end_ms: null })),
    source: 'test',
    synced: true,
  } as TimedLyrics;
}

const CANCION_ES = [
  'No sé si volverás cuando la noche pase',
  'Y en el silencio de mi corazón te espero',
  'Porque siempre supe que este amor no tiene fin',
];

const CANCION_EN = [
  'I don t know if you will come back when the night is over',
  'And in the silence of my heart I am waiting for you',
  'Because I always knew that this love would never end',
];

beforeEach(() => {
  setSpanishVariant('seseo');
});

describe('romanizeTimedLyrics — IPA de lenguas latinas', () => {
  it('anota IPA en una canción española detectada automáticamente', async () => {
    const result = await romanizeTimedLyrics(lyrics(CANCION_ES));
    expect(result.lines[1].ipa).toBe('i en el silensjo de mi koɾason te espeɾo');
  });

  it('anota todas las líneas, no solo la primera', async () => {
    const result = await romanizeTimedLyrics(lyrics(CANCION_ES));
    expect(result.lines.every((line) => typeof line.ipa === 'string' && line.ipa.length > 0)).toBe(
      true,
    );
  });

  it('NO anota una canción inglesa: no hay motor y no se inventa', async () => {
    const result = await romanizeTimedLyrics(lyrics(CANCION_EN));
    expect(result.lines.every((line) => line.ipa === undefined)).toBe(true);
  });

  it('sella la versión de anotaciones para invalidar la caché vieja', async () => {
    const result = await romanizeTimedLyrics(lyrics(CANCION_ES));
    expect(result.annotationsVersion).toBe(ANNOTATIONS_VERSION);
    expect(ANNOTATIONS_VERSION).toBeGreaterThanOrEqual(4);
  });

  it('detecta italiano y usa su motor, no el español', async () => {
    const result = await romanizeTimedLyrics(
      lyrics([
        'Non so se tornerai quando la notte passa',
        'E nel silenzio del mio cuore ti aspetto',
        'Perché ho sempre saputo che questo amore non ha fine',
      ]),
    );
    // Geminación italiana: "notte" → /notːe/. El motor español no la produce.
    expect(result.lines[0].ipa).toContain('notːe');
  });
});

describe('setSpanishVariant — el ajuste llega hasta la transcripción', () => {
  it('por defecto usa seseo', () => {
    expect(getSpanishVariant()).toBe('seseo');
  });

  it('cambia la transcripción al pasar a distinción castellana', async () => {
    const conSeseo = await analyzeLine('corazón', 'es');
    expect(conSeseo.ipa).toBe('koɾason');

    setSpanishVariant('distincion');
    const conDistincion = await analyzeLine('corazón', 'es');
    expect(conDistincion.ipa).toBe('koɾaθon');
  });

  it('la caché no devuelve la transcripción de la norma anterior', async () => {
    setSpanishVariant('seseo');
    expect((await analyzeLine('cielo', 'es')).ipa).toBe('sjelo');
    setSpanishVariant('distincion');
    expect((await analyzeLine('cielo', 'es')).ipa).toBe('θjelo');
    setSpanishVariant('seseo');
    expect((await analyzeLine('cielo', 'es')).ipa).toBe('sjelo');
  });
});

describe('analyzeLine — sin idioma no hay IPA latino', () => {
  it('una línea latina sin idioma indicado no recibe anotaciones', async () => {
    const readings = await analyzeLine('la casa');
    expect(readings.ipa).toBeUndefined();
  });
});
