// ============================================================================
// ipaGuideData.ts — catálogo de símbolos IPA, en español (para hispanohablantes)
// y en inglés (para angloparlantes: cada sonido se explica desde el inglés
// cuando existe equivalente).
//
// Cubre TODOS los símbolos que pueden producir los motores de la app:
// kana→IPA (japonés), español, italiano, francés, alemán e inglés (CMUdict).
// Las claves de varias letras (diptongos ingleses, africados) deben
// tokenizarse como UNA unidad; los diacríticos (ː, ̃, ʲ, ˈ, ˌ) tienen ficha
// propia porque se combinan con la vocal o consonante que preceden.
//
// `ipaSymbolsIn` tokeniza por coincidencia más larga contra las claves
// (ordenadas por longitud), ignora espacios, puntuación y dígitos, y
// devuelve también los caracteres sin ficha para que la UI pueda detectarlos.
// ============================================================================

/** Ficha en español: explicada desde el español cuando existe equivalente. */
export interface IpaGuideTextEs {
  /** Qué es el sonido. */
  desc: string;
  /** Palabra o sílaba de ejemplo en el idioma de origen del símbolo. */
  ejemplo: string;
}

/** Ficha en inglés: explicada desde el inglés cuando existe equivalente. */
export interface IpaGuideTextEn {
  desc: string;
  example: string;
}

export interface IpaGuideEntry {
  es: IpaGuideTextEs;
  en: IpaGuideTextEn;
}

export const IPA_GUIDE: Record<string, IpaGuideEntry> = {
  'a': {
    es: { desc: 'A abierta, como la a española de «casa».', ejemplo: 'casa · padre' },
    en: { desc: "Open 'a', like the 'a' in Spanish 'casa': close to the 'a' in 'father', but shorter.", example: 'casa · padre' },
  },
  'e': {
    es: { desc: 'E media, como la e española de «mesa».', ejemplo: 'mesa' },
    en: { desc: "Pure 'e', like Spanish 'mesa': the start of 'say' without gliding into 'ee'.", example: 'mesa' },
  },
  'i': {
    es: { desc: 'I cerrada, como la i española de «sí». En inglés es más larga y tensa («see»).', ejemplo: 'sí · see' },
    en: { desc: "'ee' as in 'see'. In Spanish and Japanese it is short and pure.", example: 'see · sí' },
  },
  'o': {
    es: { desc: 'O media, como la o española de «no».', ejemplo: 'no' },
    en: { desc: "Pure 'o', like Spanish 'no': the start of 'go' without gliding into 'oo'.", example: 'no' },
  },
  'u': {
    es: { desc: 'U cerrada, como la u española de «tú». En inglés es más larga («blue»).', ejemplo: 'tú · blue' },
    en: { desc: "'oo' as in 'blue'. In Spanish and Japanese it is shorter and pure.", example: 'blue · tú' },
  },
  'ɑ': {
    es: { desc: 'A abierta y más atrás en la boca que la a española (inglés «father», «hot»).', ejemplo: 'father · hot' },
    en: { desc: "Open 'ah' made far back in the mouth, as in 'father' or American 'hot'.", example: 'father · hot' },
  },
  'æ': {
    es: { desc: 'Vocal entre a y e, con la boca muy abierta. No existe en español.', ejemplo: 'cat · bad' },
    en: { desc: "The 'a' in 'cat': mouth wide open, between 'ah' and 'eh'.", example: 'cat · bad' },
  },
  'ʌ': {
    es: { desc: 'A breve, relajada y central (inglés «cup», «love»). Suena parecida a una a corta.', ejemplo: 'cup · love' },
    en: { desc: "Short, relaxed 'uh', as in 'cup' and 'love'.", example: 'cup · love' },
  },
  'ə': {
    es: { desc: 'Schwa: vocal neutra y débil de las sílabas átonas; ni a ni e, con la boca relajada.', ejemplo: 'about · sofa' },
    en: { desc: "Schwa: the weak, neutral 'uh' of unstressed syllables, as in 'about' and 'sofa'.", example: 'about · sofa' },
  },
  'ɚ': {
    es: { desc: 'Schwa con r: vocal átona con la lengua curvada hacia atrás (inglés «water»).', ejemplo: 'water · better' },
    en: { desc: "Unstressed 'er', as in American 'water' and 'better'.", example: 'water · better' },
  },
  'ɝ': {
    es: { desc: 'Vocal tónica con r (inglés «bird», «world»): la lengua curvada, sin pronunciar una vocal aparte.', ejemplo: 'bird · world' },
    en: { desc: "Stressed 'er', as in 'bird' and 'world': no separate vowel, just the curled-tongue r sound.", example: 'bird · world' },
  },
  'ɔ': {
    es: { desc: 'O abierta, más abierta que la o española (inglés «thought», francés «fort»).', ejemplo: 'thought · fort' },
    en: { desc: "Open 'aw', as in 'thought' (in accents that keep it distinct from 'hot'); French 'fort'.", example: 'thought · fort' },
  },
  'ɛ': {
    es: { desc: 'E abierta, algo más abierta que la e española (inglés «bed», francés «mère»).', ejemplo: 'bed · mère' },
    en: { desc: "Open 'e', as in 'bed'; French 'mère'.", example: 'bed · mère' },
  },
  'ɪ': {
    es: { desc: 'I breve y relajada, entre i y e (inglés «sit»). Distinta de la i larga de «seat».', ejemplo: 'sit · big' },
    en: { desc: "Short, relaxed 'i', as in 'sit': not the long 'ee' of 'seat'.", example: 'sit · big' },
  },
  'ʊ': {
    es: { desc: 'U breve y relajada, entre u y o (inglés «book»). Distinta de la u larga de «food».', ejemplo: 'book · good' },
    en: { desc: "Short, relaxed 'oo', as in 'book': not the long 'oo' of 'food'.", example: 'book · good' },
  },
  'ɯ': {
    es: { desc: 'U japonesa (う): como una u pero sin redondear los labios.', ejemplo: 'う (u) · すし' },
    en: { desc: "Japanese 'u' (う): like 'oo', but without rounding the lips.", example: 'う (u) · すし' },
  },
  'œ': {
    es: { desc: 'E abierta con los labios redondeados como para o (francés «cœur», alemán «können»).', ejemplo: 'cœur · können' },
    en: { desc: "Say the 'e' of 'bed' with your lips rounded as for 'o' (French 'cœur', German 'können').", example: 'cœur · können' },
  },
  'ø': {
    es: { desc: 'E cerrada con los labios redondeados como para o (francés «peu», alemán «schön»).', ejemplo: 'peu · schön' },
    en: { desc: "Say a pure 'e' (no glide) with your lips rounded as for 'oo' (French 'peu', German 'schön').", example: 'peu · schön' },
  },
  'ɐ': {
    es: { desc: 'Vocal central abierta y breve; en alemán, la -er final de «Vater».', ejemplo: 'Vater · besser' },
    en: { desc: "Short, open central 'uh'; the final -er of German 'Vater', like British 'butter' without the r.", example: 'Vater · besser' },
  },
  'ʏ': {
    es: { desc: 'Ü breve y relajada del alemán: i con los labios redondeados, más abierta que y.', ejemplo: 'Glück · hübsch' },
    en: { desc: "German short 'ü': the 'i' of 'sit' said with rounded lips.", example: 'Glück · hübsch' },
  },
  'y': {
    es: { desc: 'I con los labios redondeados como para u (francés «tu», alemán «für»).', ejemplo: 'tu · für' },
    en: { desc: "Say 'ee' with your lips rounded as for 'oo' (French 'tu', German 'für').", example: 'tu · für' },
  },
  'aɪ': {
    es: { desc: 'Diptongo «ai», como en «baile».', ejemplo: 'my · night' },
    en: { desc: "The 'eye' sound, as in 'my' and 'night'.", example: 'my · night' },
  },
  'aʊ': {
    es: { desc: 'Diptongo «au», como en «causa».', ejemplo: 'now · house' },
    en: { desc: "The 'ow' sound, as in 'now' and 'house'.", example: 'now · house' },
  },
  'eɪ': {
    es: { desc: 'Diptongo «ei», como en «rey».', ejemplo: 'say · baby' },
    en: { desc: "The 'ay' sound, as in 'say' and 'baby'.", example: 'say · baby' },
  },
  'oʊ': {
    es: { desc: 'Diptongo de o que se cierra hacia u, como «ou». No existe en español.', ejemplo: 'go · hello' },
    en: { desc: "The 'oh' sound that glides toward 'oo', as in 'go' and 'hello'.", example: 'go · hello' },
  },
  'ɔɪ': {
    es: { desc: 'Diptongo «oi», como en «hoy», pero con la o más abierta.', ejemplo: 'boy · voice' },
    en: { desc: "The 'oy' sound, as in 'boy' and 'voice'.", example: 'boy · voice' },
  },
  'ɔʏ': {
    es: { desc: 'Diptongo alemán «eu/äu»: o abierta que se cierra hacia ü.', ejemplo: 'Freude · Häuser' },
    en: { desc: "German 'eu/äu': close to the 'oy' in 'boy'.", example: 'Freude · Häuser' },
  },
  'p': {
    es: { desc: 'P, como la p española. En inglés y alemán, al inicio de sílaba tónica sale con un soplo de aire.', ejemplo: 'padre · pen' },
    en: { desc: "'p' as in 'pen'. In Spanish, French, Italian and Japanese it has no puff of air, like the 'p' in 'spin'.", example: 'pen · padre' },
  },
  'b': {
    es: { desc: 'B fuerte, como la de «boca» o «hombre» (con los labios cerrados).', ejemplo: 'boca · baby' },
    en: { desc: "'b' as in 'boy'.", example: 'baby · boca' },
  },
  't': {
    es: { desc: 'T, como la t española (en inglés se apoya en las encías, no en los dientes).', ejemplo: 'tú · time' },
    en: { desc: "'t' as in 'time'. In Spanish, French and Italian the tongue touches the back of the teeth, with no puff of air.", example: 'time · tú' },
  },
  'd': {
    es: { desc: 'D fuerte, como la de «dedo» o «andar».', ejemplo: 'dedo · day' },
    en: { desc: "'d' as in 'day'. In Spanish the tongue touches the back of the teeth.", example: 'day · dedo' },
  },
  'k': {
    es: { desc: 'K, como la c de «casa» o la k de «kilo».', ejemplo: 'casa · kilo' },
    en: { desc: "'k' as in 'kite'. In Spanish and Italian it has no puff of air, like the 'k' in 'sky'.", example: 'kilo · casa' },
  },
  'ɡ': {
    es: { desc: 'G fuerte, como la de «gato» o «tengo».', ejemplo: 'gato · go' },
    en: { desc: "Hard 'g' as in 'go'.", example: 'go · gato' },
  },
  'g': {
    es: { desc: 'Otra forma de escribir ɡ: la g fuerte de «gato».', ejemplo: 'gato' },
    en: { desc: "Another way to write ɡ: the hard 'g' of 'go'.", example: 'go' },
  },
  'f': {
    es: { desc: 'F, como la f española.', ejemplo: 'fuego · fun' },
    en: { desc: "'f' as in 'fun'.", example: 'fun · fuego' },
  },
  'v': {
    es: { desc: 'V con los dientes de arriba sobre el labio de abajo y la voz vibrando. No existe en el español general.', ejemplo: 'very · vous' },
    en: { desc: "'v' as in 'very'.", example: 'very · vous' },
  },
  's': {
    es: { desc: 'S, como la s española.', ejemplo: 'sí · see' },
    en: { desc: "'s' as in 'see'.", example: 'see · sí' },
  },
  'z': {
    es: { desc: 'S sonora, con la voz vibrando (inglés «zoo», «is»). En español solo aparece a veces ante consonante sonora («mismo»).', ejemplo: 'zoo · rose · mismo' },
    en: { desc: "'z' as in 'zoo' and 'is'.", example: 'zoo · rose · mismo' },
  },
  'ʃ': {
    es: { desc: 'SH: el sonido de pedir silencio («shhh»).', ejemplo: 'shop · chat (fr.)' },
    en: { desc: "'sh' as in 'shop'.", example: 'shop · chat (French)' },
  },
  'ʒ': {
    es: { desc: 'Como la ll/y rioplatense de «yo», «calle» (Buenos Aires, Montevideo).', ejemplo: 'vision · je · yo (rioplatense)' },
    en: { desc: "The 's' in 'vision' or 'measure'; the French 'j' in 'je'.", example: 'vision · measure · je' },
  },
  'θ': {
    es: { desc: 'Como la z/c de España («zapato», «cielo»): la lengua entre los dientes.', ejemplo: 'think · zapato' },
    en: { desc: "'th' in 'think' (no voice). Also the 'z'/'c' of Spain's Spanish ('zapato').", example: 'think · zapato' },
  },
  'ð': {
    es: { desc: 'Parecida a la d suave de «cada», con la lengua entre los dientes (inglés «this»).', ejemplo: 'this · cada' },
    en: { desc: "'th' in 'this' (with voice). The soft Spanish 'd' between vowels ('cada') is close to it.", example: 'this · cada' },
  },
  'x': {
    es: { desc: 'J española de «jamón» o «gente»; también la ch alemana tras a, o, u.', ejemplo: 'jamón · Nacht' },
    en: { desc: "A throaty 'h', like the 'ch' in Scottish 'loch': Spanish 'j' in 'jamón', German 'ch' in 'Nacht'.", example: 'loch · jamón · Nacht' },
  },
  'ç': {
    es: { desc: 'CH alemana tras e, i («ich»): como una j muy suave hecha contra el paladar, parecida a soplar una i.', ejemplo: 'ich · Milch' },
    en: { desc: "German 'ch' after e or i ('ich'): like the 'h' in 'huge', with more friction.", example: 'ich · Milch · huge' },
  },
  'ɕ': {
    es: { desc: 'SH japonesa (し): más suave que ʃ, con la lengua hacia el paladar.', ejemplo: 'し (shi)' },
    en: { desc: "Japanese 'sh' (し): softer than English 'sh', with the tongue raised toward the palate.", example: 'し (shi)' },
  },
  'ɸ': {
    es: { desc: 'F japonesa (ふ): se sopla entre los labios, sin que los dientes toquen el labio.', ejemplo: 'ふ (fu)' },
    en: { desc: "Japanese 'f' (ふ): blow air between both lips, as if blowing out a candle; the teeth don't touch the lip.", example: 'ふ (fu)' },
  },
  'β': {
    es: { desc: 'B suave entre vocales, sin cerrar del todo los labios («lavar», «la vaca»).', ejemplo: 'lavar · la vaca' },
    en: { desc: "Soft Spanish 'b' between vowels: the lips almost touch but never close ('lavar', 'la vaca').", example: 'lavar · la vaca' },
  },
  'ɣ': {
    es: { desc: 'G suave entre vocales, sin cerrar del todo («amigo», «lago»).', ejemplo: 'amigo · lago' },
    en: { desc: "Soft Spanish 'g' between vowels: the back of the tongue almost touches the palate but never closes ('amigo').", example: 'amigo · lago' },
  },
  'ʁ': {
    es: { desc: 'R francesa o alemana: se produce al fondo de la boca, cerca de la garganta.', ejemplo: 'rue · rot' },
    en: { desc: "French or German 'r': made at the back of the throat, close to a light gargle.", example: 'rue · rot' },
  },
  'tʃ': {
    es: { desc: 'CH de «chico».', ejemplo: 'chico · church' },
    en: { desc: "'ch' as in 'church'.", example: 'church · chico' },
  },
  'dʒ': {
    es: { desc: 'Y fuerte de «yo» dicho con énfasis o de «cónyuge»; inglés «judge».', ejemplo: 'judge · gin' },
    en: { desc: "'j' as in 'judge' and 'gin'.", example: 'judge · gin' },
  },
  'ts': {
    es: { desc: 'TS, como en «tsunami»; italiano «pizza», japonés つ.', ejemplo: 'tsunami · pizza · つ' },
    en: { desc: "'ts' as in 'cats', also at the start of a word ('tsunami'); Italian 'pizza', Japanese つ.", example: 'cats · pizza · つ' },
  },
  'dz': {
    es: { desc: 'DS sonora: como ts pero con la voz vibrando (italiano «mezzo», japonés ざ).', ejemplo: 'mezzo · ざ (za)' },
    en: { desc: "'ds' as in 'beds', also at the start of a word: Italian 'mezzo', Japanese ざ.", example: 'beds · mezzo · ざ (za)' },
  },
  'tɕ': {
    es: { desc: 'CH japonesa (ち): como la ch de «chico», con la lengua más hacia el paladar.', ejemplo: 'ち (chi)' },
    en: { desc: "Japanese 'ch' (ち): like the 'ch' in 'cheese', with the tongue further toward the palate.", example: 'ち (chi)' },
  },
  'dʑ': {
    es: { desc: 'J japonesa (じ): como una y fuerte de «yo», con la lengua hacia el paladar.', ejemplo: 'じ (ji)' },
    en: { desc: "Japanese 'j' (じ): like the 'j' in 'jeep', with the tongue further toward the palate.", example: 'じ (ji)' },
  },
  'm': {
    es: { desc: 'M, como la m española.', ejemplo: 'mamá' },
    en: { desc: "'m' as in 'mom'.", example: 'mom · mamá' },
  },
  'n': {
    es: { desc: 'N, como la n española.', ejemplo: 'nada' },
    en: { desc: "'n' as in 'no'.", example: 'no · nada' },
  },
  'ŋ': {
    es: { desc: 'N de «tengo» o «banco» (con el fondo de la lengua); inglés «sing», sin pronunciar la g.', ejemplo: 'sing · tengo' },
    en: { desc: "'ng' as in 'sing', without pronouncing a 'g'.", example: 'sing · tengo' },
  },
  'ɲ': {
    es: { desc: 'Ñ española; italiano gn, francés gn.', ejemplo: 'año · gnocchi' },
    en: { desc: "'ny' as in 'canyon', said as one sound: Spanish 'ñ', Italian and French 'gn'.", example: 'canyon · año · gnocchi' },
  },
  'ɴ': {
    es: { desc: 'N final japonesa (ん): con el fondo de la lengua y sin cerrar del todo.', ejemplo: 'ん (n) · ほん' },
    en: { desc: "Japanese final 'n' (ん): made with the back of the tongue, without fully closing.", example: 'ん (n) · ほん' },
  },
  'l': {
    es: { desc: 'L, como la l española (en inglés, al final de sílaba suena más oscura: «feel»).', ejemplo: 'luna · feel' },
    en: { desc: "'l'. In Spanish, French and Italian it is always the clear 'l' of 'leaf', never the dark 'l' of 'feel'.", example: 'leaf · luna' },
  },
  'ʎ': {
    es: { desc: 'LL tradicional (zonas de España y los Andes: «calle»); italiano gli.', ejemplo: 'figlio · calle' },
    en: { desc: "The 'lli' in 'million' said as a single sound: Italian 'gli', traditional Spanish 'll'.", example: 'figlio · calle' },
  },
  'ɹ': {
    es: { desc: 'R inglesa: la lengua se curva sin tocar el paladar y sin vibrar.', ejemplo: 'red · sorry' },
    en: { desc: "English 'r': the tongue curls back without touching anything and without trilling.", example: 'red · sorry' },
  },
  'r': {
    es: { desc: 'RR vibrante múltiple, como en «perro».', ejemplo: 'perro · rosa' },
    en: { desc: "Trilled 'r', as in Spanish 'perro': the tip of the tongue vibrates several times.", example: 'perro · rosa' },
  },
  'ɾ': {
    es: { desc: 'R simple, como en «pero» o «cara» (también la r japonesa).', ejemplo: 'pero · から' },
    en: { desc: "Single tapped 'r', like the 'tt' in American 'butter' (Spanish 'pero', the Japanese r).", example: 'butter · pero · から' },
  },
  'ʝ': {
    es: { desc: 'Y/LL de «yo» o «lluvia» (yeísmo).', ejemplo: 'yo · lluvia' },
    en: { desc: "Spanish 'y'/'ll' in 'yo': like the 'y' in 'yes', with more friction.", example: 'yo · lluvia' },
  },
  'j': {
    es: { desc: 'Semivocal i, como la i de «hielo» o «tierra».', ejemplo: 'yes · hielo' },
    en: { desc: "'y' as in 'yes'.", example: 'yes · hielo' },
  },
  'w': {
    es: { desc: 'Semivocal u, como la u de «cuando» o «huevo».', ejemplo: 'water · cuando' },
    en: { desc: "'w' as in 'water'.", example: 'water · cuando' },
  },
  'ɥ': {
    es: { desc: 'Semivocal de la u francesa: como w pero con los labios de «tu» (francés «nuit»).', ejemplo: 'nuit · lui' },
    en: { desc: "French semivowel: a 'w' said with the rounded lips of French 'tu' ('nuit').", example: 'nuit · lui' },
  },
  'ɰ': {
    es: { desc: 'W japonesa (わ): como una w con los labios casi sin redondear.', ejemplo: 'わ (wa)' },
    en: { desc: "Japanese 'w' (わ): like 'w', but with the lips barely rounded.", example: 'わ (wa)' },
  },
  'h': {
    es: { desc: 'Soplo suave, más suave que la j española (inglés «hello», alemán «Haus»).', ejemplo: 'hello · Haus' },
    en: { desc: "'h' as in 'hello'.", example: 'hello · Haus' },
  },
  'ʔ': {
    es: { desc: 'Golpe de glotis: un corte breve en la garganta (alemán al inicio de palabra con vocal, inglés «uh-oh»).', ejemplo: 'uh-oh · Ende' },
    en: { desc: "Glottal stop: the catch in the throat in 'uh-oh'.", example: 'uh-oh · Ende' },
  },
  'ː': {
    es: { desc: 'Marca de vocal LARGA: se sostiene más tiempo (italiano en sílaba tónica, alemán, japonés ー).', ejemplo: 'amore · Vater · ー' },
    en: { desc: 'LONG vowel mark: hold the sound longer (stressed Italian syllables, German, Japanese ー).', example: 'amore · Vater · ー' },
  },
  '̃': {
    es: { desc: 'Marca de vocal NASAL: deja salir el aire también por la nariz (francés «bon», «un»).', ejemplo: 'bon → bɔ̃' },
    en: { desc: "NASAL vowel mark: let the air out through the nose too (French 'bon', 'un').", example: 'bon → bɔ̃' },
  },
  'ʲ': {
    es: { desc: 'Palatalización: la consonante se dice con la lengua hacia el paladar, como si tuviera una i pegada.', ejemplo: 'きゃ → kʲa' },
    en: { desc: "Palatalization: the consonant is said with the tongue raised, as if a 'y' followed it (like the 'c' in 'cute').", example: 'きゃ → kʲa · cute' },
  },
  'ˈ': {
    es: { desc: 'Acento PRINCIPAL: la sílaba que sigue a la marca es la fuerte.', ejemplo: 'həˈloʊ (hello)' },
    en: { desc: 'PRIMARY stress: the syllable after this mark is the strong one.', example: 'həˈloʊ (hello)' },
  },
  'ˌ': {
    es: { desc: 'Acento SECUNDARIO: sílaba con un acento más débil que el principal.', ejemplo: 'ˌæftɚˈnun (afternoon)' },
    en: { desc: 'SECONDARY stress: a syllable with weaker stress than the primary one.', example: 'ˌæftɚˈnun (afternoon)' },
  },
};

/** Texto de una ficha en el idioma de la interfaz. */
export function ipaGuideText(
  entry: IpaGuideEntry,
  locale: 'en' | 'es',
): { desc: string; example: string } {
  return locale === 'es' ? { desc: entry.es.desc, example: entry.es.ejemplo } : entry.en;
}

/** Claves ordenadas de más larga a más corta, para la coincidencia máxima. */
const GUIDE_KEYS = Object.keys(IPA_GUIDE).sort((a, b) => b.length - a.length);

/**
 * Caracteres que no aportan sonido: espacios, puntuación y dígitos.
 * El punto también se ignora: los motores no lo usan como separador de
 * sílabas, así que en una línea de letra solo es puntuación.
 */
const IGNORED_RE = /[\s\d.,!?;:'"()[\]{}<>«»¿¡…—–\-_/\\|@#$%^&*+=~`]/;

/**
 * Extrae los símbolos IPA presentes en una transcripción.
 *
 * - Tokeniza por coincidencia más larga contra IPA_GUIDE (los diptongos y
 *   africados salen como una sola unidad).
 * - Ignora espacios, puntuación y dígitos.
 * - Deduplica conservando el orden de aparición.
 * - Los caracteres sin ficha también se devuelven (la UI los marca).
 */
export function ipaSymbolsIn(ipa: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (i < ipa.length) {
    const ch = ipa[i];
    if (IGNORED_RE.test(ch)) {
      i += 1;
      continue;
    }
    let matched = false;
    for (const key of GUIDE_KEYS) {
      if (ipa.startsWith(key, i)) {
        if (!seen.has(key)) {
          seen.add(key);
          out.push(key);
        }
        i += key.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (!seen.has(ch)) {
        seen.add(ch);
        out.push(ch);
      }
      i += 1;
    }
  }
  return out;
}
