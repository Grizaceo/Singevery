# Auditoría de Singevery — 21 de octubre de 2026

> Este informe conserva el diagnóstico anterior a los cambios. La continuación
> autorizada y sus verificaciones están en
> [Correcciones beta.3](CORRECCIONES_AUDITORIA_2026-10-21.md).

## Veredicto

**Buena beta; todavía no la considero una versión comercial terminada.** Nota global: **7/10**. La utilidad es clara y la implementación tiene defensas y pruebas sustanciales. Los frenos son la redimensión, mantenimiento del runtime, fiabilidad de distribución y condiciones de los servicios que sostienen las funciones principales.

Este encargo fue una auditoría: **no se modificó el código del producto ni se corrigieron los hallazgos**. Se agregaron este informe y evidencia reproducible. No se hizo commit, publicación ni envío a terceros.

## Alcance y límites

- Código auditado: `dd0adaaa86d8ae3cfbaadf8d08976dfc0c37385e`, versión `0.2.1-beta.2`.
- Plataforma disponible: Linux. Se revisaron main/preload, renderer, captura, sincronía, reconocimiento, letras, traducción, persistencia, permisos, empaquetado y CI mediante lectura y pruebas existentes.
- Se ejecutaron pruebas, lint, compilación, comprobación de secretos, auditoría actual de npm, verificación de entradas/salida Windows e inspección de los ASAR existentes de Windows/Linux.
- La ejecución usa las dependencias ya instaladas; no se hizo una instalación limpia con `npm ci` ni una nueva compilación completa de instaladores.
- La inspección GUI con `cua-driver` obtuvo capturas de la app y la píldora. AT-SPI no estaba disponible y los clics fueron rechazados por falta del plugin de entrada Hyprland. **No se completó una prueba interactiva de arrastre ni un recorrido funcional con música real en esta sesión.**
- No se validaron Windows en hardware, SMTC real, loopback real, permisos del SO, múltiples monitores/DPI, juegos, consumo actual, ni cierre del proceso real. El test opt-in del modelo Hy-MT2 tampoco se ejecutó por falta de rutas de binario/modelo configuradas.
- Los documentos de prueba Windows de septiembre ya estaban sin seguimiento al comenzar; se conservaron intactos. Las mediciones anteriores del repositorio se tratan como antecedentes, no como mediciones nuevas.

## Resultados ejecutados

| Verificación | Resultado |
| --- | --- |
| `npm test`, fuera del sandbox para permitir bind local | **803 pasan, 1 omitida; 69 archivos pasan y 1 omitido** |
| Primera ejecución dentro del sandbox | 802 pasan; el test del servidor local falla por no poder abrir puerto. Pasa al repetir fuera del sandbox |
| `npm run lint` | Pasa; aviso de Node sobre tipo de módulo de `eslint.config.js` |
| `npm run build` | Pasa: TypeScript renderer/main y Vite; 90 módulos, JS principal ~293 kB |
| `check:secrets` (pretest/prebuild) | Pasa para los patrones conocidos; no equivale a una certificación de ausencia de secretos |
| `npm audit --json` | **22 paquetes señalados: 2 críticos, 9 altos, 11 moderados** |
| `npm audit --omit=dev --json` | 0; excluye también Electron, aunque su motor forma parte del producto final |
| `verify:package-inputs` Windows / `--inputs-linux` | Pasan |
| `verify:package-output` Windows | Pasa en este entorno; SHA-256 `fdab88b484acc6554bf3f37654d47209f46f8eb9692b0ca3ca5dead0d5be4123` |
| Inspección de ambos ASAR existentes | Sin archivos `.env` en sus índices; contienen traducción anterior a Hy-MT2 |
| Reproducciones aisladas | Bloqueo del mínimo de ventana y reanudación corrupta del modelo confirmados con dobles controlados |

Evidencia de npm y reproducciones en [`audits/2026-10-21`](audits/2026-10-21/). El script `reproduce.cjs` usa el handler compilado real de la ventana y el downloader real; la ventana y las respuestas HTTP son simuladas. Sus aserciones confirman el comportamiento defectuoso actual, **no son pruebas de corrección ni pruebas end-to-end**.

## Hallazgos

### A01 — Alta: el mínimo nativo impide reducir la ventana

**Evidencia fuerte de código y reproducción aislada; falta validación interactiva en el SO.**

Ubicación: `apps/desktop/electron/main.ts:300` y `:637`.

El overlay se crea con `resizable: false`. En Electron 43.2.0, `NativeWindowViews::SetBounds` actualiza mínimo y máximo al tamaño solicitado cuando la ventana no es redimensionable. El handler propio consulta ese mínimo y limita la siguiente petición con `Math.max`. Así, un tamaño previamente grande se convierte en un suelo que el handler no permite atravesar.

Reproducción con el handler compilado: solicitar 1000×800, después 600×400; la segunda operación vuelve a enviar **1000×800**. Esto explica el síntoma informado. Fuente: [implementación de Electron 43.2.0](https://github.com/electron/electron/blob/v43.2.0/shell/browser/native_window_views.cc#L815).

Corrección recomendada: separar los mínimos de producto (expandido 320×200, píldora 156×48) de las restricciones nativas transitorias; usar esos mínimos en el handler y comprobar que el setter logra el tamaño. Validar secuencia crecer → reducir → colapsar → expandir en Linux y Windows. No alternar `setResizable` a ciegas: la transparencia tiene particularidades por plataforma.

Además, `src/ResizeGrip.tsx:27` espera IPC antes de instalar listeners y no maneja captura de puntero, cancelación ni desmontaje. Un pointerup temprano o fuera de la ventana puede dejar el gesto mal terminado. Es una debilidad independiente de interacción, **no la causa demostrada del bloqueo del mínimo**.

### A02 — Alta como requisito de release: Electron y herramientas con avisos de seguridad

Instalado/lock: Electron **43.2.0**. La auditoría npm señala avisos del runtime, además de Vite, Vitest y dependencias de construcción. Los 2 críticos corresponden a `shell-quote` y su consumidor `concurrently`, no a dos vulnerabilidades críticas demostradas del overlay.

El resultado cero con `--omit=dev` es insuficiente para esta aplicación: Electron está bajo `devDependencies`, pero el motor se distribuye al usuario. Debe actualizarse a una versión mantenida y parcheada, regenerar lock/paquetes y repetir pruebas funcionales.

**No se demostró explotación.** La app usa sandbox, aislamiento de contexto, navegación restringida y deniega ventanas nuevas, lo que reduce exposición. Por ejemplo, el [aviso oficial de caché de preload](https://github.com/electron/electron/security/advisories/GHSA-qmv3-fv6v-rmhq) condiciona el impacto a cargar contenido no confiable. Npm y el aviso oficial difieren en la versión exacta corregida de ese caso; este informe no usa un único número de parche como garantía para todos los avisos.

### A03 — Media: reanudar una descarga puede crear un modelo corrupto y marcar éxito

Ubicación: `electron/services/llm/modelDownloader.ts:65–95`.

Si existe `.part`, se manda `Range`, pero se abre en modo append aunque el servidor devuelva **200 con el archivo completo**, ignorando Range. El resultado concatena el prefijo anterior con el archivo entero, lo renombra a `.gguf` y devuelve `ok: true`.

Reproducción: `.part = GGUFpartial`, respuesta 200 `GGUFcomplete`; resultado final **GGUFpartialGGUFcomplete**, 23 bytes y éxito. Esto puede desperdiciar una descarga de ~1,13 GB y terminar en un fallo de traducción local difícil de entender.

Falta validar `Content-Range`/identidad de archivo y no hay comprobación propia de integridad antes del rename. La reproducción de longitud declarada divergente es una respuesta simulada: una transferencia HTTP real puede ser rechazada antes por fetch, por lo que no se presenta como una segunda falla de transporte confirmada.

Corrección: truncar/reiniciar en respuesta 200; sólo añadir con 206 y rango coincidente; validar ETag/If-Range o hash esperado, tamaño final y cancelación. Evitar descargas concurrentes del mismo destino y ofrecer recuperación de un modelo corrupto.

### A04 — Media: los artefactos existentes no representan el código actual

Ambos `release/{win,linux}-unpacked/resources/app.asar` conservan referencias al modelo anterior en `llmPath.js` y `translate.js`; el código actual declara Hy-MT2. Comparten `0.2.1-beta.2`.

La comparación byte a byte de `main.js` sólo difiere en un comentario, por lo que por sí sola no prueba una diferencia funcional; **sí la prueban los módulos del modelo y traducción**. Además, no existe `resources/native/llm` en los paquetes inspeccionados.

Esto es un problema de preparación de entrega, no evidencia de que el instalador esté roto. Reconstruir con versión nueva e identificar commit, modelo y hash del artefacto final. La traducción externa sigue siendo el camino predeterminado; no anunciar traducción integrada lista para usar en esos paquetes.

### A05 — Media: LRCLIB no respeta `Retry-After`

Ubicación: `electron/services/lyrics/providers/lrclib.ts:99`, `:115`, `:129`; `lyricsService.ts:166–181`.

Un 429 se convierte en error genérico y el orquestador reintenta con una espera de 250 ms inicial. No hay lectura de `Retry-After` ni enfriamiento compartido por host. La [documentación actual de LRCLIB](https://lrclib.net/docs) exige respetarlo y advierte de bloqueos temporales.

Confirmado por lectura; no se provocó una limitación real del servicio. Propagar estado/fecha de reintento y aplicar enfriamiento entre consultas/variantes. Conservar la identificación del cliente y actualizar su versión (el User-Agent sigue indicando 0.1.0).

### A06 — Media: claves de traducción en texto plano y guardado no atómico

Ubicación: `electron/services/settings.ts:262`, `:342`.

Las claves se persisten en JSON sin almacén seguro del SO. Está declarado con honestidad en `PRIVACIDAD_Y_DATOS.md`, pero sigue siendo una limitación para entregar credenciales de pago. El guardado directo sobre el archivo también puede dejarlo incompleto ante interrupción y el arranque vuelve a valores predeterminados si el parseo falla.

No se demostró filtración ni pérdida real. Usar un almacén seguro cuando esté disponible, documentar fallback y guardar preferencias mediante temporal + reemplazo, con copia recuperable.

### A07 — Baja: documentación no coincide con el primer uso

`README.md` dice que la traducción usa `es` por defecto; `settings.ts:118` establece `en`. El README también menciona 667 tests y presets S/M/L en comentarios de interfaz aunque el control actual sólo conserva L (y el modo compacto lo oculta).

Elegir el idioma predeterminado con intención o detectarlo del sistema; alinear ayuda, capturas y controles con la versión entregada. Es pequeño técnicamente, pero visible para un comprador hispanohablante.

## Riesgos de salida comercial y validaciones pendientes

1. **Servicios y contenidos:** Shazam usa un cliente no oficial; Musixmatch usa un endpoint de escritorio y app ID ajeno al producto; otras letras llegan de servicios públicos/scraping. No se encontró en el repositorio un contrato de provisión comercial para esos usos. El propio documento de privacidad los considera pendientes. La licencia Apache del código no aporta derechos sobre letras, traducciones o acceso a APIs. Esto no es una conclusión de ilegalidad: la autorización comercial sigue sin estar acreditada. El [issue público sobre uso comercial de LRCLIB](https://github.com/tranxuanthang/lrclib/issues/111) tampoco proporciona una autorización del titular de las letras.
2. **Instalación Windows:** instalador sin firma, fricción de SmartScreen y pruebas manuales de Windows sin resultados completados en los documentos disponibles. Falta demostrar instalación, permisos, loopback, SMTC, pausa/seek/cambio y cierre limpio en un equipo limpio. El smoke de CI comprueba que el proceso sobrevive 10 s; no demuestra esas funciones y fuerza su cierre.
3. **Verificador NSIS:** el reporte de septiembre documenta un fallo al inspeccionar sólo el wrapper. Hoy pasa con 7-Zip 26.04, que reconoce el 7z embebido. No es correcto afirmar que falla siempre; falta probar el mismo verificador con el 7za.exe que resuelve en Windows. Conviene seleccionar/extractar explícitamente el payload para evitar depender de autodetección.
4. **Rendimiento:** `docs/LINEA_BASE_2026-09-19.md` reportó consumo apreciable y recuperación de un seek grande de ~34 s. No son medidas nuevas. Persisten tick de estado de 100 ms, MPRIS por busctl cada segundo y sondeo Hyprland de 40 ms. Medir CPU/RAM/batería y latencia de recuperación con y sin MPRIS antes de prometer un widget ligero.
5. **Cobertura real:** falta una matriz manual actual con distintos reproductores, red caída, 429, canciones sin letra, permisos denegados, cambio de dispositivo, DPI y monitor desconectado. Las 803 pruebas en Node no sustituyen esa matriz ni ejercitan el arrastre real de `ResizeGrip`.

## Lo que está bien

- Separación de procesos Electron, `contextIsolation`, sandbox y `nodeIntegration: false`.
- CSP de producción y restricciones de navegación/enlaces externos.
- Validaciones de importación, límites de tamaño, escape de CSV y proveedor local limitado a loopback.
- Consentimiento para traducción externa y micrófono sin arranque automático predeterminado.
- Caché con procedencia, tratamiento de carreras de traducción/identidad y pruebas de sincronía y fonética.
- Documentos de privacidad claros sobre servicios, logs y credenciales; ausencia de `.env` en los ASAR inspeccionados.
- CI con lint/tests/build, sidecar autocontenido y verificaciones de empaquetado.

Estas medidas muestran un proyecto trabajado. No apareció una ejecución arbitraria remota demostrada en la revisión; esto no es una certificación de seguridad.

## Nota y potencial comercial

| Dimensión | Nota orientativa / 10 |
| --- | --- |
| Utilidad y propuesta | 8 |
| Base técnica y pruebas | 8 |
| Interacción y fiabilidad verificables hoy | 6,5 |
| Preparación para distribución y soporte de pago | 5 |
| Valoración global | **7** |

Son juicios de esta auditoría, no métricas estadísticas ni una validación de demanda. **Sí tiene potencial comercial de nicho**, sobre todo para cantar en japonés/coreano/chino, practicar pronunciación y usar letras en un overlay sobre otras apps. Furigana/romaji/IPA, repaso e importación aportan una propuesta más defendible que mostrar letras solamente.

Hay competencia: [Lyrixound](https://lyrixound.app/) anuncia letras sincronizadas, reconocimiento y overlay gratuitos, con compra Pro para extras. Por eso el mensaje comercial debe mostrar el beneficio para aprender/cantar idiomas, con una demostración rápida y una instalación simple.

**US$1 sirve como precio de lanzamiento para probar disposición a pagar, pero deja poco margen para soporte.** Por ejemplo, [Gumroad](https://gumroad.com/pricing) publica 10% + US$0,50 en venta directa: de US$1 quedarían US$0,40 tras esa comisión, antes de otros costes aplicables; su [ayuda de comisiones](https://gumroad.com/help/article/66-gumroads-fees) indica procesamiento adicional según método. No usar ese precio para prometer servicio externo ilimitado ni mantenimiento perpetuo.

Hipótesis a validar: probar US$1 como acceso temprano o aporte voluntario y contrastarlo con una compra única de **US$3–5**, después de corregir los bloqueos. No hay evidencia de ventas, retención ni entrevistas que permita afirmar que ese precio funcionará. Un piloto de 10–20 usuarios del nicho puede medir instalación sin ayuda, repetición de uso, sincronía percibida y compras reales.

## Orden de trabajo recomendado

1. Corregir A01 con prueba de regresión y validación de transparencia/píldora en ambos SO.
2. Actualizar Electron y herramientas señaladas; repetir build/tests y pruebas de audio/overlay.
3. Corregir downloader, aplicar Retry-After y producir artefactos nuevos identificados por versión/commit/hash.
4. Completar prueba real de Windows, rendimiento y recuperación de errores; ajustar documentación y almacenamiento de claves.
5. Acreditar el camino comercial de reconocimiento/letras o limitar el piloto a contenido aportado/autorizado por el cliente.
6. Probar ventas con usuarios concretos. **Estado recomendado hoy: beta pública o piloto controlado; no lanzamiento comercial presentado como terminado.**
