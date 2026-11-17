import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  __setEnglishDictionaryForTests,
  englishToIpa,
  isEnglishDictionaryLoaded,
  loadEnglishDictionary,
} from '../electron/services/phonetics/english';

// ===========================================================================
// Motor IPA de inglés: CMUdict (ARPAbet) → IPA, inglés general EE. UU.
// ===========================================================================

describe('englishToIpa — diccionario REAL (CMUdict)', () => {
  beforeAll(async () => {
    await loadEnglishDictionary();
  });

  it('el diccionario queda cargado tras loadEnglishDictionary', () => {
    expect(isEnglishDictionaryLoaded()).toBe(true);
  });

  it('transcribe palabras de ejemplo con su acento de diccionario', () => {
    expect(englishToIpa('hello')).toBe('həˈloʊ');
    expect(englishToIpa('water')).toBe('ˈwɔtɚ');
    expect(englishToIpa('bottle')).toBe('ˈbɑtəl');
    expect(englishToIpa('the')).toBe('ðə');
    expect(englishToIpa('crack')).toBe('kɹæk');
    expect(englishToIpa("don't")).toBe('doʊnt');
    expect(englishToIpa("i'm")).toBe('aɪm');
  });

  it('conserva puntuación, espacios y mayúsculas del entorno', () => {
    expect(englishToIpa('Hello, world!')).toBe('həˈloʊ, wɝld!');
  });

  it('marca el acento delante del ataque de la sílaba, no siempre al inicio', () => {
    // "today": la primera vocal es átona; el ˈ cae delante de D (ataque de EY).
    expect(englishToIpa('today')).toBe('təˈdeɪ');
    // "afternoon": ˌ secundario en la primera vocal y ˈ en la última.
    expect(englishToIpa('afternoon')).toBe('ˌæftɚˈnun');
  });

  it('resuelve la -in\' cantada buscando la forma en -ing', () => {
    expect(englishToIpa("runnin'")).toBe('ˈɹʌnɪn');
  });

  it('devuelve las palabras fuera del diccionario tal cual', () => {
    expect(englishToIpa('skrrt')).toBe('skrrt');
    expect(englishToIpa('Skrrt boi')).toBe('Skrrt boi');
  });
});

describe('englishToIpa — sin diccionario cargado', () => {
  afterEach(() => {
    __setEnglishDictionaryForTests(null);
  });

  it('devuelve cadena vacía (quien llama decide no anotar)', () => {
    __setEnglishDictionaryForTests(null);
    expect(isEnglishDictionaryLoaded()).toBe(false);
    expect(englishToIpa('hello')).toBe('');
  });
});

describe('englishToIpa — diccionario de prueba (casos borde)', () => {
  afterEach(() => {
    __setEnglishDictionaryForTests(null);
  });

  it('transcribe cada parte de una palabra con guion y une con guion', () => {
    __setEnglishDictionaryForTests({
      well: 'W EH1 L',
      known: 'N OW1 N',
    });
    // Una sola vocal por palabra → sin marca de acento (regla del motor).
    expect(englishToIpa('well-known')).toBe('wɛl-noʊn');
  });

  it('la parte fuera del diccionario de un compuesto queda tal cual', () => {
    __setEnglishDictionaryForTests({ well: 'W EH1 L' });
    expect(englishToIpa('well-skrtek')).toBe('wɛl-skrtek');
  });

  it('acepta el apóstrofo tipográfico y las entradas contraídas', () => {
    __setEnglishDictionaryForTests({ "don't": 'D OW1 N T' });
    expect(englishToIpa('don’t')).toBe('doʊnt');
  });

  it('prueba sin apóstrofos iniciales/finales si la forma exacta no está', () => {
    __setEnglishDictionaryForTests({ til: 'T IH1 L', rock: 'R AA1 K', n: 'EH1 N' });
    // 'til → til; 'n' → n (el apóstrofo interno de "rock 'n' roll" no une:
    // cada palabra se busca por separado).
    expect(englishToIpa("'til")).toBe('tɪl');
    expect(englishToIpa("'n'")).toBe('ɛn');
  });

  it('la -in\' sin forma en -ing en el diccionario queda OOV', () => {
    __setEnglishDictionaryForTests({ hello: 'HH AH0 L OW1' });
    // "somethin'" no está y "something" tampoco: se devuelve tal cual.
    expect(englishToIpa("somethin'")).toBe("somethin'");
  });

  it('una palabra de una vocal no lleva marca de acento', () => {
    __setEnglishDictionaryForTests({ read: 'R IY1 D' });
    expect(englishToIpa('read')).toBe('ɹid');
  });
});
