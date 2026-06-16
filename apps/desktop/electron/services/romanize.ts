import type { FuriganaSegment, TimedLyrics } from '../../src/types';
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

  // eslint-disable-next-line no-control-regex -- \x00-\x7F define el rango ASCII a propósito
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

// ============================================================================
// Furigana + lecturas por línea (Fase 2).
//
// A diferencia de romanizeText (que devuelve solo romaji), aquí AÑADIMOS las
// ayudas de lectura SIN destruir el texto original: `furigana` (segmentos para
// renderizar ruby) y `romaji`. El renderer decide cuál mostrar según el modo.
// ============================================================================

export interface LineReadings {
  furigana?: FuriganaSegment[];
  romaji?: string;
}

const STRIP_TAGS_RE = /<[^>]*>/g;
// Los <rp>(</rp> son paréntesis de fallback de ruby; se quitan junto a su
// contenido para no contaminar el texto base.
const RP_BLOCK_RE = /<rp>[\s\S]*?<\/rp>/g;
const RUBY_RE = /<ruby>([\s\S]*?)<rt>([\s\S]*?)<\/rt>[\s\S]*?<\/ruby>/g;

function stripTags(s: string): string {
  return s.replace(STRIP_TAGS_RE, '');
}

/**
 * Parsea el HTML de furigana de kuroshiro (`<ruby>感<rp>(</rp><rt>かん</rt>…`)
 * a segmentos estructurados. Quita TODA etiqueta del texto base y de la lectura,
 * de modo que ningún HTML de la letra (fuente externa) llegue al renderer:
 * el render usa solo contenido de texto, sin dangerouslySetInnerHTML.
 */
export function parseFurigana(html: string): FuriganaSegment[] {
  // Quitar los paréntesis de fallback antes de parsear: deja <ruby>感<rt>かん</rt></ruby>.
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

async function computeReadings(text: string): Promise<LineReadings> {
  if (!needsRomanization(text)) return {};

  try {
    if (isJapanese(text)) {
      const kuroshiro = await getKuroshiro();
      const romaji = await kuroshiro.convert(text, {
        to: 'romaji',
        mode: 'spaced',
        romajiSystem: 'hepburn',
      });
      const furiganaHtml = await kuroshiro.convert(text, { to: 'hiragana', mode: 'furigana' });
      const furigana = parseFurigana(furiganaHtml);
      // Solo vale la pena si hay al menos una lectura (rt); si no, es kana puro.
      const hasReading = furigana.some((seg) => seg.rt);
      return { romaji, furigana: hasReading ? furigana : undefined };
    }

    if (isKorean(text)) return { romaji: transliterate(text) };

    if (isChinese(text)) {
      return { romaji: pinyin(text, { toneType: 'none', nonZh: 'consecutive', separator: ' ' }) };
    }

    return { romaji: transliterate(text) };
  } catch {
    return {};
  }
}

// Caché por texto de línea: la romanización es determinista y kuroshiro es
// pesado; evita reprocesar líneas repetidas y recargas de la misma canción.
const readingCache = new Map<string, LineReadings>();
const READING_CACHE_MAX = 4000;

export async function analyzeLine(text: string): Promise<LineReadings> {
  const cached = readingCache.get(text);
  if (cached) return cached;
  const readings = await computeReadings(text);
  if (readingCache.size >= READING_CACHE_MAX) readingCache.clear();
  readingCache.set(text, readings);
  return readings;
}

export async function romanizeTimedLyrics(lyrics: TimedLyrics): Promise<TimedLyrics> {
  const lines = await Promise.all(
    lyrics.lines.map(async (line) => {
      const readings = await analyzeLine(line.text);
      return { ...line, ...readings }; // conserva line.text original
    }),
  );
  return { ...lyrics, lines };
}
