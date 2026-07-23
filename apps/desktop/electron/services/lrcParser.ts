import type { LyricLine, LyricWord } from '../../src/types';

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
const WORD_TS_RE = /<(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?>/g;
const METADATA_TAG_RE = /^\[(?:ar|ti|al|by|offset|length|re|ve|la|au|tool|key|language):[^\]]*\]$/i;

function timestampToMs(minutes: string, seconds: string, fraction?: string): number {
  const frac = fraction ?? '0';
  const msFrac =
    frac.length === 2 ? parseInt(frac, 10) * 10 : parseInt(frac.padEnd(3, '0').slice(0, 3), 10);
  return parseInt(minutes, 10) * 60_000 + parseInt(seconds, 10) * 1_000 + msFrac;
}

/**
 * Extrae las palabras con timestamp de `lineContent` (la línea ya sin los
 * timestamps de línea `[..]`). Cada marcador `<mm:ss.xx>` precede a su
 * palabra; el texto de la palabra es lo que hay entre el marcador y el
 * siguiente (o hasta el final). Devuelve null si no hay marcadores de palabra.
 */
function parseWords(lineContent: string): LyricWord[] | null {
  const markers: { start: number; end: number; ms: number }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(WORD_TS_RE.source, 'g');
  while ((m = re.exec(lineContent)) !== null) {
    markers.push({
      start: m.index,
      end: m.index + m[0].length,
      ms: timestampToMs(m[1], m[2], m[3]),
    });
  }
  if (markers.length === 0) return null;

  const words: LyricWord[] = [];
  for (let i = 0; i < markers.length; i++) {
    const from = markers[i].end;
    const to = i + 1 < markers.length ? markers[i + 1].start : lineContent.length;
    const text = lineContent.slice(from, to);
    // Descarta palabras vacías (marcadores pegados).
    if (text.length === 0) continue;
    words.push({ start_ms: markers[i].ms, text });
  }
  return words.length > 0 ? words : null;
}

/** Retroceso de timestamp (vs el máximo visto) que se interpreta como
 *  reinicio de timeline — un bloque nuevo de letra — y no desorden menor. */
const BLOCK_RESTART_DROP_MS = 60_000;

/** Línea cruda parseada: su timestamp mínimo (para detectar reinicios de
 *  timeline en orden de archivo) y las entradas que expande (multi-tag). */
interface RawParsedLine {
  minTs: number;
  entries: LyricLine[];
}

/**
 * Algunas fuentes (p. ej. LRCLIB con canciones JP/KO/ZH) empaquetan DOS o más
 * letras completas en el MISMO LRC — la original y su romanización — una tras
 * otra, cada una arrancando de nuevo cerca de 00:00. El sort final las
 * intercalaría línea a línea (cada verso dos veces, el resaltado saltando
 * entre alfabetos y "perdiéndose" a mitad de canción). Se detecta el reinicio
 * (retroceso brusco del timestamp en orden de archivo) y se conserva el primer
 * bloque sustancial (el original; la romanización local ya la agrega el app).
 */
function selectPrimaryBlock(rawLines: RawParsedLine[]): RawParsedLine[] {
  const blocks: RawParsedLine[][] = [];
  let current: RawParsedLine[] = [];
  let maxMin = Number.NEGATIVE_INFINITY;
  for (const line of rawLines) {
    if (current.length > 0 && line.minTs < maxMin - BLOCK_RESTART_DROP_MS) {
      blocks.push(current);
      current = [];
      maxMin = Number.NEGATIVE_INFINITY;
    }
    current.push(line);
    maxMin = Math.max(maxMin, line.minTs);
  }
  if (current.length > 0) blocks.push(current);
  if (blocks.length <= 1) return rawLines;

  // Primer bloque con al menos la mitad de líneas que el mayor: evita elegir
  // un fragmento residual, pero prefiere el bloque original sobre su copia.
  const biggest = Math.max(...blocks.map((block) => block.length));
  return blocks.find((block) => block.length >= biggest * 0.5) ?? blocks[0];
}

/** Parsea LRC sincronizado a líneas con start_ms. Ignora tags de metadatos.
 *  Soporta Enhanced LRC (A2): marcadores inline `<mm:ss.xx>` → words[].
 *  Si el LRC trae varias letras concatenadas (original + romaji), conserva
 *  solo el primer bloque (ver selectPrimaryBlock). */
export function parseLrc(lrc: string): LyricLine[] {
  const rawLines: RawParsedLine[] = [];

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

    // Contenido sin los timestamps de línea; sobre él se buscan las palabras.
    const lineContent = line.replace(TIMESTAMP_RE, '');
    const words = parseWords(lineContent);
    const text = lineContent.replace(WORD_TS_RE, '').trim();

    if (timestamps.length === 0) {
      // Línea con solo marcadores de palabra (sin `[..]`): usa la 1ª palabra.
      if (words && words.length > 0) {
        rawLines.push({
          minTs: words[0].start_ms,
          entries: [{ start_ms: words[0].start_ms, text, words }],
        });
      }
      continue;
    }
    if (!text && !words) continue;

    const entries: LyricLine[] = timestamps.map((start_ms) => {
      const entry: LyricLine = { start_ms, text };
      if (words) entry.words = words;
      return entry;
    });
    rawLines.push({ minTs: Math.min(...timestamps), entries });
  }

  const lines = selectPrimaryBlock(rawLines).flatMap((raw) => raw.entries);
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
