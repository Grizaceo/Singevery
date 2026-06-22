import { describe, it, expect } from 'vitest';
import { parseWakeMessage } from '../electron/services/wakeword/wakeWordReader';

describe('parseWakeMessage', () => {
  it('acepta el evento JSON {"type":"wake"}', () => {
    expect(parseWakeMessage('{"type":"wake"}')).toBe(true);
  });

  it('acepta la línea simple WAKE', () => {
    expect(parseWakeMessage('WAKE')).toBe(true);
  });

  it('tolera espacios alrededor', () => {
    expect(parseWakeMessage('  {"type":"wake"}  ')).toBe(true);
    expect(parseWakeMessage('  WAKE\n')).toBe(true);
  });

  it('rechaza JSON con otro type', () => {
    expect(parseWakeMessage('{"type":"track","title":"T"}')).toBe(false);
    expect(parseWakeMessage('{"type":"position"}')).toBe(false);
  });

  it('rechaza líneas vacías o basura', () => {
    expect(parseWakeMessage('')).toBe(false);
    expect(parseWakeMessage('   ')).toBe(false);
    expect(parseWakeMessage('no es json')).toBe(false);
    expect(parseWakeMessage('{"type":"wake"')).toBe(false); // json roto
  });
});