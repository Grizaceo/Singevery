import type { LyricLine } from '../../src/types';

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
const METADATA_TAG_RE = /^\[(?:ar|ti|al|by|offset|length|re|ve|la|au|tool|key|language):[^\]]*\]$/i;

function timestampToMs(minutes: string, seconds: string, fraction?: string): number {
  const frac = fraction ?? '0';
  const msFrac =
    frac.length === 2 ? parseInt(frac, 10) * 10 : parseInt(frac.padEnd(3, '0').slice(0, 3), 10);
  return parseInt(minutes, 10) * 60_000 + parseInt(seconds, 10) * 1_000 + msFrac;
}

/** Parsea LRC sincronizado a líneas con start_ms. Ignora tags de metadatos. */
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

    const text = line.replace(TIMESTAMP_RE, '').trim();
    if (timestamps.length === 0 || !text) continue;

    for (const start_ms of timestamps) {
      lines.push({ start_ms, text });
    }
  }

  lines.sort((a, b) => a.start_ms - b.start_ms);
  return lines;
}

/** Convierte letra plana (sin timestamps) en líneas espaciadas para visualización. */
export function plainTextToLyrics(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => ({
      start_ms: index * 5_000,
      text: line,
    }));
}
