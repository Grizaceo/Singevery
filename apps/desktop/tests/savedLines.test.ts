import { describe, expect, it } from 'vitest';
import { savedLineFromModel, savedLinesToCsv, toggleSavedLine } from '../src/useSavedLines';
import type { RenderModel } from '../src/types';

const model: RenderModel = {
  previous_lines: [],
  current_line: {
    text: '夢を見ていた',
    romaji: 'yume o miteita',
    translation: 'Estaba soñando',
    start_ms: 12_000,
  },
  next_lines: [],
  font_scale: 1,
  opacity: 1,
  alignment: 'center',
  mirror_mode: false,
  text_color: '#ffffff',
  track_title: 'Canción, prueba',
  track_artist: 'Artista "A"',
  status: 'DISPLAYING',
};

describe('líneas guardadas', () => {
  it('crea una ficha de aprendizaje desde la línea actual', () => {
    const saved = savedLineFromModel(model, new Date('2026-08-01T12:00:00.000Z'))!;
    expect(saved.text).toBe('夢を見ていた');
    expect(saved.reading).toBe('yume o miteita');
    expect(saved.translation).toBe('Estaba soñando');
    expect(saved.positionMs).toBe(12_000);
  });

  it('alterna una línea sin duplicarla', () => {
    const saved = savedLineFromModel(model)!;
    expect(toggleSavedLine([], saved)).toEqual([saved]);
    expect(toggleSavedLine([saved], saved)).toEqual([]);
  });

  it('exporta CSV escapando comas y comillas', () => {
    const csv = savedLinesToCsv([savedLineFromModel(model)!]);
    expect(csv).toContain('"Canción, prueba"');
    expect(csv).toContain('"Artista ""A"""');
    expect(csv).toContain('"yume o miteita"');
  });

  it('neutraliza fórmulas al exportar a una hoja de cálculo', () => {
    const saved = { ...savedLineFromModel(model)!, text: '=HYPERLINK("https://example.test")' };
    expect(savedLinesToCsv([saved])).toContain(`"'=HYPERLINK(""https://example.test"")"`);
  });
});
