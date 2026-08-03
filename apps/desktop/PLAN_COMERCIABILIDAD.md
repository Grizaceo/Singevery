# PLAN_COMERCIABILIDAD.md — de MVP técnico a producto cobrable

**Producto:** Singevery Desktop  
**Fecha base:** 2026-08-01  
**Estado:** propuesta operativa  
**Horizonte sugerido:** 12–16 semanas para un primer lanzamiento comercial pequeño, sujeto a resolver derechos y proveedores  
**Documento relacionado:** `../../PLAN_DISTRIBUCION.md`, `../../AUDITORIA_SHIP_2026-07-27.md`, `../../AVISO_LEGAL.md`

> **Estado de ejecución (2026-08-01):** la implementación técnica inicial y sus
> bloqueos externos están resumidos en
> [ESTADO_IMPLEMENTACION_COMERCIAL.md](ESTADO_IMPLEMENTACION_COMERCIAL.md).
> Este plan sigue siendo el backlog rector; no se marca C1/C2 como cumplido sin
> contratos, pilotos y evidencia externa.

---

## 1. Decisión estratégica

Singevery no se comercializará como un “teleprompter genérico” ni como un
karaoke completo. Su posicionamiento inicial será:

> **Canta J-pop, K-pop y música internacional desde Spotify, YouTube o cualquier
> audio de tu PC, con letra sincronizada, ayudas de lectura, traducción y una
> guía opcional de afinación, sin salir de tu pantalla.**

La cuña de entrada es **cantar canciones en idiomas o alfabetos que el usuario
no domina**. El aprendizaje es un beneficio central, pero hasta medir resultados
no se prometerá “aprender un idioma”; se hablará de **practicar lectura,
comprensión y canto**.

### 1.1 Cliente inicial

1. Fans de J-pop, K-pop, anime, videojuegos y música internacional que usan
   Windows.
2. Estudiantes autodidactas de japonés o coreano que ya escuchan música en esos
   idiomas.
3. Como segundo mercado, profesores de canto y academias pequeñas que quieran
   asignar práctica entre clases.

### 1.2 Segmentos que no se perseguirán inicialmente

- Bares, locales o empresas de karaoke: requieren derechos de ejecución,
  catálogo licenciado, colas, control remoto, pistas instrumentales y soporte
  profesional.
- Escuelas grandes o universidades: ciclo de compra demasiado largo para la
  primera validación.
- Apple, Spotify, Duolingo u otras plataformas grandes: no se contactarán como
  posibles compradores hasta tener métricas de uso, propiedad intelectual
  ordenada y una vía de contenido legalmente sostenible.
- Usuarios que solo quieren letras flotantes: es un mercado concurrido y con
  baja diferenciación.

### 1.3 Modelo de licencia recomendado

La versión ya publicada permanece bajo MIT. Ese permiso no se intentará retirar
ni presentar de otra manera.

Modelo recomendado para el futuro: **open core**.

- **Singevery Community:** motor básico, overlay, importación local de letras y
  ayudas de lectura fundamentales.
- **Singevery Pro:** funciones nuevas que justifican pago: aprendizaje activo,
  historial, vocabulario, práctica vocal validada, actualizaciones oficiales,
  sincronización entre equipos y soporte.
- **Singevery Education:** canciones o LRC aportados por la institución, tareas,
  grupos, progreso y reportes.
- **Servicios controlados:** backend, cuentas, licencias de proveedores,
  telemetría consentida y distribución firmada.

Antes de cambiar la licencia de trabajo futuro, confirmar que todo el copyright
relevante pertenece al titular del proyecto o que existen permisos escritos de
todos los contribuidores. Las dependencias de terceros conservan siempre sus
propias licencias.

---

## 2. Qué significa “comerciable”

El producto atravesará cuatro puertas. No se avanza por entusiasmo ni por número
de features, sino por evidencia.

### Puerta C0 — beta privada segura

Se puede entregar gratis a usuarios invitados cuando:

- no existen secretos activos en el repositorio ni en el instalador;
- hay una build reproducible y un instalador probado en otro PC;
- el usuario entiende qué audio/texto sale de su equipo;
- existe una forma clara de detener micrófono y captura;
- los fallos generan logs útiles sin registrar audio ni letras completas;
- reconocimiento, sincronización, furigana/romaji y cierre de la app pasan el
  smoke test.

### Puerta C1 — piloto cobrable

Se puede cobrar a un grupo pequeño cuando, además de C0:

- existe una ruta de contenido autorizada para el piloto: proveedor comercial,
  letras/LRC del usuario o material aportado por la institución;
- los servicios de reconocimiento utilizados admiten ese uso;
- términos, privacidad, reembolsos y soporte están documentados;
- el pitch se presenta como experimental o ya está validado con canciones
  reales;
- se conocen los costos variables por usuario activo;
- hay al menos 20 usuarios de beta y señales de uso repetido.

### Puerta C2 — venta pública

Se puede abrir la compra al público cuando, además de C1:

- el instalador está firmado o se distribuye por un canal que establezca
  confianza equivalente;
- existe autoactualización o un mecanismo de actualización dentro de la app;
- hay recuperación ante fallos, diagnóstico y canal de soporte;
- el proveedor de letras/reconocimiento está contratado para la escala prevista;
- pagos, impuestos y facturación están resueltos;
- las métricas mínimas de activación, cobertura y retención se cumplen;
- existe rollback de release y respuesta a incidentes.

### Puerta C3 — escalar o buscar comprador

Solo escalar marketing o iniciar conversaciones de adquisición cuando:

- existen tres cohortes mensuales con retención conocida;
- hay ingresos o pilotos repetibles;
- margen bruto y costo de soporte son sostenibles;
- la cadena de propiedad intelectual está documentada;
- marca, contratos, licencias y datos de usuarios son transferibles;
- el producto demuestra una ventaja que no sea únicamente el código MIT.

---

## 3. Línea base del producto

### 3.1 Fortalezas verificadas

- Overlay transparente, always-on-top, click-through y modo tangible.
- Reconocimiento mediante audio del sistema o micrófono.
- Integración SMTC en Windows para metadata, play/pause/seek y reloj maestro.
- Letras sincronizadas, corrección de deriva y ajustes por pista.
- Furigana, kana, romaji, pinyin, romanización coreana y cirílica.
- Traducción bajo la línea o en paralelo, incluyendo proveedor local.
- Captura de pitch y referencia melódica experimental.
- Caché local y personalización visual.
- Suite actual: 324 pruebas verdes y lint limpio al 2026-08-01.

### 3.2 Brechas comerciales conocidas

- La versión descargable/tag conocida no representa todo el código 0.2.0.
- Falta validación completa del instalador actual en una máquina limpia.
- Instalador sin firma, sin auto-updater y sin logs persistentes de soporte.
- La cadena de letras mezcla un servicio comunitario con endpoints/scraping que
  no deben asumirse aptos para una distribución comercial.
- El reconocimiento Shazam actual usa un cliente no oficial.
- MyMemory puede bloquear o degradar un patrón intensivo de peticiones.
- La referencia melódica usa una heurística de frecuencia dominante sobre audio
  polifónico; las pruebas sintéticas no demuestran precisión con canciones.
- No hay cuentas, pagos, entitlement, historial educativo ni panel docente.
- El producto ayuda a practicar, pero todavía no mide aprendizaje lingüístico.

---

## 4. Workstream A — seguridad, secretos y cadena de suministro

### A0 — acciones inmediatas, bloqueantes

- [ ] Revocar el token con forma de credencial real presente en `.env.example`.
- [ ] Sustituirlo por `AUDD_API_TOKEN=tu_token_aqui`.
- [ ] Revisar si el token apareció en commits, releases, artefactos o logs.
- [ ] Si fue válido, limpiar el historial público o asumirlo comprometido para
      siempre; rotarlo es obligatorio aunque se limpie el historial.
- [ ] Activar escaneo de secretos en CI y, si está disponible, en el hosting del
      repositorio.
- [ ] Añadir un test/guard que falle si `.env.example` contiene un valor con
      formato de secreto.
- [ ] Verificar que `.env`, tokens, cookies y cachés temporales nunca entren al
      instalador ni a los reportes de soporte.

### A1 — dependencias y releases

- [ ] Ejecutar auditoría de dependencias en cada PR y clasificar vulnerabilidades
      de runtime frente a tooling.
- [ ] Generar y publicar SBOM o, como mínimo, inventario versionado de
      dependencias y licencias.
- [ ] Mantener `THIRD-PARTY-NOTICES.txt` generado desde el lockfile.
- [ ] Fijar versiones de actions de CI y revisar permisos del workflow de
      release.
- [ ] Firmar hashes de artefactos o publicar SHA-256 automáticamente.
- [ ] Documentar rotación de claves, respuesta a filtraciones y revocación de
      releases.

### Criterio de aceptación A

- Ningún secreto detectado en rama, tag, release o paquete.
- Un secreto de prueba hace fallar CI.
- El instalador contiene solo los archivos esperados.
- Existe un responsable y procedimiento de incidente, aunque el equipo sea una
  sola persona.

---

## 5. Workstream B — derechos, proveedores y privacidad

Este workstream es el principal bloqueo para cobrar. Un disclaimer no reemplaza
una licencia de contenido ni los términos de una API.

### B0 — inventario jurídico-técnico

Crear una matriz versionada con estas columnas:

| Componente | Uso actual | Fuente/endpoint | Términos revisados | Comercial permitido | Costo | Plan de reemplazo |
|---|---|---|---|---|---|---|
| Reconocimiento Shazam | Identidad/posición | Cliente no oficial | Pendiente | No asumir | — | Proveedor oficial |
| AudD | Fallback | API con token | Pendiente | Contratar/confirmar | Variable | Candidato Windows |
| LRCLIB | Letras/LRC | API comunitaria | Pendiente | No asumir derechos editoriales | Donación/infra | Importación o proveedor licenciado |
| Musixmatch | Letras sincronizadas | Endpoint desktop | Pendiente | No asumir | Comercial | API Business |
| Letras.mus.br | Letra plana | Scraping HTML | Pendiente | No asumir | — | Retirar del build pagado |
| MyMemory | Traducción | API pública | Revisado parcialmente | Validar patrón/volumen | Cuota | Local o contrato |
| DeepL/Google | Traducción BYOK | API usuario | Según cuenta del usuario | Según términos | Usuario | Mantener BYOK |
| Modelo local | Traducción | localhost | Según runtime/modelo | Generalmente local | Hardware usuario | Opción privada |

### B1 — estrategia de letras

Evaluar tres rutas, en este orden:

1. **Proveedor licenciado comercialmente.** Pedir cotización y condiciones a
   proveedores de letras sincronizadas. Confirmar cobertura JP/KO/ZH,
   traducciones, romanización, almacenamiento en caché, atribución, territorios
   y derechos de display.
2. **Contenido aportado por el usuario.** Importación de `.lrc`, `.txt` y formato
   propio. La app vende sincronización, lectura y práctica; no entrega el
   catálogo. Incluir declaración de que el usuario tiene autorización para usar
   el material.
3. **Contenido institucional.** Para pilotos, la academia entrega sus letras,
   ejercicios o repertorio autorizado. Singevery no redistribuye ese contenido a
   otros clientes.

El build pagado no debe depender silenciosamente de scraping o endpoints
privados de terceros. Los proveedores experimentales pueden permanecer en una
edición Community claramente etiquetada solo después de revisión legal.

### B2 — reconocimiento de música

- [ ] Comparar AudD, ACRCloud u otra opción con contrato para Windows.
- [ ] Medir costo por identificación, límites, territorios, retención de huellas
      y SLA.
- [ ] Usar SMTC primero cuando la metadata sea suficiente para ahorrar llamadas.
- [ ] Enviar solo la mínima huella/ventana necesaria.
- [ ] Detener micrófono y loopback cuando la identificación ya no lo requiera.
- [ ] Mantener el proveedor no oficial fuera de la propuesta pagada si no hay
      autorización clara.

### B3 — privacidad y términos

- [ ] Escribir política de privacidad entendible dentro de la app y en la web.
- [ ] Separar consentimiento para micrófono, audio del sistema, traducción y
      telemetría.
- [ ] No almacenar ni subir audio crudo por defecto.
- [ ] No incluir letra completa, tokens, emails ni rutas personales en
      telemetría/logs.
- [ ] Definir retención y borrado para cuentas, historial y progreso.
- [ ] Añadir exportación/borrado de datos antes de crear cuentas públicas.
- [ ] Revisar requisitos aplicables en Chile y en los mercados donde se venda,
      incluyendo menores si se dirige a estudiantes.
- [ ] Redactar Términos de Servicio, EULA comercial, política de reembolso y
      canal de takedown.
- [ ] Distinguir uso doméstico de ejecución pública o institucional.
- [ ] Realizar búsqueda de marca “Singevery” y evaluar registro en los mercados
      prioritarios.

### Criterio de aceptación B

- Existe al menos una ruta de letras autorizada para cada plan cobrado.
- Existe reconocimiento autorizado o el piloto funciona sin identificación
  remota usando metadata/importación.
- Cada envío externo aparece en la privacidad y en la UI antes de activarse.
- Un asesor jurídico especializado revisa el paquete antes de C2. Este plan no
  sustituye esa revisión.

---

## 6. Workstream C — producto y experiencia

### C0 — promesa y onboarding

- [ ] Cambiar textos de marketing desde “teleprompter” hacia “cantar canciones
      extranjeras”.
- [ ] Crear onboarding de tres minutos: elegir idioma/interés, reproducir una
      canción, detectar, escoger lectura y cantar.
- [ ] Explicar claramente “Sistema” versus “Micrófono”.
- [ ] Añadir una canción o demo de dominio público para que el primer uso no
      dependa de proveedores externos.
- [ ] Mostrar cobertura y errores honestos: no encontrada, sin LRC, letra plana,
      traducción agotada o pitch no confiable.
- [ ] Hacer visible la privacidad sin convertir el onboarding en texto legal.
- [ ] Medir `time_to_first_value`: desde instalar hasta ver la primera línea
      correcta.

### C1 — práctica útil sin convertir la app en un LMS

Prioridad de producto recomendada:

1. **Loop de línea/estrofa:** repetir una línea usando seek SMTC cuando sea
   posible.
2. **Velocidad de práctica:** usar control del reproductor cuando exista; si no,
   explicar la limitación.
3. **Ocultar/revelar:** original, romanización o traducción para practicar
   recuperación.
4. **Guardar palabra o línea:** texto, lectura, traducción, canción y timestamp.
5. **Repaso ligero:** cola de líneas guardadas, sin construir aún un curso
   completo.
6. **Modo escucha:** completar una palabra faltante o elegir qué se oyó.
7. **Historial de práctica:** canciones, minutos, líneas repetidas y progreso
   autodeclarado.

Estas funciones aumentan retención y permiten cobrar mejor que más opciones de
color o layout.

### C2 — separar afinación de pronunciación

No llamar “pronunciación” al score de pitch. Son problemas diferentes.

- **Afinación:** frecuencia fundamental, nota objetivo, desviación y ritmo.
- **Pronunciación:** fonemas, consonantes, vocales, duración y acento lingüístico.

Plan para afinación:

- [ ] Construir corpus de validación de al menos 30 fragmentos: pop limpio,
      arreglos densos, rap, voces graves/agudas, armonías y silencios.
- [ ] Comparar la referencia heurística con una referencia manual/MIDI o una
      herramienta reconocida.
- [ ] Medir cobertura de frames vocales, errores de octava, error en cents,
      estabilidad y latencia.
- [ ] Si no alcanza, integrar separación vocal o un modelo de pitch polifónico.
- [ ] No publicitar porcentajes de precisión derivados solo de tests sintéticos.
- [ ] Permitir desactivar score y usar únicamente guía visual.

Plan para pronunciación, después de validar demanda:

- [ ] Empezar con japonés o coreano, no todos los idiomas a la vez.
- [ ] Alinear audio del usuario con una línea corta y comparar unidades
      fonéticas.
- [ ] Dar feedback accionable, no un único porcentaje opaco.
- [ ] Probar con hablantes nativos y aprendices antes de prometer exactitud.

### C3 — accesibilidad y calidad percibida

- [ ] Navegación completa con teclado y foco visible.
- [ ] Contraste y escalado verificados en Windows 10/11 y múltiples DPI.
- [ ] No depender solo de color para estados de sincronía/pitch.
- [ ] Localización ES/EN inicial; evitar UI con etiquetas técnicas.
- [ ] Instalación, desinstalación y recuperación de ventana sin intervención
      técnica.
- [ ] Uso estable durante sesiones de al menos dos horas.

### Criterio de aceptación C

- 80 % de participantes completa la primera canción sin ayuda del desarrollador.
- Mediana de tiempo al primer valor menor a cinco minutos.
- El usuario puede explicar la diferencia entre romanización, traducción,
  afinación y pronunciación.
- Ninguna afirmación comercial excede lo medido.

---

## 7. Workstream D — ingeniería para producto distribuido

### D0 — release confiable

- [ ] Ejecutar `npm run package:full` y el smoke test de `docs/RELEASING.md` en
      máquina limpia sin Node ni .NET.
- [ ] Probar Windows 10 y 11, dos escalas DPI, un monitor y dos monitores.
- [ ] Verificar `.wasm`, diccionario kuromoji y sidecar SMTC dentro del paquete.
- [ ] Añadir test automático de estructura del artefacto.
- [ ] Publicar 0.2.x como prerelease para beta, no como release estable.
- [ ] Mantener changelog y migraciones de configuración/caché.
- [ ] Añadir canal estable/beta y rollback probado.

### D1 — confianza y soporte

- [ ] Obtener firma de código o priorizar Microsoft Store/canal equivalente.
- [ ] Implementar auto-updater con verificación de firma/hashes.
- [ ] Guardar logs rotativos con redacción de secretos y datos sensibles.
- [ ] Añadir “Exportar diagnóstico” con versión, SO, estado de proveedores y
      eventos técnicos; nunca audio ni letra completa.
- [ ] Página de estado local: SMTC, reconocimiento, letras, traducción y
      micrófono.
- [ ] Manejar crash/reinicio sin perder la posición/ajustes de ventana.
- [ ] Canal de soporte con identificador de diagnóstico reproducible.

### D2 — observabilidad respetuosa

Telemetría opt-in durante beta y claramente configurable:

- instalación/versión;
- onboarding iniciado/completado;
- tiempo al primer resultado;
- reconocimiento correcto/autocorregido/fallido;
- fuente de letra y si era sincronizada, sin enviar texto;
- modo de lectura utilizado;
- función de loop/guardar/repaso;
- errores clasificados y latencia;
- retención por instalación anonimizada.

No registrar títulos/artistas sin consentimiento explícito. Preferir métricas
agregadas y eventos locales exportables.

### D3 — arquitectura Community/Pro

- [ ] Inventariar qué archivos ya están bajo MIT y su historial.
- [ ] Definir límites de paquetes: core, providers, learning, accounts,
      education y distribution.
- [ ] Mantener el core compilable sin servicios Pro.
- [ ] Colocar módulos comerciales futuros en repositorio/paquete privado si esa
      es la decisión.
- [ ] Implementar entitlement offline con período de gracia; no bloquear una
      sesión por una caída momentánea del servidor.
- [ ] No guardar claves comerciales en el cliente: usar backend/proxy con rate
      limiting cuando lo exija el proveedor.
- [ ] Definir CLA o acuerdo equivalente antes de aceptar contribuciones que
      deban estar disponibles en una edición comercial.

### D4 — pagos y operaciones

- [ ] Evaluar merchant of record frente a pasarela propia: impuestos, IVA,
      facturas, contracargos y países admitidos.
- [ ] Definir licencia por usuario/equipo, recuperación de compra y uso offline.
- [ ] No construir un sistema de pagos propio antes de validar disposición a
      pagar mediante pilotos/factura manual.
- [ ] Crear backups, monitoreo y límites de gasto para cualquier backend.
- [ ] Añadir borrado de cuenta y soporte de reembolso.

### Criterio de aceptación D

- Una persona no técnica instala, actualiza y desinstala sin instrucciones del
  desarrollador.
- Un fallo reportado puede diagnosticarse con un archivo seguro.
- Una caída de red/proveedor degrada funciones, pero no congela ni rompe la app.
- Cada release puede revertirse o reemplazarse rápidamente.

---

## 8. Workstream E — validación de mercado y aprendizaje

### E0 — beta de descubrimiento

Reclutar 30 participantes:

- 15 fans de J-pop/anime;
- 10 fans de K-pop;
- 5 estudiantes/profesores de idiomas o canto.

Evitar reclutar solo amigos o desarrolladores. Buscar participantes en Discord,
Reddit, comunidades de covers, academias, convenciones y grupos locales.

Tareas de prueba:

1. Instalar sin ayuda.
2. Reproducir una canción conocida.
3. Obtener la letra y corregir sincronía si hace falta.
4. Cambiar entre original, lectura y traducción.
5. Cantar un coro.
6. Repetir una línea y guardarla.
7. Volver por iniciativa propia durante la semana.

### E1 — métricas iniciales, tratadas como hipótesis

| Métrica | Umbral C1 | Umbral C2 |
|---|---:|---:|
| Instalación → primera letra correcta | ≥60 % | ≥75 % |
| Mediana de tiempo al primer valor | <7 min | <5 min |
| Reconocimiento correcto en corpus objetivo | ≥80 % | ≥90 % |
| Canciones con alguna letra utilizable | ≥75 % | ≥85 % |
| Canciones con letra sincronizada | ≥60 % | ≥75 % |
| Usuarios que vuelven en semana 2 | ≥20 % | ≥30 % |
| Usuarios que usan lectura/romanización | ≥50 % | ≥60 % |
| Usuarios que practican una línea ≥2 veces | ≥30 % | ≥45 % |
| Conversión beta → intención de pago | ≥10 % | ≥20 % |
| Sesiones sin error bloqueante | ≥90 % | ≥97 % |

Los umbrales se revisan después de la primera cohorte; no se manipula la
definición de una métrica para declarar éxito.

### E2 — evidencia educativa

Para afirmar que ayuda a aprender, ejecutar un piloto específico de dos a cuatro
semanas:

- pretest de lectura/comprensión de líneas no practicadas y practicadas;
- práctica con cinco canciones;
- postest y retención una semana después;
- comparación entre solo cantar y cantar usando loop/ocultar/repaso;
- encuesta de motivación y comprensión de la interfaz;
- reporte de limitaciones y tamaño de muestra.

Resultados posibles:

- Si mejora principalmente motivación/tiempo de exposición, venderlo como
  herramienta de práctica entretenida.
- Si mejora recuerdo de palabras o lectura, incorporar esa evidencia con su
  metodología.
- Si no hay mejora medible, no usar lenguaje educativo fuerte; el valor de canto
  puede seguir siendo suficiente.

### E3 — disposición a pagar

No preguntar solo “¿pagarías?”. Probar decisiones reales:

- landing con precio y lista de espera;
- oferta de preventa reembolsable después de C0;
- prueba Pro temporal seguida de elección real;
- tres precios aleatorizados en cohortes pequeñas;
- entrevistas a quienes rechazan y aceptan.

### Criterio de aceptación E

- Existen grabaciones/notas de al menos 15 sesiones observadas.
- Hay una cohorte de retención, no solo descargas.
- Se conocen las tres razones principales de abandono.
- Al menos cinco usuarios realizan una señal económica real antes de construir
  pagos complejos.

---

## 9. Workstream F — oferta, precio y unit economics

### F0 — oferta inicial

**Beta privada:** gratuita a cambio de feedback y telemetría opcional.  
**Community:** gratis, sin garantías de proveedores externos.  
**Pro, hipótesis:** USD 2,99–4,99/mes, USD 24–39/año o USD 29–49 pago único.  
**Education, piloto:** USD 300–1.000 por 4–6 semanas según personalización.  
**Education, hipótesis recurrente:** USD 3–5/estudiante/mes más base institucional.

Estos valores son experimentos, no compromisos. Localizar precios para Chile y
Latinoamérica solo después de comprobar costos y medios de pago.

### F1 — qué puede justificar Pro

- distribución firmada y actualizaciones;
- loop y práctica avanzada;
- vocabulario/historial/repaso;
- pitch validado y reportes personales;
- más configuraciones y perfiles;
- proveedores licenciados y mejor cobertura;
- sincronización entre equipos;
- soporte prioritario.

No cobrar únicamente por quitar un límite artificial de letras si el proveedor
o los derechos no lo permiten.

### F2 — costos por usuario

Modelo mensual obligatorio antes de fijar precio:

```text
ingreso neto
- comisión/impuestos del canal de pago
- reconocimiento por canción
- licencia o requests de letras
- traducción remota
- hosting/cuentas/telemetría
- firma de código amortizada
- reembolsos/contracargos
- soporte por usuario
= margen de contribución
```

Objetivo inicial: margen bruto superior a 75 % en B2C de software. Si el
contenido licenciado lo impide, subir precio, limitar uso razonablemente o
priorizar importación/local/B2B.

### F3 — límites honestos

- Medir uso real antes de imponer cuotas.
- Explicar qué costo provoca el límite.
- No ocultar que traducción local usa recursos y descarga modelos.
- Permitir seguir usando funciones locales si una suscripción vence, según la
  licencia ofrecida.

---

## 10. Workstream G — lanzamiento y adquisición

### G0 — activos mínimos

- [ ] Landing ES/EN enfocada en J-pop/K-pop y práctica en idiomas.
- [ ] Video de 30–45 s: reproducir canción → letra → furigana/romaji →
      traducción → loop/práctica.
- [ ] Capturas legibles, sin terminales ni UI de desarrollo.
- [ ] FAQ de compatibilidad, privacidad, SmartScreen/firma y cobertura.
- [ ] Página de precios y comparación Community/Pro.
- [ ] Email de onboarding con una única acción: completar primera canción.
- [ ] Formulario de feedback y reporte de canción faltante.

### G1 — canales prioritarios

1. Creadores pequeños de J-pop/K-pop, anime covers y karaoke.
2. Comunidades Discord/Reddit, respetando reglas y sin spam.
3. Academias de japonés/coreano y profesores de canto.
4. Convenciones de anime, concursos de covers y talleres.
5. Microsoft Store y búsqueda orgánica de “romaji lyrics overlay”.
6. Programa de referidos solo después de comprobar retención.

### G2 — pilotos B2B

Oferta de piloto:

- repertorio aportado o autorizado por la academia;
- onboarding de profesor y hasta 30 alumnos;
- cinco canciones/tareas;
- soporte directo;
- reporte agregado de práctica;
- entrevista final y permiso opcional para caso de estudio.

No prometer panel escolar completo antes de cerrar dos pilotos manuales. Primero
operar con herramientas simples y aprender qué reporte realmente usa el docente.

### G3 — alianzas estratégicas

Orden sugerido después de C2:

1. Apps de letras/overlay con audiencia existente: licenciar ayudas de lectura o
   pitch.
2. Plataformas de aprendizaje con música: integrar modo canto/overlay.
3. Plataformas de entrenamiento vocal: importar cualquier canción y lectura
   multilingüe.
4. Proveedores de letras/reconocimiento: caso de uso y co-marketing.
5. Empresas grandes, solo con evidencia de usuarios/ingresos.

---

## 11. Workstream H — preparación para inversión, licencia o venta

Si en el futuro se quiere vender la app, no se venderá “un repositorio MIT”; se
presentará un activo comercial completo.

### H0 — cadena de propiedad intelectual

- [ ] Lista de autores y contribuciones.
- [ ] Acuerdos de cesión/licencia comercial de contribuidores, si aplica.
- [ ] Inventario de assets, iconos, fuentes, videos y sus derechos.
- [ ] Historial de licencias por versión.
- [ ] Marca, dominios y cuentas de distribución bajo control transferible.
- [ ] Contratos de proveedores con cláusulas de cambio de control revisadas.

### H1 — data room mínimo

- arquitectura y threat model;
- resultados de tests, cobertura relevante y smoke tests;
- SBOM, licencias y auditorías;
- roadmap y deuda técnica;
- métricas por cohorte;
- ingresos, costos y margen;
- contratos/pilotos y pipeline;
- términos, privacidad e incidentes;
- soporte, SLA y estadísticas de fallos;
- evidencia educativa sin exageraciones.

### H2 — señales necesarias antes de contactar compradores

Al menos una de estas condiciones:

- 1.000 usuarios activos mensuales con retención demostrable;
- 100 clientes Pro de pago;
- 5 instituciones pagando y renovando;
- tecnología específica validada que un socio prefiera licenciar a reconstruir;
- acuerdo de contenido/proveedor difícil de replicar.

La marca, comunidad, contratos y datos agregados deben ser el moat. El código
MIT por sí solo no lo será.

---

## 12. Fases y orden de ejecución

### Fase 0 — contención y decisiones (semana 1–2)

**Objetivo:** llegar a C0 sin crear nuevas features grandes.

- A0 secretos y CI.
- B0 matriz de proveedores.
- D0 build completa + smoke test en PC limpio.
- Definir Community/Pro y congelar publicación de módulos nuevos hasta ordenar
  derechos.
- Redactar mensaje de posicionamiento y landing de beta.

**Salida:** beta instalable segura; lista explícita de proveedores permitidos y
no permitidos.

### Fase 1 — beta privada y confiabilidad (semana 3–6)

**Objetivo:** demostrar que desconocidos llegan al primer valor.

- onboarding;
- demo de dominio público;
- logs y exportación de diagnóstico;
- telemetría opt-in;
- prerelease 0.2.x;
- 15 pruebas observadas iniciales;
- cotizaciones de proveedor y asesoría jurídica inicial.

**Salida:** métricas de activación, cobertura y principales fallos.

### Fase 2 — diferenciación y retención (semana 7–10)

**Objetivo:** que la gente vuelva para practicar.

- loop de línea/estrofa;
- ocultar/revelar;
- guardar línea/palabra;
- historial ligero;
- corpus y validación de pitch;
- completar cohorte de 30 usuarios.

**Salida:** primera medición de retención y disposición a pagar.

### Fase 3 — pilotos cobrados (semana 11–14)

**Objetivo:** cruzar C1 con una ruta de contenido autorizada.

- importación LRC/contenido institucional o proveedor contratado;
- términos y privacidad para piloto;
- cobro manual/factura antes de automatizar pagos;
- dos pilotos de academia/profesor;
- soporte y reporte manual;
- experimento de precios B2C.

**Salida:** primeras señales económicas y unit economics reales.

### Fase 4 — lanzamiento público pequeño (semana 15–16+)

**Objetivo:** cruzar C2 solo si las fases anteriores lo justifican.

- firma/canal confiable;
- auto-updater;
- pagos y entitlement;
- proveedor autorizado escalable;
- release estable y rollback;
- campaña pequeña con presupuesto limitado.

**Salida:** lanzamiento controlado. No aumentar adquisición hasta observar una
cohorte completa.

---

## 13. Backlog priorizado

| ID | Prioridad | Entregable | Dependencia | Puerta |
|---|---|---|---|---|
| COM-001 | P0 | Revocar y reemplazar token expuesto | Ninguna | C0 |
| COM-002 | P0 | Escaneo de secretos en CI | COM-001 | C0 |
| COM-003 | P0 | Matriz de términos/proveedores | Ninguna | C0/C1 |
| COM-004 | P0 | Smoke test instalador 0.2.x limpio | Ninguna | C0 |
| COM-005 | P0 | Logs rotativos y diagnóstico seguro | COM-004 | C0 |
| COM-006 | P0 | Ruta autorizada de letras | COM-003 | C1 |
| COM-007 | P0 | Reconocimiento apto para producto pagado | COM-003 | C1 |
| COM-008 | P0 | Privacidad/consentimientos revisados | COM-003 | C1 |
| COM-009 | P1 | Onboarding y demo sin proveedor | COM-004 | C0 |
| COM-010 | P1 | Telemetría opt-in | COM-008 | C0 |
| COM-011 | P1 | Importación LRC/TXT | COM-006 | C1 |
| COM-012 | P1 | Loop línea/estrofa | SMTC/seek | C1 |
| COM-013 | P1 | Ocultar/revelar modos | Ninguna | C1 |
| COM-014 | P1 | Guardar línea/palabra | Modelo local de datos | C1 |
| COM-015 | P1 | Corpus de validación de pitch | Ninguna | C1 |
| COM-016 | P1 | Firma de código/canal confiable | Presupuesto/identidad | C2 |
| COM-017 | P1 | Auto-updater | COM-016 | C2 |
| COM-018 | P1 | Pagos y entitlement | Evidencia E3 | C2 |
| COM-019 | P1 | Landing y video del nicho | Posicionamiento | C1 |
| COM-020 | P1 | Beta de 30 usuarios | COM-004/009 | C1 |
| COM-021 | P1 | Dos pilotos cobrados | COM-006/008/011 | C1 |
| COM-022 | P2 | Historial y repaso ligero | COM-014 | C2 |
| COM-023 | P2 | Ejercicio de escucha/cloze | COM-012/014 | C2 |
| COM-024 | P2 | Panel docente mínimo | Dos pilotos manuales | C2/C3 |
| COM-025 | P2 | Backend de cuentas/sync | Retención validada | C2 |
| COM-026 | P2 | Pronunciación fonética de un idioma | Demanda + corpus | C3 |
| COM-027 | P2 | macOS/Android | Product-market fit Windows | C3 |
| COM-028 | P3 | Venta a locales de karaoke | Derechos públicos | Fuera de alcance |

---

## 14. Registro de riesgos

| Riesgo | Prob. | Impacto | Indicador | Mitigación |
|---|---:|---:|---|---|
| Letras sin derechos comerciales claros | Alta | Crítico | Reclamo/bloqueo/proveedor | Proveedor licenciado o contenido aportado |
| Cliente Shazam no oficial deja de funcionar | Alta | Alto | Caída de reconocimiento | Contrato oficial + SMTC + feature flag |
| Pitch falla en música polifónica | Alta | Alto | Scores incoherentes | Validación, disclaimer, modelo mejor o retirar score |
| SmartScreen destruye conversión | Alta | Alto | Abandono en instalación | Firma/Store |
| MyMemory bloquea tráfico | Media/alta | Alto | 429/errores por IP | Local/BYOK/contrato/cache/rate limit |
| Producto parece copia de overlays | Media | Alto | Baja conversión | Nicho extranjero + aprendizaje activo |
| Apple integra más idiomas/features | Alta | Medio/alto | Menor diferenciación | Cualquier reproductor + overlay + práctica |
| Fork comercial por MIT | Media | Medio | Clon visible | Marca, servicio, comunidad, Pro y velocidad |
| Usuarios prueban una vez y no vuelven | Alta | Crítico | W2 <20 % | Loop, guardados, repertorio y repaso |
| Windows-only limita mercado | Media | Medio | Demanda móvil/macOS | Validar PMF antes de portar |
| Costos API superan precio | Media | Alto | Margen <75 % | SMTC/local/importación/límites/precio |
| Soporte consume al fundador | Media | Alto | >15 min/usuario/mes | Diagnóstico, FAQ, onboarding y cohorts pequeños |

---

## 15. Decisiones que se consideran tomadas

1. MIT no se “revoca”; se gestiona como base Community publicada.
2. No se vende exclusividad sobre el código actual.
3. Las funciones comerciales futuras se separan antes de publicarlas.
4. El nicho inicial es canto de música extranjera, especialmente JP/KO.
5. Afinación no se presentará como pronunciación.
6. No se harán afirmaciones educativas fuertes sin un piloto medido.
7. No se cobrará masivamente usando scraping o endpoints no autorizados.
8. No se priorizarán bares/karaoke profesional ni grandes adquisidores.
9. Windows se valida primero; otros sistemas vienen después de product-market fit.
10. La privacidad por defecto es local y mínima: sin almacenar audio crudo.

---

## 16. Próximas diez acciones

1. Revocar la credencial expuesta y corregir `.env.example`.
2. Añadir detección automática de secretos.
3. Completar la matriz de proveedores y solicitar términos/cotizaciones.
4. Construir y probar el instalador actual en una máquina limpia.
5. Añadir logs seguros y exportación de diagnóstico.
6. Publicar 0.2.x como beta privada, no como release general.
7. Crear onboarding y demo con material de dominio público/autorizado.
8. Reclutar los primeros 15 participantes del nicho JP/KO.
9. Implementar loop de línea y ocultar/revelar antes de añadir más personalización.
10. Definir un piloto con una academia usando repertorio aportado por ella.

---

## 17. Fuentes de grounding de mercado

Revalidar precios y condiciones antes de usarlos en decisiones finales:

- Versefy: mercado de letras Windows y señales públicas de descargas —
  <https://www.versefy.app/>
- Lyric Overlay: referencia de precio para overlay —
  <https://lyricoverlay.com/>
- KaraFun: precio personal versus Pro/comercial —
  <https://www.karafun.com/subscribe.html>
- LingoClip: aprendizaje de idiomas mediante música —
  <https://es.lingoclip.com/>
- Singing Carrots Education: referencia B2B de feedback vocal —
  <https://singingcarrots.com/schools>
- Apple Music Translation/Pronunciation/Sing: competencia integrada —
  <https://www.apple.com/newsroom/2025/06/apple-services-deliver-powerful-features-and-intelligent-updates-to-users-this-fall/>
- Duolingo + Sony Music: evidencia de que el contenido popular requiere alianzas —
  <https://blog.duolingo.com/popular-songs-music-course/>
- ShazamKit oficial: referencia para reconocimiento autorizado en plataformas
  compatibles — <https://developer.apple.com/shazamkit/>
- MIT License: uso comercial permitido y obras mayores bajo otros términos —
  <https://choosealicense.com/licenses/mit/>

---

## 18. Regla de cierre

Este plan se considera cumplido cuando Singevery cruza C2 con evidencia, no
cuando se terminan todos los ítems del backlog. El objetivo no es construir la
plataforma más grande posible; es demostrar que un nicho concreto instala,
practica repetidamente, paga y puede ser atendido de forma legal y sostenible.
