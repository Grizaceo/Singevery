import { describe, it, expect } from 'vitest';
import { needsRomanization, romanizeText, parseFurigana } from '../electron/services/romanize';

describe('romanize', () => {
  it('detecta texto japonés como romanizable', () => {
    expect(needsRomanization('愛を取り戻せ')).toBe(true);
    expect(needsRomanization('Hello world')).toBe(false);
  });

  it('deja texto latino sin cambios', async () => {
    await expect(romanizeText('Is this the real life?')).resolves.toBe(
      'Is this the real life?',
    );
  });

  it('romaniza chino a pinyin', async () => {
    const result = await romanizeText('你好');
    expect(result.toLowerCase()).toMatch(/ni.*hao/);
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
