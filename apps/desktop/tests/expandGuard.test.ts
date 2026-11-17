import { describe, expect, it } from 'vitest';
import { EXPAND_GUARD_MS, withinExpandGuard } from '../src/expandGuard';

describe('withinExpandGuard', () => {
  it('sin expansión reciente no descarta nada', () => {
    expect(withinExpandGuard(1000, null)).toBe(false);
  });

  it('descarta el segundo clic de un doble clic (≈150–500 ms después)', () => {
    expect(withinExpandGuard(1150, 1000)).toBe(true);
    expect(withinExpandGuard(1500, 1000)).toBe(true);
  });

  it('pasado el margen, los clics vuelven a contar', () => {
    expect(withinExpandGuard(1000 + EXPAND_GUARD_MS, 1000)).toBe(false);
    expect(withinExpandGuard(5000, 1000)).toBe(false);
  });

  it('un reloj que retrocede no bloquea los clics', () => {
    expect(withinExpandGuard(900, 1000)).toBe(false);
  });
});
