import { describe, expect, it } from 'vitest';
import {
  assembleReferenceBuffer,
  chunksToSegments,
  type CaptureSegment,
} from '../src/audio/referenceAssembly';

const SR = 1000; // 1 muestra = 1 ms: fácil de razonar.

/** Segmento útil con `n` muestras (frecuencia constante 1). */
function useful(n: number, durationMs?: number): CaptureSegment {
  return { samples: new Float32Array(n).fill(1), durationMs: durationMs ?? n };
}

describe('assembleReferenceBuffer — regresión F3 (silencios intermedios)', () => {
  it('útil → silencio → útil conserva la posición real del segundo segmento', () => {
    // 3 s de audio útil, 2 s de silencio, 3 s de audio útil.
    const buf = assembleReferenceBuffer(
      [useful(3000), { samples: null, durationMs: 2000 }, useful(3000)],
      SR,
    );
    expect(buf.length).toBe(8000);
    // Primer segmento en 0..2999.
    expect(buf[0]).toBe(1);
    expect(buf[2999]).toBe(1);
    // Silencio en 3000..4999.
    expect(buf[3000]).toBe(0);
    expect(buf[4999]).toBe(0);
    // Segundo segmento en 5000..7999 (NO en 3000..5999 como antes del fix).
    expect(buf[5000]).toBe(1);
    expect(buf[7999]).toBe(1);
  });

  it('sin silencios, el buffer es la concatenación directa', () => {
    const buf = assembleReferenceBuffer([useful(1000), useful(1000)], SR);
    expect(buf.length).toBe(2000);
    expect(buf[999]).toBe(1);
    expect(buf[1000]).toBe(1);
  });

  it('todo silencio produce un buffer de ceros con la duración total', () => {
    const buf = assembleReferenceBuffer(
      [{ samples: null, durationMs: 5000 }],
      SR,
    );
    expect(buf.length).toBe(5000);
    expect(buf.every((v) => v === 0)).toBe(true);
  });

  it('segmento útil más corto que su duración declarada deja el resto en cero', () => {
    const buf = assembleReferenceBuffer([useful(500, 1000)], SR);
    expect(buf.length).toBe(1000);
    expect(buf[499]).toBe(1);
    expect(buf[500]).toBe(0);
  });
});

describe('chunksToSegments', () => {
  it('marca como silencio los chunks bajo el umbral', () => {
    const segs = chunksToSegments(
      [
        { samples: new Float32Array(10), level: 0.5, durationMs: 1000 },
        { samples: new Float32Array(10), level: 0.001, durationMs: 1000 },
      ],
      0.005,
    );
    expect(segs[0].samples).not.toBeNull();
    expect(segs[1].samples).toBeNull();
    expect(segs[1].durationMs).toBe(1000);
  });
});
