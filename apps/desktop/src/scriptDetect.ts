/** Detección de script para etiquetas de UI y heurísticas de lectura. */

const HAS_KANA = /[\u3040-\u309F\u30A0-\u30FF]/;
const HAS_CJK = /[\u4E00-\u9FFF]/;
const HAS_KOREAN = /[\uAC00-\uD7AF]/;
const HAS_CYRILLIC = /[\u0400-\u04FF\u0500-\u052F]/;

export type ScriptHint = 'japanese' | 'korean' | 'chinese' | 'cyrillic' | 'latin' | 'other';

/** Infiere el script predominante de un fragmento de texto. */
export function detectScript(text: string): ScriptHint {
  const trimmed = text.trim();
  if (!trimmed) return 'latin';
  if (HAS_KANA.test(trimmed)) return 'japanese';
  if (HAS_KOREAN.test(trimmed)) return 'korean';
  if (HAS_CJK.test(trimmed)) return 'chinese';
  if (HAS_CYRILLIC.test(trimmed)) return 'cyrillic';
  // eslint-disable-next-line no-control-regex -- ASCII a propósito
  if (/[^\x00-\x7F\s\d.,!?'"()[\]-]/.test(trimmed)) return 'other';
  return 'latin';
}

/** Detecta el script de una canción a partir de varias líneas visibles. */
export function detectScriptFromLines(texts: string[]): ScriptHint {
  const counts = new Map<ScriptHint, number>();
  for (const text of texts) {
    const script = detectScript(text);
    counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  let best: ScriptHint = 'latin';
  let bestCount = 0;
  for (const [script, count] of counts) {
    if (script === 'latin') continue;
    if (count > bestCount) {
      best = script;
      bestCount = count;
    }
  }
  if (bestCount > 0) return best;
  return 'latin';
}
