import { describe, expect, it } from 'vitest';
import { systemAudioConstraints } from '../src/audio/capture';

describe('systemAudioConstraints', () => {
  it('Linux pide el loopback crudo: sin cancelación de eco, supresión ni AGC', () => {
    expect(systemAudioConstraints('linux')).toEqual({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it('Windows (y plataforma desconocida) conservan la petición original', () => {
    expect(systemAudioConstraints('win32')).toBe(true);
    expect(systemAudioConstraints(undefined)).toBe(true);
  });
});
