import { describe, it, expect } from 'vitest';
import { extractCoverOriginal } from '../electron/services/lyrics/coverTitle';
import { buildQueryVariants } from '../electron/services/lyrics/normalizeQuery';

describe('extractCoverOriginal', () => {
  it('convención japonesa "Canción / Artista"', () => {
    const r = extractCoverOriginal('アイドル / YOASOBI');
    expect(r.clean).toBe('アイドル');
    expect(r.artist).toBe('YOASOBI');
  });

  it('marca 歌ってみた al principio no contamina el título', () => {
    const r = extractCoverOriginal('【歌ってみた】アイドル / YOASOBI');
    expect(r.clean).toBe('アイドル');
    expect(r.artist).toBe('YOASOBI');
    expect(r.isCover).toBe(true);
  });

  it('"covered by X" marca al INTÉRPRETE, no al original', () => {
    const r = extractCoverOriginal('Lemon (Covered by 花譜)');
    expect(r.clean).toBe('Lemon');
    expect(r.coverArtist).toBe('花譜');
    // Quien canta el cover jamás debe viajar como artista de búsqueda.
    expect(r.artist).toBeUndefined();
    expect(r.isCover).toBe(true);
  });

  it('combina intérprete del cover y original del slash', () => {
    const r = extractCoverOriginal('Lemon / 米津玄師 (Cover by 花譜)');
    expect(r.clean).toBe('Lemon');
    expect(r.artist).toBe('米津玄師');
    expect(r.coverArtist).toBe('花譜');
  });

  it('limpia (MV) y [cover] sin inventar artista', () => {
    expect(extractCoverOriginal('Creep (MV)').clean).toBe('Creep');
    expect(extractCoverOriginal('Creep (MV)').artist).toBeUndefined();
    expect(extractCoverOriginal('Creep [cover]').clean).toBe('Creep');
    expect(extractCoverOriginal('Creep [cover]').isCover).toBe(true);
  });

  it('distingue video musical de cover (un MV no es un cover)', () => {
    const mv = extractCoverOriginal('Houdini (Official Music Video)');
    expect(mv.isVideo).toBe(true);
    expect(mv.isCover).toBe(false);
    const cover = extractCoverOriginal('Houdini【歌ってみた】');
    expect(cover.isCover).toBe(true);
    expect(cover.isVideo).toBe(false);
  });

  it('cola "- Artista Version" da el artista', () => {
    const r = extractCoverOriginal('Hallelujah - Jeff Buckley Version');
    expect(r.clean).toBe('Hallelujah');
    expect(r.artist).toBe('Jeff Buckley');
  });

  it('"Acoustic Version" es un arreglo, no un artista', () => {
    const r = extractCoverOriginal('Wonderwall - Acoustic Version');
    expect(r.clean).toBe('Wonderwall');
    expect(r.artist).toBeUndefined();
  });

  it('"(Original: X)" es la señal más fuerte', () => {
    const r = extractCoverOriginal('Pretender (Original: Official髭男dism)');
    expect(r.clean).toBe('Pretender');
    expect(r.artist).toBe('髭男dism');
  });

  it('NO parte títulos con barra sin espacios (AC/DC, 24/7)', () => {
    expect(extractCoverOriginal('Highway to Hell - AC/DC').artist).toBeUndefined();
    expect(extractCoverOriginal('24/7').clean).toBe('24/7');
  });

  it('deja intacto un título normal', () => {
    const r = extractCoverOriginal('Bohemian Rhapsody');
    expect(r.clean).toBe('Bohemian Rhapsody');
    expect(r.artist).toBeUndefined();
    expect(r.coverArtist).toBeUndefined();
    expect(r.isCover).toBe(false);
  });

  it('no devuelve vacío ni con entradas degeneradas', () => {
    expect(extractCoverOriginal('(MV)').clean).toBe('(MV)');
    expect(extractCoverOriginal('').clean).toBe('');
    expect(extractCoverOriginal('   ').clean).toBe('');
  });

  it('descarta lados de slash que son frases, no nombres', () => {
    const r = extractCoverOriginal('Song / this is a very long sentence that is not a name');
    expect(r.artist).toBeUndefined();
    expect(r.clean).toBe('Song / this is a very long sentence that is not a name');
  });

  it('es idempotente: re-procesar no degrada', () => {
    const once = extractCoverOriginal('【歌ってみた】アイドル / YOASOBI');
    const twice = extractCoverOriginal(once.clean);
    expect(twice.clean).toBe(once.clean);
  });
});

describe('buildQueryVariants con covers', () => {
  it('el original va temprano cuando el upload es un cover', () => {
    const variants = buildQueryVariants({
      title: '【歌ってみた】アイドル / YOASOBI',
      artist: '花譜 Ch.',
      album: null,
      durationMs: null,
    });
    // Bajo el canal de quien lo cantó no existe la letra: el original manda.
    const original = variants.findIndex((v) => v.artist === 'YOASOBI' && v.title === 'アイドル');
    expect(original).toBeGreaterThanOrEqual(0);
    // Dentro del tope de variantes que prueba LyricsService (MAX_VARIANTS = 4).
    expect(original).toBeLessThan(4);
  });

  it('un título normal no gasta variantes en el parser de covers', () => {
    const plain = buildQueryVariants({
      title: 'Houdini',
      artist: 'Dua Lipa',
      album: null,
      durationMs: null,
    });
    expect(plain).toHaveLength(1);
  });

  it('un video musical corriente conserva las variantes de siempre', () => {
    const variants = buildQueryVariants({
      title: 'Dua Lipa - Houdini (Official Music Video)',
      artist: 'DuaLipaVEVO',
      album: null,
      durationMs: null,
    });
    // El parser de covers NO se mete aquí (no hay marca de cover ni original
    // detectado): las variantes son exactamente las de antes y ninguna cambia
    // de artista. Sin marca, adivinar "Artista - Título" da falsos positivos
    // con títulos que llevan guion.
    expect(variants.map((v) => v.title)).toEqual([
      'Dua Lipa - Houdini (Official Music Video)',
      'Dua Lipa - Houdini',
    ]);
    expect(variants.every((v) => v.artist === 'DuaLipaVEVO')).toBe(true);
  });
});
