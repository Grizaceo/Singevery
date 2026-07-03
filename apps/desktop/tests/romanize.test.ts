import { describe, it, expect } from 'vitest';
import {
  needsRomanization,
  romanizeText,
  parseFurigana,
  isCyrillic,
  isKorean,
  isChinese,
  analyzeLine,
  needsReannotation,
  stripReadings,
  ANNOTATIONS_VERSION,
} from '../electron/services/romanize';
import { detectScript, detectScriptFromLines } from '../src/scriptDetect';

describe('romanize', () => {
  it('detecta texto japonés como romanizable', () => {
    expect(needsRomanization('愛を取り戻せ')).toBe(true);
    expect(needsRomanization('Hello world')).toBe(false);
  });

  it('detecta cirílico como romanizable', () => {
    expect(needsRomanization('Привет мир')).toBe(true);
    expect(isCyrillic('Привет')).toBe(true);
  });

  it('detecta coreano como romanizable', () => {
    expect(needsRomanization('안녕하세요')).toBe(true);
    expect(isKorean('안녕')).toBe(true);
  });

  it('deja texto latino sin cambios', async () => {
    await expect(romanizeText('Is this the real life?')).resolves.toBe(
      'Is this the real life?',
    );
  });

  it('romaniza chino a pinyin', async () => {
    const result = await romanizeText('你好');
    expect(result.toLowerCase()).toMatch(/ni.*hao/);
    expect(isChinese('你好')).toBe(true);
  });

  it('romaniza ruso a latín', async () => {
    const result = await romanizeText('Привет');
    expect(result.toLowerCase()).toMatch(/privet/);
  });

  it('romaniza coreano con romanización revisada', async () => {
    const result = await romanizeText('안녕');
    expect(result.toLowerCase()).toMatch(/annyeong/);
  });

  it('genera ruby por palabra en cirílico', async () => {
    const readings = await analyzeLine('Привет');
    expect(readings.furigana?.some((s) => s.base === 'Привет' && s.rt)).toBe(true);
    expect(readings.romaji?.toLowerCase()).toMatch(/privet/);
  });

  it('genera ruby por palabra en coreano', async () => {
    const readings = await analyzeLine('안녕');
    expect(readings.furigana?.some((s) => s.rt)).toBe(true);
    expect(readings.romaji?.toLowerCase()).toMatch(/annyeong/);
  });

  it('genera ruby por carácter en chino', async () => {
    const readings = await analyzeLine('你好');
    expect(readings.furigana?.length).toBeGreaterThanOrEqual(2);
    expect(readings.furigana?.every((s) => s.base.length === 1)).toBe(true);
  });

  it('versionado de anotaciones detecta entradas viejas', () => {
    expect(needsReannotation({ lines: [], source: 'x', synced: true })).toBe(true);
    expect(
      needsReannotation({
        lines: [],
        source: 'x',
        synced: true,
        annotationsVersion: ANNOTATIONS_VERSION,
      }),
    ).toBe(false);
  });

  it('stripReadings quita anotaciones pero conserva texto', () => {
    const stripped = stripReadings({
      lines: [{ start_ms: 0, text: 'Привет', furigana: [{ base: 'x' }], romaji: 'Privet' }],
      source: 'x',
      synced: true,
      annotationsVersion: 1,
    });
    expect(stripped.lines[0]).toEqual({ start_ms: 0, text: 'Привет' });
    expect(stripped.annotationsVersion).toBeUndefined();
  });
});

describe('parseFurigana', () => {
  it('extrae base + lectura de los bloques <ruby> de kuroshiro', () => {
    const html =
      '<ruby>感<rp>(</rp><rt>かん</rt><rp>)</rp></ruby>じ<ruby>取<rp>(</rp><rt>と</rt><rp>)</rp></ruby>れたら';
    const segments = parseFurigana(html);
    expect(segments).toEqual([
      { base: '感', rt: 'かん' },
      { base: 'じ' },
      { base: '取', rt: 'と' },
      { base: 'れたら' },
    ]);
  });

  it('texto sin ruby queda como un único segmento de base', () => {
    expect(parseFurigana('ただのかな')).toEqual([{ base: 'ただのかな' }]);
  });

  it('descarta cualquier HTML del texto (no inyecta markup al renderer)', () => {
    const segments = parseFurigana('<script>alert(1)</script>あ');
    const joined = segments.map((s) => s.base).join('');
    expect(joined).not.toContain('<');
    expect(joined).toContain('あ');
  });
});

describe('scriptDetect', () => {
  it('detecta scripts por línea', () => {
    expect(detectScript('愛してる')).toBe('japanese');
    expect(detectScript('Привет')).toBe('cyrillic');
    expect(detectScript('안녕')).toBe('korean');
    expect(detectScript('你好')).toBe('chinese');
    expect(detectScript('Hello')).toBe('latin');
  });

  it('elige el script predominante en varias líneas', () => {
    expect(detectScriptFromLines(['Hello', 'Привет', 'мир'])).toBe('cyrillic');
  });
});
