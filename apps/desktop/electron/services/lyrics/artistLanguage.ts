// ============================================================================
// artistLanguage.ts — veto de letras en el alfabeto equivocado.
//
// El fallo que ataca: se busca 花譜 (japonesa) y un proveedor devuelve una
// letra en hangul, o se busca BTS y vuelve una letra en kana. Son canciones
// distintas que comparten título romanizado, y el widget las muestra tan
// campante porque ningún gate de similitud mira el ALFABETO.
//
// Qué se veta y qué NO:
//   - Se veta el cruce de ESCRITURAS: hangul para una artista japonesa, kana
//     para uno coreano o chino. Un falso positivo aquí es casi imposible: una
//     canción japonesa no trae su letra en hangul.
//   - NO se veta el latino/ASCII. Sería tentador ("una artista japonesa no
//     canta en inglés"), pero rompe dos casos reales y frecuentes: LRCLIB
//     guarda muchas letras japonesas YA romanizadas, y hay artistas japoneses
//     que graban en inglés. Vetar ASCII tiraría letras correctas.
//
// El registro es una tabla mantenible: agregar un artista es una línea.
// Solo hace falta listar a quienes sufren el cruce (JP/KR/CN); para el resto
// el veto no aplica y la cadena de proveedores decide como siempre.
// ============================================================================

/** Idioma/escritura esperable de un artista conocido. */
export type ArtistLanguage = 'ja' | 'ko' | 'zh';

/** Normaliza para comparar: sin espacios, sin puntuación, minúsculas. */
function normalizeArtist(artist: string): string {
  return artist
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s.,'"’“”\-–—_/\\()[\]{}!?:;·・]/g, '')
    .trim();
}

/**
 * Artistas japoneses. Se listan las agencias/colectivos completos porque su
 * metadata llega con el nombre del grupo tanto como con el de la integrante
 * (hololive, ReGLOSS), y ambos deben vetar hangul igual.
 */
const KNOWN_JA = [
  // Colectivos y agencias (el nombre aparece en el "artista" de muchos uploads)
  'hololive', 'ホロライブ', 'hololiveDEV_IS', 'ReGLOSS', 'リグロス', 'FLOW GLOW',
  'にじさんじ', 'nijisanji', 'VSPO', 'ぶいすぽっ', 'Neo-Porte', '774inc',
  // Solistas y bandas
  '花譜', 'KAF', '理芽', 'RIM', '春猿火', 'ヰ世界情緒', '幸祜', 'KOKO',
  'YOASOBI', 'ヨルシカ', 'Yorushika', 'ずっと真夜中でいいのに。', 'ZUTOMAYO',
  '米津玄師', 'Kenshi Yonezu', 'Ado', 'Vaundy', 'King Gnu', 'Aimer',
  'RADWIMPS', 'ONE OK ROCK', 'Official髭男dism', 'back number', 'Mrs. GREEN APPLE',
  'あいみょん', 'Aimyon', 'Eve', 'ヒトリエ', 'wowaka', 'DECO*27', 'kanaria',
  '初音ミク', 'Hatsune Miku', 'Kenshi', 'Fujii Kaze', '藤井風', 'Sakanaction',
  'サカナクション', 'Perfume', 'BABYMETAL', 'LiSA', 'ReoNa', 'Kenshi Yonezu',
  '星街すいせい', 'Hoshimachi Suisei', '宝鐘マリン', 'Houshou Marine',
  '兎田ぺこら', 'Gawr Gura', '大空スバル', 'AZKi', '常闇トワ',
  'Sou', 'まふまふ', 'Mafumafu', '天月', 'そらる', 'Soraru', 'ヒバナ',
  'Kessoku Band', '結束バンド', 'ClariS', 'ChouCho', 'fripSide', 'ZAQ',
] as const;

/** Artistas coreanos (K-pop y afines). */
const KNOWN_KO = [
  'BTS', '방탄소년단', 'BLACKPINK', '블랙핑크', 'NewJeans', '뉴진스',
  'IVE', '아이브', 'aespa', '에스파', 'SEVENTEEN', '세븐틴', 'TWICE', '트와이스',
  'Stray Kids', '스트레이 키즈', 'LE SSERAFIM', '르세라핌', 'ITZY', '있지',
  'IU', '아이유', 'EXO', '엑소', 'Red Velvet', '레드벨벳', 'NCT', 'ENHYPEN',
  'TXT', 'TOMORROW X TOGETHER', '투모로우바이투게더', '(G)I-DLE', '아이들',
  'ZEROBASEONE', 'RIIZE', 'ILLIT', 'KISS OF LIFE', 'BIGBANG', '빅뱅',
  'G-DRAGON', 'PSY', '싸이', 'AKMU', '악뮤', '10CM', 'Younha', '윤하',
  'HYUKOH', '혁오', 'DAY6', '데이식스', 'Jung Kook', 'Jimin', 'V', 'Agust D',
  'BOL4', '볼빨간사춘기', 'Paul Kim', 'Crush', 'DEAN', 'Zico', 'Heize',
] as const;

/** Artistas chinos (mandarín/cantonés). */
const KNOWN_ZH = [
  '周杰倫', '周杰伦', 'Jay Chou', '鄧紫棋', '邓紫棋', 'G.E.M.',
  '五月天', 'Mayday', '林俊傑', '林俊杰', 'JJ Lin', '陳奕迅', '陈奕迅', 'Eason Chan',
  '華晨宇', '华晨宇', '毛不易', '李榮浩', '李荣浩', '薛之謙', '薛之谦',
  '王菲', 'Faye Wong', '張學友', '张学友', 'Jacky Cheung', '劉德華', '刘德华',
  '田馥甄', 'Hebe Tien', '蔡依林', 'Jolin Tsai', '孫燕姿', '孙燕姿', 'Stefanie Sun',
  '告五人', '茄子蛋', '任然', '單依純', '单依纯', '洛天依', 'Luo Tianyi',
] as const;

function buildRegistry(): Map<string, ArtistLanguage> {
  const registry = new Map<string, ArtistLanguage>();
  const add = (names: readonly string[], lang: ArtistLanguage): void => {
    for (const name of names) {
      const key = normalizeArtist(name);
      if (key.length >= 2) registry.set(key, lang);
    }
  };
  add(KNOWN_JA, 'ja');
  add(KNOWN_KO, 'ko');
  add(KNOWN_ZH, 'zh');
  return registry;
}

const REGISTRY = buildRegistry();

/**
 * Idioma conocido del artista, o null si no está en la tabla.
 * Acepta que el nombre venga embebido ("hololive - 星街すいせい", "BTS (방탄소년단)")
 * porque así llega la metadata de muchos uploads.
 */
export function knownArtistLanguage(artist: string | null | undefined): ArtistLanguage | null {
  const normalized = normalizeArtist(artist ?? '');
  if (normalized.length < 2) return null;

  const exact = REGISTRY.get(normalized);
  if (exact) return exact;

  // Contención: el nombre del artista aparece dentro de un string más largo.
  // Se exige ≥4 caracteres para no matchear siglas cortas por casualidad.
  for (const [name, lang] of REGISTRY) {
    if (name.length >= 4 && normalized.includes(name)) return lang;
  }
  return null;
}

// --- Detección de escritura ---------------------------------------------

const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏]/gu;
const KANA_RE = /[぀-ゟ゠-ヿｦ-ﾟ]/gu;
const HAN_RE = /[一-鿿㐀-䶿]/gu;

export interface ScriptProfile {
  /** Caracteres considerados (sin espacios ni puntuación ASCII). */
  total: number;
  hangul: number;
  kana: number;
  han: number;
  hangulRatio: number;
  kanaRatio: number;
  hanRatio: number;
}

/** Cuenta caracteres por escritura. Función pura. */
export function profileScript(text: string): ScriptProfile {
  const meaningful = (text ?? '').replace(/[\s\d\p{P}\p{S}]/gu, '');
  const total = [...meaningful].length;
  const count = (re: RegExp): number => (meaningful.match(re) ?? []).length;
  const hangul = count(HANGUL_RE);
  const kana = count(KANA_RE);
  const han = count(HAN_RE);
  return {
    total,
    hangul,
    kana,
    han,
    hangulRatio: total > 0 ? hangul / total : 0,
    kanaRatio: total > 0 ? kana / total : 0,
    hanRatio: total > 0 ? han / total : 0,
  };
}

/**
 * Proporción mínima para afirmar que la letra ESTÁ en esa escritura. Una
 * palabra suelta en hangul dentro de una letra japonesa (un feat., un grito)
 * no debe vetar nada; el 15% ya implica que el cuerpo del texto lo es.
 */
const SCRIPT_PRESENCE_RATIO = 0.15;
/** Texto mínimo para que el análisis signifique algo. */
const MIN_MEANINGFUL_CHARS = 20;

export interface LanguageVeto {
  vetoed: boolean;
  reason?: string;
}

/**
 * ¿Es compatible esta letra con el idioma conocido del artista?
 *
 * Solo veta cruces de escritura imposibles. Todo lo demás pasa: si el artista
 * no está en la tabla, si el texto es corto, o si la letra viene romanizada.
 */
export function vetoLyricsByLanguage(artist: string, lyricsText: string): LanguageVeto {
  const lang = knownArtistLanguage(artist);
  if (!lang) return { vetoed: false };

  const profile = profileScript(lyricsText);
  if (profile.total < MIN_MEANINGFUL_CHARS) return { vetoed: false };

  const has = (ratio: number): boolean => ratio >= SCRIPT_PRESENCE_RATIO;
  const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`;

  if (lang === 'ja' && has(profile.hangulRatio)) {
    return { vetoed: true, reason: `artista japonés con letra en hangul (${pct(profile.hangulRatio)})` };
  }
  if (lang === 'ko' && has(profile.kanaRatio)) {
    return { vetoed: true, reason: `artista coreano con letra en kana (${pct(profile.kanaRatio)})` };
  }
  if (lang === 'zh' && has(profile.kanaRatio)) {
    // El chino no usa kana; los kanji compartidos no delatan nada, el kana sí.
    return { vetoed: true, reason: `artista chino con letra en kana (${pct(profile.kanaRatio)})` };
  }
  if (lang === 'zh' && has(profile.hangulRatio)) {
    return { vetoed: true, reason: `artista chino con letra en hangul (${pct(profile.hangulRatio)})` };
  }
  if (lang === 'ko' && has(profile.hanRatio) && !has(profile.hangulRatio)) {
    // Letra en han sin nada de hangul para un artista coreano: es china.
    return { vetoed: true, reason: `artista coreano con letra en han sin hangul (${pct(profile.hanRatio)})` };
  }
  return { vetoed: false };
}

/** Cantidad de artistas en la tabla (para diagnóstico y tests). */
export function knownArtistCount(): number {
  return REGISTRY.size;
}
