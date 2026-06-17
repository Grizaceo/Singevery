import { describe, it, expect } from 'vitest';
import { computeLuminance, classifyBackground, LIGHT_THRESHOLD } from '../electron/services/backgroundSampler';

/** Fabrica un bitmap RGBA de `w×h` píxeles todos del color dado (r,g,b 0..255). */
function solidBitmap(w: number, h: number, r: number, g: number, b: number, a = 255): Uint8Array {
  const buf = new Uint8Array(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
  return buf;
}

describe('computeLuminance', () => {
  it('negro puro → 0', () => {
    expect(computeLuminance(solidBitmap(4, 4, 0, 0, 0))).toBeCloseTo(0, 5);
  });

  it('blanco puro → 1', () => {
    expect(computeLuminance(solidBitmap(4, 4, 255, 255, 255))).toBeCloseTo(1, 5);
  });

  it('usa los pesos BT.601 (0.299/0.587/0.114)', () => {
    // Rojo puro: 0.299·255/255 = 0.299
    expect(computeLuminance(solidBitmap(2, 2, 255, 0, 0))).toBeCloseTo(0.299, 2);
    // Verde puro: 0.587
    expect(computeLuminance(solidBitmap(2, 2, 0, 255, 0))).toBeCloseTo(0.587, 2);
    // Azul puro: 0.114
    expect(computeLuminance(solidBitmap(2, 2, 0, 0, 255))).toBeCloseTo(0.114, 2);
  });

  it('ignora el canal alpha (lo que importa es el color del píxel)', () => {
    const opaque = computeLuminance(solidBitmap(2, 2, 200, 200, 200, 255));
    const transparent = computeLuminance(solidBitmap(2, 2, 200, 200, 200, 0));
    expect(opaque).toBeCloseTo(transparent, 5);
  });

  it('buffer vacío → 0 (no revienta)', () => {
    expect(computeLuminance(new Uint8Array(0))).toBe(0);
  });

  it('mezcla = promedio de píxeles', () => {
    // Mitad negro, mitad blanco → 0.5
    const half = new Uint8Array(8 * 4);
    for (let i = 0; i < 4 * 4; i++) half[i] = 0; // 4 px negros
    for (let i = 4 * 4; i < 8 * 4; i++) half[i] = 255; // 4 px blancos
    // alpha
    for (let i = 3; i < 8 * 4; i += 4) half[i] = 255;
    expect(computeLuminance(half)).toBeCloseTo(0.5, 1);
  });
});

describe('classifyBackground', () => {
  it('luminancia baja → dark', () => {
    expect(classifyBackground(0)).toBe('dark');
    expect(classifyBackground(0.4)).toBe('dark');
  });

  it('luminancia alta → light', () => {
    expect(classifyBackground(0.8)).toBe('light');
    expect(classifyBackground(1)).toBe('light');
  });

  it('umbral exacto es dark (usa >, no >=)', () => {
    expect(classifyBackground(LIGHT_THRESHOLD)).toBe('dark');
    expect(classifyBackground(LIGHT_THRESHOLD + 0.001)).toBe('light');
  });
});