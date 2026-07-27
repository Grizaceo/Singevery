import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  translateLines,
  splitForMyMemory,
  parseNumberedTranslations,
  buildLocalPrompt,
  MYMEMORY_MAX_BYTES,
} from '../electron/services/translate';

/** Respuesta con la forma de la API compatible con OpenAI (Ollama, LM Studio…). */
function localOk(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

const LOCAL_CONFIG = {
  provider: 'local' as const,
  apiKey: '',
  targetLang: 'es',
  localEndpoint: 'http://localhost:11434/v1/chat/completions',
  localModel: 'translategemma:4b',
};

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

describe('traducción con modelo local', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no exige credenciales y traduce la canción en una sola generación', async () => {
    const fetchMock = vi.fn(async () => localOk('1. hola\n2. mundo'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateLines(['hello', 'world'], LOCAL_CONFIG);

    expect(result.ok).toBe(true);
    expect(result.translations).toEqual(['hola', 'mundo']);
    // Una petición para toda la canción: por línea sería insoportable en CPU.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('manda el modelo configurado y pide salida determinista', async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        body = JSON.parse(init.body) as Record<string, unknown>;
        return localOk('1. hola');
      }),
    );

    await translateLines(['hello'], LOCAL_CONFIG);

    expect(body.model).toBe('translategemma:4b');
    expect(body.temperature).toBe(0);
    expect(body.stream).toBe(false);
  });

  it('explica qué hacer si el runtime no está corriendo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    const result = await translateLines(['hello'], LOCAL_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no se pudo conectar/i);
    expect(result.error).toMatch(/ollama/i);
  });

  it('explica cómo descargar el modelo si el runtime no lo tiene', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, text: async () => 'model not found' })),
    );

    const result = await translateLines(['hello'], LOCAL_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ollama pull translategemma:4b/);
  });

  it('reintenta sin las líneas vacías si el modelo se sale del formato', async () => {
    const fetchMock = vi
      .fn()
      // Primer intento: el modelo omite la línea vacía y descuadra el conteo.
      .mockResolvedValueOnce(localOk('1. hola\n2. mundo'))
      // Reintento solo con las líneas que tienen contenido.
      .mockResolvedValueOnce(localOk('1. hola\n2. mundo'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateLines(['hello', '', 'world'], LOCAL_CONFIG);

    expect(result.ok).toBe(true);
    // La línea vacía se conserva en su sitio: la letra no se desalinea.
    expect(result.translations).toEqual(['hola', '', 'mundo']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falla claro antes que devolver una letra desalineada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => localOk('me parece que dice hola y mundo')));

    const result = await translateLines(['hello', 'world'], LOCAL_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/formato/i);
  });
});

describe('parseNumberedTranslations', () => {
  it('recupera las líneas ignorando el preámbulo del modelo', () => {
    const raw = 'Claro, aquí tienes:\n\n1. hola\n2. mundo\n\n¿Necesitas algo más?';
    expect(parseNumberedTranslations(raw, 2)).toEqual(['hola', 'mundo']);
  });

  it('acepta las variantes de numeración que usan los modelos', () => {
    expect(parseNumberedTranslations('1) uno\n2) dos', 2)).toEqual(['uno', 'dos']);
    expect(parseNumberedTranslations('1: uno\n2: dos', 2)).toEqual(['uno', 'dos']);
    expect(parseNumberedTranslations('1 - uno\n2 - dos', 2)).toEqual(['uno', 'dos']);
  });

  it('reordena por número, no por posición', () => {
    expect(parseNumberedTranslations('2. dos\n1. uno', 2)).toEqual(['uno', 'dos']);
  });

  it('devuelve null si falta o sobra alguna línea', () => {
    expect(parseNumberedTranslations('1. uno', 2)).toBeNull();
    expect(parseNumberedTranslations('sin numerar', 1)).toBeNull();
    // Números fuera de rango no cuentan.
    expect(parseNumberedTranslations('1. uno\n9. nueve', 2)).toBeNull();
  });

  it('se queda con la primera aparición si el modelo repite un número', () => {
    expect(parseNumberedTranslations('1. bueno\n1. malo\n2. dos', 2)).toEqual(['bueno', 'dos']);
  });
});

describe('buildLocalPrompt', () => {
  it('numera las líneas y fija el conteo esperado', () => {
    const prompt = buildLocalPrompt(['hello', 'world'], 'es');
    expect(prompt).toContain('1. hello');
    expect(prompt).toContain('2. world');
    expect(prompt).toContain('exactly 2 lines');
    expect(prompt).toContain('es');
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

// ============================================================================
// Plazos. Un fetch sin tope no falla: se queda esperando, y con él la promesa
// del IPC y el spinner del renderer. Estas pruebas fijan que SIEMPRE se rinde.
// ============================================================================

/** fetch que nunca responde pero obedece el abort, como haría uno real. */
function colgado() {
  return vi.fn(
    (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        });
      }),
  );
}

/** fetch que responde bien, pero tarda `demoraMs` (en tiempo simulado). */
function lento(demoraMs: number, respuesta: () => unknown) {
  return vi.fn(
    (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(respuesta()), demoraMs);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        });
      }),
  );
}

describe('plazos de traducción', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('MyMemory se rinde con un mensaje legible si el servicio no responde', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', colgado());

    const promesa = translateLines(['hello'], {
      provider: 'mymemory',
      apiKey: '',
      targetLang: 'es',
    });
    await vi.advanceTimersByTimeAsync(60_000);
    const res = await promesa;

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/MyMemory no respondió en \d+ s/);
  });

  it('el modelo local se rinde en vez de esperar para siempre', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', colgado());

    const promesa = translateLines(['hello'], LOCAL_CONFIG);
    await vi.advanceTimersByTimeAsync(400_000);
    const res = await promesa;

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no terminó en \d+ s/);
  });

  it('DeepL se rinde con su propio mensaje', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', colgado());

    const promesa = translateLines(['hello'], {
      provider: 'deepl',
      apiKey: 'clave:fx',
      targetLang: 'es',
    });
    await vi.advanceTimersByTimeAsync(90_000);
    const res = await promesa;

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/DeepL no respondió en \d+ s/);
  });

  it('corta la canción entera cuando cada petición va lenta pero responde', async () => {
    vi.useFakeTimers();
    // 10 s por petición: ninguna vence su plazo individual (20 s), pero la
    // suma de una canción larga sí revienta el presupuesto total.
    vi.stubGlobal('fetch', lento(10_000, () => myMemoryOk('x', 'en')));

    const lineas = Array.from({ length: 60 }, (_, i) => `linea ${i}`);
    const promesa = translateLines(lineas, {
      provider: 'mymemory',
      apiKey: '',
      targetLang: 'es',
    });
    await vi.advanceTimersByTimeAsync(400_000);
    const res = await promesa;

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/tardó más de \d+ s y se canceló/);
  });

  it('cancelar desde fuera se distingue de un timeout', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', colgado());

    const promesa = translateLines(['hello'], LOCAL_CONFIG, controller.signal);
    controller.abort();
    const res = await promesa;

    expect(res.ok).toBe(false);
    expect(res.error).toBe('Traducción cancelada');
  });
});
