import { describe, it, expect } from 'vitest';
import { splitPreviousTiers, splitNextTiers } from '../src/teleprompter/teleprompterHelpers';

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
});
