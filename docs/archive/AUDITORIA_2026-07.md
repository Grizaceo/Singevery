# Auditoría y reparación — julio 2026

> Alcance: audit completo de `apps/desktop` con foco en el fetch de letras (roto).
> Estado final verificado: `tsc -b` ✓ · `tsc -p tsconfig.electron.json` ✓ · `eslint` 0 errores (antes 19) · **176/176 tests** ✓ (antes 168) · `vite build` ✓.
> Incluye la ronda 2 (§6) con los hallazgos del primer run real tras la reparación.

## 1. Por qué no funcionaba el fetch de letras

El trabajo sin commitear que agregó la cadena multi-proveedor (musixmatch, netease, letras, metadataHints) introdujo cuatro problemas que se potenciaban entre sí:

1. **Timeout de 5 s por lookup completo, con reintento de aborts.** Un solo lookup de LRCLIB encadena hasta 3 requests (`/get` → `/search` → `/search?q=`) y el de Musixmatch otros 3 (token + search + subtitle). Con 5 s compartidos, el lookup se abortaba a mitad de camino; el retry duplicaba la espera y volvía a abortar. Resultado: fuentes sanas terminaban como "error".

2. **Semántica de error demasiado agresiva.** Si CUALQUIER proveedor lanzaba (Musixmatch se rate-limitea con captcha con frecuencia), `fetchAndStore` lanzaba `LyricsLookupError` aunque LRCLIB hubiera respondido legítimamente "no existe". Todo terminaba en estado `ERROR` ("Error al buscar letra").

3. **Proveedor letras.mus.br muerto.** La página `/buscar/` se renderiza por JavaScript: el HTML estático no contiene resultados, así que el regex nunca encontraba links. Devolvía null siempre (peso muerto + latencia).

4. **Mirror de NetEase devuelve basura.** `music.xianqiao.wang/neteaseapiv2/search` responde 200 con canciones no relacionadas con los keywords (verificado incluso con queries en chino). El gate de similitud lo descartaba, pero sumaba latencia por variante.

Agravante: la caché negativa (7 días de TTL) pudo quedar envenenada con "no encontrada" de las pruebas hechas mientras los proveedores estaban rotos.

## 2. Arreglos aplicados

| Archivo | Cambio |
|---|---|
| `lyrics/lyricsService.ts` | Timeout 8 s por intento + presupuesto global de 20 s; sin retry cuando el abort es nuestro timeout; máx. 4 variantes; `ERROR` solo si TODAS las consultas fallan (mixto → "sin letra", sin cachear negativa); caché negativa solo tras barrido limpio y completo; logs `[lyrics]` con timing por proveedor; `PROVIDER_SCOPE_VERSION=2` invalida las negativas envenenadas. |
| `lyrics/providers/index.ts` | NetEase fuera de la cadena por defecto (archivo se conserva, comentado el porqué). Cadena: lrclib → musixmatch → letras. El cambio de cadena también invalida negativas viejas. |
| `lyrics/providers/letras.ts` | Reescrito: va directo a `letras.mus.br/<artista-slug>/<titulo-slug>/` (las páginas de canción SÍ son server-rendered; verificado). 404 → null sin lanzar. Valida con similitud contra `<h1>/<h2>`. |
| `lyrics/providers/musixmatch.ts` | `s_track_rating: desc` (con `asc` llegaban las 5 PEORES entradas del catálogo, típicamente sin letra); tope de recursión en redirects del WAF; tipos `MxmEnvelope` en vez de `any`. |
| `services/romanize.ts` | Si kuroshiro falla al inicializar ya no queda cacheada la promesa rechazada (reintenta la próxima vez). |
| `electron/main.ts` | `lyricsCache.flush()` en `before-quit` y `window-all-closed` (el persist debounced podía perder el último estado del índice). |

## 3. Orden y limpieza

- Eliminados `electron/services/lrclib.ts` y `electron/services/audd.ts`: código muerto, reemplazados hace tiempo por `lyrics/providers/lrclib.ts` y `recognition/auddProvider.ts` (ningún import los usaba).
- Lint a cero (19 → 0): escapes innecesarios en regex (`normalizeQuery`, `netease`), `any` tipados (`musixmatch`, `netease`), `setState` síncrono en efectos (`LyricsRescuePanel` con el patrón "ajustar estado durante render", `SettingsPanel`, `useRemoteStatus`), prop `ghost` sin uso en `Teleprompter`.
- Tests: +5 (semántica mixta error/no-encontrada, no-retry en abort, slugs y flujo nuevo de letras, 404 sin lanzar, rechazo por similitud).

## 4. Qué esperar ahora

Con Spotify u otra app con SMTC (o vía SING/Shazam), el flujo queda: metadata → LRCLIB `/get` exacto (1 request en el caso feliz) → letra sincronizada. Si LRCLIB no la tiene, Musixmatch (sincronizada) y letras.mus.br (plana) como fallbacks, con tope total de 20 s. Un proveedor caído ya no tumba la búsqueda ni envenena la caché. Los logs `[lyrics]` en la consola del proceso main muestran proveedor, resultado y ms por consulta para diagnosticar.

## 5. Ronda 2 — hallazgos del run real (logs del 2026-07-08)

Los logs `[lyrics]` confirmaron que la capa reparada funciona (musixmatch entregó letra sincronizada en 412 ms y el título basura ya no envenenó la caché), y revelaron tres problemas más:

1. **LRCLIB colgado 8 s en CADA request desde la máquina del usuario** ("This operation was aborted" a los ~8000 ms, mientras Musixmatch respondía en ~400 ms). Patrón típico de IPv6/Happy Eyeballs roto en el fetch de Node (undici). Fix: `electron/services/http.ts` con `appFetch` — usa `net.fetch` (pila de red de Chromium: Happy Eyeballs, proxy del sistema) en el main de Electron y cae al fetch global fuera (tests). Migrados lrclib, letras, netease y metadataHints. Musixmatch queda en fetch de Node a propósito: funciona bien y su manejo de cookies/redirects está probado contra undici.
2. **Títulos de video de YouTube japoneses nunca matcheaban**: `Creepy Nuts「Bling-Bang-Bang-Born」×TV Anime「マッシュル-MASHLE-」…` no genera variantes útiles con los regex ASCII. Fix: `extractCornerBracketTitle` en `normalizeQuery.ts` — el contenido del primer par de corchetes CJK (「」『』【】) se prueba como variante temprana, y esos corchetes se normalizan en la comparación de similitud.
3. **Re-búsqueda en cada evento de SMTC para pistas sin letra**: `applyExternalTrack` recargaba la búsqueda completa cada vez que el SO repetía el evento 'track' de la misma canción (los logs muestran la misma búsqueda de ~9 s dos veces seguidas). Fix: guard en `stateStore.ts` — misma pista con estado `NO_LYRICS`/`ERROR`/`FETCHING_LYRICS` no relanza; el rescate manual sigue funcionando. Además, `lyricsService` ahora salta las variantes restantes de un proveedor cuando una consulta abortó por timeout (un host colgado no se reintenta 4 veces).

Tests nuevos de la ronda: extracción de corchetes CJK, variante generada, y el guard de re-búsqueda (176 en total).

## 6. Ronda 3 — recall perdido vs. la versión anterior

Antes del trabajo multi-proveedor, la app usaba **solo LRCLIB sin ningún filtro de texto**: `pickBest` elegía por sincronización + duración y aceptaba lo que viniera. El trabajo nuevo agregó gates de similitud título/artista (lrclib ≥0.35/0.25, musixmatch ≥0.8) que rompen el caso cross-script: LRCLIB y Musixmatch guardan muchas pistas JP/KO/ZH con metadata en su alfabeto original, la query llega en romaji (o al revés), la similitud da 0 y TODO se descarta → "Sin letra disponible" para canciones que antes sí aparecían.

Fix: **fallback por duración** en ambos proveedores — si el gate de texto vacía la lista y conocemos la duración, un calce de ±2 s (lrclib) / ±3 s (musixmatch) identifica la pista con la misma confianza que usa `/api/get`. Sin duración conocida, el gate se mantiene (no volvemos al "acepta cualquier cosa" viejo). `PROVIDER_SCOPE_VERSION` → 3 para invalidar las negativas cacheadas con los gates estrictos. Tests: 179.

Sobre la sincronización corrida: la letra (LRC) corresponde a la **versión de estudio**; si lo que suena es un music video de YouTube con intro/collab (p. ej. `Creepy Nuts「Bling-Bang-Bang-Born」×TV Anime…`), toda la letra queda desplazada un offset constante. Ese caso se corrige con los botones −/+ de offset por pista (100 ms por clic, queda persistido para esa canción) o la rueda del mouse sobre los controles de sync (±1 s).

## 7. Pendientes conocidos (fuera de este arreglo)

- **SMTC sidecar sin publicar**: existe `native/smtc/bin/Release/...` pero el reader busca `native/smtc/dist/espejo-smtc.exe`. Falta `dotnet publish -c Release -r win-x64 -o dist` (ver `WINDOWS.md` §5). Sin esto no hay reloj maestro del reproductor y se depende de SING/Shazam.
- Musixmatch sin cookies persistentes puede seguir rate-limiteado en algunas redes; hoy degrada limpio (pasa al siguiente proveedor).
- NetEase: si se quiere C-pop con LRC, buscar un mirror sano y re-agregar el provider a la cadena.
- `package.json` sin `"type": "module"` genera un warning de Node al correr eslint (cosmético).
