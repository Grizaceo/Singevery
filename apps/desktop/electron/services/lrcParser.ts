import type { LyricLine, WordTiming } from '../../src/types';

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
const METADATA_TAG_RE = /^\[(?:ar|ti|al|by|offset|length|re|ve|la|au|tool|key|language):[^\]]*\]$/i;

// Enhanced LRC (A2): timestamps inline tipo <mm:ss.xx> dentro de la línea.
// Ej: [00:12.34]<00:12.34>愛<00:12.60>を<00:12.90>取り戻せ
const WORD_TS_RE = /<(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?>/g;

function timestampToMs(minutes: string, seconds: string, fraction?: string): number {
  const frac = fraction ?? '0';
  const msFrac =
    frac.length === 2 ? parseInt(frac, 10) * 10 : parseInt(frac.padEnd(3, '0').slice(0, 3), 10);
  return parseInt(minutes, 10) * 60_000 + parseInt(seconds, 10) * 1_000 + msFrac;
}

/**
 * Parsea los timestamps inline <mm:ss.xx> de una línea Enhanced LRC (A2).
 * Devuelve {text, words} donde `text` es la línea sin los <> y `words` lista
 * cada fragmento con su start_ms. Si no hay timestamps inline, words = null.
 */
function parseEnhancedWords(line: string): { text: string; words: WordTiming[] | null } {
  if (!WORD_TS_RE.test(line)) {
    WORD_TS_RE.lastIndex = 0;
    return { text: line, words: null };
  }
  WORD_TS_RE.lastIndex = 0;

  // Recorremos la línea trozando por cada <ts>: cada match inicia un fragmento
  // que corre hasta el siguiente <ts>. El texto entre ts es el "word".
  const words: WordTiming[] = [];
  const textParts: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let pendingStart: number | null = null;
  let pendingText = '';

  while ((match = WORD_TS_RE.exec(line)) !== null) {
    const ts = timestampToMs(match[1], match[2], match[3]);
    // El texto entre el cursor anterior y este match pertenece al fragmento previo.
    const between = line.slice(cursor, match.index);
    if (pendingStart !== null) {
      pendingText += between;
    } else {
      // Texto antes del primer <ts>: va al text base pero no es una "word" timed.
      textParts.push(between);
    }
    cursor = match.index + match[0].length;

    // Cerrar el fragmento pendiente si ya había uno abierto.
    if (pendingStart !== null && pendingText.trim() !== '') {
      words.push({ text: pendingText, start_ms: pendingStart });
    }
    pendingStart = ts;
    pendingText = '';
  }

  // Cola tras el último <ts>.
  const tail = line.slice(cursor);
  if (pendingStart !== null) {
    pendingText += tail;
    if (pendingText.trim() !== '') words.push({ text: pendingText, start_ms: pendingStart });
  } else {
    textParts.push(tail);
  }

  // `text` = el contenido legible completo de la línea. Preferimos reconstruirlo
  // desde las words (texto sin los <ts>), que es lo que el renderer muestra como
  // línea principal. Si no hubo words, usamos textParts (texto antes/después).
  const text = words.length > 0 ? words.map((w) => w.text).join('') : textParts.join('');
  return { text: text.trim(), words: words.length > 0 ? words : null };
}

/** Parsea LRC sincronizado a líneas con start_ms. Ignora tags de metadatos.
 *  Detecta Enhanced LRC (A2): si una línea tiene timestamps inline <mm:ss.xx>,
 *  los popula en `words` para karaoke por palabra preciso. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const rawLine of lrc.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (METADATA_TAG_RE.test(line)) continue;

    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    const tsRe = new RegExp(TIMESTAMP_RE.source, 'g');
    while ((match = tsRe.exec(line)) !== null) {
      timestamps.push(timestampToMs(match[1], match[2], match[3]));
    }

    // Quita los timestamps de línea [..] pero deja los inline <..> para parseEnhancedWords.
    const lineWithoutLineTs = line.replace(TIMESTAMP_RE, '').trim();
    if (timestamps.length === 0 || !lineWithoutLineTs) continue;

    // Enhanced LRC: timestamps inline por palabra.
    const { text, words } = parseEnhancedWords(lineWithoutLineTs);

    for (const start_ms of timestamps) {
      lines.push({ start_ms, text, ...(words ? { words } : {}) });
    }
  }

  lines.sort((a, b) => a.start_ms - b.start_ms);
  return lines;
}

/**
 * Convierte letra plana (sin timestamps) en líneas espaciadas para visualización.
 * Si se conoce la duración total de la pista (ms), reparte las líneas
 * uniformemente sobre ella; si no, cae al reparto fijo histórico (5 s/línea).
 */
export function plainTextToLyrics(text: string, durationMs?: number): LyricLine[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  // Reparto uniforme sobre la duración: n líneas → (n-1) intervalos, así la
  // última cae cerca del final de la pista. Sin duración, 5 s/línea fijo.
  const n = lines.length;
  const step =
    durationMs && durationMs > 0 && n > 1
      ? durationMs / (n - 1)
      : 5_000;

  return lines.map((line, index) => ({
    start_ms: Math.round(index * step),
    text: line,
  }));
}