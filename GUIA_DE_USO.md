# Guía de uso — Singevery

Singevery es un widget transparente que flota sobre tu pantalla, **reconoce la canción que está sonando y te muestra la letra sincronizada** para que cantes, con ayudas de lectura cuando la letra está en otro idioma (romaji para japonés, pinyin para chino, etc.).

No necesitas saber nada de programación. Esta guía cubre todo, desde instalar hasta cantar.

## 1. Requisitos

* Windows 10 (versión 1809 o más nueva) o Windows 11, de 64 bits.
* Conexión a internet (para identificar canciones y buscar letras).
* Parlantes o micrófono, según cómo escuches música (ver sección 3).

## 2. Instalación

1. Descarga `Singevery-Setup-x.y.z.exe` desde la página de descargas del proyecto (GitHub Releases).
2. Ábrelo. Si Windows muestra el aviso azul **"Windows protegió tu PC"**, es porque el instalador no está firmado con un certificado comercial (es un proyecto independiente): pulsa **"Más información"** y luego **"Ejecutar de todas formas"**.
3. Acepta la licencia, elige la carpeta (la propuesta está bien) e instala. Tendrás un acceso directo **Singevery** en el escritorio y el menú Inicio.

Para desinstalar: Configuración de Windows → Aplicaciones → Singevery → Desinstalar.

## 3. Primer uso: reconocer una canción

Abre Singevery. Verás el widget transparente con su barra de controles. Pon música y elige **cómo escuchará la app**:

* **Audio del sistema** (botón "Capturar audio del sistema"): para cuando la música suena **en el mismo PC** (Spotify, YouTube, etc.). Es el modo más preciso: además del reconocimiento, usa la información de reproducción de Windows para saber la canción y la posición exacta.
* **Micrófono** (botón "Capturar micrófono"): para cuando la música suena **fuera del PC** (un parlante, un equipo, otra habitación). El PC escucha por el micrófono e identifica la canción, como hace Shazam.

Tras unos segundos de escucha aparece la canción identificada y se carga la letra sincronizada. La línea actual se muestra grande al centro, con las líneas anterior y siguiente como contexto. Para detener, usa el botón de **detener reconocimiento**.

Consejos si no identifica: sube un poco el volumen, acerca el micrófono al parlante y evita hablar encima de la música durante la escucha.

## 4. Leer y cantar

* La línea actual avanza con **resaltado tipo karaoke**.
* En canciones rápidas (rap), la app **adelanta sola el resaltado y agranda la línea siguiente** para que alcances a leerla. No hay que configurar nada.
* **Ayudas de lectura** (botones de la barra): para japonés puedes ver la letra Original, en **Kana**, con **Furigana** (lectura sobre los kanji), en **romaji (A)** o combinada (ふ+A). Para chino hay Ruby/pinyin y romanización para coreano, cirílico y otros alfabetos.
* **Traducción**: el botón **T** cicla entre sin traducción, traducción bajo la línea actual y **texto paralelo** (letra y traducción en columnas). Funciona sin configurar nada, con un tope de unas 3 canciones al día; en Ajustes → Traducción puedes poner tu email para subirlo a ~30, o una clave de DeepL/Google para quitar el tope.

## 5. Si la letra va corrida (adelantada o atrasada)

Usa los controles de sincronización de la barra:

* **Atrasar / Adelantar letra**: mueve la letra en pasos pequeños hasta que calce con lo que suena. El ajuste **se recuerda por canción**.
* **Retroceder / Adelantar una línea**: salto rápido de línea.

Esto es útil sobre todo con videos musicales (la versión del video puede traer intro o diferencias con la versión de estudio).

## 6. Ajustes del widget

En el panel **Ajustes** puedes cambiar: tamaño de letra, opacidad, **alineación**, **color de letra** (con contraste automático opcional), modo espejo (para teleprompter físico/reflejo) y el modo fantasma para que el widget no estorbe. Arrastra el widget desde su asa para moverlo y usa el borde para redimensionarlo.

## 7. Reconocimiento alternativo con AudD (opcional, avanzado)

Sin configurar nada, Singevery reconoce con su motor principal. Si quieres un segundo motor de respaldo (AudD, servicio externo con cuenta propia):

1. Crea una cuenta en https://audd.io y copia tu **API token**.
2. En la carpeta donde instalaste Singevery, crea un archivo de texto llamado exactamente `.env` con esta línea: `AUDD_API_TOKEN=tu_token_aqui`
3. Reinicia Singevery.

Si esto te suena complicado, puedes ignorarlo: la app funciona sin AudD.

## 8. Usar Singevery mientras juegas

El widget flota encima del juego y **deja pasar los clics**, así que no estorba
mientras cantas. El problema es que, con un juego en primer plano, el juego se
queda con el mouse: el widget no recibe el paso del cursor y por eso no se
puede agarrar con el ratón. Para eso están los atajos, que **no dependen del
mouse**:

| Atajo | Qué hace |
|-------|----------|
| **Ctrl+Alt+T** | Modo tangible: el widget se vuelve agarrable (y vuelve a dejar pasar los clics al pulsarlo otra vez) |
| **Ctrl+Alt+↑ ↓ ← →** | Mueve el widget 40 px, aunque el juego tenga el mouse |
| **Ctrl+Alt+S** | Expandir e identificar la canción (SING) |

Mientras el modo tangible está activo aparece un aviso abajo recordando cómo
salir.

### Limitación conocida: pantalla completa exclusiva

Si el juego corre en **pantalla completa exclusiva**, Windows le entrega el
control del monitor y **ninguna** aplicación puede dibujarse encima —
Singevery tampoco. No es algo que la app pueda resolver: los overlays que sí
aparecen en ese modo (Steam, Discord) se inyectan dentro del propio juego, algo
que los anti-cheat suelen bloquear.

La solución es cambiar el juego a **pantalla completa sin bordes** (o *borderless
windowed*), una opción presente en casi todos los juegos actuales y sin coste de
rendimiento apreciable. En ese modo el widget se ve y los atajos funcionan.

## 9. Problemas frecuentes

* **"Buscando letra..." no encuentra nada**: no todas las canciones tienen letra sincronizada en las fuentes disponibles; prueba con la versión de estudio (los remixes/lives fallan más).
* **Identifica mal la canción**: detén y vuelve a iniciar la escucha; con el micrófono, acércalo al parlante.
* **No pasa nada con "Audio del sistema"**: asegúrate de que la música suene en el mismo PC. Si suena fuera del PC, usa el modo Micrófono.
* **No veo el widget sobre un juego**: cambia el juego a pantalla completa **sin bordes** (ver sección 8).
* **No puedo agarrar el widget para moverlo**: pulsa **Ctrl+Alt+T** o muévelo con **Ctrl+Alt+flechas**.
* **La letra aparece y luego salta a otra canción**: la app confirma dos veces antes de cambiar de canción; si pasa, suele ser porque el audio ambiente confundió al reconocedor — detén y reinicia la escucha.

## 10. Legal y licencias

Singevery es software libre (MIT). Las letras se obtienen de servicios de terceros y pertenecen a sus autores; el uso previsto es personal. Detalles en `AVISO_LEGAL.md` y licencias de componentes en `THIRD-PARTY-NOTICES.txt`, ambos en la carpeta de instalación.
