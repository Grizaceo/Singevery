// ============================================================================
// lyricsCleaner.ts — saneo de letras PLAIN (no sincronizadas) de fuentes web.
//
// Las fuentes plain (AudD findLyrics, lyrics.ovh, Genius) devuelven texto con
// ruido: headers de sección ([Verse 1], [Chorus]), etiquetas de embed de
// Genius ([Embed], [?]), entidades HTML sin decodificar, newlines de más.
// Esta función pura lo limpia antes de que plainTextToLyrics lo reparta por
// duración. Función pura (testeable, sin IO).
// ============================================================================

const SECTION_HEADER_RE = /^\[[^\]]*\]$/;
// Headers de sección comunes que SÍ aportan estructura pero no son letra.
// Los quitamos porque no se "cantan" y rompen el reparto por duración.
const KEEP_AS_EMPTY = /^\s*$/;

/** Decodifica las entidades HTML más comunes que dejan las fuentes web. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    });
}

/**
 * Limpia letra plain: quita headers de sección y ruido de Genius, decodifica
 * entidades HTML, colapsa newlines redundantes. Conserva las líneas en blanco
 * intencionales (separan estrofas) pero no más de 2 seguidas.
 */
export function cleanPlainLyrics(raw: string): string {
  if (!raw) return '';
  const decoded = decodeEntities(raw);
  const lines = decoded.split(/\r\n|\r|\n/);

  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Quitar headers de sección: [Verse 1], [Chorus], [Intro], [Outro],
    // [Bridge], [Hook], [Pre-Chorus], [Instrumental], etc. También [Embed],
    // [?] y [Produced by ...] que añade Genius.
    if (SECTION_HEADER_RE.test(trimmed)) {
      // Conservamos saltos de estrofa: un header quita la línea pero si la
      // siguiente también está vacía no la duplicamos (colapso abajo lo arregla).
      continue;
    }
    out.push(trimmed);
  }

  // Colapsar 3+ newlines en 2 (separan estrofas sin saturar) y recortar extremos.
  const joined = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return joined;
}

/** Versión "vacía" útil: letras que solo tenían headers/separadores → string vacío. */
export function isEmptyLyrics(text: string): boolean {
  return !text || KEEP_AS_EMPTY.test(text);
}