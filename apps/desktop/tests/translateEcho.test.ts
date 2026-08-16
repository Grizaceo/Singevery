// "Traducción" que en realidad es el original.
//
// Ningún proveedor avisa cuando no tradujo: MyMemory con un langpair X|X
// responde 200 con el texto tal cual, y un modelo local pequeño puede reemitir
// la lista numerada sin tocarla. Ese eco se guardaba como traducción buena, se
// persistía en la caché de letras y el guard `alreadyDone` del StateStore
// impedía reintentarlo: la canción quedaba con la "traducción" idéntica para
// siempre.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  translateLines,
  untranslatedRatio,
  UNTRANSLATED_FAIL_RATIO,
  SAME_LANGUAGE_ERROR,
} from '../electron/services/translate';

function myMemoryOk(translatedText: string, detectedLanguage?: string) {
  return {
    ok: true,
    json: async () => ({
      responseData: { translatedText, ...(detectedLanguage ? { detectedLanguage } : {}) },
      responseStatus: 200,
    }),
  };
}

/** Cuatro versos largos: cuentan todos para el veredicto. */
const VERSES = [
  'the night is calling out my name again',
  'i walk alone across the empty street',
  'nothing here can hold me down tonight',
  'we were young and we were never afraid',
];

describe('untranslatedRatio', () => {
  it('detecta el eco completo', () => {
    expect(untranslatedRatio(VERSES, [...VERSES])).toBe(1);
  });

  it('da 0 cuando todo se tradujo', () => {
    const translated = VERSES.map((v) => `traducido ${v}`);
    expect(untranslatedRatio(VERSES, translated)).toBe(0);
  });

  it('ignora interjecciones y líneas cortas', () => {
    // "Oh", "Yeah" y "La la la" se traducen igual a sí mismos con toda
    // legitimidad: contarlas haría fallar traducciones correctas.
    const originals = ['Oh', 'Yeah', 'La la la', VERSES[0]];
    const translations = ['Oh', 'Yeah', 'La la la', 'la noche vuelve a llamarme'];
    expect(untranslatedRatio(originals, translations)).toBe(0);
  });

  it('sin líneas juzgables no acusa', () => {
    expect(untranslatedRatio(['Oh', 'Ah'], ['Oh', 'Ah'])).toBe(0);
  });

  it('ignora diferencias de puntuación y mayúsculas', () => {
    expect(untranslatedRatio([VERSES[0]], [`${VERSES[0].toUpperCase()}!`])).toBe(1);
  });

  it('una minoría sin traducir no dispara el fallo', () => {
    const translations = [VERSES[0], ...VERSES.slice(1).map((v) => `traducido ${v}`)];
    expect(untranslatedRatio(VERSES, translations)).toBeLessThan(UNTRANSLATED_FAIL_RATIO);
  });
});

describe('translateLines — no acepta el eco', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falla si el proveedor devuelve el texto sin traducir', async () => {
    // MyMemory detecta inglés y luego devuelve cada línea tal cual.
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        // Las primeras respuestas son la detección de idioma (voto).
        return call <= 3 ? myMemoryOk(VERSES[0], 'en') : myMemoryOk(VERSES[call - 4] ?? '');
      }),
    );

    const result = await translateLines(VERSES, {
      provider: 'mymemory',
      apiKey: '',
      targetLang: 'es',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sin traducir/i);
  });

  it('acepta una traducción real', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        return call <= 3 ? myMemoryOk('la noche', 'en') : myMemoryOk('linea traducida');
      }),
    );

    const result = await translateLines(VERSES, {
      provider: 'mymemory',
      apiKey: '',
      targetLang: 'es',
    });

    expect(result.ok).toBe(true);
    expect(result.translations).toHaveLength(VERSES.length);
  });

  it('no gasta la cuota si la letra ya está en el idioma de destino', async () => {
    const fetchMock = vi.fn(async () => myMemoryOk('da igual', 'es'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateLines(VERSES, {
      provider: 'mymemory',
      apiKey: '',
      targetLang: 'es',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe(SAME_LANGUAGE_ERROR);
    // Solo las peticiones de detección: ni una por línea.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('el voto de varias muestras sobrevive a una detección equivocada', async () => {
    // Dos muestras dicen 'en' y una se equivoca diciendo 'es' (el idioma
    // destino). Con una sola muestra, esa equivocación habría dejado el par en
    // es|es y toda la letra habría vuelto idéntica.
    const langs = ['en', 'es', 'en'];
    const urls: string[] = [];
    let detect = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        if (detect < 3) {
          const lang = langs[detect];
          detect += 1;
          return myMemoryOk('muestra', lang);
        }
        return myMemoryOk('linea traducida');
      }),
    );

    const result = await translateLines(VERSES, {
      provider: 'mymemory',
      apiKey: '',
      targetLang: 'es',
    });

    expect(result.ok).toBe(true);
    // Las traducciones se pidieron con el par correcto, no con es|es.
    expect(urls.slice(3).every((u) => u.includes('en%7Ces'))).toBe(true);
  });
});
