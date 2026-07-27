import { describe, expect, it } from 'vitest';
import {
  cleanLetrasLyrics,
  looksLikeTranslationBlock,
  parseSongPage,
  stripInterleavedTransliteration,
} from '../electron/services/lyrics/providers/letras';

// Casos tomados de la página real de letras.mus.br (YOASOBI — Idol), donde la
// "transliteração automática" viene pegada al original dentro de la misma línea.
describe('stripInterleavedTransliteration', () => {
  it('quita la romanización pegada tras una línea en japonés', () => {
    expect(
      stripInterleavedTransliteration('無敵の笑顔であらすメディアmuteki no egao de arasu media'),
    ).toBe('無敵の笑顔であらすメディア');
    expect(stripInterleavedTransliteration('完璧で嘘つきな君はkanpeki de usotsuki na kimi wa')).toBe(
      '完璧で嘘つきな君は',
    );
  });

  it('deduplica la línea cuando el original ya es latino', () => {
    expect(
      stripInterleavedTransliteration(
        "(You're my savior, you're my saving grace)(You're my savior, you're my saving grace)",
      ),
    ).toBe("(You're my savior, you're my saving grace)");
    expect(stripInterleavedTransliteration('Hey! Hey!Hey! Hey!')).toBe('Hey! Hey!');
  });

  it('deja intactas las líneas normales', () => {
    expect(stripInterleavedTransliteration('Y que fue de aquel amor')).toBe(
      'Y que fue de aquel amor',
    );
    expect(stripInterleavedTransliteration('  con espacios  ')).toBe('con espacios');
    expect(stripInterleavedTransliteration('')).toBe('');
  });

  it('no corta puntuación ni sufijos cortos tras el japonés', () => {
    // La cola es demasiado corta para ser una romanización: se conserva.
    expect(stripInterleavedTransliteration('ありがとう!')).toBe('ありがとう!');
    expect(stripInterleavedTransliteration('君は？')).toBe('君は？');
  });

  it('no destruye una letra japonesa sin transliteración', () => {
    expect(stripInterleavedTransliteration('誰もが信じあがめてる')).toBe('誰もが信じあがめてる');
  });

  it('respeta líneas mixtas legítimas que no son duplicados', () => {
    // Inglés dentro de una letra latina: sin CJK y sin duplicación exacta.
    expect(stripInterleavedTransliteration('bailando under the moon')).toBe(
      'bailando under the moon',
    );
  });
});

describe('cleanLetrasLyrics', () => {
  it('limpia línea a línea conservando la separación de estrofas', () => {
    const raw = [
      '無敵の笑顔であらすメディアmuteki no egao de arasu media',
      '完璧で嘘つきな君はkanpeki de usotsuki na kimi wa',
      '',
      'Hey! Hey!Hey! Hey!',
    ].join('\n');

    expect(cleanLetrasLyrics(raw)).toBe(
      ['無敵の笑顔であらすメディア', '完璧で嘘つきな君は', '', 'Hey! Hey!'].join('\n'),
    );
  });
});

describe('looksLikeTranslationBlock', () => {
  it('detecta el bloque traducido por su contexto', () => {
    const html = '<div class="lyric-translation"><p>Todos creen y adoran</p></div>';
    expect(looksLikeTranslationBlock(html, html.indexOf('<p>'))).toBe(true);
  });

  it('no marca el bloque original', () => {
    const html = '<div class="cnt-letra g-pr g-sp"><p>Todos creen</p></div>';
    expect(looksLikeTranslationBlock(html, html.indexOf('<p>'))).toBe(false);
  });
});

describe('parseSongPage', () => {
  it('prefiere lyric-original y limpia la transliteración', () => {
    const html = `
      <h1>Idol</h1><h2><a href="/yoasobi/">YOASOBI</a></h2>
      <div class="lyric-original"><p>無敵の笑顔であらすメディアmuteki no egao de arasu media</p></div>
      <div class="lyric-translation"><p>Medios que arrasa con una sonrisa invencible</p></div>
    `;
    const parsed = parseSongPage(html);
    expect(parsed.title).toBe('Idol');
    expect(parsed.artist).toBe('YOASOBI');
    expect(parsed.plainLyrics).toBe('無敵の笑顔であらすメディア');
    expect(parsed.plainLyrics).not.toContain('Medios que arrasa');
  });

  it('rechaza el fallback genérico cuando el bloque es una traducción', () => {
    const html = `
      <h1>Idol</h1><h2>YOASOBI</h2>
      <div class="cnt-trad"><div class="cnt-letra"><p>Todos creen y adoran</p></div></div>
    `;
    expect(parseSongPage(html).plainLyrics).toBeNull();
  });

  it('acepta el fallback genérico cuando es la letra original', () => {
    const html = `
      <h1>Tren al Sur</h1><h2>Los Prisioneros</h2>
      <div class="cnt-letra"><p>Siete y media en la mañana</p></div>
    `;
    expect(parseSongPage(html).plainLyrics).toBe('Siete y media en la mañana');
  });
});
