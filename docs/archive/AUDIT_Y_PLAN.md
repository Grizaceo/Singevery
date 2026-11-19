# Auditoría + Plan de mejoras — Espejo Teleprompter

> Objetivo guía: **poder rapear en japonés** — letra mostrada y letra que suena sincronizadas de forma automática y precisa, con ayudas de lectura (furigana / romaji) legibles a velocidad de rap.
>
> Estado base auditado: rama `main`, 19/19 tests pasando. App real = `apps/desktop` (Electron + React 19). El resto del monorepo (`libs/` Python, `apps/ui_kiosk`, `apps/device_daemon`, `tools/simulator`) es scaffold legado.

---

## 1. Cómo funciona hoy (pipeline real)

```
RecognitionControls (renderer)
  └─ loop: grabar chunk 6s ──► IPC recognition:identify
                                   │
        AudD (/recognize) ◄────────┘  devuelve {title, artist, timecode}
                                   │
        StateStore.applyMatch ─────┤  ancla posición = timecode + elapsed + 300ms
                                   │  lastMatchKey dedup
        lrclib (/api/search) ──────┤  busca LRC sincronizado o letra plana
                                   │
        romanizeTimedLyrics ───────┤  kuroshiro→romaji (REEMPLAZA el texto original)
                                   │
        SyncEngine.setLyrics ──────┘
                                   ▼
  tick() @10Hz: pos = ancla + (now - anchoredAt) + offset
                getRenderModel(pos) → ventana de ±2 líneas
                                   ▼
            IPC render:model ──► Teleprompter (renderer)
```

**Modelo de sincronización actual = "anclar una vez y correr con el reloj de pared".** Tras el primer match, `RecognitionControls` hace `break` del loop y la posición avanza sola por `Date.now()`. No hay re-anclaje, ni corrección de deriva, ni detección de pausa/seek del reproductor.

---

## 2. Auditoría por área

Severidad: 🔴 crítico para el objetivo · 🟠 importante · 🟡 mejora · ⚪ limpieza.

### 2.1 Sincronización automática — *el corazón del objetivo*

| # | Hallazgo | Sev | Dónde |
|---|----------|-----|-------|
| S1 | **Sin re-sincronización**: tras el primer match el loop hace `break` y la posición es puro `now - anchoredAt`. Cualquier error del timecode de AudD (típicamente ±1–2 s, a veces más) **nunca se corrige** y la deriva se acumula. Para rap (líneas densas y rápidas) basta ½ s de error para perder el flow. | 🔴 | `RecognitionControls.tsx:88-94`, `stateStore.ts:147-150` |
| S2 | **No detecta pausa / seek / cambio de pista del reproductor.** Si pausas Spotify o saltas, el widget sigue "rapeando" solo. La fuente de verdad de la posición debería ser el reproductor, no un reloj ciego. | 🔴 | `stateStore.ts` (no existe) |
| S3 | **Latencia de arranque ~7–9 s**: 6 s de grabación + roundtrip de red antes de ver la primera línea. El `SYNC_OFFSET_MS = 300` es una constante adivinada, no medida. | 🟠 | `capture.ts:3`, `syncTiming.ts:6` |
| S4 | **Granularidad solo a nivel de línea.** No hay resaltado por palabra/sílaba ni progreso *dentro* de la línea actual. Imposible "seguir la sílaba" en un verso rápido. | 🔴 | `syncEngine.ts:100-124`, `Teleprompter.tsx` |
| S5 | **Offset crónico no se persiste** (`syncOffsetMs` vive en memoria; se pierde al cerrar). `electron-store` está en `package.json` pero **no se usa**. Debería persistirse por pista. | 🟠 | `stateStore.ts:35`, `package.json` |
| S6 | **Letra plana = 5 s por línea fijos** (`plainTextToLyrics`), avance totalmente ficticio e inútil para seguir la canción. | 🟠 | `lrcParser.ts:42-51` |
| S7 | Re-anclaje en `applyMatch` es un **salto duro** (sin suavizado); cuando re-identifique, la letra "brincará". | 🟡 | `stateStore.ts:111-136` |

### 2.2 Reconocimiento (AudD)

| # | Hallazgo | Sev | Dónde |
|---|----------|-----|-------|
| R1 | **`confidence: 1.0` hardcodeado** — AudD no da confianza y no hay gating. Un match falso carga la letra equivocada sin defensa. | 🟠 | `audd.ts:91` |
| R2 | **Se escucha una sola vez.** No hay re-verificación periódica ni manejo de cambio de canción. Termina una pista → nada. | 🟠 | `RecognitionControls.tsx:88-94` |
| R3 | **Costo/latencia por API**: cada chunk = 1 llamada AudD de pago. Sin caché de "misma canción", sin backoff inteligente más allá de `#300`. | 🟡 | `main.ts:164-193` |
| R4 | `position_ms` de AudD es el offset del **inicio del sample**; la matemática de `adjustMatchPosition` es correcta en principio, pero un único punto sin suavizado ni rechazo de outliers. | 🟡 | `syncTiming.ts:8-18` |

### 2.3 Japonés / romanización — *clave para el objetivo*

| # | Hallazgo | Sev | Dónde |
|---|----------|-----|-------|
| J1 | **El romaji REEMPLAZA el texto original.** `romanizeTimedLyrics` sobreescribe `line.text` con romaji, se pierde el kanji/kana. Un rapero quiere **ver el original + la lectura**, no solo romaji. | 🔴 | `romanize.ts:84-92` |
| J2 | **No hay furigana.** Kuroshiro soporta `mode:"furigana"` → `<ruby>漢字<rt>かん</rt></ruby>` y `mode:"okurigana"` → `感(かん)じ`. Es el estándar de oro para leer japonés a velocidad. Hoy no se usa ni se renderiza `<ruby>`. *(Confirmado vía docs de kuroshiro.)* | 🔴 | `romanize.ts:61-68`, `Teleprompter.tsx:33` |
| J3 | **Sin caché de romanización.** Se re-romaniza cada vez que se carga la letra; kuroshiro+kuromoji es pesado (carga diccionario). | 🟡 | `romanize.ts`, `stateStore.ts:87` |
| J4 | **Sin selección de modo de lectura** (Original / Furigana / Romaji / ambos). Decidido en duro. | 🟠 | `romanize.ts:57-82` |
| J5 | Romaji `spaced`+`hepburn` separa por palabra pero **no por mora**; para rap conviene mostrar límites de mora/sílaba para marcar el ritmo. | 🟡 | `romanize.ts:63-67` |
| J6 | Errores de kuroshiro caen a texto original **en silencio** (`catch { return text }`) — sin telemetría de qué falló. | ⚪ | `romanize.ts:79-81` |

### 2.4 Widget / UX

| # | Hallazgo | Sev | Dónde |
|---|----------|-----|-------|
| W1 | **`font_scale`, `opacity`, `alignment`, `windowSize`, `mirror_mode` están hardcodeados** en el engine y **no hay UI** para cambiarlos en runtime, aunque el `RenderModel` ya los transporta. | 🟠 | `syncEngine.ts:30-33,119-122`, sin panel de settings |
| W2 | **Ventana no redimensionable libremente** (`resizable:false`); solo 3 presets S/M/L vía IPC. Para rap en pantalla quizá quieras una barra ancha. | 🟡 | `main.ts:43`, `WindowControls.tsx:10-14` |
| W3 | **Indicador de status crudo** muestra el enum (`DISPLAYING`, etc.) — ruido visual, no producto. | 🟡 | `Teleprompter.tsx:22`, `Teleprompter.css:37` |
| W4 | **Sin atajos de teclado.** Para performance en vivo: `Space` = re-sincronizar a la línea actual, `←/→` = seek línea, `+/-` = offset. Hoy solo botones + rueda. | 🟠 | `SyncControls.tsx` |
| W5 | Dos suscripciones separadas a `onRenderModel` (`App` y `SyncControls`) — funciona, pero conviene un store/context único. | ⚪ | `App.tsx:35`, `SyncControls.tsx:23` |
| W6 | Sin estado visual para "deriva probable" / "confianza baja" / "reproductor pausado". El usuario no sabe *por qué* está desfasado. | 🟡 | — |

### 2.5 Calidad de código / tests / legacy

| # | Hallazgo | Sev | Dónde |
|---|----------|-----|-------|
| C1 | `SyncEngine.updateMatch` es **no-op muerto** (paridad con el Python original). | ⚪ | `syncEngine.ts:48-50` |
| C2 | Búsqueda **lineal** de línea actual en cada tick (10Hz). OK con N pequeño, pero binary-search es trivial y a prueba de futuro. | ⚪ | `syncEngine.ts:62-79` |
| C3 | **Monorepo con código legado** (`libs/*` Python, `apps/ui_kiosk`, `apps/device_daemon`, `tools/simulator`) superado por `apps/desktop`. Confunde y se desvía del foco. Archivar/marcar. | 🟡 | raíz |
| C4 | Tests unitarios sólidos (timing, lrc, audd, romanize, engine) pero **0 cobertura de deriva/sync continuo** porque no existe esa lógica aún. | 🟡 | `tests/` |
| C5 | Logs `console.log [AudD DEBUG]/[CAPTURE DEBUG]` quedaron en código de producción. | ⚪ | `audd.ts:56`, `capture.ts:128,137` |

---

## 3. Plan de mejoras — fases hacia "rapear en japonés"

El plan ataca las dos columnas del objetivo en paralelo: **(A) sincronización precisa y automática** y **(B) japonés legible a velocidad**. Ordenado por impacto/esfuerzo.

### Decisión arquitectónica central (recomendación)

> **Hacer un sistema híbrido de posición:** AudD responde *"¿qué canción es?"* (sirve para cualquier fuente y para el arranque en frío); el **reproductor/SO responde "¿en qué milisegundo va?"** de forma continua y precisa.
>
> - **Spotify Web API** (`GET /me/player` → `progress_ms`, `is_playing`) si usas Spotify, o
> - **Windows SMTC** (`GlobalSystemMediaTransportControlsSessionManager` → `GetTimelineProperties().Position`) para cualquier app de media (Spotify, navegador, etc.), vía módulo nativo en el proceso main.
>
> Esto elimina de un golpe la deriva (S1), las pausas/seek (S2) y casi toda la latencia (S3). Cuando **no** hay reproductor accesible (vinilo, en vivo, micrófono), se cae al modo AudD con **re-identificación periódica + estimador de deriva**.

### FASE 1 — Sincronización que se auto-corrige (núcleo del objetivo) 🔴 ✅ IMPLEMENTADA

1. ✅ **No parar de escuchar.** `RecognitionControls` ya no hace `break`: tras el match entra en modo *tracking* y re-identifica en silencio cada ~18 s (`CAPTURE_RESYNC_PAUSE_MS`) **solo para corregir**, vía nuevo IPC `recognition:correct` que no toca el overlay de estado. Refactor de `capture.ts`: el grabador ya no detiene los tracks del sistema (los gestiona `SystemAudioSession`) para permitir captura continua.
2. ✅ **Corrección suave de deriva.** `computeDrift(estimadoNow, actualNow)` (puro, en `syncTiming.ts`): banda muerta ±150 ms (ignora ruido), `gain` 0.6 + rampa de 1200 ms para derivas moderadas (no brinca, S1/S7), y *snap* duro si `|error| > 4 s` (seek/cambio brusco). `StateStore` aplica la rampa vía `rampedCorrection` en `currentPosition`.
3. ✅ **Offset persistido por pista** con `electron-store` (`services/settings.ts`, `OffsetStore` inyectable): clave `normalizeTrackKey(artist,title)` → `offsetMs`. Se carga al identificar y se guarda en `adjustSyncOffset`. *Bonus:* se corrigió un bug por el que el offset crónico se cancelaba en cada re-anclaje (ahora `currentPosition` lo suma en vivo y la base se guarda cruda).
4. ⏳ **Re-medir `SYNC_OFFSET_MS`** empíricamente / exponerlo como calibración (pendiente — S3 parcial).
5. ✅ **Tests de deriva**: `computeDrift`/`rampedCorrection`/`normalizeTrackKey` cubiertos (29 tests verdes). Detectaron 1 bug real (espacio antes de `::`).

> **Bug latente corregido de paso:** el handler `recognition:identify` forzaba `setRecognitionPhase('LISTENING')` tras un match exitoso, lo que tapaba la letra con el overlay "Escuchando…". Antes quedaba oculto porque el loop hacía `break` + `stopRecognition`; con seguimiento continuo había que quitarlo.

### FASE 2 — Japonés legible (núcleo del objetivo) 🔴 ✅ IMPLEMENTADA

1. ✅ **Dejar de destruir el original.** `LyricLine` ahora es `{ start_ms, end_ms, text, furigana?, romaji? }` y `RenderModel` lleva `RenderLine` estructuradas (texto + lecturas). `romanizeTimedLyrics` **agrega** `furigana`/`romaji` y **conserva `text`** (resuelve J1).
2. ✅ **Furigana ruby** (resuelve J2): `kuroshiro.convert(text,{to:'hiragana',mode:'furigana'})` → HTML que se **parsea a segmentos** en `parseFurigana` (quita `<rp>` y todo tag → ningún HTML de la letra externa llega al renderer; **sin `dangerouslySetInnerHTML`**). El Teleprompter renderiza `<ruby>/<rt>` desde los segmentos. Verificado end-to-end: `愛を取り戻せ` → `愛(あい) 取(と) 戻(もど)`.
3. ✅ **Selector de modo de lectura** (resuelve J4): `Original | Furigana | Romaji | Furigana+Romaji`, persistido en `localStorage` (`useReadingMode`), control arriba a la derecha (`ReadingControls`). Default `furigana_romaji`. El romaji debajo solo en la línea actual (no satura el contexto).
4. ✅ **Caché de romanización** por texto de línea (resuelve J3): `analyzeLine` cachea (kuroshiro es pesado); evita reprocesar líneas repetidas y recargas.
5. ⏳ **(Avanzado) modo mora** para marcar ritmo (J5): pendiente — encaja mejor junto con Fase 3 (sub-línea).

### FASE 3 — Granularidad sub-línea (karaoke para rap) 🔴→🟠

1. **Parsear Enhanced LRC (A2)** cuando lrclib lo provea: `<mm:ss.xx>palabra` → timing por palabra; resaltado karaoke palabra-por-palabra (resuelve S4).
2. **Interpolación dentro de la línea** como fallback universal: una barra/resaltado que barre la línea actual según `(pos − start)/(end − start)`. Da el "dónde voy" aunque la letra sea solo a nivel de línea.
3. **Letra plana**: en vez de 5 s/línea ficticios (S6), repartir proporcionalmente a `duration_ms` de la pista, o desactivar auto-scroll y dejar control manual.

### FASE 4 — Reconocimiento robusto 🟠

1. **Gating de confianza** (R1/R2): aceptar match solo si lrclib encuentra letra y/o si dos matches consecutivos concuerdan en `matchKey`. Estado visual "confianza baja" (W6).
2. **Caché de "misma canción"** y backoff para reducir llamadas/costo a AudD (R3).
3. **Detección de fin/cambio de canción** → volver a estado de escucha automáticamente.

### FASE 5 — Widget pulido para performance en vivo 🟠→🟡

1. **Panel de settings** runtime (W1): tamaño de fuente, opacidad, alineación, nº de líneas de contexto, modo lectura — todo persistido.
2. **Atajos de teclado** (W4): `Space` re-sync a línea actual, `←/→` seek, `+/-` offset, `M` mirror.
3. **Resize libre** o presets más anchos para modo "barra" (W2).
4. **Pulir el status** (W3/W6): iconos/colores en vez del enum crudo; señal de pausa/deriva/confianza.
5. **Store/context único** del RenderModel (W5).

### FASE 6 — Limpieza 🟡→⚪

1. Archivar/mover el monorepo legado (C3) a `legacy/` o documentar que `apps/desktop` es la app.
2. Quitar `updateMatch` muerto (C1), logs de debug (C5), binary-search en el engine (C2).

---

## 4. Quick wins (alto impacto, bajo esfuerzo)

| Acción | Resuelve | Esfuerzo |
|--------|----------|----------|
| Persistir `syncOffsetMs` por pista con `electron-store` | S5 | XS |
| Furigana ruby con kuroshiro `mode:"furigana"` + render `<ruby>` (sin destruir original) | J1, J2 | S |
| Atajos de teclado (`Space`/`←→`/`±`) | W4 | XS |
| Quitar el `break` y re-identificar cada ~15 s para corregir deriva | S1 | S |
| Barra de progreso interpolada dentro de la línea actual | S4 (parcial) | S |
| Caché de romanización por pista | J3 | XS |

---

## 5. Recomendación de arranque

Para el objetivo "rapear en japonés", el mayor salto percibido viene de combinar **Fase 2 (furigana, no destruir original) + Fase 1 (re-sync continuo) + Fase 3.2 (resaltado interpolado dentro de la línea)**. Con eso ves el verso original con lectura encima y el resaltado te marca exactamente dónde va el flow, auto-corrigiéndose. La integración con reproductor (Spotify/SMTC) es la mejora estructural definitiva contra la deriva, pero requiere OAuth o módulo nativo — vale como Fase 1.5 una vez validado el resto.
