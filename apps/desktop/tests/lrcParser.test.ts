import { describe, it, expect } from 'vitest';
import { parseLrc, plainTextToLyrics } from '../electron/services/lrcParser';

describe('parseLrc', () => {
  it('parsea timestamps estándar [mm:ss.xx]', () => {
    const lrc = `[00:12.34]First line
[01:05.00]Second line`;
    const lines = parseLrc(lrc);
    expect(lines).toEqual([
      { start_ms: 12_340, text: 'First line' },
      { start_ms: 65_000, text: 'Second line' },
    ]);
  });

  it('ignora tags de metadatos', () => {
    const lrc = `[ar:Queen]
[ti:Bohemian Rhapsody]
[00:01.00]Is this the real life?`;
    const lines = parseLrc(lrc);
    expect(lines).toEqual([{ start_ms: 1_000, text: 'Is this the real life?' }]);
  });

  it('crea una línea por cada timestamp en la misma fila', () => {
    const lrc = `[00:10.00][00:20.00]Repeated chorus`;
    const lines = parseLrc(lrc);
    expect(lines).toEqual([
      { start_ms: 10_000, text: 'Repeated chorus' },
      { start_ms: 20_000, text: 'Repeated chorus' },
    ]);
  });

  it('ordena por start_ms', () => {
    const lrc = `[00:30.00]Later
[00:05.00]Earlier`;
    const lines = parseLrc(lrc);
    expect(lines.map((l) => l.start_ms)).toEqual([5_000, 30_000]);
  });
});

describe('plainTextToLyrics', () => {
  it('convierte texto plano en líneas espaciadas', () => {
    const lines = plainTextToLyrics('Line one\nLine two\n\nLine three');
    expect(lines).toEqual([
      { start_ms: 0, text: 'Line one' },
      { start_ms: 5_000, text: 'Line two' },
      { start_ms: 10_000, text: 'Line three' },
    ]);
  });

  it('reparte las líneas sobre la duración de la pista cuando se provee', () => {
    // 3 líneas, duración 30 s → 15 s entre cada una.
    const lines = plainTextToLyrics('A\nB\nC', 30_000);
    expect(lines.map((l) => l.start_ms)).toEqual([0, 15_000, 30_000]);
  });

  it('cae al reparto fijo de 5 s/línea sin duración', () => {
    const lines = plainTextToLyrics('A\nB\nC');
    expect(lines.map((l) => l.start_ms)).toEqual([0, 5_000, 10_000]);
  });

  it('ignora durationMs inválido (cae al fijo)', () => {
    expect(plainTextToLyrics('A\nB', 0).map((l) => l.start_ms)).toEqual([0, 5_000]);
    expect(plainTextToLyrics('A\nB', -100).map((l) => l.start_ms)).toEqual([0, 5_000]);
  });

  it('una sola línea con duración → start 0', () => {
    const lines = plainTextToLyrics('Solo', 60_000);
    expect(lines).toEqual([{ start_ms: 0, text: 'Solo' }]);
  });
});

describe('parseLrc — Enhanced LRC (A2)', () => {
  it('popula words con timing por palabra', () => {
    const lrc = `[00:12.34]<00:12.34>愛<00:12.60>を<00:12.90>取り戻せ`;
    const lines = parseLrc(lrc);
    expect(lines.length).toBe(1);
    const line = lines[0];
    expect(line.start_ms).toBe(12_340);
    expect(line.text).toBe('愛を取り戻せ');
    expect(line.words).toEqual([
      { text: '愛', start_ms: 12_340 },
      { text: 'を', start_ms: 12_600 },
      { text: '取り戻せ', start_ms: 12_900 },
    ]);
  });

  it('LRC estándar sin timestamps inline → sin words', () => {
    const lrc = `[00:12.34]First line`;
    const lines = parseLrc(lrc);
    expect(lines[0].words).toBeUndefined();
    expect(lines[0].text).toBe('First line');
  });
});
