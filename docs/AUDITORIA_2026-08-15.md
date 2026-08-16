# Auditoría — traducción, identidad de versión, layout y sincronía en YouTube

Fecha: 2026-08-15. Sobre `feat/sync-cambio-cancion-rapido` (`ad219e3`).
Cuatro síntomas reportados por Cristóbal tras validar la mejora de sincronía.

Cada hallazgo lleva su nivel de confianza — `CONFIRMADO` (se sigue leyendo el
código) o `PROBABLE` (el mecanismo existe y explica el síntoma, pero falta
medirlo).

> **Estado (misma sesión):** los cuatro P0 están implementados. Ver
> "Estado de implementación" al final, incluida **una corrección a este propio
> informe**: la palanca que propuse para el punto 2 (encender la corrección por
> energía) no sirve para el caso extendida, y explico por qué.

---

## 1. La traducción a veces es idéntica al original

### Causa raíz — CONFIRMADO: el eco no se detecta y se cachea para siempre

Ningún punto de la cadena comprueba que la traducción **difiera** del texto de
entrada. Cuando el proveedor devuelve el original (cosa que MyMemory hace de
forma rutinaria, ver abajo), ese eco se trata como una traducción válida:

1. `translate.ts:592` `translateLines` devuelve `{ok: true}` con el eco.
2. `stateStore.ts:530` lo persiste con `updateCachedLyrics` — **queda en disco**.
3. `stateStore.ts:508` el guard `alreadyDone` (`translationLang === targetLang`
   y todas las líneas con `translation != null`) hace que **no se reintente
   nunca más**, ni reabriendo la app.

Esto explica la parte más molesta del síntoma: no es intermitente, una vez que
una canción cae en el eco se queda así de forma permanente.

### Por qué el proveedor devuelve el original — CONFIRMADO

`detectSourceLang` (`translate.ts:237`) puede devolver **el mismo idioma que el
destino**, y nadie lo comprueba. Con `langpair=es|es`, MyMemory responde 200 y
devuelve el texto tal cual. Dos caminos llegan ahí:

- **Canción ya en el idioma destino.** Legítimo, pero el usuario ve "traducción"
  idéntica en vez de un aviso.
- **Detección equivocada** (`translate.ts:318-331`): para script latino se manda
  **una sola línea** (la más larga) a MyMemory y se acepta su `detected` sin
  validar. Una línea de letra es poco texto; si sale `es` para una canción en
  inglés, las ~40 líneas se piden `es→es` y todas vuelven idénticas.

### Contribuyente menor — CONFIRMADO

`translate.ts:369` `parseNumberedTranslations` acepta la salida del modelo local
aunque sea idéntica a la entrada (un modelo pequeño que no entiende la tarea
suele reemitir la lista numerada tal cual).

### Arreglo propuesto

| Prioridad | Cambio | Archivo |
|---|---|---|
| P0 | Si `source === target` tras detectar, no llamar al proveedor: devolver un error accionable ("la letra ya está en tu idioma"). | `translate.ts:344` |
| P0 | Validar el resultado: si ≥80% de las líneas no vacías vuelven idénticas, tratarlo como fallo y **no cachear**. | `translate.ts:613-630` |
| P1 | Detectar con varias líneas (3-5 muestras, voto) en vez de una. | `translate.ts:318` |
| P1 | Que `alreadyDone` no dé por buena una traducción marcada como sospechosa. | `stateStore.ts:508` |
| P2 | Botón "reintentar traducción" que limpie el campo cacheado. | UI + `stateStore` |

---

## 2. Elige la canción correcta pero otra versión (extendida / otro idioma) y no recalibra

Son dos fallos encadenados: **se elige mal** y **nada lo detecta después**.

### 2a. La elección ignora la duración en la práctica — CONFIRMADO

`lrclib.ts:87` `pickBest` puntúa así:

```
+1000  si la letra es sincronizada
+ 250  × similitud de título/artista
+ 100  si la duración cae dentro de DURATION_TOLERANCE_S (2s)
-diff  segundos de diferencia de duración, si se pasa
```

El bonus de "sincronizada" (**+1000**) aplasta todo lo demás. Una versión
extendida de 7:00 contra una letra sincronizada de la versión de 3:30 puntúa
`1000 + 250 − 210 = 1040` y **gana con holgura**. La duración nunca descarta
nada: solo mueve el ranking. `DURATION_TOLERANCE_S` (`lrclib.ts:17`) se usa
para premiar, no para filtrar, salvo en el fallback cross-script.

Agrava: `normalizeQuery.ts:8` `DECORATION_RE` borra del título
`live|remaster|version|edit|deluxe|acústica…` antes de buscar. Es correcto para
**encontrar** la canción, pero después nadie verifica que lo encontrado sea
**esta** versión.

Lo mismo en `musixmatch.ts:175` (tolerancia de 3s, mismo patrón).

### 2b. Nada revisa la elección después — CONFIRMADO

- `lyricsService.ts:294` cachea la letra elegida sin comparar su duración con
  `query.durationMs`, que **sí se recibe** desde Shazam.
- `stateStore.applyMatch` → `applyCorrection` → `computeDrift` corrige la
  **posición**, nunca cuestiona si la letra corresponde. Con una letra de otra
  versión, cada corrección empuja la letra hacia una posición que en esa letra
  significa otra cosa.
- El único mecanismo capaz de detectarlo —la correlación de energía vocal— está
  **en modo observación**: `main.ts:1137` lo activa solo con
  `SINGEVERY_ENERGY_SYNC=1`. Mide el desfase, lo publica en `/debug` y **no
  corrige**.
- Peor: `maybeRequestResyncOnMiss` (`stateStore.ts:383`) sí dispara
  re-identificaciones cuando la letra no cuadra. Shazam reconfirma la misma
  canción, no cambia nada, y se vuelve a disparar. **Bucle sin salida** — y con
  el ciclo rápido que acabo de introducir puede repetirse más seguido.

Ese bucle es exactamente el "no recalibra" del reporte: el sistema *nota* que
algo no cuadra y lo único que sabe hacer es preguntar otra vez lo mismo.

### Arreglo propuesto

| Prioridad | Cambio | Archivo |
|---|---|---|
| P0 | Descarte duro por duración: si la diferencia supera ~15s, la entrada no es candidata aunque esté sincronizada. Con el fallback actual (elegir plana correcta antes que sincronizada equivocada). | `lrclib.ts:92-108` |
| P0 | Encender la corrección por energía **para este caso**: cuando la correlación mide un desfase estable y grande, es exactamente la señal de "letra de otra versión". Hoy está apagada globalmente. | `main.ts:1137` |
| P1 | Sustituir el resync inútil por una acción real: si tras N mediciones la letra sigue sin alinearse y el fingerprint reconfirma la canción, **descartar la letra cacheada y re-buscar** con la duración como filtro duro. | `stateStore.ts:383` |
| P1 | Guardar la duración de la letra elegida en la caché y compararla al cargar. | `lyricsService.ts:294` |
| P2 | Mostrar en la UI qué versión se cargó y ofrecer "buscar otra versión". | `ManualSearch` |

> Nota: encender `SINGEVERY_ENERGY_SYNC` es la palanca de mayor impacto y la más
> arriesgada (mueve la letra sola). Recomiendo activarla **solo** cuando el
> desfase medido sea grande y consistente en varias ventanas, no para deriva
> fina — que es el uso para el que se dejó apagada.

---

## 3. Una frase larga se superpone a la traducción de al lado

### Causa raíz — CONFIRMADO: falta la regla de ruptura de palabra

En **todo** el CSS del teleprompter no existe `overflow-wrap`, `word-break` ni
`hyphens`. Sí existe en otro sitio (`SettingsPanel.css:313,371`), lo que
confirma que fue un olvido y no una decisión.

La cadena que produce el solape:

1. `Teleprompter.css:277` — `.line-row` es un grid `1fr 1fr`.
2. `Teleprompter.css:285` — `.line-col { min-width: 0 }` permite que la columna
   se encoja **por debajo del ancho de su contenido**.
3. No hay ninguna regla para `.line-main` (el `<p>` de la letra) más allá de
   `margin: 0` (`Teleprompter.css:184-188`).
4. Si el texto **no puede romperse**, desborda su caja. `overflow` es `visible`
   por defecto → se pinta encima de lo que haya al lado.
5. `Teleprompter.css:289` — `.line-col-main { text-align: right }` hace que el
   desborde salga **hacia la derecha**, justo sobre la traducción.

Cuándo no puede romperse: japonés, chino y coreano **no llevan espacios** (una
línea entera es una sola "palabra" para el navegador); también palabras muy
largas en alemán o finés, y los `<ruby>` del modo furigana.

Encaja con que el síntoma sea intermitente: solo aparece con líneas largas sin
puntos de ruptura.

### Arreglo propuesto

P0, de una línea, sin riesgo:

```css
.line-main {
    overflow-wrap: anywhere;
    word-break: normal;        /* respeta las reglas del idioma cuando existen */
    line-break: normal;        /* CJK rompe donde el idioma lo permite */
}
```

P1: `overflow: hidden` en `.line-col` como red de seguridad, para que un caso no
previsto degrade en recorte y no en solape.

Conviene verificarlo con una línea larga en japonés y otra en alemán, en ventana
ancha y angosta (el breakpoint de 620px apila las columnas y oculta el problema).

---

## 4. En YouTube la letra avanza más rápido de lo debido, sobre todo tras cambiar de canción

### 4a. Causa raíz principal — CONFIRMADO: la proyección de posición del sidecar no está acotada

`native/smtc/Program.cs:177` `ProjectedPositionMs`:

```csharp
var elapsed = (DateTimeOffset.UtcNow - updated.ToUniversalTime()).TotalMilliseconds;
if (elapsed > 0 && elapsed < 6 * 60 * 60 * 1000) pos += elapsed;
```

La posición de SMTC es un snapshot tomado en `LastUpdatedTime`, y el sidecar le
suma el tiempo transcurrido desde entonces. El único guard es de **6 horas**.

Con Spotify eso es correcto: actualiza el snapshot cada pocos segundos, así que
`elapsed` es pequeño. **Con un navegador no**: YouTube solo actualiza
`LastUpdatedTime` en play/pausa/seek. Si el usuario lleva tres minutos viendo un
vídeo sin tocarlo, `elapsed` vale tres minutos y se suman enteros.

Además la proyección asume que el reproductor **estuvo reproduciendo todo ese
tiempo**. No lo distingue de: anuncio, buffering, pestaña en segundo plano.
Todos suman de más.

### 4b. Por qué empeora justo al cambiar de canción — PROBABLE

`EmitTrack` (`Program.cs:218-231`) reacciona a `MediaPropertiesChanged`, que en
un cambio de vídeo llega **antes** que `TimelinePropertiesChanged`. Lee entonces
`s.GetTimelineProperties()` — que todavía es **el del vídeo anterior** — y lo
proyecta. Resultado: el evento `track` del vídeo nuevo viaja con una
`positionMs` que es *(posición del vídeo viejo) + (minutos transcurridos)*.

Ese valor entra sin acotar en el proceso principal:

- si la pista se reconoce como la actual → `stateStore.ts:1108`
  `applyExternalPosition` → `computeDrift` → error > `DRIFT_SNAP_MS` (4s) →
  **snap duro hacia adelante**;
- si se carga como pista nueva → `stateStore.ts:1228`
  `loadLyricsByMetadata(title, artist, positionMs, …)` **ancla la letra nueva en
  esa posición absurda**.

En ningún punto de la cadena se acota `positionMs` contra la duración conocida
de la pista, que sí está disponible (`durationMs`).

### 4c. Riesgo que introduje yo en la entrega anterior — CONFIRMADO, sin medir

`syncClock.ts:196` `reportAudioLevel` **reanuda** el reloj en cuanto oye
cualquier sonido por encima de 0.012:

```ts
} else {
  this.silentSince = null;
  if (this.clockPaused) this.resumeClock(at);
}
```

No distingue quién pausó. Si SMTC pausó el reloj porque el usuario pausó el
vídeo, **un sonido cualquiera del sistema lo reanuda** — y en modo "audio del
sistema" el loopback captura todo: una notificación, otra pestaña, un anuncio.

Esto ya existía, pero **mi monitor continuo lo amplifica**: antes el nivel se
reportaba durante 6s de cada 20 (30% del tiempo), ahora es continuo a 20 Hz. La
ventana para que un sonido espurio reanude una letra pausada es ~3× mayor.

Lo señalo explícitamente porque es una consecuencia de mi cambio y no estaba en
el análisis de riesgo que entregué.

### Arreglo propuesto

| Prioridad | Cambio | Archivo |
|---|---|---|
| P0 | Acotar `elapsed` a ~10s en la proyección: pasado ese punto el snapshot no es fiable y es mejor emitir el valor crudo que inventar. | `Program.cs:186` |
| P0 | Acotar `pos` a `tl.EndTime` (la duración): una posición mayor que la canción es imposible. | `Program.cs:191` |
| P0 | En `EmitTrack`, no emitir la posición del timeline viejo: mandar `positionMs: 0` en el evento `track` y dejar que el canal `position` la corrija, o esperar al primer `TimelinePropertiesChanged` del vídeo nuevo. | `Program.cs:218` |
| P1 | Defensa en profundidad en Electron: descartar posiciones externas que superen la duración conocida. | `stateStore.ts:1108` |
| P1 | Precedencia de pausa: que el silencio no reanude un reloj pausado por SMTC (solo puede reanudarlo quien lo pausó). | `syncClock.ts:196` |
| P2 | Umbral de reanudación por nivel más alto que el de pausa (histéresis), como ya hace el detector de cortes. | `syncClock.ts:196` |

---

## Resumen de prioridades

| # | Síntoma | Arreglo P0 | Riesgo | Esfuerzo |
|---|---|---|---|---|
| 3 | Solape de texto | 3 líneas de CSS | Nulo | Minutos |
| 4 | YouTube corre rápido | Acotar la proyección en el sidecar | Bajo | ~1h + build de .NET |
| 1 | Traducción idéntica | Guard `source===target` + detección de eco + no cachear | Bajo | ~2h |
| 2 | Versión equivocada | Descarte duro por duración | Medio (puede dejar canciones sin letra sincronizada) | ~3h |

El 3 y el 4 son los de mejor relación impacto/riesgo. El 2 es el más delicado:
endurecer el filtro de duración hará que algunas canciones pierdan su letra
sincronizada, así que conviene medirlo con el `/debug` antes de fijar el umbral.

---

# Estado de implementación

Los cuatro P0 están hechos y verificados: **667 tests** (32 nuevos), `tsc`
limpio en ambos proyectos, `lint` limpio, sidecar recompilado y republicado en
`native/smtc/dist`.

## Corrección a este informe (punto 2b)

En el diagnóstico propuse *"encender la corrección por energía"* como P0 para
que la app recalibrara sola cuando la letra es de otra versión. **Esa propuesta
era incorrecta** y no se implementó:

`DEFAULT_CORRELATE_OPTIONS.maxLagMs` vale **5.000 ms**
(`energySync.ts:180`). La correlación solo busca alineamientos dentro de ±5s,
así que **no puede medir** el desfase de una versión extendida, que se va por
decenas de segundos. Encenderla no habría arreglado el síntoma; habría añadido
el riesgo de mover la letra sola sin resolver nada.

Ampliar `maxLagMs` tampoco es la salida: con ventanas de 6s (30 bins) buscando
±30s (150 posiciones), los estribillos repetidos producen máximos falsos y el
alineamiento sería una lotería.

La causa raíz se atacó donde estaba de verdad: en **la elección de la letra**.

## Qué se implementó

### 3 · Solape de texto — hecho
`Teleprompter.css` — `overflow-wrap: anywhere` en `.line-col`, que se hereda a
letra, traducción y romaji. Sin `overflow: hidden`: recortaría el `<rt>` del
furigana y el glow de la línea actual, y con la ruptura garantizada ya no hace
falta.

### 4 · YouTube corre de más — hecho
- `Program.cs` — la proyección va acotada por tiempo (`MAX_PROJECTION_MS`, 30s)
  y por duración (nunca más allá de `EndTime`).
- `Program.cs` — `TimelineIsStale()`: tras un cambio de pista, el timeline que
  se lee todavía es el de la canción anterior. El evento `track` sale con
  `positionMs: 0` y sin duración, y el canal `position` calla hasta tener uno
  fresco (con `STALE_GRACE_MS` de 5s para no dejar sin posición a reproductores
  que no lo refrescan nunca).
- `stateStore.ts` — defensa en profundidad: una posición externa más allá del
  final de la pista se descarta.
- `syncClock.ts` — **precedencia de pausa** (`PauseSource`): el silencio ya no
  puede levantar una pausa del reproductor. Era el riesgo 4c, el que introduje
  yo con el monitor continuo.

### 1 · Traducción idéntica — hecho
- `translate.ts` — `untranslatedRatio()`: si ≥80% de las líneas con contenido
  vuelven idénticas, la traducción **falla** en vez de devolverse como buena.
  Es lo que impide que el eco se guarde en la caché de letras y quede fijado
  para siempre. Ignora interjecciones y líneas cortas (<12 caracteres), que se
  traducen igual a sí mismas con toda legitimidad.
- `translate.ts` — guard `origen === destino`: se avisa en vez de gastar 40
  peticiones en un par X|X que devuelve el original.
- `translate.ts` — la detección de idioma vota con 3 muestras en vez de fiarse
  de una sola línea.

### 2 · Versión equivocada — hecho (2a) y acotado (2b)
- `lrclib.ts` — `isOtherVersion()`: con más de 15s de diferencia, la entrada es
  otra grabación. Entonces **se sirve el texto en plano**, no sincronizado, y
  pierde el bonus de +1000 en el ranking.

  Esta es la decisión de diseño de la entrega: la letra sigue siendo la
  correcta (es la misma canción), lo que no sirve son sus timestamps. En plano
  el usuario ve el texto bien y ninguna sincronía mentirosa; descartarla del
  todo lo habría dejado sin letra.
- `stateStore.ts` — tope al **bucle de resyncs inútiles**: tras 2
  re-identificaciones por desalineación en la misma pista, se deja de insistir.
  Preguntar lo mismo no cambia la respuesta, y con el ciclo rápido nuevo podía
  repetirse muy seguido.

## Qué queda pendiente del punto 2

1. **Las letras ya cacheadas** de sesiones anteriores conservan la elección
   vieja: `lrclib.ts` solo corrige las búsquedas nuevas. Se limpian con
   `cache:clear` o con el reintento manual por pista.
2. **`musixmatch.ts` no se tocó** (`DURATION_TOLERANCE_S = 3`, mismo patrón de
   premiar sin descartar). Es el segundo de la cadena: aplica cuando LRCLIB no
   tiene la canción.
3. **El umbral de 15s no está medido**, es un razonamiento (un remaster no se
   pasa; una extendida sí). Conviene contrastarlo con `/debug` sobre casos
   reales antes de darlo por bueno.
4. **Letra en otro idioma**: sigue sin cubrirse salvo por el veto de artistas
   conocidos (`artistLanguage.ts`). Es un fallo distinto del de la versión
   extendida, con arreglo distinto.

## Cómo probar

```bash
npm run dev:electron
```

- **3** — canción con versos largos, vista de traducción "lado a lado", ventana
  ancha. Antes el texto invadía la columna derecha.
- **4** — YouTube, dejar un vídeo sonando varios minutos sin tocarlo y saltar al
  siguiente. La letra nueva ya no debe arrancar adelantada. En la consola del
  main, `[smtc] posición … fuera de la pista → descartada` delata proyecciones
  desbocadas.
- **1** — traducir una canción que antes salía idéntica: ahora debe dar un error
  explícito en vez de una traducción falsa.
- **2** — una versión extendida: la letra debe aparecer en plano (sin karaoke)
  en vez de sincronizada y desfasada. Requiere `cache:clear` si ya estaba
  guardada.

## Qué NO se pudo determinar leyendo el código

- Con qué frecuencia MyMemory devuelve el eco frente a fallar limpiamente
  (necesita registrar entradas/salidas reales).
- Si la proyección de YouTube se desvía por minutos o por segundos en la
  práctica (necesita comparar `positionMs` de SMTC con el reloj del vídeo).
- Si el punto 2 es mayoritariamente "versión extendida" o "letra en otro
  idioma": son dos fallos distintos con arreglos distintos, y el reporte los
  agrupa. `/debug` (`lyrics.source` + duración cacheada) lo distinguiría.
