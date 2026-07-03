## Modo TV (TCL Google TV) y micrófono remoto

El PC sigue siendo el cerebro (reconocimiento, letras, sincronización). El televisor
y el teléfono son pantallas/clientes en la misma red WiFi.

### Activar

1. Abre **Ajustes** en Singevery y activa **Modo TV (pantalla remota)**.
2. Windows puede pedir permiso de firewall la primera vez — acepta en redes privadas.
3. Copia la URL de TV o escanea el código QR.

### Ver letras en el TCL (Google TV)

**Opción A — Navegador en el TV (recomendado)**

1. En la Play Store del TV, instala un navegador (p. ej. **TV Bro**).
2. Abre la URL `https://IP-DE-TU-PC:5175/tv.html` (la muestra Ajustes).
3. Acepta el certificado autofirmado la primera vez (aviso de seguridad normal en LAN).

**Opción B — Sin instalar nada en el TV**

1. En Chrome del PC, abre la misma URL del teleprompter TV.
2. Menú **Transmitir** → **Transmitir pestaña** → elige tu Chromecast / Google TV integrado.

### Micrófono remoto (música en otra habitación)

1. Con Modo TV activo, abre en el teléfono la URL `https://IP-DE-TU-PC:5175/mic.html`.
2. Acepta el certificado autofirmado y el permiso de micrófono.
3. Pulsa **Empezar a escuchar** y deja el teléfono cerca de los parlantes.
4. En el widget verás **Teléfono** activo; la captura local (Sistema/Mic) se pausa sola.

### Troubleshooting TV / LAN

| Síntoma | Causa / solución |
|---|---|
| No carga la URL en el TV | PC y TV deben estar en la misma WiFi; comprueba la IP en Ajustes. |
| Aviso de certificado | Normal en HTTPS local; acepta/continúa en el navegador del TV o teléfono. |
| Letras con retraso leve | Latencia de red (~100–300 ms); no afecta leer, solo el karaoke fino. |
| El TV no tiene navegador | Usa Cast de pestaña desde Chrome del PC (opción B). |
| Firewall bloquea | Permite Singevery / Node en redes privadas para el puerto **5175**. |
