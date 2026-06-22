import { describe, it, expect } from 'vitest';
import {
  pillBounds,
  expandedBounds,
  PILL_WIDTH,
  PILL_HEIGHT,
  type Rect,
} from '../electron/services/windowLayout';

const workArea: Rect = { x: 0, y: 0, width: 1920, height: 1080 };

describe('windowLayout', () => {
  it('pillBounds centra la pill arriba con margen', () => {
    const b = pillBounds(workArea);
    expect(b.width).toBe(PILL_WIDTH);
    expect(b.height).toBe(PILL_HEIGHT);
    expect(b.x).toBe(Math.round((1920 - PILL_WIDTH) / 2));
    expect(b.y).toBe(8); // margen superior por defecto
  });

  it('pillBounds respeta el origen del workArea (multi-monitor)', () => {
    const wa: Rect = { x: 1920, y: 100, width: 1366, height: 768 };
    const b = pillBounds(wa);
    expect(b.x).toBe(1920 + Math.round((1366 - PILL_WIDTH) / 2));
    expect(b.y).toBe(100 + 8);
  });

  it('expandedBounds centra el tamaño dado en el workArea', () => {
    const b = expandedBounds(workArea, 760, 560);
    expect(b.width).toBe(760);
    expect(b.height).toBe(560);
    expect(b.x).toBe(Math.round((1920 - 760) / 2));
    expect(b.y).toBe(Math.round((1080 - 560) / 2));
  });

  it('expandedBounds respeta origen del workArea', () => {
    const wa: Rect = { x: -1920, y: 0, width: 1920, height: 1080 };
    const b = expandedBounds(wa, 760, 560);
    expect(b.x).toBe(-1920 + Math.round((1920 - 760) / 2));
  });
});