# PLAN_DISTRIBUCION.md — instalador descargable y página web

> Anotado al cerrar la sesión del 26-07-2026, después de arreglar la sincronía
> con YouTube, el arbitraje de fuentes y sumar la vista de texto paralelo.
> **Próximo bloque de trabajo: que un desconocido pueda instalar y usar
> Singevery sin ayuda.**

---

## 0. Lo que YA está construido (no rehacer)

| Pieza | Estado |
|---|---|
| Instalador NSIS (`electron-builder.yml`) | ✅ `npm run package` → `release/Singevery-Setup-<v>.exe` |
| Sidecar SMTC autocontenido en el paquete | ✅ vía `extraResources` + `npm run build:smtc` |
| Workflow de release por tag | ✅ `release.yml` publica el `.exe` en GitHub Releases |
| Docs de usuario final junto al `.exe` | ✅ `GUIA_DE_USO.md`, `AVISO_LEGAL.md`, licencias de terceros |
| Proceso de corte de versión | ✅ documentado en `docs/RELEASING.md` |
| Puerta de calidad en el release | ✅ lint + tests antes de empaquetar |

**Cómo generar el instalador (en Windows, con Node 20 y .NET 8 SDK):**

```powershell
cd apps\desktop
npm ci
npm run package:full
```
→ `apps/desktop/release/Singevery-Setup-<version>.exe`

O sin tocar nada local: `git tag vX.Y.Z && git push origin vX.Y.Z` y GitHub
Actions lo construye y publica solo.

> **Corregido el 27-07-2026:** `release.yml` compilaba el sidecar SMTC con
> `--self-contained false`, así que el instalador publicado exigía .NET 8 en la
> máquina del usuario y, sin él, SMTC moría en silencio (se perdía la pausa y el
> seek instantáneos, justo lo que distingue a Singevery). Ahora CI usa
> `npm run package:full` — misma ruta que un build local — y verifica que el
> `.exe` del sidecar exista antes de publicar.

**Conclusión:** el instalador existe y funciona. Lo que falta no es empaquetar,
es **confianza, descubrimiento y actualización**.

---

## 1. P0 — Bloqueantes reales para terceros

### 1.1 Firma de código (el problema más grande) 🔴
Hoy el `.exe` no está firmado, así que Windows SmartScreen muestra
*"Windows protegió tu PC"* y esconde el botón de instalar tras "Más
información". Para un usuario no técnico eso **es** el fin del embudo.

Opciones, de menor a mayor costo:
- **Sin firmar + instrucciones honestas**: documentar el aviso con captura y
  publicar el hash SHA-256 del instalador para que se pueda verificar. Gratis,
  pero la fricción se mantiene.
- **Certificado OV** (~US$100-200/año, requiere validar identidad): quita el
  aviso solo después de acumular reputación de descargas.
- **Certificado EV** (~US$300-400/año, token físico o HSM en la nube): quita el
  aviso desde la primera descarga. Desde jun-2023 Microsoft exige que las
  claves vivan en hardware certificado, así que ya no basta un `.pfx` local.
- **Azure Trusted Signing** (~US$10/mes): la vía más barata hoy y encaja con
  GitHub Actions, pero exige entidad legal con ≥3 años de antigüedad
  verificable — **confirmar si aplica a una persona natural en Chile antes de
  comprometerse con este camino.**

> Verificar precios y requisitos al momento de ejecutar: cambian seguido.

### 1.2 Claves de API — decidir el modelo 🔴
Hoy la traducción exige que el usuario pegue su propia API key de DeepL/Google.
Un usuario común no va a sacar credenciales, así que la funcionalidad queda
muerta para casi todos. Opciones, investigadas en jul-2026:

- **Proveedor gratuito sin clave, como opción por defecto** (recomendado).
  **MyMemory** (`api.mymemory.translated.net`) funciona sin registro ni clave:
  5.000 caracteres/día anónimo, 50.000 si se manda un email en el parámetro
  `de=`. Tiene un límite de **500 bytes por petición**, así que hay que trocear
  — nuestra traducción hoy manda la canción entera en un lote y habría que
  partirla por líneas. Con ~1.500 caracteres por canción eso da del orden de 3
  canciones/día anónimo y ~30 con email. Calidad inferior a DeepL, suficiente
  para entender de qué habla el verso. Encaja como default con DeepL/Google
  como mejora opcional para quien tenga clave.
- **LibreTranslate**: código abierto y auto-hospedable, sin clave si corre en
  tu máquina o servidor. Sin límites al auto-hospedar, pero implica un servidor
  (o pedirle al usuario que lo instale, lo que devuelve la fricción).
- **Proxy propio**: un backend mínimo con las claves del proyecto y rate
  limiting por instalación. La mejor UX, pero implica costo variable, términos
  de uso y responsabilidad sobre el tráfico ajeno.
- **BYOK** (lo actual): cero costo de operación, pero la traducción queda fuera
  del alcance del usuario promedio.

**Nota importante:** esto solo afecta a la traducción. Reconocer la canción y
mostrar la letra sincronizada ya funciona sin ninguna clave (Shazam + cadena de
proveedores de letras), y AudD es solo un respaldo opcional.

Decisión pendiente; condiciona el mensaje de la web.

### 1.2.b Traducción local ✅ implementada (vía runtime en localhost)

Ya se puede traducir con un modelo en el propio equipo: **Ajustes → Traducción
→ Modelo local**. Habla con cualquier runtime que exponga API compatible con
OpenAI (Ollama, LM Studio, llama.cpp server, Jan); por defecto apunta a Ollama
con `translategemma:4b`. Sin cuota, sin red y sin mandar las letras a terceros.

**Lo que falta para que sea apto para cualquiera:** hoy el usuario tiene que
instalar el runtime y hacer `ollama pull` a mano. La experiencia "un clic y se
descarga el modelo" implica gestor de descargas, verificación de integridad,
control de espacio en disco y empaquetar un runtime de inferencia — todo eso
**no está hecho** y no se puede validar sin probar en Windows real.

**Pendiente de verificación:** la integración está cubierta por tests con la
API simulada (formato de petición, parseo numerado, reintento, errores), pero
**nadie ha ejecutado todavía una traducción contra un Ollama real**. Es lo
primero que hay que probar a mano.

Opciones de modelo evaluadas:

La intuición es correcta: **existe un Gemma especializado en traducir**
(`translategemma-4b-it-4bit`), y hay varias opciones locales maduras en 2026.
Ordenadas por encaje con esta app:

| Opción | Tamaño | Nota |
|---|---|---|
| **Opus-MT** (Helsinki-NLP) | ~300 MB por par de idiomas | Lo más rápido; no es un LLM general, hace solo traducción. Corre en CPU sin drama. |
| **NLLB-200** (Meta) | 1.3B ≈ 3 GB VRAM | 200+ idiomas, pensado para traducción. Cubre lo raro. |
| **TranslateGemma 4B** (4-bit) | ~2-3 GB | Gemma afinado para traducir. Mejor calidad de las tres, más peso. |

**Ventajas reales para Singevery:** sin cuota, sin red, sin latencia de ida y
vuelta, y sin mandar las letras a un tercero — que es un punto de privacidad
que hoy hay que declarar en el aviso legal.

**El obstáculo no es técnico, es de distribución.** El instalador hoy pesa
decenas de MB; meter un modelo lo lleva a cientos de MB o GB. La forma sensata
sería **descarga opcional bajo demanda**: la app arranca con MyMemory y ofrece
"traducir sin conexión" bajando el modelo una vez. Eso implica gestionar
descarga, verificación de integridad, almacenamiento y una ruta de inferencia
(`transformers.js` / ONNX Runtime / CTranslate2 vía sidecar, como ya se hace
con el de SMTC).

Decisión: **esperar al veredicto de calidad de MyMemory en uso real** antes de
invertir aquí. Si MyMemory alcanza, esto no hace falta; si no, Opus-MT es el
primer candidato por tamaño y velocidad.

### 1.3 Auto-actualización
Hoy, cada corrección obliga al usuario a volver a la web, descargar el `.exe` y
reinstalar a mano. En la práctica eso significa que la gente se queda con la
versión que instaló el primer día y nunca recibe los arreglos.

`electron-updater` (del mismo autor que electron-builder, ya en el proyecto) se
engancha a GitHub Releases y al flujo de tags que ya existe: la app consulta si
hay versión nueva, la descarga en segundo plano y la instala al reiniciar.
Requiere que el instalador esté **firmado** para no disparar el aviso en cada
actualización (ver 1.1), así que va después de esa decisión.

---

## 2. P1 — Página web ✅ construida (27-07-2026)

`docs/index.html` — landing autocontenida (sin build ni dependencias), bilingüe
ES/EN con selector que recuerda la preferencia y detecta el idioma del
navegador. El botón de descarga apunta a `releases/latest` (funciona sin JS) y,
si la API de GitHub responde, se enriquece con el número de versión y el enlace
directo al `.exe`.

**Falta un paso manual:** en GitHub → *Settings → Pages → Build and deployment →
Deploy from a branch → `main` / carpeta `/docs`*. Queda publicada en
`https://grizaceo.github.io/Singevery/`.

Incluye ya las advertencias honestas de 1.1 y 1.2 (aviso de SmartScreen con la
instrucción exacta, y qué funciona sin API key). Al resolver la firma o el
modelo de claves, hay que actualizar esa sección de la página.

### Notas de la implementación original

Objetivo: una landing de una sola página que responda en 10 segundos *qué es*,
*qué necesito* y *dónde aprieto para bajarlo*.

- **Hosting**: GitHub Pages desde `/docs` o Cloudflare Pages. Gratis y encaja
  con el repo. Dominio propio opcional (`singevery.app` o similar).
- **Contenido mínimo**:
  1. Qué es, en una frase, sobre el `demo.gif` que ya existe en `docs/`.
  2. Botón de descarga apuntando al **latest release** de GitHub (no a una URL
     con versión fija, que se queda obsoleta).
  3. Requisitos honestos: Windows 10/11 (el sidecar SMTC es específico de
     Windows), qué funciones necesitan API key y cuáles no.
  4. Cómo pasar el aviso de SmartScreen, con captura, mientras no haya firma.
  5. Aviso legal: las letras vienen de proveedores de terceros y el
     reconocimiento usa APIs externas — reutilizar `AVISO_LEGAL.md`.
- **Qué NO poner**: promesas sobre iOS/Android (ver 3), ni capturas de features
  que no estén en el release publicado.

---

## 3. P2 — Anotado, sin fecha

- **Móvil**: revisado en conversación. En **Android** el concepto se porta
  completo (overlay con `SYSTEM_ALERT_WINDOW` + `MediaSessionManager` /
  `NotificationListenerService` como equivalente de SMTC). En **iOS** es
  inviable como está: no hay overlays sobre otras apps ni lectura de metadata
  de terceros por API pública. Si se retoma, empezar por Android.
- **macOS/Linux**: `electron-builder.yml` está listo para sumar targets, pero
  la capa de posición depende de SMTC (Windows). En macOS habría que
  reimplementarla sobre la API de now-playing; sin eso queda solo el micrófono.
- **Telemetría opcional de errores** (opt-in) para saber qué falla en equipos
  ajenos sin depender de reportes manuales.

---

## 4. Orden sugerido

1. Decidir el modelo de API keys (1.2) — condiciona el texto de la web.
2. Publicar la landing sin firma, con las instrucciones de SmartScreen (2).
3. Medir si la fricción del aviso justifica pagar certificado (1.1).
4. Sumar auto-updater una vez resuelta la firma (1.3).
