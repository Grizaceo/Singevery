# Aviso legal — Singevery

*Última actualización: julio de 2026*

## 1. Licencia del software

Singevery se distribuye bajo la **Licencia MIT** (archivo `LICENSE`). El software se entrega **"tal cual" (AS IS), sin garantías de ningún tipo**, expresas o implícitas, incluyendo garantías de comerciabilidad, idoneidad para un fin particular y no infracción. El uso de la aplicación es bajo tu propia responsabilidad.

Las bibliotecas de terceros incluidas en la aplicación y sus licencias están listadas en `THIRD-PARTY-NOTICES.txt`.

## 2. Letras de canciones

Las letras que Singevery muestra **no se distribuyen con la aplicación**: se obtienen en tiempo de ejecución desde servicios de terceros (LRCLIB, Musixmatch, Letras.mus.br) y se guardan únicamente en una caché local en tu equipo para no repetir consultas.

Las letras son **obras protegidas por derecho de autor** y pertenecen a sus autores, compositores y editoriales. Singevery está diseñada para **uso personal y privado** (leer y cantar la letra mientras suena la música que tú ya estás reproduciendo), un uso análogo al de cualquier sitio o app de letras. No uses la aplicación para extraer, almacenar masivamente, republicar o explotar comercialmente letras de canciones.

El acceso a cada servicio de letras queda sujeto a sus propios términos y condiciones. Si un titular de derechos o un servicio solicita el cese del acceso, la funcionalidad puede dejar de estar disponible sin previo aviso.

## 3. Reconocimiento de música

* El reconocimiento principal usa **shazamio-core**, un cliente **no oficial** del servicio Shazam. Singevery **no está afiliada, patrocinada ni respaldada por Shazam ni por Apple Inc.** El uso de este cliente puede no estar contemplado por los términos de servicio de Shazam; se ofrece únicamente para identificación personal de la música que ya estás escuchando.
* Como alternativa opcional puede usarse **AudD** (api.audd.io), que requiere una cuenta y token propios del usuario y se rige por los términos de AudD.
* La detección de la canción reproducida en el propio PC usa la API pública **System Media Transport Controls (SMTC)** de Windows.

## 4. Marcas

Shazam es una marca de Apple Inc. Musixmatch, AudD, Letras.mus.br, LRCLIB, Windows y las demás marcas mencionadas pertenecen a sus respectivos titulares y se usan solo con fines descriptivos (indicar compatibilidad o fuente de datos). Su mención **no implica afiliación ni respaldo**.

## 5. Traducción de letras

La traducción es **opcional** y solo se ejecuta cuando pulsas el botón **T**. Al activarla, **el texto completo de la letra sale de tu equipo** hacia el proveedor que tengas configurado en *Ajustes → Traducción*:

* **MyMemory** (proveedor por defecto, de Translated S.r.l.). Es una **memoria de traducción colaborativa**: según sus [términos y condiciones](https://mymemory.translated.net/terms-and-conditions), Translated conserva de forma indefinida cada segmento enviado, lo procesa para crear estadísticas y mejorar sus servicios, puede licenciarlo a socios externos y, al no marcarse como privado, se considera **"Public Data"** sobre el que Translated declara plena titularidad. Si mandas un email en Ajustes para ampliar la cuota diaria, ese email viaja en cada consulta. Sus términos se rigen por la ley italiana.
* **DeepL o Google Translate**, si configuras tu propia clave: se aplican sus respectivos términos y políticas de privacidad, y la letra se envía a sus servidores.
* **Modelo local** (Ollama, LM Studio, llama.cpp server, Jan): la letra **no sale de tu equipo**. Es la única opción sin envío a terceros y la recomendada si te importa la privacidad o el estatus de la letra.

Las letras son obras protegidas (ver §2). Enviar una letra a un servicio de traducción colaborativo implica aportarla a un archivo de terceros; **si eso te preocupa, usa el proveedor local o no actives la traducción**. La aplicación no traduce nada por su cuenta.

## 6. Privacidad

* Singevery **no tiene servidores propios**: no recopila, transmite ni vende datos personales a los desarrolladores.
* Para identificar canciones se envían **huellas/fragmentos de audio** capturados del micrófono o del audio del sistema a los servicios de reconocimiento (Shazam vía cliente no oficial, o AudD si lo configuras). El audio solo se usa para la identificación.
* Las consultas de letras envían título y artista de la canción a los servicios de letras.
* La traducción, si la activas, envía el texto de la letra a un tercero (ver §5).
* La caché de letras, ajustes y offsets se guarda localmente en tu equipo (carpeta de datos de usuario de la aplicación).

## 7. Uso aceptable

Esta aplicación está pensada para acompañar el canto en un contexto personal o doméstico. La ejecución pública de obras musicales (por ejemplo, un local comercial con karaoke) puede requerir licencias de las entidades de gestión correspondientes en tu país; obtenerlas es responsabilidad de quien realiza la ejecución pública, no del software.

## 8. Contacto

Proyecto: https://github.com/Grizaceo/Singevery — para consultas o solicitudes de retiro, abre un issue en el repositorio.
