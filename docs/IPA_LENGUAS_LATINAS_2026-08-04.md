# IPA para lenguas de alfabeto latino — Singevery

Fecha: 2026-08-04
Estado: **IMPLEMENTADO** (español, italiano, francés, alemán)
Documento hermano: [`PLAN_IPA_2026-08-03.md`](PLAN_IPA_2026-08-03.md) (japonés, Fase 1)
Contexto de producto: [`REVISION_MERCADO_2026-08-04.md`](REVISION_MERCADO_2026-08-04.md) §2.5

---

## 1. Por qué estos cuatro idiomas

El IPA no es una curiosidad lingüística para el público objetivo de la app: es el
**estándar de trabajo del profesorado de canto**. IPA Source lleva desde 2003
vendiendo por suscripción 15.804 transcripciones IPA con traducción literal de
repertorio en italiano, alemán, francés, español, inglés y latín, hechas a mano.
Existe un mercado que ya paga por exactamente este par de datos.

Singevery aporta algo que ese material impreso no puede: **IPA sincronizado con el
audio, sobre cualquier grabación**, generado en el momento y sin catálogo.

Se implementaron español, italiano, francés y alemán. Quedan fuera:

- **Inglés**: no es transcribible por reglas. Necesita diccionario (CMUdict o
  equivalente). Se modela en el detector solo para poder rechazarlo.
- **Portugués**: nasales, reducción vocálica y divergencia BR/PT lo acercan más al
  francés en dificultad que al español. Se modela para no confundirlo con español.
- **Latín**: descartado por decisión de producto. Nota para el futuro: el latín
  eclesiástico se pronuncia con fonética italiana, así que reutilizaría el motor
  italiano casi entero — es la ampliación más barata que queda, y la que más usa
  un director de coro.

## 2. Decisión de arquitectura

Reglas deterministas propias, igual que el motor japonés. **No** se usó espeak-ng.

| Criterio | Reglas propias | espeak-ng |
|---|---|---|
| Licencia | Código propio, compatible con MIT | GPL-3.0, a resolver antes de una app comercial |
| Peso | 0 bytes extra | Binarios por plataforma dentro de Electron |
| Red | Ninguna | Ninguna |
| Testabilidad | Función pura, caso por caso | Caja negra |
| Precisión ES/IT | Comparable | Comparable |

Todo el motor son funciones **puras y síncronas**: entra una cadena, sale otra.
Sin estado, sin red, sin dependencias nuevas.

```
electron/services/phonetics/
  shared.ts       Tokenizador de palabras y predicados comunes
  langDetect.ts   Identificación de idioma dentro del alfabeto latino
  spanish.ts      es → IPA (con norma seseo/distinción)
  italian.ts      it → IPA
  french.ts       fr → IPA
  german.ts       de → IPA
  index.ts        Despachador + metadatos de precisión
```

## 3. Detección de idioma

El resto de la app detecta **script** (kana, hangul, cirílico). Eso no sirve aquí:
los cuatro idiomas comparten alfabeto. `langDetect.ts` puntúa seis idiomas —los
cuatro con motor más inglés y portugués— con tres tipos de evidencia:

| Evidencia | Peso | Ejemplo |
|---|---:|---|
| Palabra funcional frecuente | 3 | `que`, `che`, `je`, `ich` |
| Carácter casi decisivo | 4 | `ñ` → es · `ß`, `ä`, `ö` → de · `ç`, `œ` → fr · `ã`, `õ` → pt |
| Secuencia ortográfica típica | 2 | `ción` · `gli` · `eau` · `sch` |

Se cuentan evidencias **distintas**, no repeticiones: un estribillo repetido veinte
veces no vale veinte veces.

**Regla de honestidad**: el ganador necesita puntaje ≥ 12 **y** un 40 % de ventaja
sobre el segundo. Si no, o si gana inglés o portugués, la función devuelve `null` y
**no se anota nada**. Transcribir una canción inglesa con reglas españolas produce
basura con aspecto de dato fiable, que es el peor resultado posible en una
herramienta de aprendizaje.

La detección se hace **una vez por canción**, con toda la letra a la vista. Por
línea suelta no hay evidencia (`oh oh oh`) y cambiar de motor a mitad de canción
daría versos transcritos con reglas distintas.

## 4. Qué resuelve cada motor

### Español — precisión exacta

Transcripción ancha con los alófonos que sí importan al cantar:

- **b/d/g oclusivas o aproximantes** según contexto: `vida` → `/biða/`,
  `lavar` → `/laβaɾ/`, `amigo` → `/amiɣo/`. Es lo que hace que el español suene
  español y es 100 % derivable.
- **Norma configurable** (Ajustes → Extras de lectura): seseo americano por
  defecto (`corazón` → `/koɾason/`) o distinción castellana (`/koɾaθon/`), que es
  la habitual en dicción clásica.
- Vibrante múltiple frente a simple: `perro` `/pero/` ≠ `pero` `/peɾo/`.
- Asimilación nasal (`tango` → `/taŋgo/`) y sonorización de s (`mismo` → `/mizmo/`).
- Diptongos crecientes, que la tilde rompe: `bien` `/bjen/`, pero `día` `/dia/`.

Fuera: acento tónico (al cantar manda la melodía) y encadenamiento entre palabras.

### Italiano — precisión exacta

- **Geminación**, que es lo que más pesa al cantar: `notte` → `/notːe/`,
  `bella` → `/belːa/`. La consonante doble ocupa tiempo musical.
- Palatalización y la `i` ortográfica muda: `ciao` `/tʃao/`, `faccio` `/fatʃːo/`.
- `gli` → `/ʎ/`, `gn` → `/ɲ/`, `sc` ante e/i → `/ʃ/`.
- s intervocálica sonora: `casa` → `/kaza/`.

Fuera, por ser **léxico y no ortográfico**: e/o abiertas o cerradas sin tilde
(`pesca` es `/ˈpeska/` o `/ˈpɛska/` según el significado) y z sorda o sonora. Con
tilde sí se distingue: `è` → `/ɛ/`, `perché` → `/perke/`.

### Alemán — precisión aproximada

- **ich-Laut frente a ach-Laut**, el error de dicción más típico de un
  hispanohablante: `/x/` solo tras a, o, u (`Nacht` `/naxt/`); `/ç/` en todo lo
  demás (`ich` `/ʔɪç/`, `Milch` `/mɪlç/`, `Mädchen`).
- **Golpe glótico inicial** (`und` → `/ʔʊnt/`). Omitirlo es lo que hace que un
  Lied suene ligado a la italiana.
- Cantidad vocálica con cambio de timbre: `Stadt` `/ʃtat/` frente a `Saat` `/zaːt/`.
- Ensordecimiento final (`Tag` → `/taːk/`), `sp-`/`st-` iniciales, s ante vocal.

Fuera: la cantidad de la vocal ante ⟨ch⟩ es **léxica** (`Buch` larga, `Bach` breve)
y se resuelve siempre breve; préstamos del francés y el inglés.

### Francés — precisión aproximada

- Vocales nasales completas, con la regla de que la nasal se deshace ante vocal:
  `chanson` `/ʃɑ̃sɔ̃/` pero `bonne` `/bɔnə/`.
- Poda de la cola de consonantes mudas, respetando C-R-F-L: `temps` `/tɑ̃/`,
  `beaucoup` `/boku/`, pero `mer` `/mɛʁ/`.
- **E muda final como `/ə/`**: al hablar desaparece, al cantar casi siempre recibe
  nota propia. Es una decisión de dominio deliberada — la app es para cantar.

Errores sistemáticos declarados:

1. **Liaison**: `les amis` se canta `/le.za.mi/`; aquí sale `/le ami/`. Exige mirar
   la palabra siguiente y saber si la liaison es obligatoria.
2. **Final `-ent`**: nasal tras `-ment` (`vraiment` `/vʁɛmɑ̃/`), mudo en el resto
   (`chantent` `/ʃɑ̃t/`). Falla en verbos como `aiment` y en nombres como `argent`.
3. Timbres abiertos/cerrados en sílaba interna: se elige uno por defecto.

## 5. Integración

- `romanize.ts` detecta el idioma una vez en `romanizeTimedLyrics` y lo pasa a
  `analyzeLine`, que rellena `LineReadings.ipa`.
- El guard `needsRomanization` **no** sirve para decidir esto: cuenta caracteres no
  ASCII, así que `corazón` le parecía texto a romanizar por culpa de la tilde. La
  rama de IPA latino pregunta directamente si la línea está en otro script.
- `ANNOTATIONS_VERSION` pasó de 3 a **4**: obliga a re-anotar las letras cacheadas.
- La clave de la caché de lecturas incluye la norma del español y el idioma, para
  que cambiar de seseo a distinción no devuelva la transcripción anterior.
- En el widget, una canción en alfabeto latino con idioma reconocido muestra
  `Orig` e `IPA`; sin idioma reconocido no muestra botones de lectura, porque no
  hay ninguna que dar.

## 6. Verificación

| Comprobación | Resultado |
|---|---|
| Suite completa | **456 pruebas en 38 archivos**, todas verdes |
| Pruebas nuevas de esta capa | 79 (español 22, romances 32, detección 16, integración 9) |
| `tsc` renderer y main | Sin errores |
| `eslint .` | Limpio |

Los tests cubren, además de los aciertos, los **rechazos**: que una canción inglesa
no reciba IPA, que el portugués no se trate como español, que `na na na` no dispare
nada, y que cambiar la norma del español no sirva una transcripción cacheada.

## 7. Qué falta

- **Latín eclesiástico**, reutilizando el motor italiano. Es lo más barato que
  queda y lo que más usa un director de coro.
- **Inglés** por diccionario, si aparece demanda real.
- **Sílabas y ligaduras**: al cantar importa qué sílaba cae en cada nota. Hoy se
  transcribe el segmento, no el reparto silábico.
- **Diccionario de correcciones del usuario**, para las ambigüedades léxicas que
  ninguna regla puede resolver (la e/o italiana, la vocal alemana ante ⟨ch⟩).
- **Validación con hablantes nativos y profesores**. Las reglas están verificadas
  contra la descripción fonológica estándar de cada idioma, no contra oído humano.
  Es justo una de las preguntas que conviene llevar a la beta docente.
