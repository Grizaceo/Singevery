import type { TimedLyrics } from '../../src/types';
import { transliterate } from 'transliteration';
import { pinyin } from 'pinyin-pro';

const HAS_KANA = /[\u3040-\u309F\u30A0-\u30FF]/;
const HAS_CJK = /[\u4E00-\u9FFF]/;
const HAS_KOREAN = /[\uAC00-\uD7AF]/;
const HAS_LATIN = /[A-Za-z\u00C0-\u024F]/;

type KuroshiroInstance = {
  convert: (
    text: string,
    options: { to: string; mode: string; romajiSystem?: string },
  ) => Promise<string>;
};

let kuroshiroPromise: Promise<KuroshiroInstance> | null = null;

async function getKuroshiro(): Promise<KuroshiroInstance> {
  if (!kuroshiroPromise) {
    kuroshiroPromise = (async () => {
      const KuroshiroModule = await import('kuroshiro');
      const AnalyzerModule = await import('kuroshiro-analyzer-kuromoji');
      const Kuroshiro = KuroshiroModule.default;
      const KuromojiAnalyzer = AnalyzerModule.default;
      const instance = new Kuroshiro();
      await instance.init(new KuromojiAnalyzer());
      return instance;
    })();
  }
  return kuroshiroPromise;
}

/** Texto con muchos caracteres no latinos → romanizar para el teleprompter. */
export function needsRomanization(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (HAS_KANA.test(trimmed) || HAS_KOREAN.test(trimmed)) return true;

  const nonLatin = (trimmed.match(/[^\x00-\x7F\s\d.,!?'"()[\]-]/g) ?? []).length;
  const latin = (trimmed.match(HAS_LATIN) ?? []).length;
  return nonLatin > 0 && nonLatin >= latin;
}

function isJapanese(text: string): boolean {
  return HAS_KANA.test(text);
}

function isKorean(text: string): boolean {
  return HAS_KOREAN.test(text);
}

function isChinese(text: string): boolean {
  return HAS_CJK.test(text) && !HAS_KANA.test(text);
}

export async function romanizeText(text: string): Promise<string> {
  if (!needsRomanization(text)) return text;

  try {
    if (isJapanese(text)) {
      const kuroshiro = await getKuroshiro();
      return await kuroshiro.convert(text, {
        to: 'romaji',
        mode: 'spaced',
        romajiSystem: 'hepburn',
      });
    }

    if (isKorean(text)) {
      return transliterate(text);
    }

    if (isChinese(text)) {
      return pinyin(text, { toneType: 'none', nonZh: 'consecutive', separator: ' ' });
    }

    return transliterate(text);
  } catch {
    return text;
  }
}

export async function romanizeTimedLyrics(lyrics: TimedLyrics): Promise<TimedLyrics> {
  const lines = await Promise.all(
    lyrics.lines.map(async (line) => ({
      ...line,
      text: await romanizeText(line.text),
    })),
  );
  return { ...lyrics, lines };
}
