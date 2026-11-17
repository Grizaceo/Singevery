# Correcciones de auditoría — Singevery 0.2.1-beta.3

Se aplicaron las correcciones técnicas del informe `AUDITORIA_2026-10-21.md`.
No se publicó una release, no se instalaron los paquetes en el perfil del usuario
y no se inició un piloto de pago. Los cambios del producto están sin commit.

## Cambios realizados

- **Ventana:** el handler aplica los mínimos de producto (320×200), sin reutilizar
  el mínimo nativo que Electron aumenta al agrandar un overlay no redimensionable.
  Rechaza dimensiones no finitas y peticiones sobre una ventana cerrada.
- **Arrastre de tamaño:** captura del puntero antes de esperar IPC; listeners
  instalados inmediatamente; uso de la posición final; limpieza al cancelar,
  perder foco, perder captura o desmontar. Un pointerup temprano ya no instala
  listeners atrasados. Pruebas del caso crecer → reducir y del ciclo del puntero.
- **Modelo:** reanudación con URL/ETag fuerte e `If-Range`; un 200 reemplaza el
  parcial, un 206 exige rango e identidad coincidentes. Verificación de tamaño
  anunciado y cabecera GGUF, timeout de inactividad y exclusión de descargas
  simultáneas al mismo destino. Los parciales antiguos sin validador se reinician.
  No se añadió una descarga real de 1,13 GB ni se fijó un checksum criptográfico
  del modelo: tamaño/cabecera/ETag no son una certificación de autenticidad.
- **LRCLIB:** respeta `Retry-After` en segundos o fecha HTTP, comparte la pausa
  entre variantes/consultas, evita reintentos inmediatos y permite fallback a
  otros proveedores. El User-Agent toma la versión del paquete.
- **Credenciales:** claves cifradas mediante `safeStorage` cuando hay un almacén
  seguro. Se rechaza `basic_text` en Linux. Sin cifrado, la clave sólo vive en la
  sesión y la interfaz lo indica. Migración de claves antiguas; cambiar proveedor
  limpia el campo y evita convertir una clave de pago en email de MyMemory.
- **Preferencias:** escritura temporal con `fsync` y reemplazo, permisos 0600 en
  Unix y recuperación desde `.bak` si el archivo principal está dañado. Las
  copias nuevas tampoco almacenan claves de pago en texto plano.
- **Dependencias:** Electron 43.8.3, Vite 7.3.7, Vitest 5.0.5 y actualizaciones
  compatibles del lock. Override de `global-agent` a 4.1.3 para eliminar la cadena
  antigua de roarr/sprintf-js de `@electron/get`. Se comprobó el bootstrap del
  proxy del empaquetador y se usó el empaquetador en las construcciones reales.
  No se usó `npm audit fix --force` ni un downgrade de electron-builder.
- **Entrega:** versión nueva beta.3; `package`, `package:installer` y el wrapper
  firmado seleccionan Windows explícitamente incluso desde Linux. Inspección
  del payload NSIS también cuando 7za sólo muestra el wrapper. La ausencia de
  7-Zip ahora impide declarar verificado el instalador.
- **Procedencia:** `dist/build-info.json` contiene versión, commit base, versión
  de Electron, hash del lock y SHA-256 de los archivos de salida. El verificador
  contrasta esos datos y el contenido del ASAR con el build local y rechaza `.env`.
  El commit es el padre del árbol modificado; los hashes de salida identifican
  esta construcción con cambios sin commit.
- **Documentación:** destino de traducción `es` coherente con la ayuda, README
  sin conteo obsoleto de pruebas, privacidad actualizada y límite del runtime
  local aclarado. Configuración ESLint renombrada a `.mjs` para quitar su aviso.

## Verificaciones

| Comprobación | Resultado |
| --- | --- |
| Suite completa | **829 pasan, 1 omitida**; 74 archivos pasan y 1 omitido |
| Lint | Pasa |
| Compilación TypeScript + Vite + Electron | Pasa |
| Motor del binario Linux, comprobado en modo Node | Electron 43.8.3 |
| Auditoría npm completa | **0 vulnerabilidades conocidas** al 21-10-2026 |
| Comprobación de secretos | Pasa para patrones conocidos |
| Entradas del instalador Windows | Pasan; sidecar autocontenido existente |
| Construcción Windows y verificación de contenido | Pasan, 77 archivos del build verificados |
| Construcción Linux y verificación | Ver resultado final en `audits/2026-10-21/artifacts-after.json` |

Las regresiones nuevas están en `windowResize.test.ts`, `resizeGrip.test.ts`,
`modelDownloader.test.ts`, `lrclibRateLimit.test.ts`, `installerListing.test.ts` y
`settings.test.ts`. Los dobles de ventana y almacenamiento seguro no sustituyen
al compositor ni al almacén de credenciales real del SO.

Evidencias: `audits/2026-10-21/dependencies-after.json`, `tests-after.log`,
`lint-after.log`, `artifacts-after.json`. El antiguo `reproduce.cjs` se conserva
como reproducción histórica del código anterior, no como una prueba vigente.

## Límites que permanecen

- Falta comprobar en Windows real instalación, loopback, SMTC, pausa, seek,
  cambios de canción, transparencia, crecer/reducir, colapsar/expandir y cierre.
- La herramienta GUI de esta sesión no permite entrada en Hyprland. No se afirma
  que el gesto de arrastre haya sido probado físicamente.
- No se midió nuevamente CPU/RAM/batería ni la recuperación de un seek grande.
  Las mediciones de septiembre siguen siendo antecedentes, no resultados nuevos.
- No se ejecutó la prueba opt-in del modelo real: no hay rutas de binario y GGUF
  configuradas. Estos paquetes no incluyen `llama-server`; la interfaz configura
  un servidor local preparado por separado. MyMemory continúa como opción inicial.
- Se reutilizó el sidecar SMTC autocontenido existente, sin cambios de código.
  Este entorno tiene runtime .NET pero no SDK; no se recompiló el sidecar.
- Los paquetes son candidatos de prueba. No se acreditó aquí una firma de código
  válida de Windows ni se modificó la política de SmartScreen.
- Sigue pendiente acreditar el uso comercial de las fuentes de letras y del
  reconocimiento no oficial, o definir un modo con contenido autorizado. No se
  contactó ni se contrató a proveedores.

## Prueba manual de aceptación recomendada

Cerrar la versión anterior antes de abrir beta.3; los archivos se encuentran en
`apps/desktop/release`. En cada SO registrar versión/monitor/DPI y:

1. Agrandar, reducir varias veces hasta 320×200, soltar fuera y cancelar el gesto.
2. Colapsar a SING y expandir; verificar posición, tamaño y transparencia.
3. Probar reconocimiento, pausa, seek y cambio de canción en dos reproductores.
4. Denegar micrófono/captura y comprobar una recuperación comprensible.
5. Probar red caída y canción sin letra sin dejar spinners indefinidos.
6. Configurar una clave propia, reiniciar y comprobar el modo seguro/sesión
   indicado en Ajustes. No compartir claves ni archivos de preferencias.
7. Cerrar y comprobar que no quedan procesos de la app ni de sus sidecars.

La decisión de piloto de pago se deja para después de estas validaciones y de
resolver el acceso comercial a contenidos y reconocimiento.
