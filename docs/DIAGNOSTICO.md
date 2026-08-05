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
| `sync` | Offset por pista, calibración global y posición mostrada: la deriva se ve restando. |
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

## Defensas

- Escucha **solo** en `127.0.0.1` (nunca en todas las interfaces).
- Valida la cabecera `Host`: un dominio que resuelva a `127.0.0.1`
  (DNS rebinding) recibe `403`.
- Sin cabeceras CORS: el navegador no deja leer la respuesta cross-origin.
- Solo `GET`, y solo las rutas `/debug` y `/health`.
- Es de solo lectura: ningún endpoint cambia el estado del widget.
