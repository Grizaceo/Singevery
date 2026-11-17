# Ficha de procedencia — candidato Windows para prueba end-to-end

Generado por DAVI el 2026-09-25. **No es una validación de Windows**: es la
verificación automática de un instalador reci��n producido. La instalación y el
uso reales los hace Cristóbal en su notebook.

## Identificación

| Campo | Valor |
|---|---|
| Repositorio | `git@github.com:Grizaceo/Singevery.git` (local `/home/gris96/.hermes/workspace/ACTIVE/singevery`) |
| Commit fuente | `8a25e9c4c1c5c8c5237503a81dd768fdebe340eb` |
| Rama | `linux-wayland` (3 commits por delante de `origin/linux-wayland`, sin pushear) |
| Árbol de trabajo | limpio al construir (`git status --porcelain` vacío) |
| Versión declarada | `0.2.1-beta.2` (de `apps/desktop/package.json`) |
| Archivo | `Singevery-Setup-0.2.1-beta.2.exe` |
| Tamaño | 147.496.780 bytes (≈ 140,6 MiB) |
| SHA-256 | `fdab88b484acc6554bf3f37654d47209f46f8eb9692b0ca3ca5dead0d5be4123` |
| Sidecar SMTC | `espejo-smtc.exe` autocontenido (`build/smtc-dist`, 96 MB, .NET 8.0.30 embebido) |

## Comandos ejecutados y resultados

| # | Comando | Resultado |
|---|---|---|
| 1 | `npx vitest run --reporter=dot` | **69 archivos, 800/800 tests verdes** |
| 2 | `npm run lint` (eslint) | limpio, sin errores |
| 3 | `npm run build` (tsc -b + vite + tsc electron) | OK — 90 módulos, `dist/assets/main-*.js` 293 kB |
| 4 | `npm run check:secrets` | OK — sin credenciales con patrones conocidos |
| 5 | `npm run verify:package-inputs` | Entradas de release completas |
| 6 | `npx electron-builder --win --config electron-builder.yml` | instalador NSIS x64 generado |
| 7 | `npm run verify:package-output` (con 7za) | ver abajo — **FALSA ALERTA** |
| 8 | inspección manual del payload NSIS (7za) | payload correcto (10/10 rutas obligatorias) |
| 9 | comparación byte a byte asar ↔ build local | **4/4 archivos idénticos** |

### Falsa alarma de `verify:package-output`

`scripts/verify-package.cjs` ejecutó `7za l` sobre el `.exe` externo. Un
instalador NSIS de electron-builder no es un archivo plano: el contenido real
está anidado en `$PLUGINSDIR/app-64.7z`. El listado externo sólo devuelve 11
entradas (el wrapper NSIS) y **ninguna** de las rutas exigidas, por lo que el
script reportó cinco errores falsos.

**No es un defecto del paquete**: extrayendo `app-64.7z` aparecen las diez rutas
obligatorias. El defecto es del script de verificación, que mira un nivel
equivocado. No se modificó el script (queda fuera del alcance de esta prueba);
se documenta para que la puerta de release sea fiable en Windows.

## Verificación del contenido del instalador

Payload `$PLUGINSDIR/app-64.7z` (146.927.988 bytes, 296 entradas):

```
OK  Singevery.exe
OK  GUIA_DE_USO.md
OK  GUIA_BETA_PROFESORES.md
OK  PRIVACIDAD_Y_DATOS.md
OK  THIRD-PARTY-NOTICES.txt
OK  LICENSE.txt
OK  AVISO_LEGAL.md
OK  resources/native/smtc/dist/espejo-smtc.exe
OK  resources/native/smtc/dist/coreclr.dll
OK  resources/native/smtc/dist/espejo-smtc.runtimeconfig.json
```

- **Ningún `.env`** en el instalador ni dentro de `app.asar` (1811 archivos;
  verificado archivo por archivo sobre el índice del asar, no con grep).
- **Sin tokens**: 0 coincidencias de `sk-…` / `gh?_…`; ninguna asignación de
  `AUDD_API_TOKEN` con valor real.
- **`.dll` de .NET incluidos** → el equipo destino **no necesita instalar .NET 8**.
- Las 136 menciones de `.env` dentro del asar son rutas de código
  (`process.resourcesPath`, `loadDotEnv()`), no credenciales.

## Prueba de que el paquete es del HEAD actual (no el .exe viejo)

El `Singevery-Setup-0.2.1-beta.2.exe` anterior (2026-09-08) fue **eliminado de
`release/`** antes de compilar, para que no se confunda con este. La
verificación de que el contenido es del HEAD actual:

- `dist-electron/electron/core/identityArbiter.js` — módulo creado por `8a25e9c`
  (HEAD) — está en el asar, **byte a byte idéntico** al build local
  (`a160d350bcde`).
- `displayAppearance.js` (commit `89c3d23`) y `main.js` también idénticos.
- El `.exe` viejo, de haber sobrevivido, no habría contenu esos dos módulos.

## Lo comprobado automáticamente vs. lo que sólo se prueba en la notebook

**Comprobado en Linux (automático):** tests 800/800 · lint · build · ausencia de
secretos · contenido del instalador · sidecar autocontenido · bytecode del app
idéntico a HEAD · metadatos de versión (`Singevery` / `0.2.1-beta.2` en el PE) ·
SHA-256.

**Sólo comprobable en la notebook de Windows:**

- que el instalador arranca y completa la instalación (NSIS + SmartScreen)
- translucent overlay, mirror mode, click-through/ghost (Wayland ya no aplica)
- captura de audio del sistema (loopback) y reconocimiento real
- SMTC leyendo Spotify/YT Music como reloj maestro
- sincronía con música real: pausa, seek, cambio de canción
- permisos de micrófono; overlay sobre juegos en pantalla completa
- LRC importado, traducción, cierre limpio y ausencia de procesos residuales

## Funciones que dependen de servicios externos o claves

| Función | Estado en este paquete | Qué hace falta |
|---|---|---|
| Reconocimiento de música | **funcional sin claves** | `Shazam` es el motor por defecto (gratis). `AudD` es sólo fallback y sin token se omite (`recognitionService.ts:44`). |
| Letras LRC | funcional | Proveedores públicos: lrclib, musixmatch, netease, letras. Sin cuenta. |
| SMTC (reloj maestro) | funcional | Sidecar C# autocontenido ya va dentro. No requiere .NET instalado. |
| Traducción | **parcial** | `mymemory` (defecto, sin clave). DeepL/Google requieren clave → **no configuradas, fuera de alcance**. |
| Traducción IA local | **no disponible** | `native/llm/` no existe: el runtime embebido no está compilado. `electron-builder` lo omite sin fallar. |
| Wake word | no configurado | Opt-in; no es parte de esta prueba. |

**Ninguna credencial viaja en el instalador.** Para AudD en la notebook: crear
`.env` con `AUDD_API_TOKEN=` junto al ejecutable instalado
(`GUIA_DE_USO.md` §7) — configuración privada, fuera del paquete.

## Requisitos de Windows

- Windows 10 1809+ o 11 (el sidecar usa `Windows.Media.*` / SMTC).
- .NET 8: **no hace falta** (runtime embebido).
- Permisos que la app concede ella misma al frame principal
  (`main.ts:589-604`): `media` y `display-capture`. Windows puede mostrar el
  aviso de "compartir pantalla" en el primer uso: hay que aceptarlo.
