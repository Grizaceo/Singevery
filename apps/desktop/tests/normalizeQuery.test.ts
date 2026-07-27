import { describe, expect, it } from 'vitest';
import {
  buildQueryVariants,
  extractCornerBracketTitle,
  looksLikeSameTrack,
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

  it('genera la variante totalmente limpia para títulos de video de YouTube', () => {
    const variants = buildQueryVariants({
      title: 'Dua Lipa - Houdini (Official Music Video)',
      artist: 'Dua Lipa',
      album: null,
      durationMs: null,
    });
    expect(variants.map((v) => v.title)).toContain('Houdini');
  });
});

describe('looksLikeSameTrack — identidad difusa (bug YouTube vs Spotify)', () => {
  const clean = { title: 'Houdini', artist: 'Dua Lipa' };

  it('reconoce el título de video de YouTube como la misma canción', () => {
    expect(
      looksLikeSameTrack(clean, {
        title: 'Dua Lipa - Houdini (Official Music Video)',
        artist: 'Dua Lipa',
      }),
    ).toBe(true);
  });

  it('tolera el canal VEVO compactado como artista', () => {
    expect(
      looksLikeSameTrack(clean, {
        title: 'Dua Lipa - Houdini (Official Music Video)',
        artist: 'DuaLipaVEVO',
      }),
    ).toBe(true);
  });

  it('tolera canales "Artista - Topic" (YouTube Music autogenerado)', () => {
    expect(
      looksLikeSameTrack(
        { title: 'Roar', artist: 'Katy Perry' },
        { title: 'Roar', artist: 'Katy Perry - Topic' },
      ),
    ).toBe(true);
  });

  it('acepta metadata embebida aunque el "artista" sea un canal ajeno', () => {
    expect(
      looksLikeSameTrack(clean, {
        title: 'Dua Lipa - Houdini (Video Oficial 4K)',
        artist: 'Vevo Music Hits',
      }),
    ).toBe(true);
  });

  it('NO confunde canciones distintas del mismo artista', () => {
    expect(
      looksLikeSameTrack(clean, {
        title: 'Dua Lipa - New Rules (Official Music Video)',
        artist: 'Dua Lipa',
      }),
    ).toBe(false);
    expect(looksLikeSameTrack(clean, { title: 'New Rules', artist: 'Dua Lipa' })).toBe(false);
  });

  it('NO junta artistas distintos con títulos parecidos', () => {
    expect(
      looksLikeSameTrack(
        { title: 'Hello', artist: 'Adele' },
        { title: 'Hello', artist: 'Lionel Richie' },
      ),
    ).toBe(false);
  });

  it('reconoce títulos invertidos "Canción - Artista"', () => {
    expect(
      looksLikeSameTrack(
        { title: 'Acróstico', artist: 'Shakira' },
        { title: 'Acróstico - Shakira', artist: 'ShakiraVEVO' },
      ),
    ).toBe(true);
  });

  it('reconoce feat en medio del título de video', () => {
    expect(
      looksLikeSameTrack(
        { title: 'Un x100to', artist: 'Grupo Frontera' },
        { title: 'Grupo Frontera - Un x100to ft. Bad Bunny (Video Oficial)', artist: 'Grupo Frontera' },
      ),
    ).toBe(true);
  });

  it('es simétrica y estable con claves idénticas', () => {
    expect(looksLikeSameTrack(clean, clean)).toBe(true);
    expect(
      looksLikeSameTrack(
        { title: 'Dua Lipa - Houdini (Official Music Video)', artist: 'DuaLipaVEVO' },
        clean,
      ),
    ).toBe(true);
  });
});
