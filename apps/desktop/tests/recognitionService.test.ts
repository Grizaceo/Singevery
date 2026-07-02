import { describe, it, expect } from 'vitest';
import { resolveProviderChain } from '../electron/services/recognition/recognitionService';

describe('resolveProviderChain', () => {
  it('auto con token intenta shazam luego audd', () => {
    expect(resolveProviderChain('auto', true)).toEqual(['shazam', 'audd']);
  });

  it('auto sin token solo shazam', () => {
    expect(resolveProviderChain('auto', false)).toEqual(['shazam']);
  });

  it('modo fijo devuelve un solo proveedor', () => {
    expect(resolveProviderChain('shazam', true)).toEqual(['shazam']);
    expect(resolveProviderChain('audd', false)).toEqual(['audd']);
  });
});
