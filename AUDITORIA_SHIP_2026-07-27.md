# Auditoría de ship-readiness — Singevery

**Fecha:** 27-07-2026 · **Rama auditada:** `estado-2026-07-04` @ `4422695`
**Marco:** skills `deploy-checklist`, `code-review`, `tech-debt` y `testing-strategy` (plugin *engineering*).
**Alcance:** código, tests, empaque, distribución, docs y legal.

---

> ## Estado al cierre de la sesión
>
> Los cuatro bloqueantes se atacaron el mismo día. Queda **un solo GO/NO-GO
> abierto**, y es de máquina, no de código:
>
> | Bloqueante | Estado |
> |---|---|
> | P0-1 · rama sin publicar / versión | ✅ `main` en fast-forward, versión **0.2.0**, todo commiteado. **Falta tu `git push` + tag** |
> | P0-2 · instalador nunca construido | ⏳ **pendiente en tu Windows**: `npm run package:full` + el smoke test ya escrito en `docs/RELEASING.md` |
> | P0-3 · red sin timeouts | ✅ plazos en las 6 llamadas + presupuesto total por canción, con 16 tests nuevos |
> | P0-4 · doc huérfano y deps muertas | ✅ `REMOTE-TV.md` borrado; fuera `electron-store`, `ws`, `selfsigned`, `@types/ws` |
>
> El resto del documento queda como quedó al auditar, para poder contrastar.

## Veredicto

**NO-GO para distribución pública hoy.** No por calidad del código —la suite
estática está impecable— sino porque **lo que un tercero puede descargar hoy no
es este código**, y porque hay dos fallos de robustez que en una red mala dejan
la app colgada sin salida.

Estimación para llegar a GO: **1 sesión de trabajo** (los 4 bloqueantes son
acotados; el más largo es probar el instalador en Windows).

| Área | Estado |
|---|---|
| Calidad estática | ✅ verde |
| Robustez en red | 🔴 sin timeouts fuera de la capa de letras |
| Empaque | 🟠 config correcta, **nunca ejecutada** sobre este código |
| Publicación | 🔴 11 commits sin publicar; el release vivo es del 2 de julio |
| Docs de usuario | 🟠 buenas, con un documento que miente |
| Legal | 🟠 gap de traducción (corregido en este audit, requiere tu revisión) |

---

## 1. Lo que está verificado y verde

Medido en esta sesión, no heredado de notas anteriores:

| Comprobación | Resultado |
|---|---|
| `tsc -b` (renderer) | exit 0 |
| `tsc -p tsconfig.electron.json` | exit 0 |
| `eslint` (electron + src + tests + scripts) | 0 problemas |
| `vitest run` (23 archivos, 3 tandas) | **276/276 verdes** |
| `package-lock.json` vs `package.json` | en sincronía, `lockfileVersion 3`, 0 deps faltantes |
| Secretos hardcodeados | ninguno; el token de AudD sale de `.env` (`services/env.ts`) y `.env` está excluido del paquete y del git |
| Higiene de Electron | `contextIsolation: true`, `nodeIntegration: false`, CSP estricta en `file://`, `setWindowOpenHandler` → `shell.openExternal`, permisos limitados a `media`/`display-capture` |
| Árbol de trabajo | limpio antes de este audit |

La arquitectura de la capa de letras (cache-first, single-flight, presupuesto de
tiempo por proveedor y total, fallback por duración) es sólida y está bien
cubierta por tests. El sidecar SMTC autocontenido y la puerta de calidad en
`release.yml` son decisiones correctas y bien documentadas.

---

## 2. Bloqueantes (P0) — hay que resolverlos antes de publicar

### P0-1 · Lo que se descarga hoy no es este código 🔴

```
origin/main       = db8dfb9 (2 de julio)
estado-2026-07-04 = 4422695 · 11 commits por delante, 0 por detrás
tag v0.1.0        → d0eda2a  (anterior incluso a main)
```

Esos 11 commits son **101 archivos, +10.052/−2.168**: toda la capa multi-proveedor
de letras, el parser LRC de doble bloque, la anticipación adaptativa, la sincronía
con YouTube, el texto paralelo, la traducción (MyMemory + modelo local), el
instalador NSIS para terceros y la propia landing.

Consecuencias encadenadas:

- La landing (`docs/index.html`) apunta a `releases/latest`, que sirve el
  instalador del **2 de julio**. Un usuario nuevo instala una versión sin nada de
  esto.
- La landing **tampoco está publicada**: GitHub Pages sirve desde `main`/`docs`, y
  `docs/index.html` vive en los commits sin publicar (`5704b58`, `90618e2`,
  `4422695`).
- `package.json` sigue en `0.1.0` y ya existe el tag `v0.1.0`. Cortar release sin
  bumpear choca con el tag y con `artifactName: Singevery-Setup-${version}.exe`.

**Qué hacer:** `main` está 0 commits por detrás → fast-forward limpio.

```bash
git checkout main && git merge --ff-only estado-2026-07-04
# bump a 0.2.0 en apps/desktop/package.json (y package-lock)
git commit -am "chore: release v0.2.0" && git push origin main
git tag v0.2.0 && git push origin v0.2.0     # dispara release.yml
```
Después: *Settings → Pages → Deploy from a branch → `main` / `/docs`*.

### P0-2 · El instalador actual nunca se construyó con esta configuración 🔴

`apps/desktop/release/Singevery-Setup-0.1.0.exe` es del **2 de julio** y su
`builder-debug.yml` **no contiene ninguna entrada `asarUnpack`** (verificado:
0 coincidencias). El bloque `asarUnpack` con el diccionario de kuromoji y el
`.wasm` de shazamio-core se añadió después, en `55ab82e`, y **nunca se ha
ejecutado**.

Justamente esas dos cosas —el diccionario IPADIC que se lee con `fs` y el WASM de
Shazam— son las que se rompen cuando quedan dentro del `.asar`. Es decir: el
riesgo que `asarUnpack` existe para cubrir **no está verificado ni una vez**. Si
falla, en el `.exe` no hay furigana/romaji ni reconocimiento — el producto entero.

**Qué hacer, en tu Windows:** `npm run package:full`, instalar en una carpeta
limpia (o mejor, en otro equipo/VM sin .NET ni Node) y probar el camino completo:
reconocer una canción japonesa → ver furigana → traducir → cerrar y reabrir.

### P0-3 · Red sin timeouts: reconocimiento y traducción se cuelgan para siempre 🔴

La capa de letras hace esto bien (`lyricsService.ts`: `requestTimeoutMs: 12000`,
`totalBudgetMs: 25000`, `AbortController` por proveedor). **El resto de la app no
tiene nada:**

| Llamada | Archivo | Timeout | Cancelación |
|---|---|---|---|
| Shazam | `recognition/shazamApi.ts:74` | ❌ | ❌ |
| AudD | `recognition/auddProvider.ts:62` | ❌ | ❌ |
| MyMemory | `services/translate.ts:143` | ❌ | ❌ (acepta `signal`, nadie se lo pasa) |
| Modelo local | `services/translate.ts:290` | ❌ | ❌ |
| DeepL / Google | `services/translate.ts:386,413` | ❌ | ❌ |

`stateStore.requestTranslation()` (línea 328) llama a `translateLines(lines, config)`
**sin `AbortSignal`**, y `useTranslationToggle.ts:50` hace `await` directo sobre el
IPC. Si el fetch no vuelve, `loading` queda en `true` **para siempre**, sin botón
de cancelar. Igual con `identifyAudio` en `useRecognition.ts:185`.

Agravante: `translate.ts` y toda la capa de reconocimiento usan el **`fetch`
global (undici)**, no `appFetch`/`net.fetch`. El comentario de cabecera de
`services/http.ts` documenta que undici ya se colgó en tu propia red contra
lrclib por Happy Eyeballs IPv6 — misma trampa, otro módulo. Con el modelo local
esto es aún más probable: una inferencia en CPU puede tardar minutos, y si el
runtime no está abierto el `fetch` a `localhost:11434` puede quedarse esperando.

**Qué hacer:** `AbortSignal.timeout()` en las 6 llamadas (sugerido: 15 s
reconocimiento, 30 s MyMemory/DeepL/Google, 180 s modelo local), pasar el signal
desde `requestTranslation`, migrar a `appFetch`, y exponer un botón de cancelar
mientras `loading`.

### P0-4 · `REMOTE-TV.md` documenta una función que no existe 🔴

`apps/desktop/REMOTE-TV.md` explica cómo activar "Modo TV", abrir
`https://IP:5175/tv.html` en el televisor y usar el teléfono como micrófono
remoto. **Nada de eso existe en el código**: cero coincidencias de `tvServer`,
`TvApp`, `tv.html`, `mic.html` o `5175` en `electron/`, `src/` o `tests/`, y no
hay sección "Modo TV" en `SettingsPanel.tsx`.

Origen: el commit `699177c` (*feat(remote): optional LAN TV display and phone mic
extension*) trajo el documento; el código se perdió en la vuelta al estado del 2
de julio y el `.md` sobrevivió huérfano.

Restos del mismo naufragio: **`ws` y `selfsigned` siguen declaradas como
dependencias de producción y no las importa nadie** (verificado sobre imports
reales; `selfsigned` arrastra `node-forge`). Se empaquetan en el instalador y
aparecen en `THIRD-PARTY-NOTICES.txt`. Lo mismo con **`electron-store`**:
declarada, nunca importada — `settings.ts` persiste con `fs` a mano.

**Qué hacer:** decidir si reimplementar o borrar el documento (mientras tanto ya
lleva un aviso al principio, ver §5), y:

```bash
npm uninstall electron-store ws selfsigned @types/ws
```

---

## 3. Importantes (P1) — no bloquean, pero definen si el producto sobrevive

### P1-1 · Instalado y sin retorno: ni auto-updater ni logs

- **Sin auto-actualización**: `electron-updater` no está instalado y
  `electron-builder.yml` no tiene bloque `publish` (ni genera `latest.yml`). Cada
  arreglo obliga a que el usuario vuelva a la web y reinstale a mano. En la
  práctica, la gente se queda con la versión del primer día.
- **Sin logs a disco**: todo va a `console.*`, invisible en una app empaquetada de
  Windows. Cuando un tercero diga "no me funciona", no hay absolutamente nada que
  pedirle. Un `main.log` rotativo en `app.getPath('userData')` es media hora de
  trabajo y cambia por completo tu capacidad de dar soporte.

### P1-2 · MyMemory: el volumen roza sus propios términos de uso

La implementación manda **una petición por línea** con concurrencia 4
(`translate.ts`, `MYMEMORY_CONCURRENCY = 4`) más una de detección de idioma. Una
canción de 50 líneas = ~51 peticiones en ráfaga, por usuario y por canción.

Sus [términos](https://mymemory.translated.net/terms-and-conditions) prohíben
expresamente *"generate abnormal traffic that disrupts the service to other
users"* y *"use the APIs the way they are not meant to be used, like translating
more than one paragraph at once"*. Una canción entera troceada en líneas es
exactamente eso. Con pocos usuarios no pasa nada; con tracción, el bloqueo por IP
es plausible y la función muere sin aviso para todos.

**Mitigaciones:** bajar la concurrencia a 2, cachear agresivo (ya se cachea el
resultado en disco: bien), y presentar el **modelo local** como la vía seria en
la UI, no como opción avanzada.

### P1-3 · CI no ha visto nada de este trabajo

`ci.yml` solo dispara en `push`/`pull_request` a `main`. Los 11 commits de julio
nunca pasaron por CI. `release.yml` sí corre lint+test antes de empaquetar, así
que la red de seguridad existe — pero salta **en el momento del release**, que es
el peor momento para descubrir un fallo.

**Qué hacer:** añadir `branches: ['**']` (o al menos la rama de trabajo) y
`workflow_dispatch` a `ci.yml`.

### P1-4 · Firma de código: decidido, pero falta el paliativo barato

Ya está analizado en `PLAN_DISTRIBUCION.md` §1.1 y documentado honestamente en
README y guía. Lo que falta y es gratis: **publicar el SHA-256 del instalador**
en la release y en la landing, para que quien desconfíe pueda verificar. Se puede
automatizar en `release.yml` en 4 líneas.

---

## 4. Deuda técnica priorizada

Fórmula de la skill: `(Impacto + Riesgo) × (6 − Esfuerzo)`.

De mayor a menor prioridad:

| Deuda | Tipo | Imp. | Riesgo | Esf. | **Prio** |
|---|---|---|---|---|---|
| Rama sin publicar / versión sin bumpear | Infra | 5 | 5 | 1 | **50** |
| Instalador nunca construido con la config actual | Infra | 5 | 5 | 2 | **40** |
| Sin timeouts en reconocimiento y traducción | Código | 4 | 5 | 2 | **36** |
| Sin logs a disco | Infra | 4 | 4 | 2 | **32** |
| `REMOTE-TV.md` huérfano + 3 deps muertas | Docs/Deps | 3 | 3 | 1 | **30** |
| Ráfaga de peticiones a MyMemory | Arquitectura | 3 | 4 | 2 | **28** |
| CI no cubre la rama de trabajo | Infra | 2 | 3 | 1 | **25** |
| Sin auto-updater | Infra | 4 | 3 | 3 | **21** |
| Sin CHANGELOG ni plan de rollback en `RELEASING.md` | Docs | 2 | 2 | 1 | **20** |
| Sin test e2e del paquete (asar, dict, wasm) | Tests | 3 | 4 | 4 | **14** |

**Sobre cobertura de tests (skill `testing-strategy`):** la pirámide está bien
poblada en la base —276 tests unitarios sobre lógica pura y servicios con red
simulada— y vacía en la punta. Los dos huecos que importan no son de cantidad
sino de tipo:

1. **Nada valida el artefacto empaquetado.** Todo lo que puede romperse al pasar
   por `asar` (kuromoji, wasm, rutas del sidecar) es invisible para vitest.
   Cubrirlo bien es un smoke test manual documentado como checklist; automatizarlo
   con Playwright/WebdriverIO es posible pero desproporcionado hoy.
2. **Nadie ha ejecutado una traducción contra un Ollama real** (lo dice tu propio
   `PLAN_DISTRIBUCION.md` §1.2.b, y sigue siendo cierto). Los tests cubren el
   formato de petición, el parseo numerado y el reintento — todo con la API
   simulada.

No recomiendo subir el número de tests unitarios: está bien donde está.

---

## 5. Cambios aplicados en este audit

Solo lo trivial y de bajo riesgo, como acordamos:

| Archivo | Cambio |
|---|---|
| `README.md` | "Vitest (198 tests)" → **276**, que es el número real |
| `PLAN_DISTRIBUCION.md` | §1.3 decía que `electron-updater` **ya está en el proyecto**; no lo está. Corregido |
| `apps/desktop/REMOTE-TV.md` | Aviso al inicio: función no implementada, de dónde viene y cómo recuperarla |
| `AVISO_LEGAL.md` | **Nueva §5 "Traducción de letras"** + bullet en Privacidad; sin ella el aviso no declaraba que la letra completa sale del equipo. Sesiones 6-8 renumeradas |

> **Revisa tú la §5 del aviso legal.** La redacté sobre los términos vigentes de
> MyMemory (conservación indefinida de cada segmento, uso para mejorar servicios,
> licencia a socios, titularidad plena de Translated sobre *Public Data*, ley
> italiana), pero el abogado eres tú y es tu nombre el que va en el repo.

No toqué código de aplicación ni dependencias: los timeouts y el `npm uninstall`
son cambios con riesgo real y quedan para que los apruebes.

---

## 6. Checklist de release (adaptado a app de escritorio)

### Pre-release
- [ ] Timeouts en reconocimiento y traducción (P0-3)
- [ ] `npm uninstall electron-store ws selfsigned @types/ws`
- [ ] Decidir `REMOTE-TV.md`: reimplementar o borrar
- [ ] Revisar la §5 del aviso legal
- [ ] `main` fast-forward desde `estado-2026-07-04`
- [ ] Versión → `0.2.0` en `package.json` + `package-lock.json`
- [ ] CI verde en `main`
- [ ] `npm run package:full` en Windows

### Smoke test del instalador (equipo limpio, sin Node ni .NET)
- [ ] Instala y abre; el ícono y el nombre salen bien
- [ ] Reconoce por audio del sistema y por micrófono
- [ ] SMTC responde a pausa/seek (prueba de que el sidecar autocontenido va)
- [ ] Canción japonesa → **furigana y romaji** (valida `asarUnpack` de kuromoji)
- [ ] Reconocimiento funciona (valida el `.wasm` de shazamio-core)
- [ ] Traducir con MyMemory y con Ollama
- [ ] Cerrar y reabrir: ajustes, offsets y caché persisten
- [ ] Desinstalar limpio

### Release
- [ ] `git tag v0.2.0 && git push origin v0.2.0`
- [ ] `release.yml` verde y `.exe` publicado
- [ ] Publicar el **SHA-256** del `.exe` en las notas de la release
- [ ] GitHub Pages activado en `main`/`/docs`
- [ ] Landing y README apuntan a la versión nueva

### Rollback
No hay servidor que revertir: el rollback de una app de escritorio es
**despublicar el release y dejar el anterior como `latest`**. Conviene escribirlo
en `docs/RELEASING.md` con los criterios: si la app no abre, si no reconoce, o si
la letra no aparece en un equipo limpio → despublicar y volver al tag anterior.

---

## 7. Lo que NO hay que arreglar

Para que la lista de arriba no se lea como "todo está mal":

- La **arquitectura de letras** no necesita nada. Los presupuestos de tiempo, el
  single-flight, las variantes de consulta y el fallback por duración están bien
  pensados y bien probados.
- El **empaque** está bien resuelto: sidecar autocontenido, licencias generadas
  desde el árbol real de dependencias, documentos junto al `.exe`, puerta de
  calidad en el workflow. Solo falta ejecutarlo.
- Las **docs de usuario** (`GUIA_DE_USO.md`) son honestas y están al día. Explican
  SmartScreen sin excusas y las cuotas de traducción con números reales.
- La **higiene de Electron** es correcta. No hay `nodeIntegration`, no hay
  `remote`, hay CSP, y los links externos salen al navegador.
- El **número de tests unitarios** está bien. No añadas más; el hueco es de tipo,
  no de cantidad.

---

*Auditoría generada con las skills `deploy-checklist`, `code-review`, `tech-debt`
y `testing-strategy`. Toda afirmación de esta página está respaldada por un
comando ejecutado o un archivo leído en la sesión del 27-07-2026.*
