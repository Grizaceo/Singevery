import { describe, it, expect } from 'vitest';
import { computeLegibility } from '../src/teleprompter/legibility';

describe('computeLegibility — pisos de legibilidad', () => {
  it('con opacidad alta no cambia nada y el boost no se activa', () => {
    const out = computeLegibility({ textOpacity: 1, backgroundOpacity: 1, boost: true });
    expect(out).toEqual({
      currentLineOpacity: 1,
      contextOpacity: 1,
      backgroundAlpha: 1,
      boostActive: false,
    });
  });

  it('la línea actual nunca baja del 60 % aunque la letra esté al mínimo', () => {
    const out = computeLegibility({ textOpacity: 0.2, backgroundOpacity: 0.5, boost: true });
    expect(out.currentLineOpacity).toBe(0.6);
  });

  it('el contexto nunca baja del 35 %', () => {
    const out = computeLegibility({ textOpacity: 0.2, backgroundOpacity: 0.5, boost: false });
    expect(out.contextOpacity).toBe(0.35);
  });

  it('por encima de los pisos usa la opacidad de la letra tal cual', () => {
    const out = computeLegibility({ textOpacity: 0.8, backgroundOpacity: 0.4, boost: false });
    expect(out.currentLineOpacity).toBe(0.8);
    expect(out.contextOpacity).toBe(0.8);
  });
});

describe('computeLegibility — fondo y boost', () => {
  it('backgroundAlpha refleja la opacidad del fondo (0 = ventana limpia)', () => {
    expect(
      computeLegibility({ textOpacity: 1, backgroundOpacity: 0, boost: true }).backgroundAlpha,
    ).toBe(0);
    expect(
      computeLegibility({ textOpacity: 1, backgroundOpacity: 0.5, boost: true }).backgroundAlpha,
    ).toBe(0.5);
  });

  it('el boost se activa solo con fondo por debajo de 0.35', () => {
    const on = computeLegibility({ textOpacity: 1, backgroundOpacity: 0.34, boost: true });
    expect(on.boostActive).toBe(true);

    const off = computeLegibility({ textOpacity: 1, backgroundOpacity: 0.35, boost: true });
    expect(off.boostActive).toBe(false);
  });

  it('con boost desactivado por el usuario nunca se refuerza el contorno', () => {
    const out = computeLegibility({ textOpacity: 1, backgroundOpacity: 0, boost: false });
    expect(out.boostActive).toBe(false);
  });
});
