import { describe, expect, it } from 'vitest';
import { detectLatinLanguage, scoreLanguages, hasIpaEngine } from '../electron/services/phonetics/langDetect';

// Muestras escritas para el test (frases corrientes, no letras reales) con la
// densidad de palabras funcionales que tiene una canción de verdad.
const ES = [
  'No sé si volverás cuando la noche pase',
  'Y en el silencio de mi corazón te espero',
  'Porque siempre supe que este amor no tiene fin',
];
const IT = [
  'Non so se tornerai quando la notte passa',
  'E nel silenzio del mio cuore ti aspetto',
  'Perché ho sempre saputo che questo amore non ha fine',
];
const FR = [
  'Je ne sais pas si tu reviendras quand la nuit passe',
  'Et dans le silence de mon coeur je t attends',
  'Parce que j ai toujours su que cet amour est sans fin',
];
const DE = [
  'Ich weiß nicht ob du wiederkommst wenn die Nacht vergeht',
  'Und in der Stille von meinem Herz warte ich auf dich',
  'Weil ich immer wusste dass diese Liebe nie endet',
];
const EN = [
  'I don t know if you will come back when the night is over',
  'And in the silence of my heart I am waiting for you',
  'Because I always knew that this love would never end',
];
const PT = [
  'Não sei se você vai voltar quando a noite passar',
  'E no silêncio do meu coração eu espero por você',
  'Porque eu sempre soube que esse amor não tem fim',
];

describe('detectLatinLanguage — identifica los cuatro idiomas con motor', () => {
  it('reconoce el español', () => {
    expect(detectLatinLanguage(ES)).toBe('es');
  });

  it('reconoce el italiano', () => {
    expect(detectLatinLanguage(IT)).toBe('it');
  });

  it('reconoce el francés', () => {
    expect(detectLatinLanguage(FR)).toBe('fr');
  });

  it('reconoce el alemán', () => {
    expect(detectLatinLanguage(DE)).toBe('de');
  });
});

describe('detectLatinLanguage — prefiere no responder antes que responder mal', () => {
  it('devuelve null con inglés: no hay motor y transcribirlo sería inventar', () => {
    expect(detectLatinLanguage(EN)).toBeNull();
  });

  it('devuelve null con portugués en vez de tratarlo como español', () => {
    expect(detectLatinLanguage(PT)).toBeNull();
  });

  it('devuelve null con muestras sin contenido léxico', () => {
    expect(detectLatinLanguage(['na na na', 'oh oh oh', 'la la la'])).toBeNull();
  });

  it('devuelve null con una sola línea corta', () => {
    expect(detectLatinLanguage(['te quiero'])).toBeNull();
  });

  it('devuelve null con entrada vacía', () => {
    expect(detectLatinLanguage([])).toBeNull();
    expect(detectLatinLanguage([''])).toBeNull();
  });
});

describe('detectLatinLanguage — casos mixtos', () => {
  it('mantiene el español aunque el estribillo esté en inglés', () => {
    const mixed = [...ES, 'baby I love you', 'oh baby tonight'];
    expect(detectLatinLanguage(mixed)).toBe('es');
  });

  it('devuelve null cuando ninguno saca ventaja clara', () => {
    const tied = ['la vie', 'la vida', 'la vita'];
    expect(detectLatinLanguage(tied)).toBeNull();
  });
});

describe('scoreLanguages — evidencia inspeccionable', () => {
  it('puntúa más alto al idioma correcto', () => {
    const scores = scoreLanguages(ES.join('\n'));
    expect(scores.es).toBeGreaterThan(scores.it);
    expect(scores.es).toBeGreaterThan(scores.en);
  });

  it('la ñ es evidencia fuerte de español', () => {
    const withEnye = scoreLanguages('mañana');
    expect(withEnye.es).toBeGreaterThan(0);
  });

  it('la ß es evidencia fuerte de alemán', () => {
    const withEszett = scoreLanguages('Straße');
    expect(withEszett.de).toBeGreaterThan(0);
  });
});

describe('hasIpaEngine', () => {
  it('acepta los cuatro idiomas implementados', () => {
    expect(hasIpaEngine('es')).toBe(true);
    expect(hasIpaEngine('de')).toBe(true);
  });

  it('rechaza inglés, portugués y null', () => {
    expect(hasIpaEngine('en')).toBe(false);
    expect(hasIpaEngine('pt')).toBe(false);
    expect(hasIpaEngine(null)).toBe(false);
  });
});
