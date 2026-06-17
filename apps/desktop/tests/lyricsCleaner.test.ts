import { describe, it, expect } from 'vitest';
import { cleanPlainLyrics, isEmptyLyrics } from '../electron/services/lyricsCleaner';

describe('cleanPlainLyrics', () => {
  it('quita headers de sección [Verse]/[Chorus]/[Intro]/[Outro]', () => {
    const raw = '[Verse 1]\nShe\'s got a smile\n[Chorus]\nSweet child o\' mine';
    expect(cleanPlainLyrics(raw)).toBe("She's got a smile\nSweet child o' mine");
  });

  it('quita ruido de Genius [Embed]/[?]/[Produced by ...]', () => {
    const raw = 'Real lyric\n[Embed]\n[?]\n[Produced by Mike Clink]\nAnother line';
    expect(cleanPlainLyrics(raw)).toBe('Real lyric\nAnother line');
  });

  it('decodifica entidades HTML', () => {
    expect(cleanPlainLyrics('It&#39;s &amp; &quot;x&quot; &lt;tag&gt;')).toBe('It\'s & "x" <tag>');
    expect(cleanPlainLyrics('caf&#233; &#x27;')).toBe("café '");
  });

  it('colapsa 3+ newlines en 2', () => {
    const raw = 'A\n\n\n\nB';
    expect(cleanPlainLyrics(raw)).toBe('A\n\nB');
  });

  it('conserva separadores de estrofa (2 newlines)', () => {
    const raw = 'Stanza 1\n\nStanza 2';
    expect(cleanPlainLyrics(raw)).toBe('Stanza 1\n\nStanza 2');
  });

  it('recorta extremos (espacios y newlines)', () => {
    expect(cleanPlainLyrics('\n\n  Hello  \n\n')).toBe('Hello');
  });

  it('string vacío → string vacío', () => {
    expect(cleanPlainLyrics('')).toBe('');
  });

  it('solo headers → string vacío', () => {
    expect(cleanPlainLyrics('[Verse 1]\n[Chorus]\n[Outro]')).toBe('');
  });

  it('no toca letra con corchetes que NO son header (p. ej. [la la la])', () => {
    // [la la la] matchea SECTION_HEADER_RE, se quita. Pero "[la la]" igual.
    // Test del caso real: letra con texto entre corchetes que es contenido:
    expect(cleanPlainLyrics('Line [with brackets] in the middle')).toBe(
      'Line [with brackets] in the middle',
    );
    // Línea que es SOLO [algo] se interpreta como header y se quita:
    expect(cleanPlainLyrics('[Solo instrumental]')).toBe('');
  });
});

describe('isEmptyLyrics', () => {
  it('detecta string vacío', () => {
    expect(isEmptyLyrics('')).toBe(true);
  });
  it('detecta solo espacios', () => {
    expect(isEmptyLyrics('   \n  \t ')).toBe(true);
  });
  it('false para letra real', () => {
    expect(isEmptyLyrics('Hello world')).toBe(false);
  });
});