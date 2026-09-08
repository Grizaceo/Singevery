// ============================================================================
// referenceAssembly.ts — ensamblaje del buffer de captura de referencia
// conservando las posiciones temporales REALES de cada segmento.
//
// Fix del audit F3 (2026-09-08): antes se concatenaban los chunks útiles
// consecutivamente y los silencios se agregaban TODOS al final del buffer.
// Con útil A → silencio → útil B, B quedaba adelantado (en la posición que
// ocupaba el silencio) y la melodía se descorrelacionaba de la canción.
//
// Ahora cada segmento (útil o silencio) conserva su duración real y su orden
// cronológico: los silencios se materializan como ceros EN SU POSICIÓN, y el
// tiempo del buffer combinado = tiempo real transcurrido de la canción.
//
// Puro y testeable: no toca audio ni DOM.
// ============================================================================

export interface CaptureSegment {
  /** Muestras de audio útil, o null para un segmento de silencio. */
  samples: Float32Array | null;
  /** Duración real del segmento en ms (tiempo de pared de la canción). */
  durationMs: number;
}

/**
 * Concatena los segmentos de captura en un solo buffer, insertando CEROS en
 * las posiciones de los segmentos nulos (silencio). El tiempo dentro del
 * buffer resultante es el tiempo REAL transcurrido de la canción.
 */
export function assembleReferenceBuffer(
  segments: CaptureSegment[],
  sampleRate: number,
): Float32Array {
  const totalSamples = segments.reduce(
    (acc, s) => acc + Math.round((s.durationMs * sampleRate) / 1000),
    0,
  );
  const out = new Float32Array(totalSamples);
  let offset = 0;
  for (const seg of segments) {
    const len = Math.round((seg.durationMs * sampleRate) / 1000);
    if (seg.samples) {
      // El segmento útil puede ser más corto que su duración declarada
      // (redondeos): copiar lo que haya y dejar el resto en cero.
      out.set(seg.samples.subarray(0, len), offset);
    }
    offset += len;
  }
  return out;
}

/**
 * Convierte una secuencia de chunks de captura (con su nivel) en segmentos
 * cronológicos. Los chunks bajo `silenceLevel` se marcan como silencio.
 */
export function chunksToSegments(
  chunks: Array<{ samples: Float32Array | null; level: number; durationMs: number }>,
  silenceLevel = 0.005,
): CaptureSegment[] {
  return chunks.map((c) => ({
    samples: c.level < silenceLevel ? null : c.samples,
    durationMs: c.durationMs,
  }));
}
