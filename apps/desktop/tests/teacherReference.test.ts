// Conversión curva ↔ puntos y rangos por instrumento (lado renderer).
import { describe, it, expect } from 'vitest';
import {
  curveToPoints,
  pointsToCurve,
  INSTRUMENT_RANGE,
  INSTRUMENT_LABELS,
} from '../src/useTeacherReference';
import { INSTRUMENT_RANGE_HZ } from '../electron/services/references/referenceTypes';
import type { MelodyPoint } from '../src/audio/melody';

describe('curva ↔ puntos', () => {
  it('ida y vuelta conserva los datos', () => {
    const curve = { t: [0, 50, 100], f: [220, 233.08, 246.94] };
    const points = curveToPoints(curve);
    expect(points).toEqual([
      { timeMs: 0, freq: 220 },
      { timeMs: 50, freq: 233.08 },
      { timeMs: 100, freq: 246.94 },
    ]);
    expect(pointsToCurve(points)).toEqual(curve);
  });

  it('los puntos sin frecuencia (silencio) no viajan a la curva', () => {
    const points: MelodyPoint[] = [
      { timeMs: 0, freq: 220 },
      { timeMs: 50, freq: null },
      { timeMs: 100, freq: NaN },
      { timeMs: 150, freq: 250 },
    ];
    expect(pointsToCurve(points)).toEqual({ t: [0, 150], f: [220, 250] });
  });

  it('una curva vacía no rompe nada', () => {
    expect(curveToPoints({ t: [], f: [] })).toEqual([]);
    expect(pointsToCurve([])).toEqual({ t: [], f: [] });
  });
});

describe('rangos por instrumento', () => {
  it('el renderer y el main declaran los MISMOS rangos', () => {
    // Si se desincronizan, el profesor grabaría con un rango y la app
    // interpretaría con otro. Es la clase de bug que nadie nota hasta que la
    // referencia sale mal.
    expect(INSTRUMENT_RANGE).toEqual(INSTRUMENT_RANGE_HZ);
  });

  it('el bajo llega por debajo del mi grave de 41,2 Hz', () => {
    // El piso vocal del detector es 80 Hz: con ese rango la octava baja del
    // bajo es invisible. Este test existe para que nadie lo "corrija" a 80.
    expect(INSTRUMENT_RANGE.bajo.min).toBeLessThan(41.2);
    expect(INSTRUMENT_RANGE.voz.min).toBe(80);
  });

  it('cada instrumento tiene etiqueta y rango coherente', () => {
    for (const key of Object.keys(INSTRUMENT_RANGE) as (keyof typeof INSTRUMENT_RANGE)[]) {
      expect(INSTRUMENT_LABELS[key]).toBeTruthy();
      expect(INSTRUMENT_RANGE[key].min).toBeLessThan(INSTRUMENT_RANGE[key].max);
      expect(INSTRUMENT_RANGE[key].min).toBeGreaterThan(0);
    }
  });
});
