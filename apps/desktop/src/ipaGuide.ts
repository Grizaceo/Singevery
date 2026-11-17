// ============================================================================
// ipaGuide.ts — catálogo de símbolos IPA para hispanohablantes.
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

export interface IpaGuideEntry {
  /** Qué es el sonido, explicado desde el español cuando existe equivalente. */
  desc: string;
  /** Palabra o sílaba de ejemplo en el idioma de origen del símbolo. */
  ejemplo: string;
}

export const IPA_GUIDE: Record<string, IpaGuideEntry> = {
  'a': { desc: 'A abierta, como la a española de «casa».', ejemplo: 'casa · padre' },
  'e': { desc: 'E media, como la e española de «mesa».', ejemplo: 'mesa' },
  'i': { desc: 'I cerrada, como la i española de «sí». En inglés es más larga y tensa («see»).', ejemplo: 'sí · see' },
  'o': { desc: 'O media, como la o española de «no».', ejemplo: 'no' },
  'u': { desc: 'U cerrada, como la u española de «tú». En inglés es más larga («blue»).', ejemplo: 'tú · blue' },
  'ɑ': { desc: 'A abierta y más atrás en la boca que la a española (inglés «father», «hot»).', ejemplo: 'father · hot' },
  'æ': { desc: 'Vocal entre a y e, con la boca muy abierta. No existe en español.', ejemplo: 'cat · bad' },
  'ʌ': { desc: 'A breve, relajada y central (inglés «cup», «love»). Suena parecida a una a corta.', ejemplo: 'cup · love' },
  'ə': { desc: 'Schwa: vocal neutra y débil de las sílabas átonas; ni a ni e, con la boca relajada.', ejemplo: 'about · sofa' },
  'ɚ': { desc: 'Schwa con r: vocal átona con la lengua curvada hacia atrás (inglés «water»).', ejemplo: 'water · better' },
  'ɝ': { desc: 'Vocal tónica con r (inglés «bird», «world»): la lengua curvada, sin pronunciar una vocal aparte.', ejemplo: 'bird · world' },
  'ɔ': { desc: 'O abierta, más abierta que la o española (inglés «thought», francés «fort»).', ejemplo: 'thought · fort' },
  'ɛ': { desc: 'E abierta, algo más abierta que la e española (inglés «bed», francés «mère»).', ejemplo: 'bed · mère' },
  'ɪ': { desc: 'I breve y relajada, entre i y e (inglés «sit»). Distinta de la i larga de «seat».', ejemplo: 'sit · big' },
  'ʊ': { desc: 'U breve y relajada, entre u y o (inglés «book»). Distinta de la u larga de «food».', ejemplo: 'book · good' },
  'ɯ': { desc: 'U japonesa (う): como una u pero sin redondear los labios.', ejemplo: 'う (u) · すし' },
  'œ': { desc: 'E abierta con los labios redondeados como para o (francés «cœur», alemán «können»).', ejemplo: 'cœur · können' },
  'ø': { desc: 'E cerrada con los labios redondeados como para o (francés «peu», alemán «schön»).', ejemplo: 'peu · schön' },
  'ɐ': { desc: 'Vocal central abierta y breve; en alemán, la -er final de «Vater».', ejemplo: 'Vater · besser' },
  'ʏ': { desc: 'Ü breve y relajada del alemán: i con los labios redondeados, más abierta que y.', ejemplo: 'Glück · hübsch' },
  'y': { desc: 'I con los labios redondeados como para u (francés «tu», alemán «für»).', ejemplo: 'tu · für' },
  'aɪ': { desc: 'Diptongo «ai», como en «baile».', ejemplo: 'my · night' },
  'aʊ': { desc: 'Diptongo «au», como en «causa».', ejemplo: 'now · house' },
  'eɪ': { desc: 'Diptongo «ei», como en «rey».', ejemplo: 'say · baby' },
  'oʊ': { desc: 'Diptongo de o que se cierra hacia u, como «ou». No existe en español.', ejemplo: 'go · hello' },
  'ɔɪ': { desc: 'Diptongo «oi», como en «hoy», pero con la o más abierta.', ejemplo: 'boy · voice' },
  'ɔʏ': { desc: 'Diptongo alemán «eu/äu»: o abierta que se cierra hacia ü.', ejemplo: 'Freude · Häuser' },
  'p': { desc: 'P, como la p española. En inglés y alemán, al inicio de sílaba tónica sale con un soplo de aire.', ejemplo: 'padre · pen' },
  'b': { desc: 'B fuerte, como la de «boca» o «hombre» (con los labios cerrados).', ejemplo: 'boca · baby' },
  't': { desc: 'T, como la t española (en inglés se apoya en las encías, no en los dientes).', ejemplo: 'tú · time' },
  'd': { desc: 'D fuerte, como la de «dedo» o «andar».', ejemplo: 'dedo · day' },
  'k': { desc: 'K, como la c de «casa» o la k de «kilo».', ejemplo: 'casa · kilo' },
  'ɡ': { desc: 'G fuerte, como la de «gato» o «tengo».', ejemplo: 'gato · go' },
  'g': { desc: 'Otra forma de escribir ɡ: la g fuerte de «gato».', ejemplo: 'gato' },
  'f': { desc: 'F, como la f española.', ejemplo: 'fuego · fun' },
  'v': { desc: 'V con los dientes de arriba sobre el labio de abajo y la voz vibrando. No existe en el español general.', ejemplo: 'very · vous' },
  's': { desc: 'S, como la s española.', ejemplo: 'sí · see' },
  'z': { desc: 'S sonora, con la voz vibrando (inglés «zoo», «is»). En español solo aparece a veces ante consonante sonora («mismo»).', ejemplo: 'zoo · rose · mismo' },
  'ʃ': { desc: 'SH: el sonido de pedir silencio («shhh»).', ejemplo: 'shop · chat (fr.)' },
  'ʒ': { desc: 'Como la ll/y rioplatense de «yo», «calle» (Buenos Aires, Montevideo).', ejemplo: 'vision · je · yo (rioplatense)' },
  'θ': { desc: 'Como la z/c de España («zapato», «cielo»): la lengua entre los dientes.', ejemplo: 'think · zapato' },
  'ð': { desc: 'Parecida a la d suave de «cada», con la lengua entre los dientes (inglés «this»).', ejemplo: 'this · cada' },
  'x': { desc: 'J española de «jamón» o «gente»; también la ch alemana tras a, o, u.', ejemplo: 'jamón · Nacht' },
  'ç': { desc: 'CH alemana tras e, i («ich»): como una j muy suave hecha contra el paladar, parecida a soplar una i.', ejemplo: 'ich · Milch' },
  'ɕ': { desc: 'SH japonesa (し): más suave que ʃ, con la lengua hacia el paladar.', ejemplo: 'し (shi)' },
  'ɸ': { desc: 'F japonesa (ふ): se sopla entre los labios, sin que los dientes toquen el labio.', ejemplo: 'ふ (fu)' },
  'β': { desc: 'B suave entre vocales, sin cerrar del todo los labios («lavar», «la vaca»).', ejemplo: 'lavar · la vaca' },
  'ɣ': { desc: 'G suave entre vocales, sin cerrar del todo («amigo», «lago»).', ejemplo: 'amigo · lago' },
  'ʁ': { desc: 'R francesa o alemana: se produce al fondo de la boca, cerca de la garganta.', ejemplo: 'rue · rot' },
  'tʃ': { desc: 'CH de «chico».', ejemplo: 'chico · church' },
  'dʒ': { desc: 'Y fuerte de «yo» dicho con énfasis o de «cónyuge»; inglés «judge».', ejemplo: 'judge · gin' },
  'ts': { desc: 'TS, como en «tsunami»; italiano «pizza», japonés つ.', ejemplo: 'tsunami · pizza · つ' },
  'dz': { desc: 'DS sonora: como ts pero con la voz vibrando (italiano «mezzo», japonés ざ).', ejemplo: 'mezzo · ざ (za)' },
  'tɕ': { desc: 'CH japonesa (ち): como la ch de «chico», con la lengua más hacia el paladar.', ejemplo: 'ち (chi)' },
  'dʑ': { desc: 'J japonesa (じ): como una y fuerte de «yo», con la lengua hacia el paladar.', ejemplo: 'じ (ji)' },
  'm': { desc: 'M, como la m española.', ejemplo: 'mamá' },
  'n': { desc: 'N, como la n española.', ejemplo: 'nada' },
  'ŋ': { desc: 'N de «tengo» o «banco» (con el fondo de la lengua); inglés «sing», sin pronunciar la g.', ejemplo: 'sing · tengo' },
  'ɲ': { desc: 'Ñ española; italiano gn, francés gn.', ejemplo: 'año · gnocchi' },
  'ɴ': { desc: 'N final japonesa (ん): con el fondo de la lengua y sin cerrar del todo.', ejemplo: 'ん (n) · ほん' },
  'l': { desc: 'L, como la l española (en inglés, al final de sílaba suena más oscura: «feel»).', ejemplo: 'luna · feel' },
  'ʎ': { desc: 'LL tradicional (zonas de España y los Andes: «calle»); italiano gli.', ejemplo: 'figlio · calle' },
  'ɹ': { desc: 'R inglesa: la lengua se curva sin tocar el paladar y sin vibrar.', ejemplo: 'red · sorry' },
  'r': { desc: 'RR vibrante múltiple, como en «perro».', ejemplo: 'perro · rosa' },
  'ɾ': { desc: 'R simple, como en «pero» o «cara» (también la r japonesa).', ejemplo: 'pero · から' },
  'ʝ': { desc: 'Y/LL de «yo» o «lluvia» (yeísmo).', ejemplo: 'yo · lluvia' },
  'j': { desc: 'Semivocal i, como la i de «hielo» o «tierra».', ejemplo: 'yes · hielo' },
  'w': { desc: 'Semivocal u, como la u de «cuando» o «huevo».', ejemplo: 'water · cuando' },
  'ɥ': { desc: 'Semivocal de la u francesa: como w pero con los labios de «tu» (francés «nuit»).', ejemplo: 'nuit · lui' },
  'ɰ': { desc: 'W japonesa (わ): como una w con los labios casi sin redondear.', ejemplo: 'わ (wa)' },
  'h': { desc: 'Soplo suave, más suave que la j española (inglés «hello», alemán «Haus»).', ejemplo: 'hello · Haus' },
  'ʔ': { desc: 'Golpe de glotis: un corte breve en la garganta (alemán al inicio de palabra con vocal, inglés «uh-oh»).', ejemplo: 'uh-oh · Ende' },
  'ː': { desc: 'Marca de vocal LARGA: se sostiene más tiempo (italiano en sílaba tónica, alemán, japonés ー).', ejemplo: 'amore · Vater · ー' },
  '̃': { desc: 'Marca de vocal NASAL: deja salir el aire también por la nariz (francés «bon», «un»).', ejemplo: 'bon → bɔ̃' },
  'ʲ': { desc: 'Palatalización: la consonante se dice con la lengua hacia el paladar, como si tuviera una i pegada.', ejemplo: 'きゃ → kʲa' },
  'ˈ': { desc: 'Acento PRINCIPAL: la sílaba que sigue a la marca es la fuerte.', ejemplo: 'həˈloʊ (hello)' },
  'ˌ': { desc: 'Acento SECUNDARIO: sílaba con un acento más débil que el principal.', ejemplo: 'ˌæftɚˈnun (afternoon)' },
};

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
