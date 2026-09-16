# Auditoría de entrega — Singevery 0.2.1-beta.2

Fecha: 16 de agosto de 2026. Rama `feat/sync-cambio-cancion-rapido` (`551f9be`).
Objetivo: ¿se le puede entregar hoy el instalador a un profesor de música para
que lo evalúe, sin acompañamiento técnico?

**Veredicto: sí, tras cuatro arreglos de ~30 minutos.** El producto y el
empaquetado están sanos; los bloqueantes son de distribución, no de código.

Todo lo de abajo fue ejecutado, no inferido del YAML.

> **Estado (misma sesión): los cuatro P0 y los P1 de documentación están
> aplicados.** Ver "Arreglos aplicados" al final. El P0-1 nunca llegó a causar
> daño real: el commit que empaquetaba el token (`a66fbcd`) es del 8 de agosto y
> el instalador `beta.1` se construyó el 2 de agosto, así que **ningún instalador
> distribuido llevó la credencial** y no hace falta rotarla.

---

## Lo que se verificó ejecutando

| Comprobación | Resultado |
|---|---|
| `npm test` | **667 tests / 53 archivos, todos verdes** |
| `npm run lint` | limpio |
| `npm run build` | limpio (tsc + vite + tsc electron) |
| `npm run package` | **completo**, `Singevery-Setup-0.2.1-beta.2.exe` (147 MB) |
| SHA-256 del instalador | `49c43b935f53f09897da079eebe299ad525dd2cdeca1a4a2fa79aa746ba606ce` |
| Sidecar SMTC autocontenido | sí — `runtimeconfig.json` trae `includedFrameworks`, sin `framework` → **el equipo destino no necesita .NET** |
| Contenido real del instalador | inspeccionado con 7z por `verify-package.cjs`: guías, sidecar y `coreclr.dll` presentes |

### Postura de seguridad de la app (correcta)

- `contextIsolation: true`, `nodeIntegration: false` (`main.ts:230-231`).
- CSP estricta en producción sobre `file://` (`csp.ts:5`).
- Links externos salen al navegador, no dentro del widget (`main.ts:258`).
- Permisos acotados a `media` / `display-capture` (`main.ts:300-306`).
- Endpoint de diagnóstico **apagado por defecto**, bind a `127.0.0.1`, valida
  cabecera `Host` (anti DNS-rebinding), solo GET (`diagnosticsServer.ts`).
- Lock de instancia única en producción (`main.ts:1277`).

### Experiencia de instalación (correcta)

NSIS per-user → **no pide administrador**. Muestra licencia, permite elegir
carpeta, crea accesos en escritorio y menú Inicio, arranca al terminar.
Junto al `.exe` quedan `GUIA_DE_USO.md`, `GUIA_BETA_PROFESORES.md`,
`PRIVACIDAD_Y_DATOS.md`, `AVISO_LEGAL.md`, `LICENSE.txt` y
`THIRD-PARTY-NOTICES.txt`. Primer arranque muestra `BetaWelcome` con los tres
pasos y no escucha nada hasta que se pulsa SING.

---

## P0 — Bloqueantes

### 1. El instalador lleva tu token de AudD en texto plano

`electron-builder.yml:29-31` copia `./.env` a `resources/.env`. **Verificado en
el paquete recién construido:** `release/win-unpacked/resources/.env` contiene
`AUDD_API_TOKEN=<valor real, 34 caracteres>`. Cualquiera que instale la app lo
abre con el Bloc de notas.

`check-secrets.cjs:42` **salta explícitamente los archivos `.env`**, así que la
puerta de calidad que corre en `prebuild` y `pretest` no puede verlo. Pasa en
verde mientras el token se empaqueta.

Consecuencia concreta: si tu amigo reenvía el `.exe` a un colega —cosa normal
cuando algo gusta— tu cuota de AudD se va con él.

**Arreglo recomendado: quitar el token.** Sin él, `recognitionService.ts:61`
devuelve `['shazam']`, y Shazam es gratis y sin API key: es el motor por defecto.
AudD solo es el respaldo. La app funciona igual para una evaluación docente.

```yaml
# electron-builder.yml — comentar el bloque completo:
#  - from: ./.env
#    to: .env
#    filter: ['*.env']
```

Si prefieres dejarlo, avísale por escrito de que no redistribuya el `.exe`.

### 2. El `.env` empaquetado trae `VITE_DEV_SERVER_URL` activo

La misma copia lleva `VITE_DEV_SERVER_URL=http://localhost:5173` **sin comentar**.

Hoy no rompe: `isDev` (`main.ts:83`) se evalúa al cargar el módulo, y
`loadDotEnv()` corre después, dentro de `bootstrap()` (`main.ts:1070-1072`).
El orden salva la situación por accidente, no por diseño.

Si algún día `loadDotEnv()` sube de posición, o alguien lee la variable de forma
diferida, la app empaquetada intentará cargar `localhost:5173` → **ventana en
blanco en la máquina del profesor**, y además se desactiva el lock de instancia
única. Comenta esa línea del `.env` pase lo que pase con el punto 1.

### 3. El release por tag falla

`release.yml:57-63` verifica `native/smtc/dist/espejo-smtc.exe`. Pero
`build:smtc` publica en `apps/desktop/build/smtc-dist/`, y `native/smtc/dist`
está en `.gitignore` (`native/smtc/.gitignore:3`) y no está trackeado.

En un checkout limpio de CI ese archivo **no existe** → el step lanza y el job
muere *después* de haber empaquetado. `git tag v0.2.1-beta.2 && git push` no
produce release.

Arreglo: apuntar el check a la ruta real.

```yaml
- name: Verify SMTC sidecar was bundled
  shell: pwsh
  run: |
    if (-not (Test-Path apps/desktop/build/smtc-dist/espejo-smtc.exe)) {
      throw "espejo-smtc.exe no se generó: el instalador quedaría sin SMTC."
    }
```

### 4. Nada de esto está publicado

El único release en GitHub es **`v0.1.0`, del 3 de julio**. El README manda a
"Releases/latest": tu amigo bajaría 0.1.0 — dos versiones atrás, sin la
bienvenida beta, sin las guías nuevas y sin la mejora de detección de cambio de
canción.

Estado de ramas: `main` local va **6 commits detrás** de tu rama de trabajo;
`origin/main` va 8 detrás. La rama de trabajo sí está pusheada.

---

## P1 — Fricciones que el profesor va a notar

**5. La guía beta nombra el archivo equivocado.** `GUIA_BETA_PROFESORES.md:12`
dice "Recibe `Singevery-Setup-0.2.1-beta.1.exe` y su SHA-256". Le vas a entregar
**beta.2**. La guía le pide expresamente verificar que el nombre coincida antes
de saltarse SmartScreen — y no va a coincidir. Peor: la guía se instala junto al
`.exe`, así que el error viaja dentro del producto.

**6. `GUIA_DE_USO.md` §7** le explica cómo crear un `.env` a mano para AudD. Si
entregas el instalador con el token dentro (punto 1), ese paso ya está hecho y la
instrucción confunde. Si lo quitas, la sección queda correcta.

**7. Cifras desactualizadas.** `README.md:198` dice "456 tests" (son 667);
`WINDOWS.md:87` dice que genera `Singevery-Setup-0.1.0.exe`.

**8. 960 MB en `apps/desktop/release/`** con cuatro instaladores de versiones
distintas conviviendo. No es un bug, pero es exactamente la situación en la que
se envía el `.exe` equivocado.

**9. Raíz del repo con andamiaje interno.** Diez `.md` en la raíz, de los cuales
`AUDITORIA_2026-07.md`, `AUDITORIA_SHIP_2026-07-27.md`, `AUDIT_Y_PLAN.md`,
`PLAN_ESTADO_ACTUAL.md`, `PLAN_LETRAS_Y_CACHE.md` y `PLAN_DISTRIBUCION.md` son
notas de trabajo. Solo importa si además va a mirar el código; moverlos a `docs/`
es un `git mv`.

---

## Lo que NO se verificó

**No instalé el `.exe`.** Instalar crea accesos directos y entradas de registro
en tu equipo; esa decisión es tuya. Lo que sí se comprobó es el contenido real
del instalador (listado con 7z) y el árbol completo de `win-unpacked`.

**La prueba que falta es la única que importa de verdad:** instalar en una VM
limpia de Windows 10/11 **sin .NET y sin Node**, y confirmar que reconoce una
canción. Todo lo demás son inferencias sobre el paquete.

---

## Plan de entrega

### Camino corto — se lo pasas por mano (30 min)

1. Comentar el bloque `.env` de `electron-builder.yml:29-31` (P0-1).
2. Comentar `VITE_DEV_SERVER_URL` en `apps/desktop/.env` (P0-2).
3. Corregir `beta.1` → `beta.2` en `GUIA_BETA_PROFESORES.md:12` (P1-5).
4. `npm run package` y entregar el `.exe` **junto a su `.sha256.txt`** — la guía
   le pide comparar el hash antes de saltarse SmartScreen.
5. Probar en VM limpia antes de enviar.

### Camino largo — que lo baje él solo de GitHub

6. Arreglar la ruta del sidecar en `release.yml` (P0-3).
7. Merge a `main`, push, `git tag v0.2.1-beta.2 && git push origin v0.2.1-beta.2`.
8. Ojo: en CI **no existe** `.env`, así que el instalador publicado nunca lleva
   token. El P0-1 solo afecta a los builds locales.

Sin firma de código, SmartScreen va a avisar igual. Está documentado en README,
`GUIA_DE_USO.md` §2 y la guía beta, con el hash como contrapeso. Es lo correcto
para una beta; un certificado OV solo hace falta si esto sale a público amplio.

---

## Arreglos aplicados (16 de agosto)

| # | Archivo | Cambio |
|---|---|---|
| P0-1 | `electron-builder.yml` | Eliminado el `extraResources` que copiaba `./.env` |
| P0-2 | `apps/desktop/.env` | `VITE_DEV_SERVER_URL` comentada, con el porqué anotado |
| P0-3 | `.github/workflows/release.yml` | Ruta del sidecar → `apps/desktop/build/smtc-dist/` |
| P1-5 | `GUIA_BETA_PROFESORES.md` | `beta.1` → `beta.2` |
| P1-7 | `README.md`, `WINDOWS.md` | 456→667 tests; versión del instalador ya no hardcodeada |
| — | `electron/services/env.ts` | Comentario corregido: el `.env` de `resourcesPath` ahora es el que pone el usuario |
| — | `scripts/verify-package.cjs` | **Guardia nuevo**: falla si aparece cualquier `.env` en `win-unpacked` o dentro del `.exe` |

### Por qué el guardia va en `verify-package`, no en `check-secrets`

`check-secrets.cjs` salta los `.env` a propósito, y debe seguir haciéndolo: el
`.env` local del desarrollador **sí** lleva un token real y legítimo. Prohibirlo
ahí solo lograría que alguien añadiera una excepción. El único punto donde la
regla es absoluta es el artefacto que se reparte, y ahí es donde se comprueba.

### Verificación tras los arreglos

- `npm test` → **667 tests verdes**.
- `npm run lint` → limpio.
- `npm run package:full` → completo, con el sidecar recompilado desde cero.
- `release/win-unpacked/resources/` → **sin `.env`**.
- **El guardia se probó plantando un `.env` falso**: `verify:package-output`
  falló con exit 1 y el mensaje esperado. No pasa en verde por no mirar.

Instalador final para entregar:

```
Singevery-Setup-0.2.1-beta.2.exe   147.460.776 bytes
SHA-256  f887b520fa223c39b04f7af02667121174e8f320b70f82af6545d28b11816feb
```

Va acompañado de `Singevery-Setup-0.2.1-beta.2.exe.sha256.txt`, que la guía beta
le pide comparar antes de saltarse SmartScreen.

### Pendiente

- **P0-4 (publicar)**: sin tocar. Requiere merge a `main`, push y tag, y eso
  publica a nombre del autor.
- **Prueba en VM limpia** de Windows sin .NET ni Node. Sigue siendo la única
  verificación que falta y la que de verdad importa.
- **P1-8/9** (960 MB de instaladores viejos en `release/`, andamiaje `.md` en la
  raíz): cosméticos, no bloquean la entrega.
