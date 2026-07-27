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
Hoy la traducción exige que el usuario pegue su propia API key de DeepL/Google,
y AudD requiere token. Un usuario común no va a sacar credenciales. Hay que
elegir explícitamente:
- **BYOK** (lo actual): gratis de operar, pero la traducción y el respaldo AudD
  quedan fuera del alcance del usuario promedio. Requiere que la UI explique
  bien qué funciona sin key (Shazam + letras sí funcionan).
- **Proxy propio**: un backend mínimo con las keys del proyecto y rate limiting
  por instalación. Mejor UX, pero implica costo variable, términos de uso y
  responsabilidad sobre el tráfico.

Decisión pendiente; condiciona el mensaje de la web.

### 1.3 Auto-actualización
Sin updater, cada corrección exige que el usuario vuelva a descargar. `electron-updater`
se integra con GitHub Releases y el flujo de tags ya existente. Requiere firma
para funcionar sin fricción (ver 1.1).

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
