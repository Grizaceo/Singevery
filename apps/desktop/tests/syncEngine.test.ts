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
    expect(model.current_line).toBe('Line 1');
    expect(model.next_lines).toEqual(['Line 2', 'Line 3']);
  });

  it('devuelve la línea 2 a los 1500ms con contexto', () => {
    const model = engine.getRenderModel(1500);
    expect(model.current_line).toBe('Line 2');
    expect(model.previous_lines).toEqual(['Line 1']);
    expect(model.next_lines).toEqual(['Line 3', 'Line 4']);
  });

  it('devuelve la línea 4 al final sin próximas', () => {
    const model = engine.getRenderModel(3500);
    expect(model.current_line).toBe('Line 4');
    expect(model.next_lines).toEqual([]);
  });

  it('devuelve NO_LYRICS cuando no hay letra cargada', () => {
    const empty = new SyncEngine();
    const model = empty.getRenderModel(0);
    expect(model.status).toBe('NO_LYRICS');
    expect(model.current_line).toBe('');
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
    expect(model.current_line).toBe('...');
    expect(model.next_lines).toEqual(['Primera']);
    expect(model.status).toBe('IDLE');
  });
});
