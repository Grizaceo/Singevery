# Auditoría Linux — paridad 1:1 con Windows (2026-09-18)

Rama `linux-wayland`, sobre el HEAD de Windows `ef17e41` (+ 3 commits de overlay
Linux). Máquina de prueba: Omarchy (Arch, kernel 7.2), Hyprland 0.56.2 con config
Lua, PipeWire 1.6.8, dos monitores (2560×1440 + 1920×1080), Electron 43.2.

Método: revisión de todo el código con dependencia de plataforma + pruebas
empíricas en la máquina (harness Electron mínimos, la app real manejada por CDP,
`hyprctl`, `busctl`, `grim`, captura de audio con un sink virtual) + suite de tests.

## Resultado

Build, lint y **771/771 tests** en verde (antes 714; +57 nuevos). La app
empaquetada como AppImage reconoce por audio del sistema, sigue a Spotify/Zen por
MPRIS, muestra karaoke con furigana/romaji, y se comporta como overlay fijado con
atajos en Hyprland.

## Matriz de paridad

| Función | Windows | Linux antes | Linux ahora | Verificado |
|---|---|---|---|---|
| Reconocer por audio del sistema | ✅ | ❌ silencio | ✅ | Shazam identificó "Ichizu — King Gnu" desde el loopback |
| Reproductor del SO (reloj maestro) | SMTC | ❌ | ✅ MPRIS | Siguió Kick→Spotify→cambios de pista solo |
| Overlay siempre encima / todos los escritorios | ✅ | ⚠️ ni fijado ni flotante garantizado | ✅ Hyprland (float+pin) | `hyprctl clients` |
| Posición inicial / recordada | ✅ | ❌ guardaba (0,0) | ✅ Hyprland | persistencia real, multi-monitor |
| Píldora arriba al centro | ✅ | ❌ centrada por el compositor | ✅ respeta la barra | (1188,8) en DP-2 |
| Atajos Ctrl+Alt+S/T/flechas | ✅ | ❌ se "registraban" y nunca disparaban | ✅ Hyprland + comandos CLI | binds presentes; acciones probadas por CLI |
| Arrastrar asa / doble clic = fantasma | ✅ | ⚠️ arrastre del compositor, clic simple | ✅ Hyprland (arrastre por IPC) | ver "pendiente" |
| Contraste automático | ✅ | ❌ abría el selector de pantalla cada 3 s | ✅ wlroots (`grim`) | tests + sin diálogos |
| Traducción IA embebida (llama.cpp) | opt-in | ❌ bloqueada por `if (win32)` | ✅ + `llama-server` del PATH | tests |
| Clics que atraviesan el widget | ✅ | ❌ | ✅ Hyprland (`no_focus` + vigilancia del asa) | clic sobre la letra llegó a la ventana de abajo (input real) |
| Empaquetado | NSIS | ❌ | ✅ AppImage + tar.gz verificados | `npm run package:linux` |

## Hallazgos y correcciones

### CRÍTICA — el loopback llegaba en silencio (`src/audio/capture.ts`)
Chromium en Linux entrega el track de loopback con `echoCancellation`,
`noiseSuppression` y `autoGainControl` encendidos. El cancelador de eco usa como
referencia lo que suena por los parlantes — que es justamente el loopback — y lo
borra: pico 0.0002 con un tono de 0.5. De ahí el mensaje "en Linux el loopback no
está soportado", que era falso. Pidiendo el track crudo: pico 0.47.
**Fix:** `systemAudioConstraints()` pide el audio sin procesamiento en Linux;
Windows conserva la petición original. Mensaje de error corregido.

### ALTA — sin reproductor del SO (`services/mpris/mprisReader.ts`, nuevo)
El sidecar SMTC es C#/WinRT. En Linux la sesión de medios es MPRIS (D-Bus).
**Fix:** lector MPRIS con `busctl` (sin dependencias nuevas) que emite
exactamente los mismos eventos que el sidecar (`track`/`position`/`playback`)
por el mismo filtro y el mismo sink: el core no distingue el SO. Replica la
selección de sesión de SMTC, el dedupe de metadata de los navegadores y la
protección contra el timeline de la pista anterior (el bug de YouTube que
resolvía `TimelineIsStale`). Excluye la sesión MPRIS de la propia app.

### ALTA — ventana en Wayland (`services/linux/hyprland.ts`, nuevo)
En Wayland Electron no puede posicionarse (`setPosition`/`center` no-op,
`getBounds()` da x=y=0), ni ser siempre-encima, y `globalShortcut` devuelve
`true` sin disparar nunca. Se probaron alternativas: XWayland posiciona pero con
dos monitores Hyprland desplaza las coordenadas (la ventana acabó en x=−1620);
el portal GlobalShortcuts no llega a registrar nada.
**Fix (Hyprland 0.5x, config Lua):** la app inyecta en la sesión una regla para
su propia ventana (flotante, fijada, sin borde/sombra/blur/animación), la mueve
por IPC (reasignando monitor cuando cruza de pantalla: Hyprland no lo hace solo
y la devolvía en el siguiente resize), lee su posición real para persistirla,
calcula el área útil con la barra reservada, y registra los atajos. Todo se
retira al salir y se re-inyecta tras `hyprctl reload`; no pisa atajos del
usuario. Fuera de Hyprland la app queda como antes (manda el compositor).

### ALTA — atajos globales (`services/cliCommands.ts`, nuevo)
Comandos `--sing`, `--tangible`, `--move=<dir>` que la segunda instancia pasa a
la primera por el lock de instancia única. En Hyprland los atajos los registra
la app; en cualquier otro escritorio se asignan a esos comandos. En dev el lock
ahora también se toma en Linux (lo necesitan los atajos).

### ALTA — tormenta de EPIPE en el logger (`services/appLogger.ts`) — todas las plataformas
Con la terminal de lanzamiento cerrada, escribir en stdout emite EPIPE como
error asíncrono → `uncaughtException` → `console.error` → otro EPIPE: ~1000
líneas/s en `main.log` (se encontraron 3500 en los logs). En Windows no aparecía
porque la app empaquetada no tiene stdout.
**Fix:** listener de error en stdout/stderr que apaga la salida a consola (el
archivo sigue); el handler de `uncaughtException` ignora EPIPE.

### MEDIA — contraste automático (`services/linux/screenSample.ts`, nuevo)
En Wayland `desktopCapturer` abre el selector de pantalla del portal en cada
muestra (cada 3 s). Además Linux no tiene `setContentProtection`: la captura
incluiría la propia letra y el color oscilaría.
**Fix:** captura con `grim` (wlroots, sin diálogos, 48 ms) midiendo un anillo
alrededor de la ventana, nunca su interior.

### MEDIA — runtime LLM (`services/llm/llmRuntime.ts`, `llmPath.ts`)
Bloqueado con `process.platform !== 'win32'` aunque hubiera binario Linux.
Además, **en todas las plataformas**, `stop()` dejaba `stopping=true` y
`start()` retornaba temprano: tras detenerlo no volvía a arrancar nunca (ni con
`llm:start` ni al terminar la descarga del modelo).
**Fix:** sin barrera de plataforma, búsqueda de `llama-server` en el PATH en
Linux, y `start()` explícito rearranca.

### MEDIA — asa del widget (`src/WidgetHandle.tsx`)
El commit anterior pasó el asa a `-webkit-app-region: drag` con clic simple para
el modo fantasma; en una región de arrastre Chromium no entrega eventos DOM,
así que el hover/clic del asa quedaba en duda.
**Fix:** en Hyprland el main sigue al cursor real por el socket IPC (~1-3 ms por
petición) y mueve la ventana; el asa conserva todos sus eventos y el **doble
clic** alterna el modo fantasma como en Windows. Otros compositores: se mantiene
el arrastre del compositor.

### BAJA
- `.env` del usuario: en Linux la instalación es de solo lectura → también se
  busca en `~/.config/singevery-desktop/.env` (`env.ts`, `GUIA_DE_USO.md`).
- Scripts: `dev:electron:linux` con GPU (el `:nix` la apagaba por WSL y rompía
  `ready-to-show`), `kill-dev` sin descargar `kill-port` en cada uso,
  `check-zombies` y `reset-window` con soporte Linux.
- Empaquetado: target Linux (AppImage + tar.gz) con verificación anti-`.env`,
  checksum, y el sidecar SMTC solo en el build de Windows.
- Textos: "Concede acceso en Ajustes de Windows" solo en Windows.

## Limitaciones que quedan

1. **Click-through fuera de Hyprland: no es posible con Electron 43.**
   `setIgnoreMouseEvents` y `setShape` son no-op en Wayland. En Hyprland se
   resolvió (ver "Adenda"); en GNOME/KDE/Sway el widget sigue recibiendo los
   clics de su área.
2. **Sin Hyprland** (GNOME/KDE/Sway): el compositor decide posición y capas; los
   atajos se asignan a los comandos CLI; el contraste automático solo en wlroots.
3. **Pérdida del dispositivo de audio** (p. ej. fallo Bluetooth de los AirPods
   durante la prueba): el Audio Service de Chromium hace segfault y se relanza;
   la app sobrevive (reproducido a propósito). Si aún no había canción
   identificada, hay que pulsar SING de nuevo; en seguimiento, se re-adquiere.
   Igual que Windows ante la pérdida del dispositivo.

## Pendiente de verificar con ratón y teclado físicos

Con el puntero virtual se verificó con input real: doble clic en el asa (entra y
sale del modo fantasma), el paso de clics y la recuperación al volver al asa. El
seguimiento del cursor al arrastrar se verificó llamando al IPC directamente
(+100/+50 exactos); los intentos de arrastre con pulsación real coincidieron con
el usuario moviendo su propio ratón y no son concluyentes. Quedan para probar a
mano:
- Arrastrar el asa.
- Ctrl+Alt+S / Ctrl+Alt+T / Ctrl+Alt+flechas desde el teclado físico (Hyprland
  ignora los binds de teclados virtuales como `wtype`).
- Redimensionar con el grip de la esquina.

## Observaciones fuera de alcance (no cambiadas)

- `index.html` declara `lang="es"`: los kanji pueden tomar la forma china de la
  fuente CJK. Pasa igual en Windows; convendría `lang="ja"` en las líneas
  japonesas.
- `~/.config/hypr/looknfeel.lua` tiene una regla para la clase
  `singevery-desktop`; la clase ahora es `singevery` y la regla inyectada por la
  app ya cubre lo mismo, así que esa regla quedó sin efecto.
- Un `windowBounds` guardado en (0,0) por las versiones anteriores se corrige
  solo al primer movimiento.

## Adenda (mismo día) — click-through en Hyprland

Tras probar la app, el usuario confirmó que lo único que faltaba era que el modo
transparente dejara clickear lo que hay debajo — que es el objetivo de la app.

Se midió con input de puntero **real** (cliente `wlr-virtual-pointer` compilado
para la prueba; los warps de `hyprctl` solo entregan eventos a la ventana con
foco y no sirven para esto):

- XWayland + `setIgnoreMouseEvents`: la ventana deja de recibir el puntero, pero
  la de abajo tampoco — XWayland descarta la entrada y Hyprland sigue
  entregándosela a su superficie. **No sirve.**
- Propiedad `no_focus` de Hyprland (`hl.dsp.window.set_prop`): movimiento y
  **clics llegan a la ventana de abajo**; con `0` vuelve a recibirlos; se puede
  alternar en caliente. Con el widget fijado (pin) sigue encima aunque la
  ventana de abajo tome el foco.

**Fix:** `HyprlandWindow.setPassthrough()` (serializado: el último pedido gana) y,
en `main.ts`, `setHyprlandClickThrough()`: mientras el renderer pide ser
atravesable, el main consulta el cursor cada 40 ms por el socket de Hyprland y
quita el paso mientras está sobre el asa (el renderer informa su rect), igual que
`forward: true` en Windows. Verificado en la app: doble clic en el asa → modo
fantasma; cursor sobre la letra → atravesable; clic → llegó a la ventana de
abajo; volver al asa → recupera el control; doble clic → sale del modo fantasma.

**Bug de ambas plataformas corregido de paso:** la condición de click-through no
miraba si el widget estaba colapsado; con una canción en pantalla, la píldora se
volvía atravesable a los pocos segundos y no se podía pulsar SING con el mouse.

