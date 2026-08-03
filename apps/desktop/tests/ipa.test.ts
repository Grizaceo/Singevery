// Test unitario del conversor kana→IPA (P0).
// Casos fonéticos fijados en docs/PLAN_IPA_2026-08-03.md (convenciones NHK).
import { describe, expect, it } from 'vitest';
import { kanaToIpa, ipaForRuby } from '../electron/services/ipa';

describe('kanaToIpa — gojūon básico', () => {
  it('vocales', () => {
    expect(kanaToIpa('あいうえお')).toBe('aiɯeo');
  });
  it('sílabas con palatales y fricativas', () => {
    expect(kanaToIpa('し')).toBe('ɕi');
    expect(kanaToIpa('す')).toBe('sɯ');
    expect(kanaToIpa('ち')).toBe('tɕi');
    expect(kanaToIpa('つ')).toBe('tsɯ');
    expect(kanaToIpa('ひ')).toBe('çi');
    expect(kanaToIpa('ふ')).toBe('ɸɯ');
    expect(kanaToIpa('に')).toBe('ɲi');
    expect(kanaToIpa('わ')).toBe('ɰa');
    expect(kanaToIpa('ら')).toBe('ɾa');
  });
  it('dakuon: ざ行 como /dz/ (convención NHK)', () => {
    expect(kanaToIpa('ざ')).toBe('dza');
    expect(kanaToIpa('ず')).toBe('dzɯ');
    expect(kanaToIpa('ぜ')).toBe('dze');
    expect(kanaToIpa('ぞ')).toBe('dzo');
    expect(kanaToIpa('じ')).toBe('dʑi');
  });
  it('yōon con palatalización ʲ', () => {
    expect(kanaToIpa('きゃ')).toBe('kʲa');
    expect(kanaToIpa('きゅ')).toBe('kʲɯ');
    expect(kanaToIpa('きょ')).toBe('kʲo');
    expect(kanaToIpa('しゃ')).toBe('ɕa');
    expect(kanaToIpa('ちゃ')).toBe('tɕa');
    expect(kanaToIpa('じゃ')).toBe('dʑa');
    expect(kanaToIpa('にゃ')).toBe('ɲa');
    expect(kanaToIpa('ひゃ')).toBe('ça');
  });
});

describe('kanaToIpa — chōon (vocales largas)', () => {
  it('ー alarga la vocal anterior', () => {
    expect(kanaToIpa('ラーメン')).toBe('ɾaːmeɴ');
    expect(kanaToIpa('ケーキ')).toBe('keːki');
  });
  it('お+う → oː', () => {
    expect(kanaToIpa('おとうさん')).toBe('otoːsaɴ');
    expect(kanaToIpa('ありがとう')).toBe('aɾiɡatoː');
    expect(kanaToIpa('こうこう')).toBe('koːkoː');
    expect(kanaToIpa('きょう')).toBe('kʲoː');
  });
  it('え+い → eː', () => {
    expect(kanaToIpa('せんせい')).toBe('seɴseː');
    expect(kanaToIpa('がくせい')).toBe('ɡakɯseː');
    expect(kanaToIpa('きれい')).toBe('kiɾeː');
  });
  it('vocales repetidas', () => {
    expect(kanaToIpa('おおきい')).toBe('oːkiː');
    expect(kanaToIpa('かわいい')).toBe('kaɰaiː');
    expect(kanaToIpa('ゆうめい')).toBe('jɯːmeː');
  });
  it('no fusiona あ+う ni い+う', () => {
    expect(kanaToIpa('あう')).toBe('aɯ');
    expect(kanaToIpa('いう')).toBe('iɯ');
  });
});

describe('kanaToIpa — ん contextual', () => {
  it('antes de p/b → m', () => {
    expect(kanaToIpa('せんぱい')).toBe('sempai');
    // は como partícula sería /ɰa/, pero ortográficamente es /ha/ — kuromoji
    // resuelve partículas aguas arriba, el conversor es determinista.
    expect(kanaToIpa('こんばんは')).toBe('kombaɴha');
    expect(kanaToIpa('しんぶん')).toBe('ɕimbɯɴ');
  });
  it('antes de t/d/n → n (ɴ solo al final de palabra)', () => {
    expect(kanaToIpa('かんたん')).toBe('kantaɴ');
    expect(kanaToIpa('みんな')).toBe('minna');
    expect(kanaToIpa('ほんの')).toBe('honno');
  });
  it('antes de k/g → ŋ', () => {
    expect(kanaToIpa('たんご')).toBe('taŋɡo');
    expect(kanaToIpa('おんがく')).toBe('oŋɡakɯ');
    expect(kanaToIpa('にほんご')).toBe('ɲihoŋɡo');
    expect(kanaToIpa('ぎんこう')).toBe('ɡiŋkoː');
    expect(kanaToIpa('きんぎょ')).toBe('kiŋɡʲo');
  });
  it('antes de palatales (ɕ, tɕ, dʑ, ɲ, ç) → ɲ; velares palatalizadas (kʲ/ɡʲ) → ŋ', () => {
    expect(kanaToIpa('しんし')).toBe('ɕiɲɕi');
    expect(kanaToIpa('こんにちは')).toBe('koɲɲitɕiha');
    expect(kanaToIpa('かんじゃ')).toBe('kaɲdʑa');
    expect(kanaToIpa('きんぎょ')).toBe('kiŋɡʲo');
    expect(kanaToIpa('きんきゃく')).toBe('kiŋkʲakɯ');
  });
  it('final o ante vocal → ɴ', () => {
    expect(kanaToIpa('ほん')).toBe('hoɴ');
    expect(kanaToIpa('でんわ')).toBe('deɴɰa');
    expect(kanaToIpa('おん')).toBe('oɴ');
  });
});

describe('kanaToIpa — sokuon (geminación)', () => {
  it('duplica la consonante siguiente', () => {
    expect(kanaToIpa('いっち')).toBe('ittɕi');
    expect(kanaToIpa('いっし')).toBe('iɕɕi');
    expect(kanaToIpa('みっつ')).toBe('mittsɯ');
    expect(kanaToIpa('がっこう')).toBe('ɡakkoː');
    expect(kanaToIpa('きっぷ')).toBe('kippɯ');
  });
  it('ante vocal o final → parada glotal', () => {
    expect(kanaToIpa('っあ')).toBe('ʔa');
    expect(kanaToIpa('っ')).toBe('ʔ');
  });
});

describe('kanaToIpa — katakana extranjero', () => {
  it('ヴァ行, ファ行, ティ/ディ, シェ/チェ/ジェ', () => {
    expect(kanaToIpa('ヴァイオリン')).toBe('vaioɾiɴ');
    expect(kanaToIpa('ティー')).toBe('tiː');
    expect(kanaToIpa('チェック')).toBe('tɕekkɯ');
    expect(kanaToIpa('シェア')).toBe('ɕea');
    expect(kanaToIpa('ジェット')).toBe('dʑetto');
    expect(kanaToIpa('ファン')).toBe('ɸaɴ');
  });
  it('yōon extranjero con ー', () => {
    expect(kanaToIpa('ミュージック')).toBe('mʲɯːdʑikkɯ');
    expect(kanaToIpa('ニュース')).toBe('ɲɯːsɯ');
  });
});

describe('kanaToIpa — passthrough', () => {
  it('texto latino/kanji/emoji pasa intacto (kana dentro se convierte)', () => {
    expect(kanaToIpa('ABC')).toBe('ABC');
    expect(kanaToIpa('君')).toBe('君');
    expect(kanaToIpa('君は')).toBe('君ha');
    expect(kanaToIpa('🎵 だいすき 🎵')).toBe('🎵 daisɯki 🎵');
  });
  it('cadena vacía', () => {
    expect(kanaToIpa('')).toBe('');
  });
});

describe('kanaToIpa — adversarial (P3)', () => {
  it('kana raro: ゐ/ゑ y ヷ/ヸ/ヹ/ヺ', () => {
    expect(kanaToIpa('ゐ')).toBe('i');
    expect(kanaToIpa('ゑ')).toBe('e');
    expect(kanaToIpa('ヷ')).toBe('va');
    expect(kanaToIpa('ヸ')).toBe('vi');
    expect(kanaToIpa('ヹ')).toBe('ve');
    expect(kanaToIpa('ヺ')).toBe('vo');
  });
  it('texto mixto JP+EN: convierte kana y deja latín intacto', () => {
    expect(kanaToIpa('アイドルmaster')).toBe('aidoɾɯmaster');
    expect(kanaToIpa('ドラゴン Ball Z')).toBe('doɾaɡoɴ Ball Z');
  });
  it('katakana largo y sokuon + chōon combinados', () => {
    // ン ante ピ (p) → /m/ por asimilación nasal (misma regla que せんぱい).
    expect(kanaToIpa('コンピューター')).toBe('kompʲɯːtaː');
    expect(kanaToIpa('バッテリー')).toBe('batteɾiː');
  });
  it('っっ doble sokuon no revienta', () => {
    expect(kanaToIpa('あっっ')).toBe('aʔʔ');
  });
});

describe('ipaForRuby', () => {
  it('convierte rt a IPA y conserva base', () => {
    const segments = [
      { base: '明日', rt: 'あした' },
      { base: '東京', rt: 'とうきょう' },
      { base: 'USA', rt: 'USA' },
    ];
    expect(ipaForRuby(segments)).toEqual([
      { base: '明日', rt: 'aɕita' },
      { base: '東京', rt: 'toːkʲoː' },
      { base: 'USA', rt: 'USA' },
    ]);
  });
  it('segmentos sin rt pasan intactos', () => {
    expect(ipaForRuby([{ base: 'あ' }])).toEqual([{ base: 'あ' }]);
  });
});
