import { afterAll, describe, expect, it } from 'vitest';
import { IPA_GUIDE, ipaGuideText, ipaSymbolsIn } from '../src/ipaGuide';
import { kanaToIpa } from '../electron/services/ipa';
import { spanishToIpa } from '../electron/services/phonetics/spanish';
import { italianToIpa } from '../electron/services/phonetics/italian';
import { frenchToIpa } from '../electron/services/phonetics/french';
import { germanToIpa } from '../electron/services/phonetics/german';
import {
  __setEnglishDictionaryForTests,
  englishToIpa,
} from '../electron/services/phonetics/english';

// ===========================================================================
// Guía de símbolos IPA: tokenización y cobertura sobre los motores reales.
// ===========================================================================

describe('ipaSymbolsIn — tokenización', () => {
  it('los diptongos ingleses salen como una sola unidad', () => {
    expect(ipaSymbolsIn('naɪt')).toEqual(['n', 'aɪ', 't']);
    expect(ipaSymbolsIn('həˈloʊ')).toEqual(['h', 'ə', 'ˈ', 'l', 'oʊ']);
    expect(ipaSymbolsIn('aɪm')).toEqual(['aɪ', 'm']);
  });

  it('los africados y africadas salen como una sola unidad', () => {
    expect(ipaSymbolsIn('tʃiko')).toEqual(['tʃ', 'i', 'k', 'o']);
    expect(ipaSymbolsIn('dʑi')).toEqual(['dʑ', 'i']);
    expect(ipaSymbolsIn('tsɯ')).toEqual(['ts', 'ɯ']);
  });

  it('los diacríticos tienen ficha propia', () => {
    expect(ipaSymbolsIn('kʲa')).toEqual(['k', 'ʲ', 'a']);
    expect(ipaSymbolsIn('notːe')).toEqual(['n', 'o', 't', 'ː', 'e']);
    expect(ipaSymbolsIn('bɔ̃')).toEqual(['b', 'ɔ', '̃']);
    expect(ipaSymbolsIn('ˈwɔtɚ ˌæftɚ')).toEqual(['ˈ', 'w', 'ɔ', 't', 'ɚ', 'ˌ', 'æ', 'f']);
  });

  it('deduplica conservando el orden de aparición', () => {
    expect(ipaSymbolsIn('sasa')).toEqual(['s', 'a']);
    expect(ipaSymbolsIn('oʊ oʊ')).toEqual(['oʊ']);
  });

  it('ignora espacios, puntuación y dígitos', () => {
    expect(ipaSymbolsIn('a1, b!')).toEqual(['a', 'b']);
    // El punto es puntuación de la letra, no separador silábico: se ignora.
    expect(ipaSymbolsIn('  ˈx.y  ')).toEqual(['ˈ', 'x', 'y']);
  });

  it('devuelve también los caracteres sin ficha (para detectarlos)', () => {
    expect(ipaSymbolsIn('qx')).toEqual(['q', 'x']);
    expect(IPA_GUIDE['q']).toBeUndefined();
  });
});

describe('IPA_GUIDE — fichas bilingües', () => {
  it('cada ficha tiene texto en inglés y en español, sin campos vacíos', () => {
    for (const [sym, entry] of Object.entries(IPA_GUIDE)) {
      expect(entry.es.desc.trim(), `es.desc de ${sym}`).not.toBe('');
      expect(entry.es.ejemplo.trim(), `es.ejemplo de ${sym}`).not.toBe('');
      expect(entry.en.desc.trim(), `en.desc de ${sym}`).not.toBe('');
      expect(entry.en.example.trim(), `en.example de ${sym}`).not.toBe('');
    }
  });

  it('ipaGuideText devuelve la ficha del idioma pedido', () => {
    expect(ipaGuideText(IPA_GUIDE['θ'], 'en').desc).toContain("'th' in 'think'");
    expect(ipaGuideText(IPA_GUIDE['ɾ'], 'en').desc).toContain("'tt' in American 'butter'");
    expect(ipaGuideText(IPA_GUIDE['r'], 'en').desc).toContain("Spanish 'perro'");
    expect(ipaGuideText(IPA_GUIDE['θ'], 'es')).toEqual({
      desc: IPA_GUIDE['θ'].es.desc,
      example: IPA_GUIDE['θ'].es.ejemplo,
    });
  });
});

// --- Corpus de cobertura -----------------------------------------------------

// Todas las moras del motor japonés (MORA + yōon + katakana extranjero) en un
// solo texto: si kanaToIpa emite un símbolo sin ficha, este test lo pilla.
const KANA_ALL =
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんっー' +
  'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ' +
  'ぁぃぅぇぉゃゅょゎゐゑゔ' +
  'きゃきゅきょしゃしゅしょちゃちゅちょにゃにゅにょひゃひゅひょみゃみゅみょりゃりゅりょ' +
  'ぎゃぎゅぎょじゃじゅじょぢゃぢゅぢょびゃびゅびょぴゃぴゅぴょてゃてゅてょでゃでゅでょ' +
  'ヴァヴィヴェヴォヴュファフィフェフォフュティディトゥドゥシェチェジェツァツィツェツォスィズィ' +
  'ウィウェウォクァクィクェクォグァグィグェグォヷヸヹヺ';

const ROMANCE = [
  // español (seseo + distintas reglas): vibrantes, palatales, nasales, s→z
  spanishToIpa(
    'El niño lloró en el campo; vida, hombre, lavar, nada, donde, amigo, gente, ' +
      'agua, tango, enviar, mismo, desde, noche, año, perro, rosa, queso, guitarra, ' +
      'pingüino, día, aire, bien, cuatro, hueso, ahora, corazón, cielo, qué, ahí',
  ),
  // italiano: palatalización, geminación, vocales abiertas
  italianToIpa(
    'cielo gente perché ghiaccio figlia sogno scena bella notte pizza faccio oggi ' +
      'gnocchi è però casa sole piano cuore quando amore figlio',
  ),
  // francés: nasales, dígrafos, finales mudas, -ill-
  frenchToIpa(
    'chanson pain non un rien loin bonne ami beau amour toi nuit coeur je belle vie ' +
      'vraiment chantent chat fille ville tu exclusion',
  ),
  // alemán: ich/ach-Laut, cantidad, diptongos, -er/-e finales
  germanToIpa(
    'Nacht auch ich durch Milch Stadt Welt Sohn Saat Liebe mein Freude Vater singen ' +
      'und alles Straße schön Sonne Zeit ich-laut Sprichwort',
  ),
];

// Diccionario de prueba que cubre TODOS los fonemas ARPAbet (vocales con sus
// variantes de acento y consonantes), para que el motor inglés emita cada
// símbolo que puede producir.
const EN_PHONEMES = [
  'AA1', 'AE1', 'AH0', 'AH1', 'AO1', 'AW1', 'AY1', 'EH1', 'ER0', 'ER1', 'EY1',
  'IH1', 'IY1', 'OW1', 'OY1', 'UH1', 'UW1',
  'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N', 'NG', 'P',
  'R', 'S', 'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH',
];

const EN_DICT: Record<string, string> = {};
EN_PHONEMES.forEach((phone, i) => {
  // Nombre de palabra sin dígitos (WORD_RE no los admite): letras a..z, aa..
  const name = String.fromCharCode(97 + (i % 26)) + (i >= 26 ? 'a' : '');
  EN_DICT[name] = phone;
});
// Palabra multisílaba con acento primario Y secundario para ˈ y ˌ.
EN_DICT['multistress'] = 'P AO2 K AH0 T IH1 L';

describe('ipaSymbolsIn — completitud sobre los motores reales', () => {
  afterAll(() => {
    __setEnglishDictionaryForTests(null);
  });

  it('todo símbolo del japonés (kanaToIpa) tiene ficha', () => {
    const ipa = kanaToIpa(KANA_ALL);
    expect(ipa.length).toBeGreaterThan(0);
    for (const sym of ipaSymbolsIn(ipa)) {
      expect(IPA_GUIDE[sym], `símbolo japonés sin ficha: ${sym}`).toBeDefined();
    }
  });

  it('todo símbolo del español tiene ficha', () => {
    for (const sym of ipaSymbolsIn(ROMANCE[0])) {
      expect(IPA_GUIDE[sym], `símbolo español sin ficha: ${sym}`).toBeDefined();
    }
  });

  it('todo símbolo del italiano tiene ficha', () => {
    for (const sym of ipaSymbolsIn(ROMANCE[1])) {
      expect(IPA_GUIDE[sym], `símbolo italiano sin ficha: ${sym}`).toBeDefined();
    }
  });

  it('todo símbolo del francés tiene ficha', () => {
    for (const sym of ipaSymbolsIn(ROMANCE[2])) {
      expect(IPA_GUIDE[sym], `símbolo francés sin ficha: ${sym}`).toBeDefined();
    }
  });

  it('todo símbolo del alemán tiene ficha', () => {
    for (const sym of ipaSymbolsIn(ROMANCE[3])) {
      expect(IPA_GUIDE[sym], `símbolo alemán sin ficha: ${sym}`).toBeDefined();
    }
  });

  it('todo símbolo del inglés (todos los fonemas ARPAbet) tiene ficha', () => {
    __setEnglishDictionaryForTests(EN_DICT);
    const ipa = englishToIpa([...Object.keys(EN_DICT)].join(' '));
    expect(ipa.length).toBeGreaterThan(0);
    for (const sym of ipaSymbolsIn(ipa)) {
      expect(IPA_GUIDE[sym], `símbolo inglés sin ficha: ${sym}`).toBeDefined();
    }
  });
});
