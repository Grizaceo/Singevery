import type { FuriganaSegment, TimedLyrics } from '../../src/types';
import { transliterate } from 'transliteration';
import { pinyin } from 'pinyin-pro';
import { romanize as hangulRomanize } from 'es-hangul';
import cyrillicToTranslitFactory from 'cyrillic-to-translit-js';

const HAS_KANA = /[\u3040-\u309F\u30A0-\u30FF]/;
const HAS_CJK = /[\u4E00-\u9FFF]/;
const HAS_KOREAN = /[\uAC00-\uD7AF]/;
const HAS_CYRILLIC = /[\u0400-\u04FF\u0500-\u052F]/;
const HAS_LATIN = /[A-Za-z\u00C0-\u024F]/;
const CYRILLIC_WORD_RE = /[\u0400-\u04FF\u0500-\u052F]+/g;
const KOREAN_WORD_RE = /[\uAC00-\uD7AF]+/g;
const CJK_CHAR_RE = /[\u4E00-\u9FFF]/;

/** Incrementar al cambiar el formato de anotaciones (furigana, kana, ruby multi-idioma). */
export const ANNOTATIONS_VERSION = 2;

type KuroshiroInstance = {
  convert: (
    text: string,
    options: { to: string; mode: string; romajiSystem?: string },
  ) => Promise<string>;
};

let kuroshiroPromise: Promise<KuroshiroInstance> | null = null;
let cyrillicConverter: ReturnType<typeof cyrillicToTranslitFactory> | null = null;

/** Tipo de tono para pinyin (configurable desde settings). */
let pinyinToneType: 'none' | 'symbol' = 'none';

export function setPinyinToneType(toneType: 'none' | 'symbol'): void {
  pinyinToneType = toneType;
}

export function getPinyinToneType(): 'none' | 'symbol' {
  return pinyinToneType;
}

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

function getCyrillicConverter(): ReturnType<typeof cyrillicToTranslitFactory> {
  if (!cyrillicConverter) {
    cyrillicConverter = cyrillicToTranslitFactory();
  }
  return cyrillicConverter;
}

/** Texto con muchos caracteres no latinos → romanizar para el teleprompter. */
export function needsRomanization(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (HAS_KANA.test(trimmed) || HAS_KOREAN.test(trimmed) || HAS_CYRILLIC.test(trimmed)) return true;

  // eslint-disable-next-line no-control-regex -- \x00-\x7F define el rango ASCII a propósito
  const nonLatin = (trimmed.match(/[^\x00-\x7F\s\d.,!?'"()[\]-]/g) ?? []).length;
  const latin = (trimmed.match(HAS_LATIN) ?? []).length;
  return nonLatin > 0 && nonLatin >= latin;
}

export function isJapanese(text: string): boolean {
  return HAS_KANA.test(text);
}

export function isKorean(text: string): boolean {
  return HAS_KOREAN.test(text);
}

export function isChinese(text: string): boolean {
  return HAS_CJK.test(text) && !HAS_KANA.test(text);
}

export function isCyrillic(text: string): boolean {
  return HAS_CYRILLIC.test(text);
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
      return hangulRomanize(text);
    }

    if (isChinese(text)) {
      return pinyin(text, {
        toneType: pinyinToneType,
        nonZh: 'consecutive',
        separator: ' ',
      });
    }

    if (isCyrillic(text)) {
      return getCyrillicConverter().transform(text);
    }

    return transliterate(text);
  } catch {
    return text;
  }
}

// ============================================================================
// Furigana / ruby + lecturas por línea.
//
// `furigana` almacena segmentos ruby para cualquier script (JP, RU, KO, ZH…).
// `romaji` es la romanización latina de la línea completa.
// `kana` es hiragana completo (solo japonés).
// ============================================================================

export interface LineReadings {
  /** Segmentos ruby: lectura encima del texto base (furigana, pinyin, etc.). */
  furigana?: FuriganaSegment[];
  /** Romanización latina de la línea (hepburn / pinyin / RR / cirílico→latín). */
  romaji?: string;
  /** Texto en hiragana (modo kana, solo japonés). */
  kana?: string;
}

const STRIP_TAGS_RE = /<[^>]*>/g;
const RP_BLOCK_RE = /<rp>[\s\S]*?<\/rp>/g;
const RUBY_RE = /<ruby>([\s\S]*?)<rt>([\s\S]*?)<\/rt>[\s\S]*?<\/ruby>/g;

function stripTags(s: string): string {
  return s.replace(STRIP_TAGS_RE, '');
}

/**
 * Parsea el HTML de furigana de kuroshiro (`<ruby>感<rp>(</rp><rt>かん</rt>…`)
 * a segmentos estructurados.
 */
export function parseFurigana(html: string): FuriganaSegment[] {
  const cleaned = html.replace(RP_BLOCK_RE, '');
  const segments: FuriganaSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(RUBY_RE.source, 'g');

  while ((match = re.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      const plain = stripTags(cleaned.slice(lastIndex, match.index));
      if (plain) segments.push({ base: plain });
    }
    const base = stripTags(match[1]);
    const rt = stripTags(match[2]);
    if (base) segments.push({ base, rt: rt || undefined });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < cleaned.length) {
    const plain = stripTags(cleaned.slice(lastIndex));
    if (plain) segments.push({ base: plain });
  }

  return segments;
}

/** Construye segmentos ruby emparejando palabras con una función de romanización. */
function buildWordRuby(
  text: string,
  wordRe: RegExp,
  romanizeWord: (word: string) => string,
): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  let lastIndex = 0;
  const re = new RegExp(wordRe.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ base: text.slice(lastIndex, match.index) });
    }
    const word = match[0];
    const rt = romanizeWord(word);
    segments.push({ base: word, rt: rt && rt !== word ? rt : undefined });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ base: text.slice(lastIndex) });
  }

  return segments;
}

function buildChineseRuby(text: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  for (const char of text) {
    if (CJK_CHAR_RE.test(char)) {
      const rt = pinyin(char, { toneType: pinyinToneType, nonZh: 'removed' });
      segments.push({ base: char, rt: rt || undefined });
    } else {
      segments.push({ base: char });
    }
  }
  return segments;
}

function buildFallbackRuby(text: string): FuriganaSegment[] | undefined {
  if (/\s/.test(text)) {
    const parts = text.split(/(\s+)/).filter((p) => p.length > 0);
    const segments: FuriganaSegment[] = parts.map((part) => {
      if (/^\s+$/.test(part) || !needsRomanization(part)) {
        return { base: part };
      }
      const rt = transliterate(part);
      return { base: part, rt: rt && rt !== part ? rt : undefined };
    });
    return segments.some((s) => s.rt) ? segments : undefined;
  }
  return undefined;
}

function cyrillicReadings(text: string): LineReadings {
  const converter = getCyrillicConverter();
  const romanizeWord = (word: string) => converter.transform(word);
  const furigana = buildWordRuby(text, CYRILLIC_WORD_RE, romanizeWord);
  const hasReading = furigana.some((seg) => seg.rt);
  return {
    romaji: converter.transform(text),
    furigana: hasReading ? furigana : undefined,
  };
}

function koreanReadings(text: string): LineReadings {
  const romanizeWord = (word: string) => hangulRomanize(word);
  const furigana = buildWordRuby(text, KOREAN_WORD_RE, romanizeWord);
  const hasReading = furigana.some((seg) => seg.rt);
  const romajiParts: string[] = [];
  for (const seg of furigana) {
    if (seg.rt) romajiParts.push(seg.rt);
    else if (seg.base.trim()) romajiParts.push(seg.base.trim());
  }
  return {
    romaji: romajiParts.join(' ').replace(/\s+/g, ' ').trim() || hangulRomanize(text),
    furigana: hasReading ? furigana : undefined,
  };
}

function chineseReadings(text: string): LineReadings {
  const furigana = buildChineseRuby(text);
  const hasReading = furigana.some((seg) => seg.rt);
  return {
    romaji: pinyin(text, {
      toneType: pinyinToneType,
      nonZh: 'consecutive',
      separator: ' ',
    }),
    furigana: hasReading ? furigana : undefined,
  };
}

function fallbackReadings(text: string): LineReadings {
  const furigana = buildFallbackRuby(text);
  return {
    romaji: transliterate(text),
    furigana,
  };
}

async function computeReadings(text: string): Promise<LineReadings> {
  if (!needsRomanization(text)) return {};

  try {
    if (isJapanese(text)) {
      const kuroshiro = await getKuroshiro();
      const [romaji, furiganaHtml, kana] = await Promise.all([
        kuroshiro.convert(text, {
          to: 'romaji',
          mode: 'spaced',
          romajiSystem: 'hepburn',
        }),
        kuroshiro.convert(text, { to: 'hiragana', mode: 'furigana' }),
        kuroshiro.convert(text, { to: 'hiragana', mode: 'normal' }),
      ]);
      const furigana = parseFurigana(furiganaHtml);
      const hasReading = furigana.some((seg) => seg.rt);
      const readings: LineReadings = { romaji, kana: kana !== text ? kana : undefined };
      if (hasReading) readings.furigana = furigana;
      return readings;
    }

    if (isKorean(text)) return koreanReadings(text);
    if (isChinese(text)) return chineseReadings(text);
    if (isCyrillic(text)) return cyrillicReadings(text);
    return fallbackReadings(text);
  } catch {
    return {};
  }
}

const readingCache = new Map<string, LineReadings>();
const READING_CACHE_MAX = 4000;

export async function analyzeLine(text: string): Promise<LineReadings> {
  const cacheKey = `${pinyinToneType}:${text}`;
  const cached = readingCache.get(cacheKey);
  if (cached) return cached;
  const readings = await computeReadings(text);
  if (readingCache.size >= READING_CACHE_MAX) readingCache.clear();
  readingCache.set(cacheKey, readings);
  return readings;
}

/** Quita anotaciones de una letra cacheada para re-procesarla. */
export function stripReadings(lyrics: TimedLyrics): TimedLyrics {
  return {
    ...lyrics,
    annotationsVersion: undefined,
    lines: lyrics.lines.map(({ text, start_ms, end_ms, words }) => ({
      text,
      start_ms,
      end_ms,
      words,
    })),
  };
}

export function needsReannotation(lyrics: TimedLyrics): boolean {
  return (lyrics.annotationsVersion ?? 0) < ANNOTATIONS_VERSION;
}

export async function romanizeTimedLyrics(lyrics: TimedLyrics): Promise<TimedLyrics> {
  const lines = await Promise.all(
    lyrics.lines.map(async (line) => {
      const readings = await analyzeLine(line.text);
      return { ...line, ...readings };
    }),
  );
  return { ...lyrics, lines, annotationsVersion: ANNOTATIONS_VERSION };
}
