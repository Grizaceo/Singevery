// ============================================================================
// matchLog.test.ts — bitácora de aciertos del reconocimiento (loop de mejora).
// ============================================================================
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MatchLog } from '../electron/core/matchLog';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matchlog-test-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('MatchLog', () => {
  it('escribe entradas append-only en JSONL con timestamp', () => {
    const log = new MatchLog(dir);
    log.log({ type: 'identify', source: 'audd', outcome: 'matched', track: { title: 'T', artist: 'A' } });
    log.log({ type: 'feedback', source: 'audd', outcome: 'wrong' });

    const raw = fs.readFileSync(path.join(dir, 'matchlog.jsonl'), 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]);
    expect(first.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.type).toBe('identify');
    expect(first.source).toBe('audd');
    expect(first.outcome).toBe('matched');
    expect(first.track).toEqual({ title: 'T', artist: 'A' });
  });

  it('agrega stats de acierto por fuente y feedback del usuario', () => {
    const log = new MatchLog(dir);
    log.log({ type: 'identify', source: 'audd', outcome: 'matched' });
    log.log({ type: 'identify', source: 'audd', outcome: 'matched' });
    log.log({ type: 'identify', source: 'audd', outcome: 'no_match' });
    log.log({ type: 'identify', source: 'shazam', outcome: 'error' });
    log.log({ type: 'feedback', source: 'audd', outcome: 'correct' });
    log.log({ type: 'feedback', source: 'audd', outcome: 'wrong' });

    const stats = log.getStats();
    expect(stats.matched).toBe(2);
    expect(stats.noMatch).toBe(1);
    expect(stats.errors).toBe(1);
    expect(stats.correctFeedback).toBe(1);
    expect(stats.wrongFeedback).toBe(1);
    // matched / (matched + noMatch + errors) = 2/4
    expect(stats.accuracy).toBeCloseTo(0.5);
    expect(stats.bySource.audd).toEqual({ total: 3, matched: 2 });
    expect(stats.bySource.shazam).toEqual({ total: 1, matched: 0 });
    expect(stats.lastEntry?.type).toBe('feedback');
  });

  it('tolerancia: una línea corrupta no tumba el resto del log', () => {
    const log = new MatchLog(dir);
    log.log({ type: 'identify', source: 'audd', outcome: 'matched' });
    // Corrompe la última línea (corte a mitad de escritura).
    fs.appendFileSync(path.join(dir, 'matchlog.jsonl'), '{"ts": "2026-08-03T00:00:00.000Z", "ty', 'utf8');

    const stats = log.getStats();
    expect(stats.matched).toBe(1);
    expect(stats.total).toBe(1); // la línea corrupta se omite
  });

  it('stats vacías cuando no hay log todavía', () => {
    const log = new MatchLog(dir);
    const stats = log.getStats();
    expect(stats.total).toBe(0);
    expect(stats.accuracy).toBe(0);
    expect(stats.bySource).toEqual({});
    expect(stats.lastEntry).toBeNull();
  });
});
