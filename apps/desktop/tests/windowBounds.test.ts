import { describe, it, expect } from 'vitest';
import { isWindowBoundsValid } from '../electron/services/settings';

describe('isWindowBoundsValid', () => {
  const displays = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 1280, height: 720 },
  ];

  it('acepta bounds que intersectan un display', () => {
    expect(isWindowBoundsValid({ x: 100, y: 50, width: 760, height: 560 }, displays)).toBe(true);
    expect(isWindowBoundsValid({ x: 2000, y: 40, width: 760, height: 560 }, displays)).toBe(true);
  });

  it('rechaza bounds fuera de todos los displays', () => {
    expect(isWindowBoundsValid({ x: 4000, y: 0, width: 760, height: 560 }, displays)).toBe(false);
  });
});
