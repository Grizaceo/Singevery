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

  it('parsea Enhanced LRC (A2): palabras con timestamp <mm:ss.xx>', () => {
    const lrc = `[00:12.00]<00:12.34>First <00:12.67>line`;
    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line.start_ms).toBe(12_000);
    expect(line.text).toBe('First line');
    expect(line.words).toEqual([
      { start_ms: 12_340, text: 'First ' },
      { start_ms: 12_670, text: 'line' },
    ]);
  });

  it('la concatenación de palabras reconstruye el texto', () => {
    const lrc = `[00:10.00]<00:10.10>音 <00:10.40>楽`;
    const line = parseLrc(lrc)[0];
    expect(line.words!.map((w) => w.text).join('')).toBe(line.text);
  });

  it('una línea sin marcadores de palabra no lleva words', () => {
    const lrc = `[00:12.00]Plain line`;
    const line = parseLrc(lrc)[0];
    expect(line.words).toBeUndefined();
  });

  it('soporta timestamps con 3 cifras de fracción', () => {
    const lrc = `[00:01.000]<00:01.234>hi`;
    const line = parseLrc(lrc)[0];
    expect(line.words).toEqual([{ start_ms: 1234, text: 'hi' }]);
  });

  it('línea con solo marcadores de palabra (sin [..]) usa la 1ª palabra', () => {
    const lrc = `<00:05.00>only words`;
    const line = parseLrc(lrc)[0];
    expect(line.start_ms).toBe(5_000);
    expect(line.words).toEqual([{ start_ms: 5_000, text: 'only words' }]);
  });

  // LRCLIB a veces empaqueta la letra original Y su romanización en el mismo
  // LRC, cada bloque arrancando de nuevo en ~00:00 (visto en canciones JP).
  // Sin manejo, el sort las intercala línea a línea.
  it('doble bloque (original + romaji): conserva solo el primer bloque', () => {
    const lrc = `[00:01.00]無敵の笑顔で荒らすメディア
[01:10.00]知りたいその秘密ミステリアス
[03:20.00]愛してる
[00:01.00]Muteki no egao de arasu media
[01:10.00]Shiritai sono himitsu misuteriasu
[03:20.00]Aishiteru`;
    const lines = parseLrc(lrc);
    expect(lines.map((l) => l.text)).toEqual([
      '無敵の笑顔で荒らすメディア',
      '知りたいその秘密ミステリアス',
      '愛してる',
    ]);
  });

  it('doble bloque: un primer bloque residual no gana al bloque real', () => {
    const lrc = `[03:50.00]outro suelto
[00:01.00]Line one
[00:05.00]Line two
[00:09.00]Line three
[01:00.00]Line four`;
    const lines = parseLrc(lrc);
    expect(lines.map((l) => l.text)).toEqual(['Line one', 'Line two', 'Line three', 'Line four']);
  });

  it('multi-tag de coro no dispara la detección de bloques', () => {
    const lrc = `[00:10.00][02:00.00]Coro repetido
[00:12.00]Verso uno
[00:20.00]Verso dos
[02:10.00]Final`;
    const lines = parseLrc(lrc);
    expect(lines.map((l) => l.start_ms)).toEqual([10_000, 12_000, 20_000, 120_000, 130_000]);
  });

  it('retroceso menor (desorden) no parte bloques: solo reordena', () => {
    const lrc = `[00:30.00]Later
[00:05.00]Earlier
[00:40.00]Last`;
    const lines = parseLrc(lrc);
    expect(lines.map((l) => l.text)).toEqual(['Earlier', 'Later', 'Last']);
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
});
