import { describe, expect, it } from 'vitest';
import { spanishToIpa } from '../electron/services/phonetics/spanish';

describe('spanishToIpa — reglas básicas', () => {
  it('transcribe las cinco vocales sin alterarlas', () => {
    expect(spanishToIpa('la mesa')).toBe('la mesa');
  });

  it('aplica seseo por defecto en c ante e/i y en z', () => {
    expect(spanishToIpa('corazón')).toBe('koɾason');
    expect(spanishToIpa('cielo')).toBe('sjelo');
  });

  it('aplica distinción castellana cuando se pide', () => {
    expect(spanishToIpa('corazón', 'distincion')).toBe('koɾaθon');
    expect(spanishToIpa('cielo', 'distincion')).toBe('θjelo');
  });

  it('enmudece la h', () => {
    expect(spanishToIpa('hola')).toBe('ola');
    expect(spanishToIpa('ahora')).toBe('aoɾa');
  });

  it('convierte la u de hue- en semiconsonante', () => {
    expect(spanishToIpa('hueso')).toBe('weso');
  });
});

describe('spanishToIpa — alófonos que importan al cantar', () => {
  it('b/v son oclusivas en inicial y tras nasal, aproximantes en el resto', () => {
    expect(spanishToIpa('vida')).toBe('biða');
    expect(spanishToIpa('hombre')).toBe('ombɾe');
    expect(spanishToIpa('lavar')).toBe('laβaɾ');
  });

  it('d es aproximante entre vocales', () => {
    expect(spanishToIpa('nada')).toBe('naða');
    expect(spanishToIpa('donde')).toBe('donde');
  });

  it('g es aproximante entre vocales y velar fricativa ante e/i', () => {
    expect(spanishToIpa('amigo')).toBe('amiɣo');
    expect(spanishToIpa('gente')).toBe('xente');
    expect(spanishToIpa('agua')).toBe('aɣwa');
  });

  it('asimila la nasal ante velar y ante bilabial dentro de la palabra', () => {
    expect(spanishToIpa('tango')).toBe('taŋgo');
    expect(spanishToIpa('enviar')).toBe('embjaɾ');
  });

  it('NO asimila entre palabras: el motor trabaja palabra a palabra', () => {
    // "un beso" se pronuncia [um beso] en habla encadenada. Queda fuera por
    // diseño, igual que la liaison francesa; documentado en la cabecera.
    expect(spanishToIpa('un beso')).toBe('un beso');
  });

  it('sonoriza la s ante consonante sonora', () => {
    expect(spanishToIpa('mismo')).toBe('mizmo');
    expect(spanishToIpa('desde')).toBe('dezðe');
  });
});

describe('spanishToIpa — dígrafos y vibrantes', () => {
  it('ch, ll, ñ', () => {
    expect(spanishToIpa('noche')).toBe('notʃe');
    expect(spanishToIpa('llorar')).toBe('ʝoɾaɾ');
    expect(spanishToIpa('año')).toBe('aɲo');
  });

  it('distingue vibrante múltiple y simple', () => {
    expect(spanishToIpa('perro')).toBe('pero');
    expect(spanishToIpa('pero')).toBe('peɾo');
    expect(spanishToIpa('rosa')).toBe('rosa');
  });

  it('enmudece la u de que/qui y gue/gui', () => {
    expect(spanishToIpa('queso')).toBe('keso');
    expect(spanishToIpa('guitarra')).toBe('gitara');
  });

  it('devuelve la u con diéresis', () => {
    expect(spanishToIpa('pingüino')).toBe('piŋgwino');
  });
});

describe('spanishToIpa — diptongos', () => {
  it('i/u átonas ante vocal son semiconsonantes', () => {
    expect(spanishToIpa('bien')).toBe('bjen');
    expect(spanishToIpa('cuatro')).toBe('kwatɾo');
  });

  it('la tilde rompe el diptongo', () => {
    expect(spanishToIpa('día')).toBe('dia');
    expect(spanishToIpa('púa')).toBe('pua');
  });

  it('no convierte en semiconsonante la i tras vocal', () => {
    expect(spanishToIpa('aire')).toBe('aiɾe');
  });
});

describe('spanishToIpa — robustez', () => {
  it('conserva puntuación, espacios y mayúsculas del entorno', () => {
    expect(spanishToIpa('¿Dónde estás, amor?')).toBe('¿donde estas, amoɾ?');
  });

  it('no toca dígitos ni otros scripts', () => {
    expect(spanishToIpa('son 3 とき')).toBe('son 3 とき');
  });

  it('devuelve cadena vacía para entrada vacía', () => {
    expect(spanishToIpa('')).toBe('');
  });

  it('transcribe una línea real de letra', () => {
    expect(spanishToIpa('Y nos dieron las diez')).toBe('i nos djeɾon las djes');
  });
});
