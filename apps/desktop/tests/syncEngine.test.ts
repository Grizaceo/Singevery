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

  it('expone current_line_progress interpolado dentro de la línea', () => {
    const model = engine.getRenderModel(1500);
    // Línea 2: start 1000, end 2000 → a 1500 va por la mitad.
    expect(model.current_line.text).toBe('Line 2');
    expect(model.current_line_progress).toBeCloseTo(0.5);
  });

  it('progreso 0 al inicio de la línea y ~1 justo antes del final', () => {
    // A los 1000 empieza la línea 2 → progreso 0.
    expect(engine.getRenderModel(1000).current_line_progress).toBe(0);
    // A los 1999 la línea 2 (1000–2000) está a punto de terminar → ~1.
    expect(engine.getRenderModel(1999).current_line_progress).toBeCloseTo(0.999, 2);
    // A los 2000 cae en la línea 3 → progreso 0 de esa línea.
    expect(engine.getRenderModel(2000).current_line_progress).toBe(0);
  });

  it('sin end_ms estima el progreso con la siguiente línea', () => {
    const noEnd: TimedLyrics = {
      source: 'Test',
      synced: true,
      lines: [
        { start_ms: 0, text: 'A' },
        { start_ms: 2000, text: 'B' },
      ],
    };
    const e = new SyncEngine();
    e.setLyrics(noEnd);
    // Línea A: start 0, sin end → usa 2000 (siguiente). A 1000 → 0.5.
    expect(e.getRenderModel(1000).current_line_progress).toBeCloseTo(0.5);
  });
});

describe('SyncEngine — modo palabra (A2)', () => {
  const a2Lyrics: TimedLyrics = {
    source: 'Test',
    synced: true,
    lines: [
      {
        start_ms: 10_000,
        end_ms: 10_500,
        text: 'First line',
        words: [
          { start_ms: 10_000, text: 'First ' },
          { start_ms: 10_200, text: 'line' },
        ],
      },
    ],
  };

  it('selecciona la palabra activa según positionMs', () => {
    const e = new SyncEngine();
    e.setLyrics(a2Lyrics);
    // Antes de la primera palabra: sin palabra activa.
    expect(e.getRenderModel(9_000).current_word_index).toBeUndefined();
    // En la primera palabra (start 10000): activa la 0.
    expect(e.getRenderModel(10_000).current_word_index).toBe(0);
    // En la segunda palabra (start 10200): activa la 1.
    expect(e.getRenderModel(10_200).current_word_index).toBe(1);
    expect(e.getRenderModel(10_400).current_word_index).toBe(1);
  });

  it('calcula el avance dentro de la palabra activa', () => {
    const e = new SyncEngine();
    e.setLyrics(a2Lyrics);
    // Palabra 0: 10000 → 10200. A 10100 → mitad.
    const m = e.getRenderModel(10_100);
    expect(m.current_word_index).toBe(0);
    expect(m.current_word_progress).toBeCloseTo(0.5);
  });

  it('el fin de la última palabra usa el fin de la línea', () => {
    const e = new SyncEngine();
    e.setLyrics(a2Lyrics);
    // Palabra 1: 10200 → 10500 (fin de línea). A 10350 → mitad.
    const m = e.getRenderModel(10_350);
    expect(m.current_word_index).toBe(1);
    expect(m.current_word_progress).toBeCloseTo(0.5, 1);
  });

  it('la línea actual expone las palabras en el RenderLine', () => {
    const e = new SyncEngine();
    e.setLyrics(a2Lyrics);
    expect(e.getRenderModel(10_100).current_line.words).toEqual(a2Lyrics.lines[0].words);
  });
});
