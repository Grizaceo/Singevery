import { describe, expect, it } from 'vitest';
import { FIT_MIN, overflowCorrection, viewportFitScale } from '../src/teleprompter/fitScale';
import { BAR_MIN_ZOOM, barZoom } from '../src/useFitBar';

describe('viewportFitScale', () => {
  it('1 en el tamaño de referencia o mayor (no agranda: eso es fontScale)', () => {
    expect(viewportFitScale(760, 560)).toBe(1);
    expect(viewportFitScale(1400, 1000)).toBe(1);
  });
  it('proporcional al lado más limitante (casos del 17-11)', () => {
    expect(viewportFitScale(500, 330)).toBeCloseTo(330 / 560, 5);
    expect(viewportFitScale(340, 220)).toBeCloseTo(220 / 560, 5);
    expect(viewportFitScale(400, 800)).toBeCloseTo(400 / 760, 5);
  });
  it('nunca baja de FIT_MIN y tolera tamaños inválidos', () => {
    expect(viewportFitScale(100, 60)).toBe(FIT_MIN);
    expect(viewportFitScale(0, 0)).toBe(1);
  });
});

describe('overflowCorrection', () => {
  it('1 si cabe (con 1 % de tolerancia)', () => {
    expect(overflowCorrection(300, 330)).toBe(1);
    expect(overflowCorrection(333, 330)).toBe(1);
  });
  it('caso real: panel de 612 px en 330 px disponibles', () => {
    expect(overflowCorrection(612, 330)).toBeCloseTo((330 / 612) * 0.97, 5);
  });
});

describe('barZoom', () => {
  it('caso real: barra de 417 px en 322 px', () => {
    expect(barZoom(417, 322)).toBe(0.77);
  });
  it('1 si cabe y nunca baja de BAR_MIN_ZOOM', () => {
    expect(barZoom(300, 322)).toBe(1);
    expect(barZoom(2000, 322)).toBe(BAR_MIN_ZOOM);
  });
});
