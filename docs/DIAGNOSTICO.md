# Diagnóstico en vivo (endpoint local)

Singevery puede exponer su estado interno en JSON por HTTP local. Sirve para
responder “¿por qué la letra no calza?” sin mirar la pantalla ni adivinar.

**Está apagado por defecto.** Un puerto abierto siempre en una app instalada
por terceros es superficie de ataque gratis: cualquier página web puede hacerle
peticiones a `127.0.0.1`.

## Encenderlo

Variable de entorno, o una línea en el `.env` que va junto al ejecutable:

```
SINGEVERY_DEBUG_PORT=5199
```

Al arrancar, el log muestra `[diagnostics] endpoint en http://127.0.0.1:5199/debug`.
Un valor inválido se ignora con un aviso (la app arranca igual).

## Usarlo

```bash
curl http://127.0.0.1:5199/debug          # radiografía completa
curl http://127.0.0.1:5199/debug?recent=50 # más intentos de identificación
curl http://127.0.0.1:5199/health          # ¿está vivo?
```

## Qué contesta

| Bloque | Para qué sirve |
| --- | --- |
| `matched` | Pista en pantalla: título, artista, **de qué fuente** salió la letra (`sourceKind`), **qué tan vieja** es (`vintageMs`), si está `locked` o `provisional`, y el puntaje de distintividad del título. |
| `playing` | Estado del widget, posición mostrada, si el reloj está en pausa, y qué fuente de reconocimiento está activa. |
| `sync` | Offset por pista, calibración global, posición mostrada y la última medición de sincronía por energía vocal (`sync.energy`). |
| `state` | El arbitraje de identidad: cambio pendiente y cuántas confirmaciones lleva, si la sesión del SO es confiable, si el input externo está suprimido, y la cadena de proveedores vigente. |
| `recent` | Últimos intentos del matchlog: método, resultado, confianza y **por qué falló**. |

### Lecturas típicas

- **`provisional: true` con `titleDistinctiveness` bajo** → la pista entró por un
  título genérico del SO (“Awake”, “Alone”). No está lockeada: el próximo match
  por audio la reemplaza sin esperar la histéresis.
- **`vintageMs` alto con la letra desincronizada** → la letra viene de la caché
  y puede ser de otra versión. `sourceKind` dice a quién reclamarle.
- **`pendingChangeCount: 1`** → el reconocedor ya vio otra canción una vez y está
  esperando la segunda confirmación antes de cambiar.
- **`externalTrusted: false`** → la sesión de medios de Windows no coincide con
  lo que suena; sus posiciones se están ignorando a propósito.
- **`state.requiredHits: 5`** → el sistema operativo sigue afirmando la canción
  que se muestra, así que el reconocedor necesita cinco insistencias seguidas
  para romper el lock. Con `2`, las dos señales ya coinciden en que cambió.

## Sincronía por energía vocal (`sync.energy`)

Cada vez que el widget graba un chunk para re-identificar (~cada 18 s), el
mismo audio se usa para medir si la letra está corrida: se compara cuándo hay
energía en la banda vocal contra cuándo el LRC dice que hay línea sonando.

```json
"energy": {
  "offsetMs": -1000,      // ms a sumar a la posición: negativo = letra adelantada
  "confidence": 0.90,     // fuerza del pico × unicidad del pico
  "peak": 0.90,           // correlación del mejor desplazamiento
  "runnerUp": 0.23,       // mejor pico LEJANO: si se acerca al peak, no sirve
  "applied": false,
  "skipped": "modo observación (SINGEVERY_ENERGY_SYNC apagado)"
}
```

**Viene en modo observación.** Mide y registra, pero no toca el reloj. Mover la
letra sola es el peor fallo posible de este widget, así que primero conviene
mirar varias canciones reales en `/debug` y confirmar que los `offsetMs` que
propone coinciden con lo que se ve en pantalla. Cuando convenza:

```
SINGEVERY_ENERGY_SYNC=1
```

Aun encendida, solo corrige si la confianza supera 0.35 y la corrección no pasa
de 3 s, y siempre por la misma rampa suave que usa la deriva del reconocedor
(la letra se acomoda, no salta). `runnerUp` cerca de `peak` es la firma de un
estribillo repetido: ahí la medición se descarta sola.

## Defensas

- Escucha **solo** en `127.0.0.1` (nunca en todas las interfaces).
- Valida la cabecera `Host`: un dominio que resuelva a `127.0.0.1`
  (DNS rebinding) recibe `403`.
- Sin cabeceras CORS: el navegador no deja leer la respuesta cross-origin.
- Solo `GET`, y solo las rutas `/debug` y `/health`.
- Es de solo lectura: ningún endpoint cambia el estado del widget.
