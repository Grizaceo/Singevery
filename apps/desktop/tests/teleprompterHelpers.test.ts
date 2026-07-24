import { describe, it, expect } from 'vitest';
import {
  splitPreviousTiers,
  splitNextTiers,
  tierSizes,
} from '../src/teleprompter/teleprompterHelpers';

describe('teleprompterHelpers tiers', () => {
  const lines = [
    { text: 'a' },
    { text: 'b' },
    { text: 'c' },
  ];

  it('splitPreviousTiers separa lejana y adyacente (última)', () => {
    expect(splitPreviousTiers(lines)).toEqual({
      far: [{ text: 'a' }, { text: 'b' }],
      adjacent: [{ text: 'c' }],
    });
  });

  it('splitNextTiers separa adyacente (primera) y lejana', () => {
    expect(splitNextTiers(lines)).toEqual({
      adjacent: [{ text: 'a' }],
      far: [{ text: 'b' }, { text: 'c' }],
    });
  });

  it('con una sola línea va toda a adjacent', () => {
    expect(splitPreviousTiers([{ text: 'solo' }])).toEqual({
      far: [],
      adjacent: [{ text: 'solo' }],
    });
  });

  it('tierSizes: en ritmo normal ambas adyacentes van iguales', () => {
    expect(tierSizes(1, false)).toEqual({
      current: '4rem',
      prevAdjacent: '2.1rem',
      nextAdjacent: '2.1rem',
      far: '1.35rem',
    });
  });

  it('tierSizes: en sección densa la siguiente crece y la previa cede', () => {
    expect(tierSizes(1, true)).toEqual({
      current: '4rem',
      prevAdjacent: '1.5rem',
      nextAdjacent: '3rem',
      far: '1.35rem',
    });
    // Escala con font_scale.
    expect(tierSizes(0.5, true).nextAdjacent).toBe('1.5rem');
  });
});
