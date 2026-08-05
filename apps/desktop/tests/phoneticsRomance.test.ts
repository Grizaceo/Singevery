import { describe, expect, it } from 'vitest';
import { italianToIpa } from '../electron/services/phonetics/italian';
import { frenchToIpa } from '../electron/services/phonetics/french';
import { germanToIpa } from '../electron/services/phonetics/german';

// ===========================================================================
// Italiano
// ===========================================================================

describe('italianToIpa — palatalización', () => {
  it('c y g ante e/i', () => {
    expect(italianToIpa('cielo')).toBe('tʃelo');
    expect(italianToIpa('gente')).toBe('dʒente');
  });

  it('enmudece la i ortográfica de cia/gio', () => {
    expect(italianToIpa('ciao')).toBe('tʃao');
    expect(italianToIpa('giorno')).toBe('dʒorno');
  });

  it('ch y gh devuelven el sonido velar', () => {
    expect(italianToIpa('perché')).toBe('perke');
    expect(italianToIpa('ghiaccio')).toBe('gjatʃːo');
  });

  it('gli, gn y sc ante e/i', () => {
    expect(italianToIpa('figlia')).toBe('fiʎa');
    expect(italianToIpa('gli')).toBe('ʎi');
    expect(italianToIpa('sogno')).toBe('soɲo');
    expect(italianToIpa('scena')).toBe('ʃena');
    expect(italianToIpa('sciare')).toBe('ʃare');
  });
});

describe('italianToIpa — geminación', () => {
  it('marca la consonante doble como larga', () => {
    expect(italianToIpa('bella')).toBe('belːa');
    expect(italianToIpa('notte')).toBe('notːe');
    expect(italianToIpa('pizza')).toBe('pitsːa');
  });

  it('la doble palataliza según lo que sigue al par', () => {
    expect(italianToIpa('faccio')).toBe('fatʃːo');
    expect(italianToIpa('oggi')).toBe('odʒːi');
    expect(italianToIpa('gnocchi')).toBe('ɲokːi');
  });
});

describe('italianToIpa — vocales y s', () => {
  it('la tilde fija el timbre abierto o cerrado', () => {
    expect(italianToIpa('è')).toBe('ɛ');
    expect(italianToIpa('perché')).toBe('perke');
    expect(italianToIpa('però')).toBe('perɔ');
  });

  it('sonoriza la s entre vocales', () => {
    expect(italianToIpa('casa')).toBe('kaza');
    expect(italianToIpa('sole')).toBe('sole');
  });

  it('semiconsonantes ante vocal', () => {
    expect(italianToIpa('piano')).toBe('pjano');
    expect(italianToIpa('cuore')).toBe('kwore');
    expect(italianToIpa('quando')).toBe('kwando');
  });

  it('transcribe una línea real de letra', () => {
    expect(italianToIpa('Nel blu dipinto di blu')).toBe('nel blu dipinto di blu');
  });
});

// ===========================================================================
// Francés
// ===========================================================================

describe('frenchToIpa — vocales nasales', () => {
  it('an/en, in/ain, on y un', () => {
    expect(frenchToIpa('chanson')).toBe('ʃɑ̃sɔ̃');
    expect(frenchToIpa('pain')).toBe('pɛ̃');
    expect(frenchToIpa('non')).toBe('nɔ̃');
    expect(frenchToIpa('un')).toBe('œ̃');
  });

  it('ien y oin', () => {
    expect(frenchToIpa('rien')).toBe('ʁjɛ̃');
    expect(frenchToIpa('loin')).toBe('lwɛ̃');
  });

  it('deshace la nasal ante vocal o nasal doble', () => {
    expect(frenchToIpa('bonne')).toBe('bɔnə');
    expect(frenchToIpa('ami')).toBe('ami');
  });
});

describe('frenchToIpa — dígrafos y finales mudas', () => {
  it('eau, au, ou, oi, eu, ui', () => {
    expect(frenchToIpa('beau')).toBe('bo');
    expect(frenchToIpa('amour')).toBe('amuʁ');
    expect(frenchToIpa('toi')).toBe('twa');
    expect(frenchToIpa('nuit')).toBe('nɥi');
    expect(frenchToIpa('coeur')).toBe('kœʁ');
  });

  it('poda la cola de consonantes mudas', () => {
    expect(frenchToIpa('temps')).toBe('tɑ̃');
    expect(frenchToIpa('beaucoup')).toBe('boku');
  });

  it('conserva C-R-F-L finales', () => {
    expect(frenchToIpa('mer')).toBe('mɛʁ');
    expect(frenchToIpa('avec')).toBe('avɛk');
  });

  it('canta la e muda final como schwa', () => {
    expect(frenchToIpa('je')).toBe('ʒə');
    expect(frenchToIpa('belle')).toBe('bɛlə');
    expect(frenchToIpa('vie')).toBe('viə');
  });

  it('-ment nasal frente a -ent verbal mudo', () => {
    expect(frenchToIpa('vraiment')).toBe('vʁɛmɑ̃');
    expect(frenchToIpa('chantent')).toBe('ʃɑ̃t');
  });

  it('ch, gn, j, ç e -ill-', () => {
    expect(frenchToIpa('chat')).toBe('ʃa');
    expect(frenchToIpa('fille')).toBe('fijə');
    expect(frenchToIpa('ville')).toBe('vilə');
  });
});

// ===========================================================================
// Alemán
// ===========================================================================

describe('germanToIpa — ich-Laut y ach-Laut', () => {
  it('ach-Laut solo tras a, o, u', () => {
    expect(germanToIpa('Nacht')).toBe('naxt');
    expect(germanToIpa('auch')).toBe('ʔaʊx');
    // Limitación declarada: la cantidad de la vocal ante ⟨ch⟩ es léxica en
    // alemán ("Buch" larga, "Bach" breve) y aquí se resuelve siempre breve.
    expect(germanToIpa('Buch')).toBe('bʊx');
  });

  it('ich-Laut tras vocal palatal, consonante y en -chen', () => {
    expect(germanToIpa('ich')).toBe('ʔɪç');
    expect(germanToIpa('durch')).toBe('dʊʁç');
    expect(germanToIpa('Milch')).toBe('mɪlç');
  });
});

describe('germanToIpa — cantidad vocálica', () => {
  it('h de alargamiento y vocal doble alargan', () => {
    expect(germanToIpa('Sohn')).toBe('zoːn');
    expect(germanToIpa('Saat')).toBe('zaːt');
  });

  it('ie es larga', () => {
    expect(germanToIpa('Liebe')).toBe('liːbə');
  });

  it('dos o más consonantes acortan y cambian el timbre', () => {
    expect(germanToIpa('Stadt')).toBe('ʃtat');
    expect(germanToIpa('Welt')).toBe('vɛlt');
  });
});

describe('germanToIpa — consonantes y ataque', () => {
  it('marca el golpe glótico ante vocal inicial', () => {
    expect(germanToIpa('und')).toBe('ʔʊnt');
    expect(germanToIpa('alles')).toBe('ʔaləs');
  });

  it('ensordece b, d, g finales', () => {
    expect(germanToIpa('Tag')).toBe('taːk');
    expect(germanToIpa('Lied')).toBe('liːt');
  });

  it('sp-/st- iniciales, sch, s ante vocal, w, v, z', () => {
    expect(germanToIpa('Straße')).toBe('ʃtʁaːsə');
    expect(germanToIpa('schön')).toBe('ʃøːn');
    expect(germanToIpa('Sonne')).toBe('zɔnə');
    expect(germanToIpa('Welt')).toBe('vɛlt');
    expect(germanToIpa('Zeit')).toBe('tsaɪt');
  });

  it('diptongos ei, au, eu', () => {
    expect(germanToIpa('mein')).toBe('maɪn');
    expect(germanToIpa('Freude')).toBe('fʁɔʏdə');
  });

  it('terminaciones átonas -er y -e', () => {
    expect(germanToIpa('Vater')).toBe('faːtɐ');
    expect(germanToIpa('singen')).toBe('zɪŋən');
  });
});

// ===========================================================================
// Robustez común
// ===========================================================================

describe('motores latinos — robustez', () => {
  it('no tocan puntuación, dígitos ni otros scripts', () => {
    expect(italianToIpa('3 note, ok?')).toBe('3 note, ok?');
    expect(frenchToIpa('— oui!')).toBe('— wi!');
    expect(germanToIpa('(ja)')).toBe('(jaː)');
  });

  it('aceptan cadena vacía', () => {
    expect(italianToIpa('')).toBe('');
    expect(frenchToIpa('')).toBe('');
    expect(germanToIpa('')).toBe('');
  });

  it('tratan la elisión con apóstrofo como una sola palabra', () => {
    expect(italianToIpa("l'amore")).toBe('lamore');
    expect(frenchToIpa("j'ai")).toBe('ʒɛ');
  });
});
