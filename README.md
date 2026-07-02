# Singevery

> Teleprompter transparente para cantar: reconoce la canción que suena y muestra la letra sincronizada con karaoke en tiempo real.

**Repositorio:** https://github.com/Grizaceo/Singevery

Widget de escritorio transparente para **cantar con la letra sincronizada**: reconoce la canción que suena, muestra la letra con karaoke (palabra a palabra) y soporta furigana y romaji para japonés, chino y coreano.

App activa: **[`apps/desktop`](apps/desktop)** — Electron + React 19 + TypeScript.

## Descargas

[![Latest release](https://img.shields.io/github/v/release/Grizaceo/Singevery?label=latest)](https://github.com/Grizaceo/Singevery/releases/latest)

Descarga el instalador de Windows desde **[GitHub Releases](https://github.com/Grizaceo/Singevery/releases/latest)** (`Singevery-Setup-x.y.z.exe`).

> **SmartScreen:** el instalador no está firmado con certificado de código. Windows puede mostrar *"Windows protegió tu PC"*. Pulsa **Más información → Ejecutar de todos modos** para continuar.

## Demo

![Demo de Singevery](docs/demo.gif)

[▶ Ver video completo (HD)](https://github.com/Grizaceo/Singevery/blob/main/docs/demo.mp4)

> **¿Quieres reproductor MP4 inline en el README?** GitHub no lo permite con archivos del repo (`raw/main/...` sale como enlace). Edita el README en github.com, arrastra [`docs/demo-readme.mp4`](docs/demo-readme.mp4) (~1 MB) al editor y GitHub insertará una URL `user-attachments` que sí se reproduce embebida. Sustituye el GIF por esa URL.

En la grabación:

1. Pill **SING** o atajo **Ctrl+Alt+S** con música sonando (Spotify / navegador).
2. Letra sincronizada sobre el escritorio (overlay transparente + click-through).
3. Modos de lectura (原 / ふ / A) y ajustes (⚙).

## Qué hace

- **Reconoce música** desde el audio del sistema o el micrófono (Shazam gratuito en modo auto, con fallback a AudD).
- **Sincroniza la letra** en tiempo real con resaltado karaoke y corrección de deriva.
- **Overlay transparente** sobre el escritorio: modo pill (SING), click-through mientras cantas, arrastrable.
- **Windows:** integración con el reproductor del SO vía SMTC (Spotify, navegador, etc.) como reloj maestro cuando está disponible.

## Estructura del repo

```
apps/desktop/     App Electron (main + renderer React)
native/smtc/      Sidecar C# (.NET 8) — metadata del reproductor Windows
native/wakeword/  Referencia para activación por voz (opt-in)
legacy/           Código archivado (Python/kiosk) — no se mantiene
```

## Puesta en marcha

```bash
cd apps/desktop
npm install
npm run dev:electron      # Windows: GPU on · Linux: GPU off (auto)
npm run dev:electron:win  # Windows explícito
npm run dev:kill          # Si no abre tras Ctrl+C: mata Electron + puerto 5173
```

### Windows (recomendado)

1. Compila el sidecar SMTC (sincronización precisa con Spotify, etc.):

   ```powershell
   .\native\smtc\build.ps1
   ```

2. Opcional: crea `apps/desktop/.env` con tu token de AudD (fallback):

   ```env
   AUDD_API_TOKEN=tu_token
   ```

3. Atajo global **Ctrl+Alt+S** o clic en la pill **SING** para expandir e identificar.

Guía completa: [`apps/desktop/WINDOWS.md`](apps/desktop/WINDOWS.md).

## Reconocimiento de música

| Modo | Descripción |
|------|-------------|
| **Auto** (default) | Shazam (gratis, sin API key) → AudD si hay token y Shazam no reconoce |
| **Shazam** | Solo cliente no oficial |
| **AudD** | Requiere `AUDD_API_TOKEN` en `.env` |

Selector en **Ajustes (⚙)** del widget.

## Scripts útiles

```bash
npm test              # Vitest (128+ tests)
npm run build         # Build producción
npm run package       # Instalador Windows (electron-builder)
```

## Licencia

[MIT](LICENSE) — Copyright © 2026 Gris.
