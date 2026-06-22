// ============================================================================
// lineHighlight — helpers puras de render para el resaltado interpolado
// dentro de la línea actual (karaoke por tiempo, P2.6).
//
// El motor (SyncEngine) entrega `current_line_progress` (0..1); aquí dividimos
// el texto/segmentos mostrados en la parte ya "cantada" y la pendiente, sin
// tocar el DOM directamente (funciones puras, testeables). El modo palabra
// (A2, P2.7) reemplaza este avance lineal por saltos exactos por palabra.
// ============================================================================

import type { FuriganaSegment } from './types';

/** Recorta un string a la fracción dada: [parte cantada, parte pendiente]. */
export function splitAtFraction(text: string, fraction: number): [string, string] {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= 0) return ['', text];
  if (f >= 1) return [text, ''];
  const cut = Math.round(text.length * f);
  return [text.slice(0, cut), text.slice(cut)];
}

/**
 * Divide los segmentos de furigana en cantados/pendientes según la fracción.
 * Avanza por segmento entero (cada segmento suele ser un kanji/grupo), por lo
 * que el resaltado es discreto a esta resolución — la precisión por palabra
 * (A2) cubre el caso de saltos exactos. El segmento de frontera se asigna
 * completo al cantar o no según su posición central.
 */
export function splitSegmentsAtFraction(
  segments: FuriganaSegment[],
  fraction: number,
): { spoken: FuriganaSegment[]; unspoken: FuriganaSegment[] } {
  const f = Math.max(0, Math.min(1, fraction));
  if (segments.length === 0) return { spoken: [], unspoken: [] };
  // Índice del primer segmento pendiente: redondea para que el avance sea
  // perceptible a mitad de cada segmento.
  const boundary = Math.round(segments.length * f);
  return {
    spoken: segments.slice(0, boundary),
    unspoken: segments.slice(boundary),
  };
}