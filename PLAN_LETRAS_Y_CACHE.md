# Plan — Letras offline-first + caché local (+ capas de sync a/b)

> Continuación operativa de `AUDIT_Y_PLAN.md`. Este documento detalla el **siguiente batch a implementar todo junto**: las dos capas de sincronización ya acordadas (a = reloj con pausa por silencio, b = SMTC como reloj maestro) y los dos features nuevos: **(1) capa de letras nativa, multi-fuente y desacoplada** y **(2) caché local de canciones escuchadas**.
>
> Principio rector del batch: **offline-first y agnóstico de fuente**. El widget no depende de ninguna app externa ni de un único proveedor de letras; busca, parsea, romaniza y guarda todo localmente, y en la segunda escucha de una canción no toca la red.

---

## 0. Orden de ejecución (un solo esfuerzo coherente)

El orden minimiza retrabajo: primero el fix de reloj, luego el seam de letras que la caché necesita, luego la caché, y al final SMTC que se enchufa como fuente de reloj **y** dispara el prefetch a la caché.

| # | Pieza | Por qué este orden | Esfuerzo |
|---|-------|--------------------|----------|
| a | **Reloj con pausa por silencio** | Bug actual de deriva en pausa; independiente, 1 tarde | XS |
| 1 | **Capa de letras (`LyricsService` + providers)** | Crea el seam limpio donde enchufa la caché | M |
| 2 | **Caché local de letras** | Usa el seam de (1); acelera re-escuchas | M |
| b | **SMTC como reloj maestro** | Fuente de verdad de posición + prefetch a caché en cuanto hay metadata | M-L |

Fuera de este batch (tracks adyacentes, ya conversados, no se implementan aquí): **pill colapsable "SING"** y **wake word / hotkey**. Se dejan anotados al final para no perderlos.

---

## a. Reloj con pausa por silencio (fix de deriva en pausa)

**Problema (S2 de la auditoría):** `StateStore.currentPosition()` suma `now - anchoredAt` siempre. Si la música se pausa, la letra sigue avanzando hasta el próximo `recognition:correct` (~12 s después). Sin SMTC, una pausa desincroniza todo.

**Diseño:**
- El `createLevelMeter` de `capture.ts` ya mide `peak`. Reportar el `level` de cada chunk al main (ya viaja en `RecordedChunk.level`); además exponer un muestreo de nivel más frecuente o reusar el `SILENCE_PEAK = 0.012` existente.
- En `StateStore`: estado `clockPaused: boolean`. Cuando hay silencio sostenido (p. ej. ≥2 muestras bajo `SILENCE_PEAK`), **congelar el ancla**: `settle(now)` + `clockPaused = true`. Al volver señal, `reanchor(currentPosition, now)` y `clockPaused = false`.
- `currentPosition(now)`: si `clockPaused`, devolver la base sin sumar `elapsed`.
- Reloj monotónico: cambiar `Date.now()` por un reloj basado en `performance.now()` acumulado para no saltar con cambios de hora del SO (refactor pequeño y contenido en `syncTiming`/`stateStore`).

**Archivos:** `electron/core/stateStore.ts`, `electron/core/syncTiming.ts`, `src/audio/capture.ts` (propagar nivel), `main.ts` (IPC si hace falta un canal de nivel).

**Aceptación:** pausar Spotify/YouTube congela la letra en ≤0.5 s; reanudar la retoma sin salto perceptible. Test unitario de `currentPosition` con `clockPaused`.

---

## 1. Capa de letras nativa, multi-fuente y desacoplada

**Objetivo:** reemplazar la llamada directa a `fetchLyricsByMetadata` por un servicio local con **abstracción de proveedor**, endpoint exacto y rápido, normalización y romanización locales. Independiente de cualquier app: la letra se busca por metadata (que ya tenemos de AudD/SMTC), se parsea y se envuelve aquí.

### Estructura nueva: `electron/services/lyrics/`

```
lyrics/
  types.ts            # LyricsQuery, RawLyrics, LyricsProvider
  providers/
    lrclib.ts         # provider primario (refactor del lrclib.ts actual)
    index.ts          # cadena ordenada de providers
  lyricsService.ts    # orquestador: caché → providers → normalizar → romanizar
```

### Contratos

```ts
interface LyricsQuery {
  title: string;
  artist: string;
  album?: string | null;
  durationMs?: number | null;   // de SMTC/AudD → desambigua
}

interface RawLyrics {
  source: string;               // "lrclib", ...
  synced: boolean;
  lrc?: string;                 // LRC crudo si synced
  plain?: string;               // texto plano si no
}

interface LyricsProvider {
  name: string;
  lookup(q: LyricsQuery, signal: AbortSignal): Promise<RawLyrics | null>;
}
```

### Provider LRCLIB (refactor del actual)

- **Preferir `GET /api/get`** (firma exacta: `track_name`, `artist_name`, `album_name`, `duration`) → 1 request, sin escanear array, mucho más preciso. **Fallback a `/api/search`** solo si `/get` da 404.
- Selección del mejor resultado en `search`: `synced` primero, luego cercanía de `durationMs` (±2 s), descartar `instrumental`.
- Mantener `parseLrc` / `plainTextToLyrics` existentes para normalizar.

### Orquestador `lyricsService.getLyrics(query): Promise<TimedLyrics | null>`

1. `cache.get(key)` → si hit, devuelve **sin red ni romanización** (ver §2).
2. Single-flight: si ya hay un fetch en vuelo para ese `key`, esperar esa promesa (evita doble request por prefetch + carga real).
3. Recorrer `providers` en orden hasta el primer `RawLyrics`.
4. Normalizar (`parseLrc`/`plainTextToLyrics`) → `LyricLine[]`.
5. `romanizeTimedLyrics` (existente) → agrega furigana/romaji.
6. `cache.put(key, timedLyrics, meta)`; si nadie dio letra, `cache.markNotFound(key)`.
7. Devolver `TimedLyrics`.

### Eficiencia

- Agente HTTP con **keep-alive + gzip** compartido (undici/`fetch` con `Agent`), timeout ~4 s + `AbortController`.
- `/api/get` exacto como camino feliz.
- La romanización (kuroshiro) es lo caro → su resultado queda en la caché en disco, así que solo se paga **una vez por canción** en toda la vida del equipo.

### Integración

- `stateStore.loadLyricsByMetadata(title, artist)` pasa a llamar `lyricsService.getLyrics({ title, artist, album, durationMs })`. Aprovechar `TrackRef.duration_ms`/`album` cuando AudD/SMTC los entreguen.
- `lrclib.ts` actual se absorbe en `providers/lrclib.ts` (no romper imports: dejar re-export temporal o actualizar `stateStore`).

**Aceptación:** misma canción que hoy carga letra sincronizada; `/api/get` usado cuando hay duración; agregar un segundo provider es solo crear un archivo en `providers/` y añadirlo a la cadena. Tests: provider con `/get` mockeado, fallback a `/search`, selección por duración.

---

## 2. Caché local de canciones escuchadas

**Objetivo:** que volver a una canción que te gusta sea **instantáneo** (sin red, sin kuroshiro), eficiente en espacio, ordenado y entendible. Aprovecha que el repertorio real de un usuario es chico y repetitivo.

### Filosofía de almacenamiento (sin dependencias nativas)

Coherente con `settings.ts` (eligieron `fs` sobre `userData` para evitar líos ESM/native). **Índice JSON legible + payloads gzip por canción.** Nada de SQLite por ahora (se reevalúa solo si la biblioteca supera ~miles de pistas).

```
userData/cache/
  index.json                       # metadata caliente, legible
  lyrics/
    ab/ab12cd34….json.gz           # TimedLyrics normalizado + romanizado, gzip
    7f/7f90ee21….json.gz
```

- **Clave:** `normalizeTrackKey(artist, title)` (reusar el existente).
- **Nombre de archivo:** `sha1(key)`, shardeado por los 2 primeros chars (evita dirs gigantes y nombres ilegales).
- **gzip:** una letra de ~2–10 KB baja a <2 KB; 1000 canciones ≈ pocos MB.

### Entrada de índice

```ts
interface CacheEntry {
  key: string;
  title: string; artist: string; album?: string | null;
  durationMs?: number | null;
  source: string; synced: boolean;
  hasFurigana: boolean; hasRomaji: boolean;
  lyricsFile: string;              // ruta sharded relativa
  contentHash: string;
  firstHeardAt: number; lastHeardAt: number;
  playCount: number;               // ← clave para favoritos
  syncOffsetMs?: number;           // consolidación opcional de OffsetStore
  notFound?: { at: number; ttlMs: number };  // caché negativa
}
interface CacheIndex { schemaVersion: number; entries: Record<string, CacheEntry>; }
```

### API `electron/services/cache/lyricsCache.ts`

- `get(key)`: lee índice; si hit, **lazy-load** del `.json.gz`, gunzip, y `lastHeardAt = now; playCount++` (el boost de re-escucha). Devuelve `TimedLyrics | null`.
- `put(key, lyrics, meta)`: escribe payload gzip + upsert de la entrada.
- `markNotFound(key)` / chequeo de caché negativa con TTL corto (p. ej. 7 días) → no re-pegarle a la red en cada replay de un instrumental.
- `prune()`: aplica caps con **score que protege favoritos** → `score = recencia + w · playCount`; expulsa los de menor score. Caps: `maxEntries` (~1000) y `maxBytes` (~100 MB). Corre al iniciar y cada N `put`.
- Escrituras **atómicas** del índice (tmp + rename) para no corromper.
- `schemaVersion` para migraciones futuras.

### Aprovechar las re-escuchas (el corazón del feature)

- **Prefetch en reconocimiento:** apenas SMTC/AudD entregan `title`/`artist`, disparar `lyricsService.getLyrics` (que va a caché primero). En canciones favoritas la letra aparece casi instantánea en el replay porque salta red + romanización + carga de diccionario kuroshiro.
- La romanización por línea en memoria (J3, ya hecho) se complementa: el disco guarda la canción ya romanizada, así el ahorro sobrevive a reinicios.

### Consolidación opcional con `OffsetStore`

El `syncOffsetMs` por pista (hoy en `espejo-settings.json`) puede vivir en `CacheEntry.syncOffsetMs` como **fuente única por canción**, y `OffsetStore` pasar a ser un adaptador delgado sobre `lyricsCache`. Bajo riesgo, pero opcional: si se hace, migrar el JSON viejo al primer arranque.

### Mantenibilidad / futura UI

- IPC `cache:stats` y `cache:clear` para un futuro panel de settings (Fase 5 del audit).
- `index.json` legible a propósito: se puede abrir y entender qué hay cacheado.

**Aceptación:** segunda escucha de una canción muestra letra sin tocar la red (verificable apagando wifi); `prune` respeta las de mayor `playCount`; caché negativa evita refetch de instrumentales; tamaño total acotado. Tests: get/put/markNotFound, política de `prune`, escritura atómica.

---

## b. SMTC como reloj maestro (Fase 1.5 del audit)

**Objetivo:** que la posición la mande el SO, no un reloj ciego. Resuelve deriva (S1), pausa/seek/cambio de pista (S2) y casi toda la latencia (S3); además da `title`/`artist`/`album`/`duration` **gratis y sin audio** para disparar el prefetch a la caché.

**Diseño:**
- `GlobalSystemMediaTransportControlsSessionManager` (Win10 1809+): metadata + `GetTimelineProperties().Position` + estado play/pausa + eventos `TimelinePropertiesChanged`/`PlaybackInfoChanged`.
- Acceso desde Electron: **sidecar nativo pequeño** (C#/Rust) que lee SMTC y empuja JSON por stdio al proceso main (más confiable que los paquetes npm abandonados tipo `electron-media-service`; evita `electron-rebuild`).
- En `StateStore`: nueva fuente de posición de **alta confianza**. Cuando SMTC reporta posición, tratarla como corrección de drift de confianza máxima (vía el mismo `computeDrift`/`reanchor`); pausa de SMTC → `clockPaused` (se reusa la capa a); cambio de pista → `applyMatch` con la nueva metadata.
- AudD queda como **fallback** (vinilo, en vivo, web sin SMTC, micrófono), no como fuente primaria de reloj.
- Equivalentes para portar luego: **MPRIS** (Linux), **MediaRemote** (macOS).

**Aceptación:** con Spotify/YouTube en navegador soportado, la letra sigue play/pausa/seek al instante y sin deriva; sin SMTC disponible cae a AudD sin romperse. La metadata de SMTC dispara prefetch de caché.

---

## Resumen de archivos del batch

**Nuevos:** `electron/services/lyrics/{types,lyricsService}.ts`, `electron/services/lyrics/providers/{lrclib,index}.ts`, `electron/services/cache/lyricsCache.ts`, sidecar SMTC (carpeta aparte, p. ej. `native/smtc/`).

**Modificados:** `electron/core/stateStore.ts` (reloj con pausa, fuente SMTC, llamar a `lyricsService`), `electron/core/syncTiming.ts` (reloj monotónico), `src/audio/capture.ts` (propagar nivel), `electron/main.ts` (IPC: nivel, `cache:*`, canal SMTC), `electron/services/settings.ts` (opcional: adaptador sobre caché).

**Tests:** `tests/` — `clockPaused`, providers (`/get` vs `/search`, selección por duración), caché (`get/put/markNotFound/prune`), e integración SMTC mockeada.

---

## Tracks adyacentes (no en este batch, anotados)

- **Pill colapsable "SING":** reemplazar `window:minimize` (que va a la barra de tareas) por un estado *colapsado* — misma `BrowserWindow`, `setSize` a ~140×44 + reposición top-center con `screen.workArea`, `alwaysOnTop('screen-saver')`, icono+texto como contenido del renderer. Expandir al detectar canción o al comando.
- **Comando "SING" (wake word / hotkey):** por defecto sin mic → `globalShortcut` (ej. Ctrl+Alt+S) + click en la pill. Opt-in por voz → wake word local (**openWakeWord** open source, u **Porcupine** comercial), audio nunca grabado/enviado. Al disparar: expandir → SMTC → loopback+AudD → (si mic activo) mic+AudD → mostrar letra.
