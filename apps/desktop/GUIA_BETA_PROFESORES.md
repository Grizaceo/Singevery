# Guía beta para profesores de música — Singevery

Versión objetivo: 0.2.1-beta.1  
Plataforma: Windows 10/11 x64  
Fecha: 2 de agosto de 2026

Gracias por evaluar Singevery. Esta beta busca saber si la app realmente ayuda
a aprender y practicar, no sólo si sus botones funcionan.

## Antes de instalar

1. Recibe `Singevery-Setup-0.2.1-beta.1.exe` y su SHA-256 por el mismo canal de
   confianza usado con la persona responsable de la prueba.
2. Esta beta aún no está firmada digitalmente. Windows SmartScreen puede mostrar
   un aviso de "editor desconocido". Continúa sólo si el nombre y el hash
   coinciden. No desactives Windows Defender ni el antivirus.
3. El instalador es por usuario, no necesita permisos de administrador y crea
   accesos directos en Escritorio e Inicio.

Si el antivirus bloquea el archivo, no lo excluyas: toma una captura del mensaje
y repórtalo como problema de instalación.

## Primera ejecución

La pantalla de bienvenida resume el flujo. Una instalación nueva no escucha
audio por sí sola y el micrófono nunca se activa automáticamente.

1. Reproduce una canción en Spotify, YouTube u otro reproductor.
2. Abre Singevery y pulsa **SING** para escuchar el audio del sistema.
3. Espera la identificación y la letra. Si no aparece, prueba **Importar** con
   un LRC/TXT propio o autorizado.
4. Para practicar afinación, activa el control de pitch/micrófono de forma
   expresa. Windows puede solicitar permiso la primera vez.
5. El engranaje abre Ajustes. **Ayuda y beta** contiene esta guía, el
   diagnóstico y el formulario de tickets.

Atajos útiles:

- `Ctrl+Alt+S`: expandir y empezar a reconocer.
- `Ctrl+Alt+T`: volver tangible el overlay si el mouse no puede agarrarlo.
- `Ctrl+Alt` + flechas: mover el widget mientras está tangible.

## Recorrido de prueba sugerido (30–45 minutos)

No es necesario completar todo en una sesión. Anota también lo que resulta
confuso aunque finalmente logres hacerlo.

### 1. Instalación y orientación

- ¿Pudiste instalar y abrir sin ayuda?
- ¿Entendiste qué hacer en los primeros 30 segundos?
- Cierra y vuelve a abrir la app. Confirma que conserva sus ajustes.

### 2. Reconocimiento y letras

- Prueba dos canciones conocidas y una grabación menos popular.
- Evalúa si la canción y la letra correctas aparecen a tiempo.
- Usa adelantar/atrasar línea y el ajuste fino de sincronización.
- Importa un archivo LRC y uno TXT si tienes material autorizado.

### 3. Lectura y aprendizaje

- Cambia tamaño, alineación, pronunciación/romaji y traducción.
- Guarda algunas líneas para repaso y exporta el CSV.
- Decide si la anticipación visual ayuda a cantar o genera carga cognitiva.

### 4. Afinación y ejecución

- Prueba notas sostenidas, cambios por grados conjuntos, saltos y vibrato.
- Repite a volumen bajo/alto y cerca/lejos del micrófono.
- Si quieres probar un instrumento monofónico, hazlo como experimento y
  descríbelo en el ticket. Esta beta todavía no valida acordes ni separa voz e
  instrumento; los resultados instrumentales no deben tratarse como medición
  pedagógica fiable.
- Prueba cantar mientras tocas y anota si el indicador sigue la voz, el
  instrumento o alterna entre ambos.

## Cómo reportar un problema

1. Abre **Ajustes → Ayuda y beta → Reportar un problema**.
2. Elige la categoría, resume el problema y describe qué ocurrió. Los pasos
   reproducibles son especialmente valiosos.
3. Decide si incluir el diagnóstico. Puede contener versión, configuración no
   secreta, metadatos de canciones y logs recientes redactados. Nunca contiene
   audio ni letras completas.
4. Pulsa **Guardar ticket y abrir GitHub**. La app guarda un JSON, abre un issue
   prellenado y selecciona el archivo en el Explorador.
5. Revisa el JSON. Adjúntalo al issue sólo si estás de acuerdo y luego envía el
   issue. Nada se sube automáticamente.

Para un fallo que impida abrir la app, envía una captura y la versión del
instalador por el canal acordado. No compartas archivos `.env`, carpetas de
usuario ni credenciales.

## Qué feedback es más útil

- La tarea musical que intentabas realizar.
- El resultado esperado y el observado.
- Canción o tipo de ejercicio, fuente de audio y micrófono/instrumento usado.
- Si el problema ocurre siempre o de forma intermitente.
- Impacto: bloquea la práctica, confunde, retrasa o es sólo visual.
- Una idea de mejora, separada del reporte del fallo.

## Privacidad y desinstalación

Consulta `PRIVACIDAD_Y_DATOS.md`, incluido junto a la app. La desinstalación
conserva por defecto los datos locales para no perder ajustes; si quieres un
borrado completo, solicita las instrucciones antes de eliminar carpetas.

Esta beta no es una evaluación clínica ni sustituye el criterio de un docente de
música. El objetivo de la revisión es precisamente descubrir dónde la interfaz y
las mediciones apoyan —o interfieren con— una práctica real.
