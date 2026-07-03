import { describe, it, expect } from 'vitest';
import {
  isWindowBoundsValid,
  isWindowBoundsVisible,
  resolveInitialWindowBounds,
} from '../electron/services/windowLayout';

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

describe('isWindowBoundsVisible', () => {
  const displays = [{ x: 0, y: 0, width: 1920, height: 1080 }];

  it('rechaza ventana en monitor desconectado aunque intersecte el canvas virtual', () => {
    // Centro en x=3313 — fuera del único display activo
    expect(isWindowBoundsVisible({ x: 2933, y: 276, width: 760, height: 560 }, displays)).toBe(false);
  });

  it('acepta ventana centrada en el display', () => {
    expect(isWindowBoundsVisible({ x: 580, y: 260, width: 760, height: 560 }, displays)).toBe(true);
  });
});

describe('resolveInitialWindowBounds', () => {
  const displays = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const offScreen = { x: 3313, y: 556, width: 760, height: 560 };

  it('en dev ignora bounds guardados fuera de pantalla', () => {
    const b = resolveInitialWindowBounds(offScreen, displays, workArea, 760, 560, true);
    expect(b.x).toBe(Math.round(workArea.x + (workArea.width - 760) / 2));
    expect(b.y).toBe(Math.round(workArea.y + (workArea.height - 560) / 2));
  });

  it('en prod usa saved si es visible', () => {
    const saved = { x: 100, y: 80, width: 760, height: 560 };
    expect(resolveInitialWindowBounds(saved, displays, workArea, 760, 560, false)).toEqual(saved);
  });
});
