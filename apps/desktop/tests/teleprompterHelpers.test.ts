import { describe, it, expect } from 'vitest';
import {
  splitPreviousTiers,
  splitNextTiers,
  tierSizes,
  contextScale,
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

  it('contextScale: no encoge con la ventana por defecto', () => {
    expect(contextScale(0)).toBe(1);
    expect(contextScale(4)).toBe(1); // 2 arriba + 2 abajo
  });

  it('contextScale: encoge al pedir más contexto, con suelo legible', () => {
    expect(contextScale(6)).toBeCloseTo(0.86, 2);
    expect(contextScale(10)).toBeCloseTo(0.6, 2);
    // Nunca baja del suelo por mucho contexto que se pida.
    expect(contextScale(40)).toBe(0.6);
  });

  it('tierSizes: con más líneas visibles el texto se achica para que quepa', () => {
    const normal = parseFloat(tierSizes(1, false, 4).current);
    const amplio = parseFloat(tierSizes(1, false, 10).current);
    expect(amplio).toBeLessThan(normal);
    // La jerarquía visual se conserva: la actual sigue siendo la más grande.
    const sizes = tierSizes(1, false, 10);
    expect(parseFloat(sizes.current)).toBeGreaterThan(parseFloat(sizes.nextAdjacent));
    expect(parseFloat(sizes.nextAdjacent)).toBeGreaterThan(parseFloat(sizes.far));
  });
});
