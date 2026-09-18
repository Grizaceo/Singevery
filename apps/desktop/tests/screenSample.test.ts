import { describe, it, expect } from 'vitest';
import {
  parsePpm,
  ringLuminance,
  ringRegion,
  sampleSurroundingLuminance,
} from '../electron/services/linux/screenSample';

/** PPM de w×h: blanco dentro de `inner` (en píxeles de imagen), negro fuera. */
function ppm(w: number, h: number, inner?: { x: number; y: number; w: number; h: number }): Buffer {
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`, 'latin1');
  const px = Buffer.alloc(w * h * 3, 0);
  if (inner) {
    for (let y = inner.y; y < inner.y + inner.h; y++) {
      for (let x = inner.x; x < inner.x + inner.w; x++) px.fill(255, (y * w + x) * 3, (y * w + x) * 3 + 3);
    }
  }
  return Buffer.concat([header, px]);
}

describe('screenSample', () => {
  it('parsePpm lee la cabecera de grim y rechaza basura', () => {
    const img = parsePpm(ppm(4, 2));
    expect(img).toMatchObject({ width: 4, height: 2 });
    expect(img?.pixels.length).toBe(24);
    expect(parsePpm(Buffer.from('not an image'))).toBeNull();
  });

  it('ringRegion añade el margen y recorta al monitor', () => {
    const display = { x: 2560, y: 0, width: 1920, height: 1080 };
    expect(ringRegion({ x: 3000, y: 300, width: 760, height: 560 }, display, 48)).toEqual({
      x: 2952,
      y: 252,
      width: 856,
      height: 656,
    });
    // Pegado arriba a la izquierda del monitor: no se sale de él.
    expect(ringRegion({ x: 2560, y: 0, width: 156, height: 48 }, display, 48)).toEqual({
      x: 2560,
      y: 0,
      width: 204,
      height: 96,
    });
  });

  it('el interior de la ventana no cuenta: letra blanca sobre fondo negro mide negro', () => {
    // Región 20×20 px; la ventana ocupa el centro 10×10 y está "pintada" de blanco.
    const region = { x: 0, y: 0, width: 20, height: 20 };
    const inner = { x: 5, y: 5, width: 10, height: 10 };
    const img = parsePpm(ppm(20, 20, { x: 5, y: 5, w: 10, h: 10 }))!;
    expect(ringLuminance(img, region, inner)).toBeCloseTo(0, 5);
  });

  it('respeta la escala de la captura (grim -s 0.25)', () => {
    // Región lógica 80×80 capturada a 20×20; la ventana lógica 20..60 = imagen 5..15.
    const region = { x: 100, y: 100, width: 80, height: 80 };
    const inner = { x: 120, y: 120, width: 40, height: 40 };
    const img = parsePpm(ppm(20, 20, { x: 5, y: 5, w: 10, h: 10 }))!;
    expect(ringLuminance(img, region, inner)).toBeCloseTo(0, 5);
  });

  it('ventana a pantalla completa: mide la región entera antes que nada', () => {
    const region = { x: 0, y: 0, width: 10, height: 10 };
    const img = parsePpm(ppm(10, 10, { x: 0, y: 0, w: 10, h: 10 }))!;
    expect(ringLuminance(img, region, region)).toBeCloseTo(1, 5);
  });

  it('sampleSurroundingLuminance llama a grim con la geometría del anillo', async () => {
    const calls: string[][] = [];
    const lum = await sampleSurroundingLuminance(
      { x: 3000, y: 300, width: 760, height: 560 },
      { x: 2560, y: 0, width: 1920, height: 1080 },
      async (args) => {
        calls.push(args);
        return ppm(214, 164);
      },
    );
    expect(lum).toBeCloseTo(0, 5);
    expect(calls[0]).toEqual(['-s', '0.25', '-g', '2952,252 856x656', '-t', 'ppm', '-']);
  });
});
