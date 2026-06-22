# Wake word sidecar — comando "SING" por voz (opcional)

El comando **SING** funciona por defecto **sin micrófono**: atajo global
`Ctrl+Alt+S` y clic en la pill. Este sidecar es **opt-in** y agrega activación
por voz: escucha localmente la palabra clave "SING" y, al detectarla, emite un
evento por stdout que el proceso main consume
(`apps/desktop/electron/services/wakeword/wakeWordReader.ts`).

Privacidad: corre 100% local, **no graba ni envía audio**; solo dispara el
evento de wake. Aun así, oír la palabra clave requiere el micrófono abierto, por
eso es opt-in.

## Protocolo (stdout, una línea por evento)

```json
{"type":"wake"}
```

(También se acepta la línea simple `WAKE`.)

## Opción recomendada: openWakeWord (open source, gratis)

Entrena un modelo para la palabra "SING" y corre un script que imprime el evento
al detectarla. Esbozo de referencia (Python):

```python
import sys, json
import numpy as np, sounddevice as sd
from openwakeword.model import Model

model = Model(wakeword_models=["sing.onnx"])  # tu modelo entrenado
with sd.InputStream(samplerate=16000, channels=1, dtype="int16") as stream:
    while True:
        frame, _ = stream.read(1280)  # 80 ms
        scores = model.predict(np.squeeze(frame))
        if scores.get("sing", 0) > 0.5:
            print(json.dumps({"type": "wake"}), flush=True)
```

Empaquétalo (PyInstaller) o invoca el intérprete; apunta la app al ejecutable:

```powershell
$env:WAKEWORD_SIDECAR="C:\ruta\a\wakeword.exe"
```

Alternativa comercial más sencilla de entrenar: **Picovoice Porcupine** (palabra
custom en la consola, runtime offline). Cualquiera que imprima el protocolo de
arriba sirve.

Si `WAKEWORD_SIDECAR` no está o el archivo no existe, el reader es no-op y el
comando SING sigue disponible por hotkey y por la pill.
