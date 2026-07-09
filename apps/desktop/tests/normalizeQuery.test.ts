import { describe, expect, it } from 'vitest';
import {
  buildQueryVariants,
  extractCornerBracketTitle,
  normalizeSearchText,
  titleArtistSimilarity,
} from '../electron/services/lyrics/normalizeQuery';

describe('normalizeQuery', () => {
  it('genera variantes limpiando remaster/live/feat', () => {
    const variants = buildQueryVariants({
      title: 'Tren al Sur - Remasterizado 2011 (feat. Invitado)',
      artist: 'Los Prisioneros',
      album: null,
      durationMs: null,
    });

    expect(variants.map((variant) => variant.title)).toContain(
      'Tren al Sur - Remasterizado 2011 (feat. Invitado)',
    );
    expect(variants.map((variant) => variant.title)).toContain('Tren al Sur');
  });

  it('normaliza texto para comparación tolerante a acentos y espacios', () => {
    expect(normalizeSearchText('  Éxijo   más  ')).toBe('exijo mas');
  });

  it('puntúa alto coincidencias fuertes de título y artista', () => {
    const score = titleArtistSimilarity(
      { title: 'El baile de los que sobran', artist: 'Los Prisioneros' },
      { title: 'El Baile de Los Que Sobran', artist: 'Los Prisioneros' },
    );
    expect(score).toBeGreaterThan(0.9);
  });

  it('extrae el título real de videos de YouTube japoneses con 「」', () => {
    expect(
      extractCornerBracketTitle(
        'Creepy Nuts「Bling-Bang-Bang-Born」×TV Anime「マッシュル-MASHLE-」　Collaboration Music Video',
      ),
    ).toBe('Bling-Bang-Bang-Born');
    expect(extractCornerBracketTitle('YOASOBI『アイドル』Official Music Video')).toBe('アイドル');
    expect(extractCornerBracketTitle('Tren al Sur')).toBeNull();
  });

  it('genera una variante con el contenido del corchete CJK', () => {
    const variants = buildQueryVariants({
      title: 'Creepy Nuts「Bling-Bang-Bang-Born」×TV Anime「マッシュル-MASHLE-」　Collaboration Music Video',
      artist: 'Creepy Nuts',
      album: null,
      durationMs: null,
    });
    expect(variants.map((v) => v.title)).toContain('Bling-Bang-Bang-Born');
  });
});
