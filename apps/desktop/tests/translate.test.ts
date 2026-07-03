import { describe, it, expect, vi, afterEach } from 'vitest';
import { translateLines } from '../electron/services/translate';

describe('translateLines', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falla sin API key', async () => {
    const result = await translateLines(['hola'], {
      provider: 'deepl',
      apiKey: '',
      targetLang: 'es',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/API key/i);
  });

  it('traduce con DeepL en lote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          translations: [{ text: 'hola' }, { text: 'mundo' }],
        }),
      })),
    );

    const result = await translateLines(['hello', 'world'], {
      provider: 'deepl',
      apiKey: 'test-key:fx',
      targetLang: 'es',
    });

    expect(result.ok).toBe(true);
    expect(result.translations).toEqual(['hola', 'mundo']);
  });

  it('traduce con Google en lote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            translations: [{ translatedText: 'solitaria' }],
          },
        }),
      })),
    );

    const result = await translateLines(['alone'], {
      provider: 'google',
      apiKey: 'google-key',
      targetLang: 'es',
    });

    expect(result.ok).toBe(true);
    expect(result.translations).toEqual(['solitaria']);
  });
});
