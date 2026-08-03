import { describe, expect, it } from 'vitest';
import { parseImportedLyrics } from '../electron/services/importLyrics';

describe('parseImportedLyrics', () => {
  it('importa LRC sincronizado y respeta su metadata', () => {
    const result = parseImportedLyrics(
      '[ar:Utada Hikaru]\n[ti:First Love]\n[00:01.20]最後のキスは',
      'archivo.lrc',
    );

    expect(result.artist).toBe('Utada Hikaru');
    expect(result.title).toBe('First Love');
    expect(result.lyrics.synced).toBe(true);
    expect(result.lyrics.lines[0]).toEqual({ start_ms: 1_200, text: '最後のキスは' });
  });

  it('obtiene artista y título desde "Artista - Canción.txt"', () => {
    const result = parseImportedLyrics('Uno\nDos', 'Aimer - Ref:rain.txt');

    expect(result.artist).toBe('Aimer');
    expect(result.title).toBe('Ref:rain');
    expect(result.lyrics.synced).toBe(false);
    expect(result.lyrics.lines).toHaveLength(2);
  });

  it('rechaza archivos vacíos', () => {
    expect(() => parseImportedLyrics('\n\n', 'vacío.txt')).toThrow(
      'El archivo no contiene líneas de letra',
    );
  });

  it('no convierte metadata sin timestamps en líneas visibles', () => {
    const result = parseImportedLyrics('[ar:Artista]\n[ti:Título]\nTexto', 'archivo.txt');
    expect(result.lyrics.lines).toEqual([{ start_ms: 0, text: 'Texto' }]);
  });

  it('rechaza un archivo que sólo contiene metadata', () => {
    expect(() => parseImportedLyrics('[ar:Artista]\n[ti:Título]', 'archivo.txt')).toThrow(
      'El archivo no contiene líneas de letra',
    );
  });
});
