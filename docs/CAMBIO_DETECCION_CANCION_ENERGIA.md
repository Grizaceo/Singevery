# Detección de cambio de canción por energía (P1)

Commit: `67288e3` — autor: DAVI para Cristóbal (beta 0.2.1)

## Qué hacía antes (el síntoma)

En modo seguimiento, la app re-identificaba la canción cada `~18s`
(6s de captura + 1.5s de red + 12s de pausa `RESYNC_PAUSE_MS`). Al cambiar de
tema, AudD se enteraba recién en el siguiente ciclo, y encima la histéresis
exigía 2 confirmaciones (o 5 si SMTC seguía afirmando la canción vieja).
Resultado: 18–90s de "la letra sigue mostrando la canción anterior".

## Qué hace ahora

`reportAudioWindow` (que ya corría sobre cada chunk capturado) detecta cuándo
**el patrón vocal del audio ya no se alinea con la letra mostrada**:

- Confianza de correlación < `ENERGY_SYNC_MIN_CONFIDENCE` (0.35) **y**
  pico < 0.35 → la letra no responde al audio en ningún desplazamiento.
- O el desfase "mejor" supera `ENERGY_SYNC_MAX_CORRECTION_MS` → ni desplazando
  todo coincide.

En cualquiera de esos casos dispara `command:resync` (con throttle de 10s):
el renderer **corta la espera de 12s y re-identifica de inmediato**. La
detección del cambio de tema baja de decenas de segundos a unos pocos.

Guarda doble: **no** dispara sin letra en pantalla ni con pista provisional.
Si AudD reconfirma la misma canción (estribillo repetido / ambigüedad), el
resync es inofensivo: vuelve a `applyMatch`, confirma la misma pista y solo
re-ancla.

## Archivos tocados

- `apps/desktop/electron/core/stateStore.ts` — nuevo `maybeRequestResyncOnMiss`
  + invocación al inicio del bloque de medición de `reportAudioWindow`.
- `apps/desktop/tests/energySyncPipeline.test.ts` — 4 tests nuevos.

## Verificación

- `npx vitest run` → **612 tests, 0 fallos** (4 nuevos).
- `npx tsc -p tsconfig.electron.json --noEmit` → limpio.
- `npx tsc -b --noEmit` → limpio.
- `npm run lint` → limpio. `npm run check:secrets` → OK.

## Qué NO cambié (decisión deliberada)

- **`SINGEVERY_ENERGY_SYNC=1`** (recalibrado fino que MUEVE la letra) queda
  apagado por defecto. Es la parte más arriesgada (mover la letra en vivo con
  música real) y NO es el síntoma reportado; se puede encender con la variable
  de entorno si tras probar el profe hace falta corregir deriva fina.
- **P0** (bajar el lock de 5 strikes cuando SMTC contradice) se pospone hasta
  medir con `/debug`; el P1 ya ataca la demora que Cristóbal confirmó.

## Cómo revertir

```bash
git revert 67288e3
```

Revierte los 2 archivos, deja 612→608 tests y vuelve al comportamiento
anterior. Alternativa manual: `git checkout 6b58140 -- apps/desktop/electron/core/stateStore.ts apps/desktop/tests/energySyncPipeline.test.ts`

## Cómo probar con música real

1. `npm run dev:electron` (Windows).
2. Inicia SING en modo "audio del sistema".
3. Reproduce una canción A; espera a que cargue la letra y se sincronice.
4. Cambia a una canción B (con letra distinta).
5. Antes: la letra tardaba hasta ~30-40s en cambiar.
   Ahora: debería detectarse en ~6-8s (el resync corta la pausa de 12s).
6. En la consola del main deberías ver:
   `[energía] el audio no se alinea con la letra mostrada (... ) → re-identificando`

**Veredicto de la prueba:** si el cambio fue más rápido y estable → mergear para
la entrega; si no mejoró o se ve raro → `git revert 67288e3`.