import { describe, it, expect, vi } from 'vitest';
import {
  knownArtistLanguage,
  profileScript,
  vetoLyricsByLanguage,
  knownArtistCount,
} from '../electron/services/lyrics/artistLanguage';
import { LyricsService } from '../electron/services/lyrics/lyricsService';
import type { LyricsCache, LyricsProvider, RawLyrics } from '../electron/services/lyrics/types';

const JA_LYRICS = '無彩色の街を歩いて　君のことを思い出す　あの日の空はどこまでも青くて　声が届かない';
const KO_LYRICS = '너의 목소리가 들려와 오늘도 나는 걷고 있어 하늘은 파랗고 바람은 차가워 다시 만날 수 있을까';
const ZH_LYRICS = '我看见你的背影在人群中消失不见 时间静止在那一天 我们说好的永远还剩多少年';
const ROMAJI_LYRICS =
  'musaishoku no machi wo aruite kimi no koto wo omoidasu ano hi no sora wa doko made mo aokute';

describe('knownArtistLanguage', () => {
  it('reconoce artistas japoneses, coreanos y chinos', () => {
    expect(knownArtistLanguage('花譜')).toBe('ja');
    expect(knownArtistLanguage('YOASOBI')).toBe('ja');
    expect(knownArtistLanguage('hololive')).toBe('ja');
    expect(knownArtistLanguage('BTS')).toBe('ko');
    expect(knownArtistLanguage('NewJeans')).toBe('ko');
    expect(knownArtistLanguage('周杰倫')).toBe('zh');
  });

  it('tolera el nombre embebido en metadata sucia', () => {
    expect(knownArtistLanguage('hololive - 星街すいせい')).toBe('ja');
    expect(knownArtistLanguage('BLACKPINK (블랙핑크)')).toBe('ko');
    expect(knownArtistLanguage('ReGLOSS Official')).toBe('ja');
  });

  it('devuelve null para artistas fuera de la tabla', () => {
    expect(knownArtistLanguage('Los Prisioneros')).toBeNull();
    expect(knownArtistLanguage('Dua Lipa')).toBeNull();
    expect(knownArtistLanguage('')).toBeNull();
    expect(knownArtistLanguage(null)).toBeNull();
  });

  it('no matchea por siglas cortísimas', () => {
    // "IU" está en la tabla pero es demasiado corto para buscarlo por
    // contención dentro de otro nombre.
    expect(knownArtistLanguage('Paul Simon')).toBeNull();
    expect(knownArtistLanguage('Vintage Culture')).toBeNull();
  });

  it('la tabla tiene contenido', () => {
    expect(knownArtistCount()).toBeGreaterThan(100);
  });
});

describe('profileScript', () => {
  it('clasifica cada escritura', () => {
    expect(profileScript(JA_LYRICS).kanaRatio).toBeGreaterThan(0.3);
    expect(profileScript(KO_LYRICS).hangulRatio).toBeGreaterThan(0.9);
    expect(profileScript(ZH_LYRICS).hanRatio).toBeGreaterThan(0.9);
    expect(profileScript(ROMAJI_LYRICS).kanaRatio).toBe(0);
  });

  it('ignora espacios, puntuación y números', () => {
    const p = profileScript('1, 2, 3... !!! ');
    expect(p.total).toBe(0);
    expect(p.kanaRatio).toBe(0);
  });
});

describe('vetoLyricsByLanguage', () => {
  it('veta hangul para una artista japonesa', () => {
    const v = vetoLyricsByLanguage('花譜', KO_LYRICS);
    expect(v.vetoed).toBe(true);
    expect(v.reason).toContain('hangul');
  });

  it('veta kana para un artista coreano', () => {
    expect(vetoLyricsByLanguage('BTS', JA_LYRICS).vetoed).toBe(true);
  });

  it('veta kana y hangul para un artista chino', () => {
    expect(vetoLyricsByLanguage('周杰倫', JA_LYRICS).vetoed).toBe(true);
    expect(vetoLyricsByLanguage('周杰倫', KO_LYRICS).vetoed).toBe(true);
  });

  it('veta letra china (han sin hangul) para un artista coreano', () => {
    expect(vetoLyricsByLanguage('IU', ZH_LYRICS).vetoed).toBe(true);
  });

  it('NO veta la letra correcta de cada artista', () => {
    expect(vetoLyricsByLanguage('花譜', JA_LYRICS).vetoed).toBe(false);
    expect(vetoLyricsByLanguage('BTS', KO_LYRICS).vetoed).toBe(false);
    expect(vetoLyricsByLanguage('周杰倫', ZH_LYRICS).vetoed).toBe(false);
  });

  it('NO veta letras romanizadas: LRCLIB las guarda así y son correctas', () => {
    expect(vetoLyricsByLanguage('YOASOBI', ROMAJI_LYRICS).vetoed).toBe(false);
    expect(vetoLyricsByLanguage('花譜', 'I was walking down the street thinking about you all night')
      .vetoed).toBe(false);
  });

  it('NO veta a artistas fuera de la tabla', () => {
    expect(vetoLyricsByLanguage('Los Prisioneros', KO_LYRICS).vetoed).toBe(false);
  });

  it('una palabra suelta en otro alfabeto no veta (feat., grito, título)', () => {
    const mostlyJapanese = JA_LYRICS + JA_LYRICS + ' 사랑';
    expect(vetoLyricsByLanguage('花譜', mostlyJapanese).vetoed).toBe(false);
  });

  it('un texto demasiado corto no alcanza para decidir', () => {
    expect(vetoLyricsByLanguage('花譜', '안녕').vetoed).toBe(false);
    expect(vetoLyricsByLanguage('花譜', '').vetoed).toBe(false);
  });
});

// --- integración con la cadena de proveedores -----------------------------

function provider(name: string, raw: RawLyrics | null): LyricsProvider {
  return { name, lookup: async () => raw };
}

function memCache() {
  const negatives: string[] = [];
  const cache: LyricsCache = {
    get: async () => null,
    put: async () => {},
    isNegative: () => false,
    markNotFound: async (key) => {
      negatives.push(key);
    },
  };
  return { cache, negatives };
}

const lrcOf = (text: string): RawLyrics => ({
  source: 'x',
  synced: true,
  lrc: text
    .split(' ')
    .map((word, i) => `[00:0${i % 10}.00]${word}`)
    .join('\n'),
});

describe('LyricsService — veto por idioma en la cadena', () => {
  it('descarta la letra en el alfabeto equivocado y sigue con el próximo proveedor', async () => {
    const { cache } = memCache();
    const service = new LyricsService(
      cache,
      [provider('malo', lrcOf(KO_LYRICS)), provider('bueno', lrcOf(JA_LYRICS))],
      { enableMetadataHints: false },
    );

    const out = await service.getLyrics({ title: 'テーマ', artist: '花譜' });
    expect(out).not.toBeNull();
    // Ganó el segundo proveedor: la letra japonesa.
    expect(out!.lines.some((l) => /[぀-ヿ一-鿿]/u.test(l.text))).toBe(true);
  });

  it('un veto NO se cachea como "sin letra": la canción existe', async () => {
    const { cache, negatives } = memCache();
    const service = new LyricsService(cache, [provider('malo', lrcOf(KO_LYRICS))], {
      enableMetadataHints: false,
    });

    expect(await service.getLyrics({ title: 'テーマ', artist: '花譜' })).toBeNull();
    expect(negatives).toHaveLength(0);
  });

  it('sin artista conocido la cadena se comporta igual que siempre', async () => {
    const { cache, negatives } = memCache();
    const lookup = vi.fn(async () => lrcOf(KO_LYRICS));
    const service = new LyricsService(cache, [{ name: 'p', lookup }], {
      enableMetadataHints: false,
    });

    const out = await service.getLyrics({ title: 'Cancion', artist: 'Artista Desconocido' });
    expect(out).not.toBeNull();
    expect(negatives).toHaveLength(0);
  });
});
