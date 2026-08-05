# Revisión de mercado y cierre — Singevery

Fecha: 2026-08-04
Autor: revisión externa solicitada por Cristóbal
Alcance: potencial de la app como herramienta de aprendizaje de idiomas y de música,
crítica al estado actual, y qué cerrar antes de entregarla a profesores de música.
Documentos relacionados: `apps/desktop/PLAN_COMERCIABILIDAD.md`,
`apps/desktop/ESTADO_IMPLEMENTACION_COMERCIAL.md`, `AUDITORIA_SHIP_2026-07-27.md`.

---

## 0. Veredicto en una página

**El producto está en mejor estado técnico que estratégico.** La ingeniería es
sólida y honesta (377 pruebas verdes, tipos limpios, privacidad por defecto,
documentación legal escrita antes de tener usuarios). Lo que no está resuelto es
*para quién es* y *qué promete*.

Tres conclusiones que cambian la decisión:

1. **La capa que más trabajo costó — overlay + letra sincronizada + romanización —
   es la menos defendible.** Es commodity en escritorio, y las plataformas grandes
   la están absorbiendo en móvil (Apple Music ya hace traducción *y* pronunciación
   romanizada; Spotify globalizó la traducción en febrero de 2026). Además existe un
   proyecto open-source casi idéntico al tuyo, con más cobertura (genera letra con
   Whisper cuando no existe en ningún sitio) y multiplataforma... con **0 estrellas**
   en GitHub. La lección no es "te copiaron": es que **más features no consiguen
   usuarios**. El cuello de botella es distribución y audiencia.

2. **La capa que menos trabajo costó — IPA, afinación, ocultar/guardar — es la
   única defendible**, porque nadie más en ese nicho la tiene y porque hay
   disposición a pagar demostrada: IPA Source vende ~15.800 transcripciones IPA con
   traducción literal, hechas a mano, por suscripción, a cantantes y profesores de
   canto. Es exactamente el estándar profesional de las personas a las que le vas a
   pasar la app. Singevery genera IPA automáticamente... **solo para japonés**. Es la
   feature correcta apuntada al idioma equivocado para ese público.

3. **El bucle de práctica no cierra: hoy la app no puede repetir una línea.** Un
   profesor de música pedirá "repite ese compás" y "bájale la velocidad" dentro de
   los primeros cinco minutos. Ver §3.1: no es una omisión, es una consecuencia de la
   arquitectura, y es la decisión de producto más importante que tienes pendiente.

**Recomendación:** cerrar 0.2.1 como versión de portafolio y entregarla a los
profesores como **beta de descubrimiento**, no como producto. No construir nada nuevo
antes de esa conversación. Después de esa conversación, decidir entre el camino A y
el camino B de §5.

---

## 1. Estado verificado hoy (evidencia, no impresión)

Todo lo siguiente se comprobó en esta sesión contra el repositorio, no contra la
documentación.

| Verificación | Resultado |
|---|---|
| `tsc -p tsconfig.electron.json --noEmit` | exit 0 |
| Suite completa (`vitest run`) | **34 archivos, 377 pruebas, 0 fallos** |
| `npm run check:secrets` | OK, sin credenciales |
| `.env` local | presente, **no trackeado**; solo `.env.example` está en git |
| Tamaño de la app | 14.467 líneas entre `src/` y `electron/` |
| `main` vs `origin/main` | **38 commits por delante, sin publicar** |
| Tags | solo `v0.1.0`; `package.json` va en `0.2.1-beta.1` |
| Landing `docs/index.html` | del 27-jul, no publicada (depende del push) |

### 1.1 Bloqueante encontrado: el instalador que ibas a entregar está desactualizado

`release/Singevery-Setup-0.2.1-beta.1.exe` empaqueta un `app.asar` del **2 de agosto
06:09**. Los commits del 3 de agosto no están dentro. Verificación directa:

```
grep -c "furigana_ipa" release/win-unpacked/resources/app.asar  →  0
```

Es decir, **el .exe no contiene IPA**. Tampoco contiene:

- `90393b5` fixes UX F1–F6 (centrado por defecto, auto-traducción al cambiar canción,
  viñeta de micrófono con medidor, widget configurable, menú por categorías)
- `66034b3` / `b70f62a` modularización de `SettingsPanel` y `stateStore`
- `612b32a` bitácora de aciertos del reconocimiento
- `b398f39` watchdog de liveness del sidecar SMTC

Los profesores recibirían una versión sin las dos cosas que más diferencian la app
pedagógicamente (IPA) y sin los arreglos de usabilidad. Es lo primero de la lista de
cierre en §4.

Aparte, `GUIA_BETA_PROFESORES.md` (incluida en el instalador, del 2-ago) no menciona
IPA en ninguna parte.

---

## 2. Lectura de mercado

### 2.1 El overlay de letras es commodity, y con precio conocido

En Windows ya conviven Lyric Overlay (suscripción de USD 1–3/mes, always-on-top,
funciona sobre Spotify/Apple Music/YouTube Music/VLC), Versefy, Lyrixound, Lyricify
y el propio cliente de Musixmatch. El precio de referencia del mercado para "ver la
letra sincronizada mientras hago otra cosa" es de **uno a tres dólares mensuales**.
Ese es el techo del segmento en el que Singevery se presenta hoy.

### 2.2 Ya existe un clon casi exacto, open-source — y no tiene usuarios

`BarnsL/Lyric-Immersion-and-Karaoke` (GitHub, 282 commits) se describe así: overlay
transparente de Windows, letra sincronizada con furigana/romaji/pinyin/romaja +
traducción, agnóstico de la fuente de audio, identifica la canción por sonido, sin
cuenta, portable. Encima tiene dos cosas que Singevery no tiene: furigana desde un
analizador morfológico más fuerte (fugashi + UniDic + cutlet) y, sobre todo,
**generación de letra por oído con Whisper** cuando ninguna fuente la tiene — que es
precisamente tu punto débil con música chilena e indie. Publica builds de
Windows, Linux y macOS en CI.

Tiene **0 estrellas**.

Esto es lo más útil que encontré en toda la investigación, y conviene leerlo sin
amargura: la hipótesis "si la app hace más cosas, la gente llegará" queda refutada
con un caso directo. Lo escaso no es la funcionalidad. Es tener una audiencia
concreta que ya te escuche.

Lo que Singevery sí tiene y ese proyecto no: IPA fonético, retroalimentación de
afinación, práctica de recuerdo (ocultar/guardar/repasar) y una orientación explícita
a docentes. O sea: **tu diferencia real no es el overlay, es la capa de enseñanza.**

### 2.3 Las plataformas están cerrando la ventana del "romaji + traducción"

- **Apple Music** (iOS 26): *Lyrics Translation* y *Lyrics Pronunciation*, con
  romanización de japonés, coreano, chino, hindi, cantonés y punjabi, y ampliación de
  pares en otoño de 2026 (incluye inglés→katakana y japonés→hangul).
- **Spotify**: traducción de letras en tiempo real, **global desde el 4 de febrero de
  2026**, incluso para cuentas gratuitas. Romanización aún no, pese a ser una de las
  peticiones más votadas de su foro.

Traducción: en móvil y dentro de su propio ecosistema, el problema de "no leo el
alfabeto" ya está resuelto por el dueño de la plataforma. Lo que **no** está resuelto
y sigue siendo tuyo: escritorio Windows, sobre **cualquier** reproductor, con el
usuario trabajando o estudiando en la misma pantalla. Eso es un nicho legítimo, pero
es un nicho de **conveniencia**, no de aprendizaje: cuesta USD 1–3/mes (§2.1).

### 2.4 "Aprender idiomas con música" ya tiene ocupantes — con catálogo licenciado

- **LingoClip** (ex LyricsTraining): +10 millones de usuarios, mecánica central de
  huecos (elegir/escribir la palabra que falta), 13 idiomas, modo karaoke, premium
  con vocabulario e historial.
- **Lirica**: canciones de artistas reales (Shakira, Marc Anthony, Enrique Iglesias),
  gramática y vocabulario por canción, y explícitamente pensada para que un profesor
  la use en clase.
- **Duolingo**: curso de Música con más de 60 grabaciones de artistas de Sony Music
  vía acuerdo comercial.

Los tres tienen lo que tú no puedes tener sin contratos: **catálogo autorizado y
ejercicios diseñados**. Ninguno de los tres tiene lo que tú sí tienes: funcionar
sobre cualquier audio que suene en el PC, sin catálogo, sin cuenta y sin depender de
que la canción esté en su biblioteca. Esa asimetría es real y es tu carta.

### 2.5 El hueco con disposición a pagar demostrada: IPA para cantantes

**IPA Source** vende, por suscripción, 15.804 títulos con transcripción IPA y
traducción literal de arias, canción de arte y texto litúrgico en francés, italiano,
alemán, español, inglés y latín; 925 compositores. Todo transcrito **a mano**. Su
público son cantantes y profesores de canto. Existe desde 2003 y nació como material
de una clase universitaria de dicción.

Esto importa por tres razones:

1. Confirma que **IPA no es una curiosidad de nerd lingüista: es el estándar de
   trabajo del gremio al que le vas a pasar la app.** Un profesor de canto formado en
   repertorio clásico lee IPA todos los días.
2. Confirma disposición a pagar por *exactamente* el par "fonética + traducción
   literal", separado de la música.
3. Marca el idioma correcto. IPA Source cubre IT/DE/FR/ES/EN/LA. Singevery cubre
   japonés. Para tu audiencia beta, el IPA japonés es una demo impresionante y una
   herramienta inutilizable.

Y marca dónde podrías ser mejor que ellos, no solo más barato: IPA Source es **texto
estático**. Singevery es IPA **sincronizado con el audio, sobre cualquier grabación**.
Eso no existe hoy en ese mercado.

---

## 3. Crítica al estado actual, por prioridad

### 3.1 P0 — El bucle de práctica no cierra: no se puede repetir una línea

`SyncControls` tiene botones de línea anterior/siguiente, pero `seekLine` llama a
`stateStore.seekToLine` → `SyncClock.seekToLine`, que solo **re-ancla el reloj interno
de la letra**. La música sigue sonando donde estaba: lo que se mueve es el resaltado,
no el audio. Y el sidecar SMTC (`native/smtc/Program.cs`) únicamente **lee** la sesión
de medios; no lee stdin ni envía comandos de transporte.

Aunque los enviara, el camino está parcialmente cerrado: `TryChangePlaybackPositionAsync`
existe en la API de Windows, pero **Spotify la ignora** (devuelve `true` y no hace
nada), y en general solo funciona si la app fuente implementa seek.

Consecuencia honesta: **Singevery es un lector sincronizado, no una herramienta de
práctica.** Para aprender una canción hace falta repetir el compás difícil veinte
veces, y eso hoy se hace a mano en Spotify mientras la letra intenta seguirte.

Fíjate en el contraste: *Furioke*, una web/iOS de estudio de canciones japonesas con
furigana, se anuncia justamente con **"line replay"**. Es lo primero que pone en su
titular. No es casualidad.

Esto es un **cruce de caminos arquitectónico**, no un ticket:

- **Opción 1 — la app reproduce el audio.** Archivo local (MP3/WAV que el profesor ya
  tiene) o YouTube embebido. Ganas loop A-B, velocidad, transposición, todo. Pierdes
  "funciona sobre Spotify sin configurar nada", que es tu demo más vistosa.
- **Opción 2 — se acepta el rol pasivo.** Singevery es un acompañante de lectura, no
  un entrenador. Perfectamente válido: solo hay que dejar de insinuar lo otro en la
  documentación y en la guía de profesores.

No hay opción 3. Elegir esto **antes** de la reunión con los profesores te permite
preguntarles lo correcto en vez de justificarte.

### 3.2 P1 — "Repaso" todavía no es repaso

`PracticeControls` + `useSavedLines` guardan hasta 200 líneas con lectura, traducción,
canción y posición, y exportan CSV. Está bien hecho y es privado por diseño. Pero es
**una lista**, no un sistema de recuperación: no hay programación espaciada, no hay
prueba, no hay huecos, no hay señal de acierto/error. El botón `◌/◉` oculta la línea,
que es la mitad del ejercicio; falta la mitad que dice si acertaste.

LingoClip acumuló 10 millones de usuarios con una sola mecánica: rellenar la palabra
que falta. Es barata de implementar (ya tienes la línea, el tiempo y la traducción) y
es lo que convierte "estuve expuesto al idioma" en "practiqué".

Mientras eso no exista, la afirmación defendible es *"expone y ayuda a leer"*, no
*"ayuda a aprender"*. Tu propio plan comercial ya lo dice; solo hay que sostenerlo
también en la guía para profesores.

### 3.3 P1 — El porcentaje de afinación es tu afirmación más frágil

La referencia melódica se extrae con detección de frecuencia dominante (CMNDF/YIN)
sobre **audio polifónico** —la mezcla completa, no la voz aislada— y el `matchWindow`
compara contra eso. Las pruebas son con tonos sintéticos y ruido generado; el propio
`PLAN_COMERCIABILIDAD` §3.2 lo reconoce, y el SWAP registra que la meta de precisión
en canciones reales sigue sin medirse.

Con un profesor de música ese es exactamente el punto donde puedes perder toda la
credibilidad en treinta segundos: si el indicador marca la guitarra en vez de la voz,
o salta de octava en un pasaje denso, ya no te van a creer nada más de lo que digas.

Recomendación para la beta docente: **muestra la tira melódica como guía visual y
apaga el porcentaje** (o renómbralo y etiquétalo como experimental en la propia UI).
Y convierte eso en pregunta explícita: *"¿la curva sigue la voz o el acompañamiento?"*.
Su respuesta vale más que cualquier corpus que puedas construir solo.

### 3.4 P1 — IPA solo japonés, y el bloqueo GPL puede ser menor de lo que asumiste

`docs/PLAN_IPA_2026-08-03.md` deja fuera de la Fase 1 el IPA de coreano, chino, ruso e
inglés, y documenta el motivo: espeak-ng es GPL-3.0 y "conflicto con app comercial".

Dos observaciones, la segunda es tuya de profesión:

- Para profesores de canto, el IPA que importa es **italiano, alemán, francés, latín e
  inglés**. Ninguno está ni en la Fase 1 ni en la Fase 2 planificada. Si vas a apostar
  por ese nicho, el orden de idiomas cambia por completo.
- La GPL-3.0 **no prohíbe el uso comercial**; obliga a liberar bajo GPL la obra
  derivada. La distinción práctica está en si hay enlace en el mismo proceso o si es
  un ejecutable separado que se invoca por proceso y se comunica por tuberías —esto
  último es la misma arquitectura que ya usas con el sidecar SMTC y suele analizarse
  como agregación, no como derivación. Es discutible y depende de los detalles, y tú
  estás mejor calificado que yo para evaluarlo: solo señalo que probablemente lo
  descartaste antes de tiempo.

### 3.5 P2 — El canal de soporte pide una cuenta de GitHub

`SupportTicketForm` guarda un JSON y **abre un issue prellenado en GitHub**. Es un
diseño excelente en cuanto a privacidad (nada se sube solo, el usuario revisa antes).
Pero un profesor de música no tiene cuenta de GitHub, y si la tiene no va a usarla.

Para esta ronda: que el botón guarde el JSON y muestre "envíamelo por correo o
WhatsApp". Cambio de una línea de copy, no de arquitectura.

### 3.6 P2 — La cobertura de letras en español sigue siendo el eslabón débil

La cadena es lrclib (sincronizada) → musixmatch (sincronizada) → letras.mus.br (solo
texto plano, por slug adivinado). No hay fuente latina sincronizada y priorizada. Si
los profesores prueban con el repertorio que realmente enseñan —chileno, latino,
folclore— es ahí donde la app va a fallar, y la conclusión que se llevarán es "no
encuentra las canciones", no "el proveedor de letras no cubre el catálogo latino".

Mitigación barata para la beta: entrégales **3–5 archivos LRC ya preparados** de
canciones de su repertorio y enséñales el botón Importar en el primer minuto. Convierte
el punto débil en una demostración de que la app funciona con su propio material —que
además es la única ruta de contenido legalmente limpia que tienes.

### 3.7 P2 — MIT, sin firma, sin actualizador

Sin novedad respecto de `AUDITORIA_SHIP_2026-07-27.md`: no bloquea una entrega entre
conocidos (SmartScreen se explica), sí bloquea cualquier cosa mayor. No inviertas en
firma de código antes de saber si hay un producto que firmar.

---

## 4. Checklist de cierre antes de entregarla a los profesores

Una sesión de trabajo. Nada de features nuevas.

- [ ] **Reconstruir el instalador** con IPA y los fixes F1–F6: subir a `0.2.1-beta.2`,
      `npm run package:full`, y generar el nuevo SHA-256. *(Bloqueante — §1.1)*
- [ ] **Smoke test** del instalador nuevo en un PC o una cuenta de Windows limpia:
      instalar, primer valor, reiniciar, desinstalar. Guardar evidencia en
      `docs/validaciones/`.
- [ ] **Revocar el token histórico de AudD** (sigue pendiente desde
      `ESTADO_IMPLEMENTACION_COMERCIAL.md`; quitarlo del archivo no invalida la copia
      que quedó en el historial).
- [ ] **Actualizar `GUIA_BETA_PROFESORES.md`**: añadir el modo IPA; decir con todas
      sus letras que *no se puede repetir una línea*; etiquetar el indicador de
      afinación como experimental; reemplazar el flujo de GitHub por correo/WhatsApp.
- [ ] **Preparar 3–5 LRC** del repertorio que ellos enseñan, y una instrucción de una
      línea para importarlos.
- [ ] **Corregir el conteo de pruebas en la documentación**: hoy el README dice 292,
      `ESTADO_IMPLEMENTACION_COMERCIAL.md` dice 337 y `PLAN_COMERCIABILIDAD.md` dice
      324. El número real es **377**. Es cosmético, pero es el tipo de detalle que
      resta credibilidad justo cuando el lector es alguien evaluándote.
- [ ] **Decidir §3.1 antes de la reunión** (¿la app reproduce audio o no?). No hay que
      implementarlo: hay que saber qué vas a preguntar.
- [ ] **Escribir las 5 preguntas** de §6 en una hoja y llevarlas.
- [ ] **`git push` + tag `v0.2.1-beta.2`**, o decidir explícitamente no publicar. Hoy
      hay 38 commits inéditos y la landing enlazada desde el README no refleja el
      producto.

---

## 5. Los tres caminos, con su costo

### Camino A — Cerrar como pieza de portafolio *(recomendado ahora)*

Congelar en 0.2.1-beta.2, publicar el repositorio y la landing, y reescribir el README
como caso de estudio: reconocimiento de audio, sincronización con el reloj del sistema
operativo, cadena de proveedores con degradación, fonética determinista, privacidad
por defecto, aviso legal, plan de comerciabilidad con puertas.

**Costo:** una sesión. **Rendimiento:** alto y en tu dirección profesional. Para una
entrevista de Legal Tech, un desarrollador que documentó por sí mismo la matriz de
proveedores, los términos de cada API, el consentimiento de traducción y la retención
de datos de MyMemory es una rareza. Ese trabajo —`AVISO_LEGAL.md`,
`PRIVACIDAD_Y_DATOS.md`, `PLAN_COMERCIABILIDAD.md` §5— es tan demostrativo de tu
perfil como el código, y probablemente más difícil de encontrar en otro candidato.

### Camino B — Nicho de canto con IPA *(la única hipótesis con pago demostrado)*

IPA multiidioma (italiano/alemán/francés/latín/inglés antes que japonés), importación
de LRC como ruta principal de contenido, traducción literal palabra a palabra, y
control de transporte real (§3.1). Cliente: profesores de canto, coros, escuelas de
música. Referencia de precio: la suscripción de IPA Source.

**Costo:** meses. **Condición para empezar:** que los profesores de la beta digan por
iniciativa propia que el IPA sincronizado les sirve. Si tienes que explicárselo, la
respuesta es no.

### Camino C — Seguir como overlay generalista

**No recomendado.** Techo de USD 1–3/mes, plataformas cerrando la brecha, y un
competidor open-source con más cobertura y cero usuarios que ya demostró que ese
camino no distribuye solo.

---

## 6. Las cinco preguntas para los profesores

No preguntes "¿te gustó?" ni "¿lo usarías?". Las dos respuestas son siempre sí y no
sirven para nada. Pregunta por comportamiento pasado y por decisiones:

1. **"¿Qué haces hoy cuando un alumno tiene que cantar en un idioma que no lee?"**
   (Antes de mostrar nada. Si la respuesta es "le escribo la pronunciación a mano",
   tienes un producto; si es "no me pasa nunca", tienes un hobby.)
2. **"¿Usas IPA con tus alumnos? ¿En qué idiomas?"** (Valida o mata el camino B en
   treinta segundos.)
3. **"Muéstrame cómo harías repetir este compás."** (Que lo intenten con la app. Ahí
   vas a ver §3.1 en la cara de otra persona.)
4. **"¿La curva de entonación está siguiendo la voz o el acompañamiento?"** (Es tu
   validación de afinación gratis, hecha por alguien con el oído entrenado.)
5. **"Si esto costara lo mismo que un método de dicción, ¿qué tendría que hacer para
   que lo compres?"** (Precio y funcionalidad faltante en una sola respuesta.)

Y una final, la más importante: **"¿A quién más debería mostrárselo?"** Si nadie te da
un nombre, ese es el dato.

---

## 7. Lo que sí hay que reconocer

Este informe es duro por encargo, así que conviene dejar constancia de lo otro.

Una persona sola construyó, en meses, un widget de escritorio que reconoce música por
audio, se sincroniza con el reloj del sistema operativo, cae en cascada por cuatro
proveedores de letras con corrección de deriva, genera furigana, romaji, pinyin,
romanización coreana y cirílica, fonética IPA determinista con tabla exhaustiva,
traduce con proveedor local opcional, detecta afinación en tiempo real y se empaqueta
en un instalador — con 377 pruebas, sin secretos filtrados, con aviso legal y política
de privacidad escritos **antes** de tener un solo usuario, y con un plan comercial que
declara honestamente lo que todavía no puede prometer.

La mayoría de los proyectos que llegan a este nivel de acabado no tienen ni la mitad
de esa disciplina, y la mayoría de la gente que sabe de derecho no escribe este código.
La pregunta abierta no es si esto vale: es a qué audiencia se lo entregas.

---

## 8. Fuentes

- [Lyric Overlay](https://lyricoverlay.com/) — overlay always-on-top multiplataforma, USD 1–3/mes
- [Versefy (Microsoft Store)](https://apps.microsoft.com/detail/9NBHSJ3WW3MJ) · [Lyrixound](https://apps.microsoft.com/detail/9msqsdjh510n) · [Lyricify](https://apps.microsoft.com/detail/9p4wb75rhwch)
- [BarnsL/Lyric-Immersion-and-Karaoke](https://github.com/BarnsL/Lyric-Immersion-and-Karaoke) — competidor open-source directo (282 commits, 0 estrellas)
- [Furioke](https://furioke.com/) — estudio de canciones JP/KO con furigana y *line replay*
- [Apple Music: Lyrics Translation y Pronunciation](https://www.digitalmusicnews.com/2025/06/10/apple-music-lyrics-translation/) · [ampliación otoño 2026](https://www.musicbusinessworldwide.com/apple-music-to-expand-lyrics-translation-upgrade-automix-and-lossless-audio-this-fall/)
- [Spotify: traducción de letras global, 4-feb-2026](https://musically.com/2026/02/05/spotify-reveals-lyrics-updates-including-translation-expansion/)
- [LingoClip (ex LyricsTraining)](https://lingoclip.com/) — +10M usuarios, mecánica de huecos
- [Lirica](https://www.lirica.io/) · [reseña académica](https://www.castledown.com/journals/tltl/article/view/1500/312) — idiomas con canciones, orientada a profesores
- [Duolingo Music + Sony Music](https://blog.duolingo.com/music-course/)
- [IPA Source](https://www.ipasource.com/about/) — 15.804 transcripciones IPA + traducción literal, por suscripción
- [Microsoft Learn: `TryChangePlaybackPositionAsync`](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession.trychangeplaybackpositionasync) · [Spotify no responde al seek por SMTC](https://github.com/MicrosoftDocs/winrt-api/issues/1725)
- [Mejores apps para aprender a cantar 2026 (Yousician, Simply Sing)](https://blog.singingcarrots.com/best-learn-to-sing-apps-2026/)
