# Cambio de canción: de ~40s a ~8s (2026-08-15)

Continúa el trabajo de `CAMBIO_DETECCION_CANCION_ENERGIA.md`. El síntoma
reportado seguía vivo: **con una canción ya reconocida, cambiar de tema dejaba
la letra vieja en pantalla mucho tiempo.**

## Por qué seguía lento

Tres causas, en orden de peso:

### 1. Las peticiones de resync se perdían (bug)

`useRecognition` solo podía atender un resync si en ese instante estaba
DURMIENDO: `requestResync()` resolvía la espera en curso y nada más. Si la
petición llegaba mientras el ciclo grababa (6s) o esperaba a la red (~2s), no
había ninguna espera que cortar y **la petición se descartaba entera**.

Eso anulaba justo el disparador de la entrega anterior: la detección por
energía corre DENTRO del IPC `recognition:correct`, o sea exactamente cuando el
renderer está esperando la respuesta de ese IPC. El `command:resync` llegaba
siempre en el peor momento posible. Encima el throttle del main (10s) se
marcaba como consumido igual, bloqueando el siguiente intento.

### 2. La app estaba sorda el 70% del tiempo

El audio solo se miraba durante los 6s de grabación de cada ciclo de ~20s.
Entre medias no se analizaba nada, así que un cambio de canción no se podía
notar hasta la siguiente grabación (media ~10s de pura espera). De paso, la
pausa del reloj por silencio (`reportLevel`) también llegaba tarde.

### 3. La histéresis costaba un ciclo entero

Confirmar un cambio pide 2 identificaciones seguidas de la misma pista nueva
(5 si el reproductor del SO insiste en la vieja). Entre una y otra pasaba un
ciclo completo: +20s por confirmación. El peor camino (5 strikes) superaba el
minuto y medio.

## Qué hace ahora

### Monitor continuo (`src/audio/monitor.ts`)

Un `AnalyserNode` colgado del stream —que ahora se abre UNA vez por sesión y
sigue vivo entre ciclos, también en micrófono— muestrea a 20 Hz: nivel de pico
y 8 bandas de energía. No consume el stream ni compite con el `MediaRecorder`.
Coste ~0, sin red.

Con eso, el nivel se reporta SIEMPRE (la pausa por silencio del reloj deja de
llegar tarde) y se puede detectar el corte de pista en vivo.

### Detector de corte (`src/audio/trackChange.ts`, puro y testeado)

- **`gap`** — hueco de silencio ≥ 320 ms seguido de música. Es la huella
  física de un cambio de tema: casi todos los reproductores dejan ese hueco.
  Señal FUERTE.
- **`novelty`** — el reparto de energía entre bandas cambia de golpe respecto
  al de la canción en curso y se sostiene ≥ 1.1s (crossfade, mezcla
  encadenada). Señal DÉBIL: solo sirve para re-identificar antes.

Con histéresis de nivel (zona muerta 0.012–0.03), calentamiento del perfil
(6s) y periodo refractario (8s) para no encadenar detecciones. Subir el
volumen NO cuenta como cambio (se compara el reparto, no la escala).

**El detector nunca mueve la letra**: solo pide re-identificar.

### El corte como tercera señal del arbitraje (`stateStore.ts`)

Un `gap` reciente (< 30s) + un match distinto = dos señales independientes →
el cambio se aplica **a la primera**, sin gastar el segundo ciclo de
histéresis. Es además la única corroboración disponible cuando no hay
reproductor del SO accesible (parlante externo, micrófono, vinilo), donde antes
solo quedaba la histéresis completa.

Guardas:
- Solo `gap`, nunca `novelty`.
- **No** aplica si la sesión del SO sigue afirmando la canción mostrada: ahí el
  hueco es casi seguro una pausa del usuario, y el SO sabe qué reproduce.
- El corte **se consume** al usarlo, y se descarta si el fingerprint reconfirma
  la pista actual (era una pausa, no un cambio).

### Ciclo rápido de confirmación (`useRecognition.ts` + `recognition:correct`)

`recognition:correct` ahora devuelve `suspected`: el fingerprint ya vio otra
canción pero la histéresis no la confirma todavía. El renderer encadena el
ciclo siguiente **sin pausa** (300 ms en vez de 12s), así que la confirmación
que faltaba llega en ~7s en lugar de ~20s. Con tope de 5 ciclos rápidos
seguidos: si las señales no se ponen de acuerdo, vuelve a la cadencia normal en
vez de insistir contra la red.

### Resync que ya no se pierde

`pendingResyncRef`: la petición queda anotada aunque llegue mientras se graba o
se espera a la red, y la próxima espera se salta. Esto es lo que hace que la
detección por energía de la entrega anterior **por fin funcione**.

## Presupuesto de latencia (estimado, a confirmar con música real)

| Escenario | Antes | Ahora |
|---|---|---|
| Cambio con hueco entre pistas (lo normal) | ~35-45s | **~8-10s** |
| Cambio encadenado sin hueco (crossfade) | ~35-45s | ~15-17s |
| Peor caso: el SO insiste en la canción vieja (5 strikes) | 100s+ | ~35s |

Los ~8s del caso normal son ya casi el suelo físico: hay que grabar varios
segundos de la canción NUEVA para poder identificarla.

## Coste en llamadas al reconocedor

En régimen estable no cambia (un ciclo cada ~20s). Sube solo mientras hay un
cambio en curso: como mucho 5 ciclos rápidos, y un corte falso (una pausa del
usuario) cuesta UNA llamada extra que además corrige la deriva. Shazam —el
proveedor por defecto— es gratis.

## Archivos tocados

Nuevos:
- `apps/desktop/src/audio/trackChange.ts` — detector puro de corte de pista.
- `apps/desktop/src/audio/monitor.ts` — tap de lectura continuo sobre el stream.
- `apps/desktop/tests/trackChange.test.ts` — 13 tests.
- `apps/desktop/tests/stateStoreBoundary.test.ts` — 10 tests.

Modificados:
- `apps/desktop/src/audio/capture.ts` — `AudioCaptureSession`, `MicrophoneSession`
  (micrófono persistente), `createCaptureSession`, `CAPTURE_FAST_PAUSE_MS`.
- `apps/desktop/src/useRecognition.ts` — resync pendiente, monitor continuo,
  ciclo rápido con tope, re-montaje del monitor si el stream muere.
- `apps/desktop/electron/core/stateStore.ts` — `noteAudioBoundary`,
  `boundaryCorroborates`, `isChangeSuspected`, corte en `/debug`.
- `apps/desktop/electron/main.ts` — IPC `recognition:boundary`, `suspected`.
- `apps/desktop/electron/preload.ts`, `apps/desktop/src/types.ts` — contrato IPC.

## Verificación

- `npx vitest run` → **635 tests, 0 fallos** (23 nuevos, 612 previos intactos).
- `npx tsc -p tsconfig.electron.json --noEmit` → limpio.
- `npx tsc -b --noEmit` → limpio.
- `npm run lint` → limpio. `npm run check:secrets` → OK.

Falta la prueba con música real (abajo): la detección de corte se validó con
señales sintéticas, no con un reproductor de verdad.

## Cómo probar con música real

1. `npm run dev:electron` (Windows).
2. SING en modo "audio del sistema". Espera a que cargue la letra y sincronice.
3. Cambia a otra canción con letra distinta.
4. Esperado: la letra nueva aparece en **~8-10s**. En la consola del main:
   `[identidad] corte de audio reciente + match distinto (...) → cambio confirmado sin histéresis`
5. Repite pausando y reanudando la MISMA canción: **no** debe cambiar de letra
   (el fingerprint reconfirma y el corte se descarta).
6. Repite en modo micrófono con un parlante externo: es el caso donde antes no
   había ninguna corroboración posible.

Con `SINGEVERY_DEBUG_PORT` puesto, `/debug` muestra `identity.lastAudioBoundary`
para ver si el detector está disparando.

## Qué NO cambié (decisión deliberada)

- **`SINGEVERY_ENERGY_SYNC`** sigue apagado por defecto: mover la letra sola con
  música real es el fallo más caro del widget y no es el síntoma reportado.
- **La ventana de grabación sigue en 6s.** Bajarla aceleraría cada ciclo ~1s
  pero arriesga la tasa de acierto del fingerprint, que es lo que sostiene todo
  lo demás. La ganancia estaba en las esperas, no en la grabación.
- **Los umbrales de la histéresis (2 y 5 confirmaciones) siguen iguales.** No
  hacía falta relajarlos: ahora hay una tercera señal que los deja pasar cuando
  el cambio es real, y las confirmaciones que faltan llegan en 7s en vez de 20s.
