# PR: Singevery 0.2.1-beta.2 — robustez, IPA de lenguas latinas y entrega a beta

**Base:** `main` (en `db8dfb9`, 2-jul-2026) · **Compara:** `release/0.2.1-beta.2`
**43 commits · 200 archivos · +25.192 / −6.051**

`origin/main` es ancestro directo de esta rama: el merge es *fast-forward*, sin
conflictos posibles. No hay nada que resolver a mano.

---

## Por qué un solo PR y no varios

`main` local lleva dos meses de trabajo secuencial sobre una `origin/main`
congelada el 2 de julio. Partirlo en PRs temáticos exigiría reescribir esos 43
commits en ramas independientes desde julio, y los estados intermedios no
compilarían (la capa IPA depende de la modularización de `stateStore`, que
depende de la reparación de la cadena de letras). Un PR de release que trae la
rama al día es la forma honesta de mergear esto; los commits internos ya vienen
separados por tema y con mensajes que explican el porqué.

---

## Qué entra

### Robustez de identificación y sincronía (5 capas, 4 commits)

| Capa | Qué resuelve |
|---|---|
| **P0** diagnóstico | Endpoint HTTP local *opt-in* (`SINGEVERY_DEBUG_PORT`) con el estado interno en JSON: qué está lockeado, de qué fuente salió la letra y qué tan vieja es, deriva del reloj, últimos intentos con su motivo de fallo. Ver `docs/DIAGNOSTICO.md`. |
| **P0** atribución | `sourceKind` + `cachedAt` por entrada de caché; permite invalidar solo lo de un proveedor degradado en vez de vaciarla entera. Lo que el usuario importó a mano ya no lo borra un reintento automático. |
| **P1** covers | `extractCoverOriginal()` recupera la canción original detrás de un upload de cover/MV, separando el artista **original** (sirve para buscar) del **intérprete** (no sirve: la letra está catalogada bajo el original). |
| **P1** distintividad | Un título genérico del SO ("Awake", "Alone") ya no lockea la pista: se muestra pero queda provisional y el audio la reemplaza sin esperar la histéresis. |
| **P2** idioma | Veto por escritura: un artista japonés conocido no tiene su letra en hangul. Tabla mantenible JA/KO/ZH. |
| **P3** two-signal lock | El lock solo se suelta si el SO **y** el audio coinciden en que cambió la canción. Si el SO sigue afirmando la actual, el reconocedor necesita 5 insistencias. |
| **P4** energía vocal | Mide el desfase de la letra correlacionando energía en banda vocal contra las líneas del LRC, sobre el chunk que ya se graba cada ~18 s. **Viene en modo observación**: mide y publica en `/debug`, no corrige hasta `SINGEVERY_ENERGY_SYNC=1`. |

### IPA de lenguas latinas

Español (seseo/distinción configurable), italiano (geminación), francés y alemán
(declarados aproximados en la UI). Reglas deterministas **propias**, no
espeak-ng: esa librería es GPL-3.0 y contaminaría la licencia MIT del proyecto.
Sin dependencias nuevas.

`langDetect.ts` exige puntaje ≥12 y 40 % de ventaja o devuelve `null`: ante la
duda prefiere no responder antes que transcribir mal.

### Antes de esto (julio)

Reparación de la cadena de letras (timeouts, `net.fetch` de Chromium, variantes
de query, fallback por duración), corrección del LRC de doble bloque que
desincronizaba las canciones japonesas, anticipación adaptativa para secciones
densas, instalador NSIS con notices de terceros, plazos de red en todas las
llamadas, Electron 33 → 43, modularización de `stateStore` y `SettingsPanel`,
watchdog del sidecar SMTC y bitácora de aciertos del reconocimiento.

---

## Verificación

| Gate | Resultado |
|---|---|
| `tsc -p tsconfig.json --noEmit` | exit 0 |
| `tsc -p tsconfig.electron.json --noEmit` | exit 0 |
| `vitest run` | **578 pruebas en 46 archivos, 0 fallos** |
| `eslint .` | limpio |
| `npm run check:secrets` | sin credenciales |
| `npm run verify:package-inputs` | entradas de release completas |

Los commits de robustez se recompilaron además en un `git worktree` aislado para
confirmar que no dependían del trabajo IPA sin commitear.

---

## Pendiente después del merge

1. `npm run package:full` en Windows → `Singevery-Setup-0.2.1-beta.2.exe`.
2. Smoke test del instalador en limpio (ver `docs/RELEASING.md`).
3. Tag `v0.2.1-beta.2`.
4. Validar `sync.energy` contra canciones reales antes de encender
   `SINGEVERY_ENERGY_SYNC`.
