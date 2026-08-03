# Validación canónica — Singevery 0.2.1-beta.1 (Windows)

Fecha: 2026-08-03
Propósito: verificación definitiva del paquete beta comercial. Desde WSL los binarios
nativos (rollup de node_modules) son de Windows, así que el build y los tests DEBEN
correr en Windows (PowerShell o CMD), no en WSL.

## Estado esperado antes de empezar

- Rama con los 5 commits atómicos del 02-ago: 873fb28, b1f531a, e3d945f, 82f3aa4, 0aeaac7
- `git status` → árbol limpio salvo `build/icon-old.ico` y `build/icon-old.png` (untracked intencional)

## A. Limpieza y sanity (2 min)

1. Abrir PowerShell en `C:\Users\usuario\Desktop\Code\Singevery\Espejo-teleprompter`
2. `git log --oneline -6` → esperar los 5 feat + docs(sesion)
3. `git status --short` → solo los 2 icon-old untracked
4. `npm run check:secrets` (en apps/desktop) → exit 0, sin tokens reales

## B. Build canónico (5-10 min) — LA puerta que no se salta

En `apps\desktop`:

    npm run build

Esperado: exit 0, tres etapas completas:
  - `tsc -b` (renderer)
  - `vite build`
  - `tsc -p tsconfig.electron.json` (main)

OJO (pitfall conocido del repo): `npx tsc --noEmit` suelto NO alcanza — la config de
project references compila distinto. El check canónico es `npm run build` completo.

Si falla: correr `npm run build 2>&1 | Select-String -Pattern "error TS"` y reportar el
archivo+línea. NO parchear a ciegas: traer el error de vuelta.

## C. Suite de tests (2-5 min)

    npm test

Esperado: exit 0, suite completa verde. Con el paquete beta la suite es 324+ tests;
los tests nuevos de los commits del 02-ago deben aparecer y pasar:
  - tests/supportTicket.test.ts
  - tests/importLyrics.test.ts
  - tests/savedLines.test.ts
  - tests/appLogger.test.ts
  - tests/checkSecrets.test.ts

Si algún test falla: `npx vitest run <archivo> --reporter=verbose` para el detalle.

## D. Verificación del paquete instalable (10-20 min)

En `apps\desktop`:

    node scripts/verify-package.cjs

Esperado: exit 0 y checklist de lo que el instalador debe contener (docs
PRIVACIDAD_Y_DATOS.md + GUIA_BETA_PROFESORES.md, metadata del ejecutable,
smtc-dist autocontenido).

Luego:

    npm run dist

Esperado: instalador generado en `dist/` (NSIS .exe de 0.2.1-beta.1).

## E. Smoke manual en PC limpio (30 min, ideal)

Instalar el .exe en un PC SIN Singevery previo y verificar:

1. BetaWelcome aparece al primer arranque (onboarding)
2. autoStart está OFF por defecto (opción en Settings; NO arranca solo)
3. Importar letra propia: botón ↥ en ChromeTopBar → LRC/TXT local → se anota con
   furigana/romaji/kana automáticamente (romanizeTimedLyrics corre al importar)
4. Modos de lectura: original / furigana / romaji / furigana_romaji / kana
5. Traducción: T → debajo → lado a lado; la primera vez pide consentimiento
   explícito antes de enviar a proveedor externo (MyMemory); proveedor local
   (Ollama) NO pide consentimiento
6. Práctica de recuerdo: guardar línea difícil → exportar CSV → ocultar letra
   (concealed) no detiene el sync ni la entonación
7. Soporte: formulario de ticket genera ID y abre GitHub Issues (NO enviar ticket real)
8. Reconocimiento + sync con una canción real (Shazam/AudD) — la prueba de humo final
9. Cerrar y reabrir: modo de lectura, traducción y líneas guardadas persisten

## Resultado

Documentar aquí el resultado: fechas, exit codes, tests verdes, artefacto instalado.
Si todo pasa → marcar puerta C0 del plan comercial como COMPLETA (ver
ESTADO_IMPLEMENTACION_COMERCIAL.md) y proceder con IPA (docs/PLAN_IPA_2026-08-03.md).
