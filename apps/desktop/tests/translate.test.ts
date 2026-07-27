import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  translateLines,
  splitForMyMemory,
  MYMEMORY_MAX_BYTES,
} from '../electron/services/translate';

/** Respuesta de MyMemory con la forma real de la API. */
function myMemoryOk(translatedText: string, detectedLanguage?: string) {
  return {
    ok: true,
    json: async () => ({
      responseData: { translatedText, ...(detectedLanguage ? { detectedLanguage } : {}) },
      responseStatus: 200,
    }),
  };
}

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

  it('MyMemory NO exige credenciales', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => myMemoryOk('hola', 'en')));
    const result = await translateLines(['hello'], {
      provider: 'mymemory',
      apiKey: '',
      targetLang: 'es',
    });
    expect(result.ok).toBe(true);
    expect(result.translations).toEqual(['hola']);
  });

  it('MyMemory detecta el idioma una vez y lo reutiliza en todas las líneas', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        // La primera llamada es la de detección (Autodetect).
        return myMemoryOk('traducida', 'ja');
      }),
    );

    const result = await translateLines(['線が長い行です', 'corta'], {
      provider: 'mymemory',
      apiKey: '',
      targetLang: 'es',
    });

    expect(result.ok).toBe(true);
    expect(result.translations).toHaveLength(2);
    expect(urls[0]).toContain('Autodetect');
    // Tras detectar, el resto usa el idioma concreto: mejor calidad que dejar
    // que autodetecte líneas sueltas de dos palabras.
    expect(urls.slice(1).every((u) => u.includes('ja%7Ces'))).toBe(true);
  });

  it('MyMemory no gasta cuota en líneas vacías', async () => {
    const fetchMock = vi.fn(async () => myMemoryOk('x', 'en'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateLines(['hola', '', '   '], {
      provider: 'mymemory',
      apiKey: '',
      targetLang: 'es',
    });

    expect(result.translations).toEqual(['x', '', '   ']);
    // 1 detección + 1 línea con contenido = 2 peticiones, no 4.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('MyMemory manda el email cuando se configura (sube la cuota)', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return myMemoryOk('hola', 'en');
      }),
    );

    await translateLines(['hello'], {
      provider: 'mymemory',
      apiKey: 'yo@ejemplo.com',
      targetLang: 'es',
    });

    expect(urls.every((u) => u.includes('de=yo%40ejemplo.com'))).toBe(true);
  });

  it('MyMemory explica el agotamiento de cuota en vez de fallar en críptico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' },
          responseStatus: 200,
          quotaFinished: true,
        }),
      })),
    );

    const result = await translateLines(['hello'], {
      provider: 'mymemory',
      apiKey: '',
      targetLang: 'es',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cuota/i);
    expect(result.error).toMatch(/email/i);
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

describe('splitForMyMemory — tope de 500 bytes del parámetro q', () => {
  const bytes = (s: string): number => new TextEncoder().encode(s).length;

  it('deja intactas las líneas normales de una letra', () => {
    expect(splitForMyMemory('Todo el mundo ha sido cegado')).toEqual([
      'Todo el mundo ha sido cegado',
    ]);
  });

  it('trocea por palabras sin exceder el límite', () => {
    const largo = Array.from({ length: 200 }, (_, i) => `palabra${i}`).join(' ');
    const partes = splitForMyMemory(largo);
    expect(partes.length).toBeGreaterThan(1);
    for (const parte of partes) {
      expect(bytes(parte)).toBeLessThanOrEqual(MYMEMORY_MAX_BYTES);
    }
    // No se pierde ni se duplica contenido.
    expect(partes.join(' ')).toBe(largo);
  });

  it('cuenta BYTES, no caracteres (el japonés ocupa 3 por carácter)', () => {
    // 200 caracteres CJK = 600 bytes: cabe en caracteres pero no en bytes.
    const cjk = '誰'.repeat(200);
    expect(cjk.length).toBeLessThan(MYMEMORY_MAX_BYTES);
    const partes = splitForMyMemory(cjk);
    expect(partes.length).toBeGreaterThan(1);
    for (const parte of partes) {
      expect(bytes(parte)).toBeLessThanOrEqual(MYMEMORY_MAX_BYTES);
    }
    expect(partes.join('')).toBe(cjk);
  });

  it('parte una palabra suelta más larga que el límite en vez de perderla', () => {
    const monstruo = 'a'.repeat(1200);
    const partes = splitForMyMemory(monstruo);
    expect(partes.join('')).toBe(monstruo);
    for (const parte of partes) {
      expect(bytes(parte)).toBeLessThanOrEqual(MYMEMORY_MAX_BYTES);
    }
  });
});
