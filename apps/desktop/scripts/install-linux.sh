#!/usr/bin/env bash
# ============================================================================
# install-linux.sh — instala Singevery para el usuario actual (sin sudo).
#
# Deja la app como cualquier otra del escritorio (Omarchy: Super + Espacio):
#   ~/.local/share/singevery/           la app (release/linux-unpacked)
#   ~/.local/bin/singevery              comando (singevery --sing, etc.)
#   ~/.local/share/applications/singevery.desktop
#   ~/.local/share/icons/hicolor/256x256/apps/singevery.png
#
# El .desktop se llama singevery.desktop a propósito: coincide con el app_id
# de la ventana (app.setDesktopName en main.ts), así el escritorio asocia la
# ventana abierta con su lanzador e icono.
#
# Se usa la carpeta desempaquetada y no el AppImage: arranca antes, no
# necesita FUSE, y cada atajo (Ctrl+Alt+S/T) lanza una segunda instancia que
# así tarda ~0.4 s en vez de ~1.2 s.
#
# Uso:
#   npm run package:linux && bash scripts/install-linux.sh   (o npm run install:linux)
#   bash scripts/install-linux.sh --uninstall
# ============================================================================
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$APP_ROOT/release/linux-unpacked"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_DIR="$DATA_HOME/singevery"
BIN_LINK="$HOME/.local/bin/singevery"
DESKTOP_DIR="$DATA_HOME/applications"
DESKTOP_FILE="$DESKTOP_DIR/singevery.desktop"
ICON_ROOT="$DATA_HOME/icons/hicolor"
ICON_FILE="$ICON_ROOT/256x256/apps/singevery.png"

refresh_caches() {
  update-desktop-database "$DESKTOP_DIR" &>/dev/null || true
  gtk-update-icon-cache -q -t "$ICON_ROOT" &>/dev/null || true
}

notify() {
  if command -v omarchy-notification-send &>/dev/null; then
    omarchy-notification-send -g 󰝚 "$1" "$2" || true
  fi
}

# Reemplazar archivos bajo una app en marcha la puede tumbar: se cierra antes
# (SIGTERM = salida ordenada: guarda posición, retira atajos de Hyprland).
close_running() {
  local pids
  pids=$(pgrep -f "^$INSTALL_DIR/singevery( |$)" || true)
  [[ -z $pids ]] && return 0
  echo "Cerrando la Singevery instalada que está abierta…"
  kill -TERM $pids 2>/dev/null || true
  for _ in {1..20}; do
    pgrep -f "^$INSTALL_DIR/singevery( |$)" &>/dev/null || return 0
    sleep 0.25
  done
  echo "No se cerró a tiempo; ciérrala a mano y vuelve a ejecutar el instalador." >&2
  exit 1
}

if [[ ${1:-} == --uninstall ]]; then
  close_running
  rm -rf "$INSTALL_DIR"
  rm -f "$DESKTOP_FILE" "$ICON_FILE"
  [[ -L $BIN_LINK ]] && rm -f "$BIN_LINK"
  refresh_caches
  echo "Singevery desinstalada. Tus ajustes siguen en ~/.config/singevery-desktop."
  exit 0
fi

if [[ ! -x $SRC/singevery ]]; then
  echo "No hay build de Linux en $SRC." >&2
  echo "Genera una con: npm run package:linux" >&2
  exit 1
fi

close_running

# Copia a un directorio temporal y cambio de nombre: una instalación a medias
# nunca queda en el lugar de la buena.
mkdir -p "$DATA_HOME"
rm -rf "$INSTALL_DIR.new"
cp -a "$SRC" "$INSTALL_DIR.new"
rm -rf "$INSTALL_DIR"
mv "$INSTALL_DIR.new" "$INSTALL_DIR"

mkdir -p "$(dirname "$BIN_LINK")"
if [[ -e $BIN_LINK && ! -L $BIN_LINK ]]; then
  echo "Aviso: $BIN_LINK existe y no es un enlace de Singevery; no se toca." >&2
else
  ln -sfn "$INSTALL_DIR/singevery" "$BIN_LINK"
fi

mkdir -p "$(dirname "$ICON_FILE")" "$DESKTOP_DIR"
cp "$APP_ROOT/build/icon.png" "$ICON_FILE"

cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Singevery
GenericName=Letras sincronizadas
Comment=Letra sincronizada tipo karaoke sobre tu escritorio
Exec="$INSTALL_DIR/singevery"
Icon=singevery
Terminal=false
Categories=AudioVideo;Audio;
Keywords=karaoke;letras;lyrics;teleprompter;cantar;
StartupNotify=true
StartupWMClass=singevery
EOF
chmod +x "$DESKTOP_FILE"

refresh_caches

version=$(node -p "require('$APP_ROOT/package.json').version" 2>/dev/null || echo "")
echo "Singevery ${version} instalada en $INSTALL_DIR"
echo "Ábrela desde el lanzador o con: singevery"
notify "Singevery instalada" "Ábrela con Super + Espacio"
