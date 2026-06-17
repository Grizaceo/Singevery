// ============================================================================
// Tests del SyncEngine — porte fiel de tests/test_sync_engine.py a Vitest.
// Verifica que la lógica de ventaneo (línea previa/actual/siguiente según
// position_ms) se comporta igual que el engine Python original.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SyncEngine } from '../electron/core/syncEngine';
import type { TimedLyrics } from '../src/types';

describe('SyncEngine', () => {
  let engine: SyncEngine;
  const sampleLyrics: TimedLyrics = {
    source: 'Test',
    synced: true,
    lines: [
      { start_ms: 0, end_ms: 1000, text: 'Line 1' },
      { start_ms: 1000, end_ms: 2000, text: 'Line 2' },
      { start_ms: 2000, end_ms: 3000, text: 'Line 3' },
      { start_ms: 3000, end_ms: 4000, text: 'Line 4' },
    ],
  };

  beforeEach(() => {
    engine = new SyncEngine();
    engine.setLyrics(sampleLyrics);
  });

  it('devuelve la línea 1 a los 500ms', () => {
    const model = engine.getRenderModel(500);
    expect(model.current_line.text).toBe('Line 1');
    expect(model.next_lines).toEqual([{ text: 'Line 2' }, { text: 'Line 3' }]);
  });

  it('devuelve la línea 2 a los 1500ms con contexto', () => {
    const model = engine.getRenderModel(1500);
    expect(model.current_line.text).toBe('Line 2');
    expect(model.previous_lines).toEqual([{ text: 'Line 1' }]);
    expect(model.next_lines).toEqual([{ text: 'Line 3' }, { text: 'Line 4' }]);
  });

  it('devuelve la línea 4 al final sin próximas', () => {
    const model = engine.getRenderModel(3500);
    expect(model.current_line.text).toBe('Line 4');
    expect(model.next_lines).toEqual([]);
  });

  it('calcula el avance interpolado dentro de la línea (synced)', () => {
    expect(engine.getRenderModel(500).current_progress).toBeCloseTo(0.5); // Line 1: 0–1000
    expect(engine.getRenderModel(1250).current_progress).toBeCloseTo(0.25); // Line 2: 1000–2000
    expect(engine.getRenderModel(0).current_progress).toBeCloseTo(0);
  });

  it('no expone avance con letra no sincronizada', () => {
    const plain = new SyncEngine();
    plain.setLyrics({
      source: 'test',
      synced: false,
      lines: [
        { start_ms: 0, text: 'a' },
        { start_ms: 5000, text: 'b' },
      ],
    });
    expect(plain.getRenderModel(1000).current_progress).toBeUndefined();
  });

  it('devuelve NO_LYRICS cuando no hay letra cargada', () => {
    const empty = new SyncEngine();
    const model = empty.getRenderModel(0);
    expect(model.status).toBe('NO_LYRICS');
    expect(model.current_line.text).toBe('');
  });

  it('muestra "..." en el intro instrumental', () => {
    // 500ms antes de la primera línea que empieza en 0 no aplica; uso una
    // letra con intro para este caso.
    const withIntro: TimedLyrics = {
      source: 'Test',
      synced: true,
      lines: [{ start_ms: 5000, end_ms: 8000, text: 'Primera' }],
    };
    const e = new SyncEngine();
    e.setLyrics(withIntro);
    const model = e.getRenderModel(1000);
    expect(model.current_line.text).toBe('...');
    expect(model.next_lines).toEqual([{ text: 'Primera' }]);
    expect(model.status).toBe('IDLE');
  });

  it('calcula current_word_index con Enhanced LRC (A2)', () => {
    const a2: TimedLyrics = {
      source: 'Test',
      synced: true,
      lines: [
        {
          start_ms: 10_000,
          end_ms: 14_000,
          text: '愛を取り戻せ',
          words: [
            { text: '愛', start_ms: 10_000 },
            { text: 'を', start_ms: 10_600 },
            { text: '取り戻せ', start_ms: 10_900 },
          ],
        },
      ],
    };
    const e = new SyncEngine();
    e.setLyrics(a2);

    // Antes de la 1ª palabra → -1 (ninguna cantada).
    expect(e.getRenderModel(10_000).current_word_index).toBe(0); // exactamente en 10s cae la 1ª
    expect(e.getRenderModel(10_550).current_word_index).toBe(0); // solo la 1ª
    expect(e.getRenderModel(10_700).current_word_index).toBe(1); // 1ª y 2ª
    expect(e.getRenderModel(11_000).current_word_index).toBe(2); // las tres
    // Propaga words a la current_line del render.
    expect(e.getRenderModel(10_700).current_line.words?.length).toBe(3);
  });

  it('sin words → current_word_index undefined (cae a interpolación)', () => {
    expect(engine.getRenderModel(500).current_word_index).toBeUndefined();
  });
});
