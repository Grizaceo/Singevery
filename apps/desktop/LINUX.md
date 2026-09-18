# Correr en Linux

Singevery corre nativo en Linux (Wayland o X11) con las mismas funciones que en
Windows. Probado en Omarchy (Arch + Hyprland 0.56, PipeWire).

## Paridad con Windows

| Función | Windows | Linux |
|---|---|---|
| Audio del sistema (loopback) | WASAPI vía Electron | PulseAudio/PipeWire vía Electron (monitor de la salida por defecto) |
| Reproductor del SO como reloj maestro | SMTC (sidecar `espejo-smtc.exe`) | **MPRIS** por D-Bus (`busctl`): Spotify, Firefox/Zen, Chromium, VLC, mpv… |
| Overlay transparente siempre encima | `setAlwaysOnTop('screen-saver')` | Hyprland: regla flotante + **fijada en todos los workspaces**. Otros compositores: lo que permita el compositor |
| Atajos Ctrl+Alt+S / T / flechas | Atajos globales del SO | Hyprland: los registra la app sola. Otros escritorios: asignar `singevery --sing` etc. (ver abajo) |
| Mover con el asa, doble clic = modo fantasma | Sí | Hyprland: igual. Otro compositor Wayland: arrastre del compositor y **un** clic para el modo fantasma |
| Posición recordada / píldora arriba al centro | Sí | Hyprland: sí (respeta la barra). Otro compositor Wayland: decide el compositor |
| Contraste automático | desktopCapturer | `grim` (Hyprland/Sway/wlroots), midiendo el fondo *alrededor* del widget |
| Traducción IA local embebida | `native/llm/llama-server.exe` | `native/llm/llama-server` o el `llama-server` del sistema (PATH) |
| Clics que atraviesan el widget (modo fantasma / letra sin controles) | `setIgnoreMouseEvents` | Hyprland: propiedad `no_focus` de la ventana; pasar sobre el asa devuelve el control. Otros compositores Wayland: **no** (ver limitaciones) |

## Instalar como app del escritorio (Omarchy y cualquier Linux)

Desde el repo, sin sudo:

```bash
cd apps/desktop
npm run install:linux          # empaqueta e instala (o, con un build ya hecho:
                               #   bash scripts/install-linux.sh)
bash scripts/install-linux.sh --uninstall
```

Queda en el lanzador (Omarchy: **Super + Espacio → Singevery**), con icono, y
como comando `singevery` (`~/.local/bin`). Instala la carpeta desempaquetada en
`~/.local/share/singevery/`: arranca más rápido que el AppImage y los atajos
responden en ~0.4 s. Para actualizar, vuelve a ejecutar `npm run install:linux`
(cierra sola la versión abierta). Los ajustes, la caché y el `.env` viven en
`~/.config/singevery-desktop/` y no se tocan.

## Instalar (AppImage)

```bash
chmod +x Singevery-<versión>-x86_64.AppImage
./Singevery-<versión>-x86_64.AppImage
```

Necesita `fuse2` (en Arch: `sudo pacman -S fuse2`). También se genera un
`.tar.gz` con la carpeta de la app (`singevery` es el ejecutable).

El token opcional de AudD va en `~/.config/singevery-desktop/.env`
(la carpeta del AppImage es de solo lectura).

## Atajos

**Hyprland (config Lua, 0.5x+):** al abrir, la app registra en la sesión
Ctrl+Alt+S (SING), Ctrl+Alt+T (modo tangible) y Ctrl+Alt+flechas (mover), más
una regla de ventana para el overlay. No se escribe nada en `~/.config/hypr`:
todo se retira al cerrar la app y se re-inyecta si recargas la config. Si ya
tienes esas combinaciones asignadas, la app no las pisa (lo avisa en el log).
Para desactivar la integración: `SINGEVERY_HYPRLAND=0`.

**Otros escritorios (GNOME, KDE, Sway…):** Wayland no deja que una app capture
teclas globales. Asigna en los atajos de tu escritorio estos comandos (llegan a
la instancia que ya está abierta):

| Comando | Equivale a |
|---|---|
| `singevery --sing` | Ctrl+Alt+S |
| `singevery --tangible` | Ctrl+Alt+T |
| `singevery --move=left` / `right` / `up` / `down` | Ctrl+Alt+flechas |

(Con el AppImage, usa su ruta completa en lugar de `singevery`.)

## Limitaciones conocidas

- **Click-through fuera de Hyprland.** Electron 43 no puede vaciar la región
  de entrada de una ventana Wayland (`setIgnoreMouseEvents` y `setShape` son
  no-op). En Hyprland se resuelve con la propiedad `no_focus` (Hyprland salta
  esas ventanas al decidir qué hay bajo el cursor) y el proceso main vigila el
  cursor para devolver la entrada al pasar sobre el asa, lo que en Windows hace
  `forward: true`. En GNOME/KDE/Sway Wayland el widget sigue recibiendo los
  clics de su área. XWayland no sirve: descarta la entrada a nivel X11 pero el
  compositor sigue entregándole el puntero, que "desaparece" en vez de pasar.
- **Contraste automático** necesita `grim` y un compositor wlroots (Hyprland,
  Sway). En GNOME/KDE Wayland se desactiva solo tras fallar y vuelve al color
  manual; nunca abre el selector de pantalla del portal.
- **Sin atajos automáticos fuera de Hyprland** (usa la tabla de comandos).

## Desarrollo

```bash
cd apps/desktop
npm install
npm run dev:electron      # en Linux nativo usa dev:electron:linux (GPU encendida)
npm test
npm run package:linux     # AppImage + tar.gz verificados en release/
npm run check:zombies     # tras cerrar la app: no deben quedar procesos
npm run dev:reset-window  # borra la posición guardada del widget
```

Diagnóstico en vivo: `SINGEVERY_DEBUG_PORT=39123` y `curl 127.0.0.1:39123/debug`.
