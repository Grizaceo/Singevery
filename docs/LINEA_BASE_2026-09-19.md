# Línea base — antes de Fase 1 (2026-09-19)

Rama `linux-wayland`, HEAD `34bf478`. Build (`npm run build`), lint (`npm run
lint`) y tests (`npm test`) verdes: **771/771**. Medido en la máquina de
pruebas (Omarchy, Hyprland 0.56.2 Lua, PipeWire), con la app de producción
(`npm run build` + `electron .`) lanzada con `SINGEVERY_DEBUG_PORT=39123
--remote-debugging-port=9223`, canción real reproduciéndose en una pestaña de
Zen (YouTube, "Gorillaz — Clint Eastwood (Official Video)", con letra
sincronizada ya en caché de LRCLIB) y MPRIS activo (`org.mpris.MediaPlayer2.
firefox.instance_1_4625`). Fuentes: `~/.config/singevery-desktop/logs/
{main.log,matchlog.jsonl}` y `/debug`.

## 1. Tiempo hasta la primera letra (SING → letra visible)

Dos caminos distintos, según si ya hay un reproductor MPRIS de confianza:

- **Con MPRIS ya de confianza** (caso típico: Spotify/YouTube/navegador
  soportado ya sonando): la identidad llega por MPRIS y, si hay letra en
  caché, se muestra casi de inmediato — en esta prueba la app ya estaba
  `DISPLAYING` con las 78 líneas antes de que SING hiciera falta. El botón
  SING no es la ruta crítica en este caso.
- **Reconocimiento de audio puro (Shazam)**, que es lo que SING dispara y lo
  que se usa sin MPRIS: grabación + `matched_at` desde `recordStartedAt` en
  los `[sync] anchor` del log.
  - Primer intento tras pulsar SING: **7.63 s** (`recordStartedAt`
    00:01:52.519 → `matched_at` 00:02:00.151).
  - Intentos posteriores (ya con el pipeline caliente), 6 muestras:
    **6.38–6.43 s** (media ~6.41 s). Confirma la grabación de ~6 s citada en
    la auditoría + ~0.3–1.6 s de arranque/red.
  - Duración de la llamada de red/match en sí (`matchlog.jsonl`,
    `durationMs`), 17 muestras consecutivas: **320–403 ms** (media ~355 ms) —
    la grabación domina el tiempo total, no la red.
  - Fetch de letra sincronizada una vez identificada la pista (`[lyrics]
    lrclib → sincronizada`): **345–454 ms**.
  - Total estimado SING (sin MPRIS) → letra en pantalla: **~6.7–8.1 s**
    (grabación + match + fetch de letra).

## 2. Cadencia de re-verificación en reposo (hallazgo no pedido pero relevante)

Con la pista ya identificada y bloqueada (`locked: true`), la app sigue
lanzando ciclos Shazam de corroboración cada **~18–19 s** (a veces con un
segundo intento 6–7 s después del primero) en vez de quedar en silencio total.
17 ciclos observados en ~4 minutos, todos `confidence=1`. Esto es lo que hace
que "reposo" no sea realmente silencioso — ver sección 4 (CPU). Candidato
directo para Fase 3.

## 3. Error de sincronía (posición mostrada vs medida por Shazam/MPRIS)

Tomado directo de `[sync] error=…` (ya lo loguea el propio código):

- **Estado bloqueado, sin eventos externos** (`acción=ignore`), 8 muestras:
  error entre **-48 ms y +6 ms** — sincronía sub-50ms, dentro de lo esperado.
- **Deriva pequeña corregida** (`acción=correct`), picos de -683 ms a -278 ms,
  se corrigen en la siguiente muestra.
- **Desincronización grande** (`acción=snap`, típicamente el vídeo de
  YouTube reinicia o el usuario salta de posición): errores de **-5.9 s hasta
  -191.8 s**. Un evento grande completo (el vídeo volvió a 0:09 mientras la
  UI seguía mostrando 3:05) tardó **34.1 s** en pasar por
  `quarantined → corroborated seek → correct` hasta volver a error de un
  dígito de ms (00:04:31.383 → 00:05:05.490). Ese es el número a mejorar en
  Fase 3 si se ataca la recuperación de saltos grandes.

## 4. CPU en reposo (letra en pantalla, sin interacción del usuario)

Medido sumando ticks de usuario+sistema de `/proc/<pid>/stat` de todos los
procesos Electron (main, gpu, renderer, utility de red, audio service, 3
zygotes) sobre ventanas de pared real, sin usar `%CPU` acumulado de `ps`:

| Ventana | Condición | CPU total (suma de procesos, % de 1 core) |
|---|---|---|
| 20 s | Incluye 2 ciclos Shazam de corroboración | ~52 % (main 15.3, gpu 12.1, renderer 21.3, audio 3.6) |
| 20 s | Incluye 1 ciclo Shazam | ~38 % (main 11.2, gpu 8.1, renderer 16.0, audio 3.1) |
| 10 s | Sin ningún ciclo Shazam en la ventana (piso real) | ~16.9 % (main 5.5, gpu 2.3, renderer 7.0, audio 2.1) |

Con ciclos cada ~18 s y ~6.4 s "activos" cada uno (duty cycle ~35%), el
promedio ponderado ronda **~25–30 % de un core** en reposo. El piso sin
reconocimiento activo (~17%) es principalmente UI/paint + sondeo MPRIS
(`busctl` cada 1 s, ver auditoría) + click-through (sondeo de cursor cada
40 ms). Ambos son objetivos concretos de Fase 3.

## 5. Extra: detección de pausa vs cambio de canción

No se logró provocar un cambio de canción real durante la sesión (el vídeo
de prueba llegó a su fin y quedó en pausa). Sí quedó registrada la detección
de **pausa por MPRIS**: `pauseSource: "external"`, con `positionMs` clavado
en la duración total del vídeo (267804 ms de 267000 ms de `mpris:length`) —
la app la tomó de inmediato, sin polling adicional visible en el log.
Pendiente para una sesión futura: repetir con un cambio real de pista para
medir la latencia MPRIS→título aceptado (columna vacía en la matriz de la
auditoría original).

## Metodología (para repetir después de Fase 3)

```bash
cd apps/desktop && npm run build
SINGEVERY_DEBUG_PORT=39123 setsid ./node_modules/.bin/electron . \
  --remote-debugging-port=9223 > /tmp/electron-run.log 2>&1 &
# disparar SING sin atajo físico:
./node_modules/.bin/electron . --sing
# leer:
curl -s 127.0.0.1:39123/debug
tail -f ~/.config/singevery-desktop/logs/main.log        # [sync] error=…, anchors
tail -f ~/.config/singevery-desktop/logs/matchlog.jsonl   # durationMs por intento
# CPU: sumar utime+stime de /proc/<pid>/stat de todos los procesos electron
# del árbol (main, gpu-process, renderer, utility de red, audio service)
# sobre una ventana de pared real; no usar %CPU acumulado de `ps aux`.
```
