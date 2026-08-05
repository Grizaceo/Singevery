import { describe, it, expect } from 'vitest';
import {
  scoreTitleDistinctiveness,
  isDistinctiveTitle,
  charEntropyBits,
  DISTINCTIVE_TITLE_THRESHOLD,
} from '../electron/services/lyrics/titleDistinctiveness';

describe('scoreTitleDistinctiveness', () => {
  it('títulos genéricos de una palabra no lockean', () => {
    for (const title of ['Awake', 'Alone', 'Home', 'Love', 'Night']) {
      expect(isDistinctiveTitle(title), title).toBe(false);
    }
  });

  it('"Lucky Star" (dos palabras comunes) tampoco lockea', () => {
    expect(isDistinctiveTitle('Lucky Star')).toBe(false);
  });

  it('nombres propios / palabras raras sí lockean', () => {
    for (const title of ['Bohemian Rhapsody', 'Smells Like Teen Spirit', 'Marea (we’ve lost dancing)']) {
      expect(isDistinctiveTitle(title), title).toBe(true);
    }
  });

  it('una frase larga de palabras comunes SÍ identifica una canción', () => {
    expect(isDistinctiveTitle('Never Gonna Give You Up')).toBe(true);
  });

  it('kana/kanji sube el puntaje aunque el título sea corto', () => {
    expect(isDistinctiveTitle('アイドル')).toBe(true);
    expect(isDistinctiveTitle('過去を喰らう')).toBe(true);
    expect(isDistinctiveTitle('강남스타일')).toBe(true);
  });

  it('vacío, un carácter y números puros valen ~0', () => {
    expect(scoreTitleDistinctiveness('')).toBe(0);
    expect(scoreTitleDistinctiveness('A')).toBeLessThan(0.1);
    expect(scoreTitleDistinctiveness('1')).toBeLessThan(0.1);
    expect(scoreTitleDistinctiveness('2024')).toBeLessThanOrEqual(0.1);
  });

  it('el puntaje siempre queda en 0..1', () => {
    const titles = ['', 'a', 'Awake', 'Never Gonna Give You Up', '過去を喰らう'.repeat(10)];
    for (const t of titles) {
      const s = scoreTitleDistinctiveness(t);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('un título distintivo puntúa por encima de uno genérico', () => {
    expect(scoreTitleDistinctiveness('Bohemian Rhapsody')).toBeGreaterThan(
      scoreTitleDistinctiveness('Alone'),
    );
    expect(DISTINCTIVE_TITLE_THRESHOLD).toBeGreaterThan(scoreTitleDistinctiveness('Alone'));
  });

  it('no lanza con entradas raras', () => {
    expect(() => scoreTitleDistinctiveness('   ')).not.toThrow();
    expect(() => scoreTitleDistinctiveness('🎵🎵🎵')).not.toThrow();
  });
});

describe('charEntropyBits', () => {
  it('texto repetido tiene entropía 0', () => {
    expect(charEntropyBits('aaaa')).toBe(0);
  });

  it('más variedad, más bits', () => {
    expect(charEntropyBits('abcd')).toBeGreaterThan(charEntropyBits('aabb'));
  });
});
