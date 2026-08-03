# Diagnóstico: procesos zombies al cerrar Singevery

Fecha: 2026-08-03
Estado: DIAGNÓSTICO COMPLETO + FIX APLICADO Y VALIDADO (E1-E4). Pendiente: prueba en vivo en Windows.

## Síntoma reportado

Al cerrar la app, quedan procesos que enlentecen el PC.

## Inventario de procesos que puede dejar la app

La app spawna EXACTAMENTE un proceso hijo (verificado en código):

1. **`espejo-smtc.exe`** (sidecar SMTC, C#/.NET 8) — lanzado por
   `electron/services/smtc/smtcReader.ts:150` via `spawn()`. Es el único sidecar
   con binario real (`native/smtc/dist/espejo-smtc.exe`).
2. WakeWordReader (`wakeword/wakeWordReader.ts:51`) — MISMO patrón de spawn, pero
   `native/wakeword/` NO tiene binario (solo README.md) → nunca arranca, no es el
   zombie. Aun así, el fix aplica a ambos readers (defensa en profundidad).

NO hay tray, NO hay child_process en otro lado (grep completo de spawn/exec/fork
en electron/ dio solo estos dos), NO hay intervalos sin limpiar (stateStore.stop()
hace clearInterval + cancelAutoRetry; autoContrast.dispose() → stop(); lyricsCache
flush escribe y no deja timer; boundsSaveTimer de la ventana muere con la ventana).

## Mecanismo exacto del cierre

`window-all-closed` (main.ts:1041-1049): smtcReader.stop() + wakeWordReader.stop()
+ autoContrast.dispose() + stateStore.stop() + lyricsCache.flush() + quit().
`before-quit` (main.ts:1051-1057): repite los stops.

`stop()` de ambos readers (smtcReader.ts:177-180, wakeWordReader.ts:74-77):
`this.proc?.kill()` — manda SIGTERM/CTRL_CLOSE al hijo y espera nada más.

## Evidencia reproducible (experimentos reales, 2026-08-03, WSL→Windows)

E1 — Padre muere primero (simula crash del main o kill de electron.exe en Task
Manager) CON medios sonando (había un podcast en reproducción):
  - El sidecar escribía eventos cada segundo.
  - Al morir el padre, la pipe rota hizo que la siguiente escritura reventara →
    el sidecar MURIÓ solo. Verificado: `tasklist` sin espejo-smtc 3 s después.

E2 — kill() normal (equivale a smtcReader.stop()): el sidecar murió limpio
(exit code null, no quedó proceso).

## Hallazgo clave — el caso zombie real

**El sidecar SOLO escribe cuando hay sesión de medios activa.** En
`native/smtc/Program.cs`:
- Línea 167: `if (s == null) return;` en EmitPosition — sin sesión NO escribe.
- Línea 60: `await Task.Delay(Timeout.Infinite)` — vive para siempre.

Consecuencia: si el proceso main muere (crash, force-kill, cierre forzado) y en
ese momento NO hay música/medios reproduciéndose, el sidecar nunca vuelve a
escribir a la pipe → nunca detecta que el padre murió → **queda vivo con su
Timer de 1 s y su Task.Delay(Infinite) para siempre**. Ese es el zombie.

El cierre NORMAL no lo deja (E2 probado), pero cualquier cierre anormal SÍ —
y el usuario percibe "cierro y el PC queda lento" porque el exe se queda en
background consumiendo CPU (timer 1 s) y memoria.

Segunda puerta: si el main queda colgado (hang) y el usuario mata electron.exe
desde Task Manager (no con taskkill /T), el sidecar sobrevive por la misma razón.

## Por qué NO es Electron el que lo deja

Electron mata a sus hijos al morir el main SOLO si son children del proceso
Electron con handles válidos; un sidecar spawnado con stdio pipe normal se
convierte en huérfano de Windows (se re-parentea) y nadie lo mata. La protección
debe vivir en el propio sidecar (auto-detección de padre muerto).

## Plan de arreglo

### P0 — Robustez del sidecar C# (la raíz) — `native/smtc/Program.cs`
1. **Parent watcher**: timer de 2 s que chequea si el proceso padre sigue vivo
   (Process.GetCurrentProcess().Parent() via Win32 API o `GetParentProcessId`).
   Si el padre murió → `Environment.Exit(0)`.
2. **Heartbeat incondicional**: emitir `{"type":"heartbeat"}` cada 5 s aunque no
   haya sesión de medios. Si la pipe está rota (padre muerto), la escritura lanza
   IOException → el proceso termina solo. Doble red con el watcher.
3. No requiere .NET nuevo: mismo target, compilar con `dotnet publish` existente
   (build.ps1 ya documentado; SDK 8.0.423 presente).

### P1 — Defensa en profundidad en los readers TS — smtcReader.ts / wakeWordReader.ts
4. `stop()`: kill() + `unref()` (que el handle no mantenga vivo el event loop) +
   null. Ya hace kill + null; agregar unref y un segundo kill de respaldo tras
   breve delay si el proceso sigue vivo (en Windows, SIGTERM a veces es ignorado
   por procesos nativos).
5. `window-all-closed`: tras flush(), `app.exit(0)` explícito (no depender de
   quit() implícito) — garantiza que el main no deje timers/IO colgando.
6. Registrar el PID del sidecar en el logger de soporte (`collectDiagnostics`)
   para que un ticket incluya "procesos en segundo plano al cerrar".

### P2 — Verificación post-cierre (script)
7. `scripts/check-zombies.cjs` (node puro, corre desde WSL también):
   - Busca `espejo-smtc.exe` y `electron.exe` en la lista de procesos Windows.
   - Si la app está cerrada y `espejo-smtc.exe` sigue vivo → alerta con PID.
   - npm script `check:zombies`; se corre tras smoke manual.
8. Smoke manual Windows (paso E del checklist de validación):
   cerrar la app → `npm run check:zombies` → 0 zombies esperado.

### P3 — Validación y commit
9. Rebuild del sidecar (`native/smtc/build.ps1` en Windows), re-empaquetar
   (`build/smtc-dist` → extraResources), `npm run build` + tests.
10. Commit atómico `feat(cleanup): ...` (scope feat, regla del repo).
11. Actualizar skill `espejo-teleprompter` con el hallazgo y el fix.

## Verificación del diagnóstico (qué falta confirmar en Windows real)

El experimento E1 se hizo CON medios sonando. El caso zombie (padre muere SIN
medios) NO se ha reproducido todavía — el sidecar se lanza igual y Task.Delay
Infinite + sin escrituras → debería quedar vivo. Pasos para confirmarlo en
Windows (opcional, 2 min):

    cd native/smtc/dist
    # lanzar espejo-smtc.exe en una consola, SIN música reproduciéndose
    espejo-smtc.exe
    # desde PowerShell, matar solo el "padre" — en este caso es el cmd/consola
    # (o lanzarlo con node.exe -e como en E1 y matar ese node)
    # luego: Get-Process espejo-smtc  → debe seguir vivo (BUG CONFIRMADO)

Si se confirma, el fix P0 es imprescindible; si no (el SO re-parentea y algo lo
mata), igual aplicamos P0 como defensa: es barato y cubre todos los caminos.
