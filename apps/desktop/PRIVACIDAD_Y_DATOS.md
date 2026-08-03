# Privacidad y datos — Singevery Desktop

Última actualización: 2 de agosto de 2026  
Aplica a la versión de escritorio 0.2.x.

Este documento explica el comportamiento real de la aplicación. No sustituye
los términos de los servicios externos ni una revisión jurídica para un
lanzamiento comercial.

## Resumen fácil

- Singevery no tiene cuentas, servidor propio ni telemetría de producto.
- Una instalación nueva no comienza a escuchar por sí sola. La persona debe
  pulsar SING o activar expresamente el inicio automático en Ajustes.
- El micrófono nunca se activa automáticamente.
- No se almacena audio crudo.
- Importar un LRC/TXT, generar lecturas y usar el repaso son funciones locales.
- Reconocer una canción, buscar letras o usar traducción externa sí puede enviar
  datos a terceros, según se explica abajo.

## Cuándo salen datos del equipo

### Reconocimiento

Al pulsar SING o activar voluntariamente el inicio automático, la app captura
una muestra del audio del sistema. Si se elige micrófono, captura una muestra
del micrófono. La muestra o una huella derivada se usa para identificar la
canción:

- el modo Shazam usa un cliente no oficial;
- AudD recibe el fragmento de audio si ese proveedor está seleccionado o actúa
  como fallback con un token configurado;
- SMTC de Windows aporta localmente título, artista, posición y pausa cuando el
  reproductor lo permite.

El proyecto no guarda el audio después del intento. Los servicios externos
pueden tratar la solicitud conforme a sus propias políticas.

### Búsqueda de letras

La app envía metadatos como título, artista, álbum o duración a la cadena de
proveedores configurada actualmente: LRCLIB, Musixmatch y Letras.mus.br. La
respuesta puede guardarse en la caché local.

La opción Importar LRC/TXT no envía el archivo ni conserva su ruta. El archivo
se lee sólo después de que la persona lo elige y tiene un límite de 2 MB.

### Traducción

Al activar por primera vez una traducción externa, la app avisa que enviará el
texto completo de la letra y pide confirmación:

- MyMemory recibe los segmentos y, opcionalmente, el email configurado;
- DeepL o Google reciben los segmentos y la credencial configurada;
- el proveedor local envía los segmentos únicamente al endpoint local elegido.

La app no envía audio al traductor. El consentimiento guardado puede
restablecerse borrando los datos locales de la aplicación.

## Datos guardados localmente

La carpeta de datos de usuario de Electron puede contener:

- ajustes visuales, proveedor elegido y posición de la ventana;
- claves o email de traducción configurados por la persona;
- offsets de sincronización y calibración;
- caché de letras y traducciones;
- hasta 200 líneas guardadas para repaso;
- logs técnicos rotativos: `main.log` y `main.previous.log`.

Las credenciales de traducción se guardan actualmente en el archivo local de
ajustes, no en un gestor seguro del sistema operativo. No compartas ese archivo.
Antes de una venta pública deberá decidirse si se migra a Credential Manager o
si el producto usa credenciales gestionadas por un backend.

Los logs tienen un máximo aproximado de 1 MB por archivo. El logger intenta
redactar tokens, claves, emails y la ruta del perfil. No registra audio ni el
texto completo de las letras. Puede registrar datos técnicos y metadatos de
canciones necesarios para diagnosticar un fallo.

## Exportaciones iniciadas por la persona

- Exportar diagnóstico crea un JSON en la ruta elegida. Incluye versión,
  plataforma, configuración no secreta, estadísticas de caché y logs recientes
  redactados. Revísalo antes de compartirlo.
- Exportar CSV crea una copia de las líneas guardadas, incluida letra,
  pronunciación, traducción y pista. Sólo ocurre al pulsar el botón.
- Reportar un problema crea primero un ticket JSON local. Puede incluir el texto
  que la persona escribió y, si acepta la opción, el mismo diagnóstico redactado.
  La app abre un issue prellenado en GitHub, pero no adjunta ni sube el JSON. La
  persona debe revisarlo y compartirlo manualmente.

Singevery no sube estas exportaciones.

## Captura de pantalla para contraste

El contraste automático, si se activa, toma periódicamente una miniatura del
área bajo el widget. Se procesa en memoria para estimar luminosidad, se descarta
y no se envía. Mientras funciona, la ventana puede protegerse de capturas.

## Cómo borrar datos

- Ajustes → caché permite borrar letras cacheadas.
- El panel Repaso permite quitar líneas individualmente.
- Desinstalar la app no siempre elimina la carpeta de datos de usuario. Para un
  borrado total, cierra Singevery y elimina manualmente su carpeta de datos.
- Las copias que la persona exportó deben borrarse por separado.

Esta eliminación local no borra solicitudes que ya hayan recibido servicios
externos. Para eso se aplican las políticas de cada proveedor.

## Alcance comercial actual

Esta versión sigue orientada a beta y uso personal. El cliente Shazam no oficial
y las fuentes actuales de letras no deben asumirse autorizados para un servicio
pagado. Un piloto cobrable debe usar contenido aportado/autorizado por el
cliente o un proveedor con contrato comercial y reconocimiento aprobado.

## Contacto

Repositorio y seguimiento de incidencias:
<https://github.com/Grizaceo/Singevery>
