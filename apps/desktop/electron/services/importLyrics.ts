import * as path from 'node:path';
import type { TimedLyrics } from '../../src/types';
import { parseLrc, plainTextToLyrics } from './lrcParser';

const TITLE_TAG_RE = /^\s*\[ti:([^\]]*)\]\s*$/im;
const ARTIST_TAG_RE = /^\s*\[ar:([^\]]*)\]\s*$/im;
const LRC_TIMESTAMP_RE = /\[(?:\d{1,2}):(?:\d{2})(?:\.\d{2,3})?\]/;
const METADATA_LINE_RE =
  /^\s*\[(?:ar|ti|al|by|offset|length|re|ve|la|au|tool|key|language):[^\]]*\]\s*$/i;

export interface ImportedLyricsDocument {
  title: string;
  artist: string;
  lyrics: TimedLyrics;
}

function metadataValue(content: string, expression: RegExp): string | null {
  const value = expression.exec(content)?.[1]?.trim();
  return value ? value : null;
}

function filenameMetadata(fileName: string): { title: string; artist: string } {
  const base = path.basename(fileName, path.extname(fileName)).trim() || 'Letra importada';
  const separator = base.indexOf(' - ');
  if (separator <= 0 || separator >= base.length - 3) {
    return { title: base, artist: 'Archivo local' };
  }
  return {
    artist: base.slice(0, separator).trim(),
    title: base.slice(separator + 3).trim(),
  };
}

/**
 * Convierte un documento escogido por el usuario a TimedLyrics. El contenido
 * permanece local: esta función no consulta proveedores ni persiste la ruta.
 */
export function parseImportedLyrics(content: string, fileName: string): ImportedLyricsDocument {
  const normalized = content.replace(/^\uFEFF/, '');
  const fallback = filenameMetadata(fileName);
  const title = metadataValue(normalized, TITLE_TAG_RE) ?? fallback.title;
  const artist = metadataValue(normalized, ARTIST_TAG_RE) ?? fallback.artist;

  const parsedLrc = parseLrc(normalized);
  const synced = LRC_TIMESTAMP_RE.test(normalized) && parsedLrc.length > 0;
  const plainContent = normalized
    .split(/\r?\n/)
    .filter((line) => !METADATA_LINE_RE.test(line))
    .join('\n');
  const lines = synced ? parsedLrc : plainTextToLyrics(plainContent);
  if (lines.length === 0) {
    throw new Error('El archivo no contiene líneas de letra');
  }

  return {
    title,
    artist,
    lyrics: {
      lines,
      source: 'import-local',
      synced,
    },
  };
}
