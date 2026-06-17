# Sincronización y captura de audio — WSL y Windows

> **TL;DR**: reproducí música en Spotify/YouTube/navegador y la letra se sincroniza
> **sola, sin tocar nada**, tanto en WSL como en Windows nativo. La app lee el "Now
> Playing" del Windows anfitrión por SMTC (vía `powershell.exe`, que WSL alcanza por
> el interop). AudD/Micrófono quedan como **fallback** para fuentes sin sesión de
> media (vinilo, en vivo, micrófono).

## Cómo se sincroniza (prioridad de fuentes)

1. **SMTC (Now Playing del Windows anfitrión)** — fuente primaria, máxima precisión.
   Da título/artista + posición exacta + play/pausa continuamente, **sin deriva**.
   Funciona en **WSL2 y Windows nativo** por igual. No requiere configuración.
2. **AudD + captura de audio** — fallback. Se usa solo si no hay sesión de media
   (vinilo, streaming de una web sin SMTC, micrófono en vivo). Botón "Audio sistema"
   / "Micrófono" en la UI.

---

## Correr en WSL (recomendado para desarrollo)

En la terminal de WSL, dentro de `apps/desktop`:
```bash
npm install
npm run dev:electron
```
- En WSL la ventana es **opaca con bordes** (WSLg no compositiona ventanas
  transparentes); por eso `dev:electron` usa `ELECTRON_DISABLE_GPU=1` para evitar
  glitches de GPU.
- Al reproducir música en Windows, la app la detecta por SMTC automáticamente y
  sincroniza la letra. **No hay que elegir dispositivo ni habilitar Stereo Mix.**

> ¿SMTC no lista tu reproductor? Algunas apps no se registran en SMTC. En ese caso
> usá el botón **"Audio sistema"** (loopback de Windows, ver abajo) o **"Micrófono"**.

---

## Correr en Windows nativo

La captura de **audio del sistema** (loopback) de Electron es **solo Windows/macOS**.
En WSL el loopback no existe; por eso para forzar AudD con loopback hay que correr
la app **nativa en Windows**.

### 0. Requisitos en Windows
- **Node.js 20+** instalado en Windows (no el de WSL): https://nodejs.org
- Verifica en **PowerShell** (no en la terminal de WSL): `node -v` y `npm -v`.

### 1. Tener el código en una carpeta nativa de Windows
`node_modules` de WSL (Linux) **no sirve** en Windows: hay que instalar aparte.
- **A) Copiar el working tree actual** (PowerShell):
  ```powershell
  robocopy \\wsl.localhost\<TU_DISTRO>\home\gris\.hermes\workspace\repos\Espejo-teleprompter C:\dev\Espejo-teleprompter /E /XD node_modules dist dist-electron release .git
  ```
  (reemplaza `<TU_DISTRO>`, p. ej. `Ubuntu`). Copiar a `C:\dev\...` evita la
  lentitud/errores de instalar sobre rutas `\\wsl.localhost`.
- **B) Clonar de GitHub** (⚠️ trae solo lo que esté *pusheado*):
  ```powershell
  git clone https://github.com/Grizaceo/Espejo-teleprompter.git C:\dev\Espejo-teleprompter
  ```

### 2. Configurar el token de AudD
Crea `C:\dev\Espejo-teleprompter\.env` (raíz del repo) con:
```
AUDD_API_TOKEN=tu_token_de_audd
```
(Sin token, AudD usa el plan anónimo, muy limitado.)

### 3. Instalar y correr (dev)
En PowerShell, dentro de `C:\dev\Espejo-teleprompter\apps\desktop`:
```powershell
npm install
npm run dev:electron:win
```
- `dev:electron:win` es como `dev:electron` **pero sin** `ELECTRON_DISABLE_GPU=1`.
  En Windows la ventana transparente **necesita GPU**; con esa flag se vería negra.
- Al reproducir música, SMTC sincroniza solo. Si querés forzar AudD: click en
  **"Audio sistema"** → el handler de Electron concede pantalla + `loopback`
  automáticamente. El **medidor de nivel** (▰▰▰▱▱) muestra si llega señal.

### 4. Empaquetar un .exe (opcional)
```powershell
npm run package
```
Genera el instalador en `apps\desktop\release\Espejo Teleprompter-Setup-0.1.0.exe`
(NSIS x64). Incluye el diccionario de kuromoji para que el furigana funcione.

---

## Forzar AudD con audio del sistema en WSL (avanzado, solo si SMTC no basta)

WSL no puede tomar el loopback de Windows directamente, pero sí ve el
**dispositivo de grabación** de Windows (vía `RDPSource`). Si necesitás AudD con
audio de sistema desde WSL (p. ej. una app que no expone SMTC):

1. En **Windows**, habilitá una entrada de captura que sea el audio del sistema:
   - **Stereo Mix** (gratis, en muchas placas Realtek): Configuración de sonido →
     Más opciones de sonido → pestaña *Grabar* → mostrar deshabilitados → habilitar
     **Stereo Mix**.
   - **VB-Audio Virtual Cable** (gratis): enviá la salida del sistema a `CABLE Input`
     y usá `CABLE Output` como entrada.
2. En la app (corriendo en WSL), en el **selector de entrada** debajo del botón
   *Micrófono*, elegí **Stereo Mix** o **CABLE Output**.
3. Apretá **"Micrófono"** → captura el audio del sistema de Windows. El medidor
   `▰▰▰` confirma la señal.

> El selector recuerda tu elección (localStorage), así no tenés que cambiar el
> dispositivo predeterminado de Windows.

---

## Troubleshooting

| Síntoma | Causa / solución |
|---|---|
| No sincroniza solo al reproducir | El reproductor no se registra en SMTC (algunas apps web). Usá "Audio sistema" (Windows nativo) o "Micrófono". |
| Ventana negra (sin transparencia) | Estás usando GPU deshabilitada. En Windows nativo usa `dev:electron:win` (sin `ELECTRON_DISABLE_GPU`). En WSL la ventana es opaca a propósito. |
| "No se capturó audio del sistema" | El loopback necesita algo **sonando**. Reproduce música y sube el volumen. |
| Medidor en silencio (▱▱▱▱▱ rojo) | Volumen del sistema bajo o nada reproduciéndose. |
| "AudD #900/#901" | Falta token o cuota agotada → revisa `.env`. |
| No reconoce la canción | Señal baja (mira el medidor) o no está en la base de AudD. |
