import { describe, it, expect } from 'vitest';
import { splitAtFraction, splitSegmentsAtFraction } from '../src/lineHighlight';
import type { FuriganaSegment } from '../src/types';

describe('splitAtFraction', () => {
  it('fracción 0 → nada cantado, todo pendiente', () => {
    expect(splitAtFraction('hola', 0)).toEqual(['', 'hola']);
  });

  it('fracción 1 → todo cantado, nada pendiente', () => {
    expect(splitAtFraction('hola', 1)).toEqual(['hola', '']);
  });

  it('parte por la mitad', () => {
    const [spoken, rest] = splitAtFraction('hola', 0.5);
    expect(spoken).toBe('ho');
    expect(rest).toBe('la');
  });

  it('satura fuera de rango', () => {
    expect(splitAtFraction('hola', -1)).toEqual(['', 'hola']);
    expect(splitAtFraction('hola', 2)).toEqual(['hola', '']);
  });

  it('texto vacío no rompe', () => {
    expect(splitAtFraction('', 0.5)).toEqual(['', '']);
  });

  it('respeta caracteres multibyte (CJK) contando por code unit', () => {
    // '音楽' son 2 caracteres; 0.5 → 1 cantado.
    const [spoken, rest] = splitAtFraction('音楽', 0.5);
    expect(spoken).toBe('音');
    expect(rest).toBe('楽');
  });
});

describe('splitSegmentsAtFraction', () => {
  const segs: FuriganaSegment[] = [
    { base: '音', rt: 'おん' },
    { base: '楽', rt: 'がく' },
    { base: '日', rt: 'ひ' },
    { base: '本', rt: 'ほん' },
  ];

  it('fracción 0 → todo pendiente', () => {
    const { spoken, unspoken } = splitSegmentsAtFraction(segs, 0);
    expect(spoken).toEqual([]);
    expect(unspoken).toEqual(segs);
  });

  it('fracción 1 → todo cantado', () => {
    const { spoken, unspoken } = splitSegmentsAtFraction(segs, 1);
    expect(spoken).toEqual(segs);
    expect(unspoken).toEqual([]);
  });

  it('avanza por segmento: 0.5 → 2 cantados, 2 pendientes', () => {
    const { spoken, unspoken } = splitSegmentsAtFraction(segs, 0.5);
    expect(spoken).toEqual(segs.slice(0, 2));
    expect(unspoken).toEqual(segs.slice(2));
  });

  it('lista vacía → ambos vacíos', () => {
    expect(splitSegmentsAtFraction([], 0.5)).toEqual({ spoken: [], unspoken: [] });
  });
});