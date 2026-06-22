# Espejo SMTC sidecar (Capa b)

Sidecar nativo (C# / .NET 8) que lee la sesión de medios de Windows
(`GlobalSystemMediaTransportControls`) y emite eventos JSON por **stdout**, uno
por línea, para que el proceso main de Electron los consuma
(`apps/desktop/electron/services/smtc/smtcReader.ts`).

Con esto el reproductor del SO (Spotify, YouTube/YT Music en navegador, etc.)
actúa como **reloj maestro**: metadata + playhead real + play/pausa con eventos,
sin capturar audio ni gastar llamadas a AudD. AudD queda como *fallback*.

## Protocolo (stdout, una línea JSON por evento)

```json
{"type":"track","title":"...","artist":"...","album":"...","durationMs":210000,"positionMs":0,"playing":true}
{"type":"position","positionMs":12345,"playing":true}
{"type":"playback","playing":false}
```

## Build (en Windows, con .NET 8 SDK)

```powershell
cd native/smtc
dotnet publish -c Release -r win-x64 --self-contained false -o dist
```

Genera `dist/espejo-smtc.exe`.

## Conectar con la app

El reader busca el ejecutable en la variable de entorno `SMTC_SIDECAR`:

```powershell
$env:SMTC_SIDECAR="C:\ruta\a\native\smtc\dist\espejo-smtc.exe"
```

Si la variable no está o el archivo no existe, SMTC queda deshabilitado y la app
sigue funcionando con reconocimiento por AudD (sistema/micrófono). Fuera de
Windows el reader es no-op.

## Equivalentes para portar a futuro
- **Linux:** MPRIS (D-Bus `org.mpris.MediaPlayer2`).
- **macOS:** MediaRemote (framework privado) / `nowplaying`.
