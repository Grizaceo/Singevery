# Correr en Windows (captura de audio del sistema)

La captura de **audio del sistema** (loopback) de Electron es **solo Windows/macOS**
(lo dice la doc oficial: `audio: 'loopback'` *Windows only for loopback*). En
**WSL/Linux el loopback no existe** y, además, WSLg no puede "oír" el audio de
apps de Windows. Por eso, para capturar lo que suena en Spotify/navegador de
Windows, hay que correr la app **nativa en Windows**.

> El micrófono sí funciona en WSL (ver el botón "Micrófono"); esta guía es para
> el audio de sistema con loopback.

## 0. Requisitos en Windows

- **Node.js 20+** instalado en Windows (no el de WSL): https://nodejs.org
- Verifica en **PowerShell** (no en la terminal de WSL): `node -v` y `npm -v`.

## 1. Tener el código en una carpeta nativa de Windows

`node_modules` de WSL (Linux) **no sirve** en Windows: hay que instalar aparte.
Elige una opción:

- **A) Copiar el working tree actual** (incluye los cambios locales no
  commiteados: re-sync automático, furigana/romaji, medidor de nivel). En
  PowerShell:
  ```powershell
  robocopy \\wsl.localhost\<TU_DISTRO>\home\gris\.hermes\workspace\repos\Espejo-teleprompter C:\dev\Espejo-teleprompter /E /XD node_modules dist dist-electron release .git
  ```
  (reemplaza `<TU_DISTRO>`, p. ej. `Ubuntu`). Copiar a `C:\dev\...` evita la
  lentitud/errores de instalar sobre rutas `\\wsl.localhost`.

- **B) Clonar de GitHub** (⚠️ trae solo lo que esté *pusheado*; hoy los cambios
  locales no están subidos):
  ```powershell
  git clone https://github.com/Grizaceo/Singevery.git C:\dev\Singevery
  ```

## 2. Configurar el token de AudD

Crea `C:\dev\Singevery\.env` (raíz del repo) con:
```
AUDD_API_TOKEN=tu_token_de_audd
```
(El que ya usas en WSL sirve. Sin token, AudD usa el plan anónimo, muy limitado.)

## 3. Instalar y correr (dev)

En PowerShell, dentro de `C:\dev\Singevery\apps\desktop`:
```powershell
npm install
npm run dev:electron:win
```

- `dev:electron:win` es como `dev:electron` **pero sin** `ELECTRON_DISABLE_GPU=1`.
  En Windows la ventana transparente **necesita GPU**; con esa flag se vería
  negra. (El script de WSL la mantiene porque allá evita errores de GPU.)
- Al abrir, click en **"Audio sistema"**: el handler de Electron concede pantalla
  + `loopback` automáticamente y empieza a capturar lo que suena.
- El **medidor de nivel** (▰▰▰▱▱) muestra si llega señal. Si está en rojo/▱▱▱▱▱:
  sube el volumen de Windows o reproduce música.

## 4. Empaquetar un .exe (opcional)

```powershell
npm run package
```
Genera el instalador en `apps\desktop\release\Singevery-Setup-0.1.0.exe`
(NSIS x64, según `electron-builder.yml`). Incluye el diccionario de kuromoji para
que el furigana funcione en la app empaquetada.

## 5. SMTC — el reproductor del SO como reloj maestro (recomendado)

El **sidecar SMTC** (C# / .NET 8) lee la sesión de medios de Windows
(Spotify, YouTube/YT Music en el navegador, etc.) y la convierte en el reloj
maestro de la app: metadata + playhead real + play/pausa/seek/skip con eventos,
**sin capturar audio ni gastar AudD**. AudD queda como fallback (vinilo, en
vivo, web sin SMTC, micrófono). Detalles del protocolo en
`native/smtc/README.md`.

### Compilar el sidecar (una sola vez, requiere .NET 8 SDK)

Instala el **SDK de .NET 8** (https://dotnet.microsoft.com) y, desde la raíz
del repo en **PowerShell**:

```powershell
./native/smtc/build.ps1
# equivalente manual: cd native/smtc ; dotnet publish -c Release -r win-x64 --self-contained false -o dist
```

Genera `native/smtc/dist/espejo-smtc.exe` (win-x64, *framework-dependent*:
necesita el runtime de .NET 8 en la máquina). Compílalo en Windows; no se
compila desde WSL/Linux.

### Conectar con la app (autodetección)

La app resuelve la ruta del sidecar en este orden (`smtcPath.ts`):

1. `SMTC_SIDECAR` (ruta explícita, opcional):
   ```powershell
   $env:SMTC_SIDECAR="C:\dev\Singevery\native\smtc\dist\espejo-smtc.exe"
   ```
2. **Autodetección**: sin la env, busca `native/smtc/dist/espejo-smtc.exe` bajo
   el repo. Si compilaste con el script, **no hace falta** configurar nada.
3. Si no existe, SMTC queda fuera y la app usa AudD. Fuera de Windows es no-op.

### Smoke test

Con el sidecar compilado y la app corriendo (`npm run dev:electron:win`),
reproduce algo en Spotify o en el navegador: play/pausa/seek/skip deben seguir
al instante sin deriva, y la metadata dispara el prefetch de la letra a la
caché. Mira la consola del main: `[smtc]` indica estado; si dice "sidecar no
encontrado", revisa la ruta o compílalo.

## Troubleshooting

| Síntoma | Causa / solución |
|---|---|
| Ventana negra (sin transparencia) | Estás usando GPU deshabilitada. Usa `dev:electron:win` (sin `ELECTRON_DISABLE_GPU`). |
| "No se capturó audio del sistema" | El loopback necesita algo **sonando**. Reproduce música y sube el volumen. |
| Medidor en silencio (▱▱▱▱▱ rojo) | Volumen del sistema bajo o nada reproduciéndose. |
| "AudD #900/#901" | Falta token o cuota agotada → revisa `.env`. |
| No reconoce la canción | Señal baja (mira el medidor) o no está en la base de AudD. |
| `[smtc] sidecar no encontrado` | No compilaste el sidecar (paso 5) o la ruta `SMTC_SIDECAR` apunta mal. |
| Deriva o no sigue seek/skip | SMTC no está activo; sin él la app depende de AudD (más lento y con deriva). Compila el sidecar. |
