import { describe, it, expect } from 'vitest';
import { needsRomanization, romanizeText } from '../electron/services/romanize';

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
