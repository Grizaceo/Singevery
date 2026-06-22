# PLAN_ESTADO_ACTUAL.md — Espejo Teleprompter (post-auditoría, jun 2026)

> Continuación operativa de `AUDIT_Y_PLAN.md` y `PLAN_LETRAS_Y_CACHE.md`.
> Refleja el **estado real del repo** tras revisar la rama `feat/windows-widget-ui`
> y restaurar `apps/desktop/electron/preload.ts` (estaba físicamente truncado a
> mitad de archivo, rompiendo build y runtime).
>
> Estado base verificado: build **verde** — `npx tsc -b` + `npx tsc -p
> tsconfig.electron.json --noEmit` OK, `eslint` 0 errores, **59/59 tests** verdes.
> El batch de `PLAN_LETRAS_Y_CACHE.md` (capas a / 1 / 2 / b) está implementado en
> código, con varias piezas a medio conectar.

---

## 0. Estado de lo ya construido

| Pieza | Código | Cableado | Falta |
|---|---|---|---|
| Capa a — reloj con pausa por silencio | ✅ `stateStore.reportAudioLevel` / `clockPaused` | ✅ | — |
| Capa 1 — `LyricsService` + providers | ✅ single-flight + cadena de providers | ✅ inyectada en `main.ts` | — |
| Capa 2 — `FileLyricsCache` | ✅ gzip + índice + `prune` + TTL negativo | ✅ inyectada | micro: reescribe el índice completo en cada hit |
| Capa b — SMTC reader | ✅ `smtcReader.ts` + 6 tests | ✅ `new SmtcReader(...).start()` en `main.ts` | **binario del sidecar C#** (no compilado) |
| SING pill | ✅ `Pill.tsx` + IPC `setCollapsed` / `onSingCommand` | ❌ **no conectado** | render en `App`, `globalShortcut`, emitir `command:sing` |
| Wake word | ✅ `WakeWordReader` | ❌ no instanciado | sidecar `native/wakeword/` + cableado |
| Sub-línea (Fase 3) | ❌ | — | karaoke por palabra / barra interpolada |

### Hallazgos de la revisión que ajustan el roadmap
- **SMTC inerte**: el reader está cableado y testeado, pero `native/smtc/` solo
  tiene `Program.cs` + `EspejoSmtc.csproj` + `README.md`; falta `dotnet publish`
  → `native/smtc/dist/espejo-smtc.exe`, y exportar `SMTC_SIDECAR`.
- **SING pill a medias**: `src/Pill.tsx` + `src/Pill.css` existen y el preload/
  `main.ts` tienen `onSingCommand` + `window:setCollapsed`, pero `App.tsx` no
  renderiza `Pill`, no hay `globalShortcut`, nadie emite `command:sing`, y
  `WakeWordReader` no se instancia.
- **Artefactos versionados**: `apps/desktop/src/types.js` y `.map` son salida de
  compilación y **no** están en `.gitignore` (solo cubre `dist/`, `dist-electron/`).

---

## 1. P0 — Cierre del batch actual (XS, hacer ya)

1. **Commitear** la restauración de `apps/desktop/electron/preload.ts`.
2. **Sacar artefactos de `src/`**: añadir `src/types.js` y `src/types.js.map` a
   `.gitignore` + `git rm --cached`. Son salida de compilación, no fuente.
3. **(micro) Cache `index.json`**: debouncing del `persist()` en
   `FileLyricsCache.get()` — hoy reescribe el índice completo en cada
   reproducción por `playCount++` (`lyricsCache.ts:142-144`).

---

## 2. P1 — Completar lo que está a medias (alto valor / esfuerzo S-M)

4. **SMTC end-to-end (Capa b real)** 🔴 — mata deriva / pausa / seek (S1/S2/S3).
   - Compilar el sidecar: `dotnet publish -c Release -r win-x64
     --self-contained false -o dist` → `native/smtc/dist/espejo-smtc.exe`.
   - Documentar `SMTC_SIDECAR` en `WINDOWS.md`; idealmente autodetectar la ruta
     `dist/` si la env no está.
   - Smoke test en Windows con Spotify / YouTube: play/pausa/seek/skip siguen al
     instante; la metadata dispara prefetch a la caché.
5. **SING pill conectada (modo widget)** 🟠 — la promesa de UX a medio construir.
   - `App.tsx`: estado `collapsed`; render `<Pill onSing=…>` colapsado,
     teleprompter expandido.
   - `main.ts`: `globalShortcut` (Ctrl+Alt+S) → `webContents.send('command:sing')`;
     `App` se suscribe con `onSingCommand` → expande (`setCollapsed(false)`) e
     inicia reconocimiento.
   - Expandir también al detectar canción (SMTC / AudD); colapsar manual.

---

## 3. P2 — Núcleo del objetivo "rapear en japonés" (S-M, mayor salto percibido)

6. **Fase 3.2 — Resaltado interpolado dentro de la línea** 🔴 (fallback
   universal): barra/resalte que barre la línea actual según
   `(pos − start) / (end − start)`. Da el "dónde voy" aunque la letra sea solo a
   nivel de línea. `syncEngine.ts` (exponer progreso) + `Teleprompter.tsx`.
7. **Fase 3.1 — Enhanced LRC (A2) palabra-por-palabra** 🟠 cuando lrclib lo
   provea: `<mm:ss.xx>palabra` → timing por palabra; karaoke real (resuelve S4).
   Parser en `lrcParser.ts` + tipo `LyricLine.words?`.
8. **Fase 1.4 — Calibrar `SYNC_OFFSET_MS`** 🟠 (`syncTiming.ts:6`, hoy `300`
   adivinado): medir empíricamente y/o exponer como ajuste fino persistido.

---

## 4. P3 — Robustez y limpieza (M, después de validar lo anterior)

9. **Wake word opt-in** 🟡: instanciar `WakeWordReader` en `main.ts` (env
   `WAKEWORD_SIDECAR`) → `command:sing`; sidecar `native/wakeword/` (openWakeWord,
   audio nunca se graba/envía). Tests de `parseWakeMessage`.
10. **SMTC suavizado** ⚪: si en pruebas reales `applyExternalPosition` da
    microsaltos por posiciones gruesas, cambiar el snap duro por rampa para
    deriva moderada (`stateStore.ts:378-388`).
11. **Fase 6 — Archivar legacy** 🟡 (C3): mover `libs/*` Python, `apps/ui_kiosk`,
    `apps/device_daemon`, `tools/simulator` a `legacy/` o documentar que
    `apps/desktop` es la app única.

---

## 5. Quick wins

| Acción | Resuelve | Esfuerzo |
|---|---|---|
| `git rm --cached` de `types.js` / `.map` + gitignore | limpieza | XS |
| Debounce de `persist()` en cache | I/O en cada play | XS |
| Compilar sidecar SMTC + autodetección de ruta | S1/S2/S3 | S |
| Barra interpolada dentro de la línea | S4 (parcial) | S |
| Conectar Pill + hotkey | modo widget | S |

---

## 6. Prompt (formato goal) para implementar este plan

```
GOAL
Llevar Espejo Teleprompter (apps/desktop, Electron + React 19) desde "batch
implementado a medias" hasta "rapear en japonés con sincronización precisa y
modo widget usable", ejecutando este plan por fases P0→P3 sin romper el build
ni los 59 tests.

WHY
El objetivo del producto es mostrar la letra original japonesa con lectura
(furigana/romaji) sincronizada al audio que suena, legible a velocidad de rap.
La sincronización y la granularidad sub-línea son el corazón; SMTC y el modo
widget (pill) son la infraestructura que lo hace fiable y usable en vivo.

CONTEXT (estado real del repo, ya verificado)
- Build VERDE tras restaurar electron/preload.ts (estaba truncado). No re-romper.
- Implementado y testeado: capa a (pausa por silencio en stateStore), capa 1
  (LyricsService single-flight + providers/lrclib), capa 2 (FileLyricsCache
  gzip+índice+prune+TTL), capa b reader (smtcReader.ts, cableado en main.ts).
- A MEDIO CONECTAR: SMTC no tiene binario (native/smtc/ solo Program.cs+csproj,
  falta dotnet publish); la SING pill (src/Pill.tsx) NO se renderiza ni hay
  globalShortcut ni emisión de command:sing; WakeWordReader no se instancia.
- Artefactos versionados por error: src/types.js y src/types.js.map.
- Constantes pendientes: SYNC_OFFSET_MS=300 (syncTiming.ts) es adivinada.
- Sin granularidad sub-línea (sin karaoke ni barra interpolada).

SCOPE (en orden; cada fase debe quedar verde antes de la siguiente)
P0 — Cierre/limpieza:
  - Commitear el fix de preload.ts.
  - .gitignore + git rm --cached de src/types.js y .map.
  - Debounce del persist() en FileLyricsCache.get().
P1 — Completar lo a medias:
  - SMTC real: compilar sidecar (native/smtc, dotnet publish win-x64 → dist/),
    autodetectar la ruta dist/ si SMTC_SIDECAR no está, documentar en WINDOWS.md.
  - SING pill: App.tsx con estado collapsed renderizando <Pill>; globalShortcut
    Ctrl+Alt+S en main.ts → command:sing; App se suscribe vía onSingCommand,
    expande con setCollapsed e inicia reconocimiento; expandir al detectar canción.
P2 — Núcleo del objetivo:
  - Resaltado interpolado dentro de la línea actual (progreso (pos-start)/
    (end-start)) en syncEngine + Teleprompter.
  - Parser de Enhanced LRC (A2) palabra-por-palabra en lrcParser + tipo
    LyricLine.words?; karaoke por palabra cuando lrclib lo provea.
  - Calibrar/exponer SYNC_OFFSET_MS como ajuste fino persistido.
P3 — Robustez/limpieza:
  - Cablear WakeWordReader (opt-in, env WAKEWORD_SIDECAR) → command:sing + tests
    de parseWakeMessage.
  - Si hay microsaltos reales de SMTC, suavizar applyExternalPosition.
  - Archivar legacy (libs/* py, ui_kiosk, device_daemon, tools/simulator) a legacy/.

CONSTRAINTS
- Mantener `npx tsc -b`, `npx tsc -p tsconfig.electron.json --noEmit` y
  `npx vitest run` (59 tests) verdes después de CADA fase; añadir tests para la
  lógica pura nueva (parser A2, interpolación, parseWakeMessage, debounce).
- Seguir los patrones existentes: funciones puras testeables en syncTiming/
  lrcParser, servicios inyectables con NULL_* por defecto, contrato DesktopApi
  (src/types.ts) como fuente de verdad para preload↔main, comentarios en español.
- Seguridad Electron intacta: nada de dangerouslySetInnerHTML; el furigana se
  sigue parseando a segmentos. No exponer IPC fuera del bridge de preload.
- No tocar el snake_case de RenderModel (contrato con renderer/daemon).
- Cambios atómicos por fase con su commit; no mezclar P0 con features.

OUT OF SCOPE (anotar, no implementar salvo que se pida)
- Integración Spotify Web API / OAuth (SMTC cubre el caso Windows).
- Portar SMTC a MPRIS/MediaRemote (Linux/macOS).
- Modo mora (J5) y panel de settings runtime completo (Fase 5 del audit).

DEFINITION OF DONE
- En Windows con Spotify/YouTube: play/pausa/seek/skip siguen al instante sin
  deriva; la pill colapsada se expande con Ctrl+Alt+S o al sonar una canción.
- La línea actual muestra resaltado que avanza dentro de la línea; cuando lrclib
  da A2, el resaltado es por palabra.
- Build verde, lint limpio, tests ampliados pasando; src/ sin artefactos .js.
```
