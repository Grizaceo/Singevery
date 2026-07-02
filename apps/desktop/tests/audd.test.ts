import { describe, it, expect } from 'vitest';
import { parseAuddTimecode } from '../electron/services/recognition/auddProvider';

describe('parseAuddTimecode', () => {
  it('parsea segundos numéricos', () => {
    expect(parseAuddTimecode(12)).toBe(12000);
  });

  it('parsea formato m:ss', () => {
    expect(parseAuddTimecode('1:30')).toBe(90000);
  });

  it('parsea formato mm:ss', () => {
    expect(parseAuddTimecode('00:12')).toBe(12000);
  });

  it('devuelve 0 para valores vacíos', () => {
    expect(parseAuddTimecode(null)).toBe(0);
    expect(parseAuddTimecode('')).toBe(0);
  });
});
