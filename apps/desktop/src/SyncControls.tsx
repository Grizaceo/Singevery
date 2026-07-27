import { useCallback, useEffect, useState } from 'react';
import type { Status } from './types';
import { useRenderModel } from './renderModelContext';
import './SyncControls.css';

const SYNCABLE_STATUSES: Set<Status> = new Set([
  'DISPLAYING',
  'FETCHING_LYRICS',
  'NO_LYRICS',
]);

const NUDGE_WHEEL_MS = 1000;
/** Paso del ajuste por pista. 250ms: un desfase audible se corrige en pocos
 *  clics (con 100ms hacían falta demasiados para un retraso de ~1-2s). */
const OFFSET_STEP_MS = 250;

export function SyncControls() {
  const model = useRenderModel();
  const hasLyrics = SYNCABLE_STATUSES.has(model.status);
  const [offsetMs, setOffsetMs] = useState(0);
  const [calibrationMs, setCalibrationMs] = useState(0);

  useEffect(() => {
    if (!window.api) return;
    window.api.getSyncOffset().then((r) => {
      if (r.ok) setOffsetMs(r.offsetMs);
    });
    window.api.getSyncCalibration().then((r) => {
      if (r.ok) setCalibrationMs(r.offsetMs);
    });
  }, []);

  const seekLine = useCallback(async (direction: -1 | 1) => {
    if (!window.api) return;
    await window.api.seekLine(direction);
  }, []);

  const nudgeSync = useCallback(async (deltaMs: number) => {
    if (!window.api) return;
    await window.api.nudgeSync(deltaMs);
  }, []);

  const adjustOffset = useCallback(async (deltaMs: number) => {
    if (!window.api) return;
    const result = await window.api.adjustSyncOffset(deltaMs);
    if (result.ok) setOffsetMs(result.offsetMs);
  }, []);

  const adjustCalibration = useCallback(async (deltaMs: number) => {
    if (!window.api) return;
    const result = await window.api.adjustSyncCalibration(deltaMs);
    if (result.ok) setCalibrationMs(result.offsetMs);
  }, []);

  const applyToAll = useCallback(async () => {
    if (!window.api?.applyOffsetToAllTracks) return;
    const result = await window.api.applyOffsetToAllTracks();
    if (result.ok) {
      setCalibrationMs(result.calibrationMs);
      setOffsetMs(result.offsetMs);
    }
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault?.();
      const delta = e.deltaY < 0 ? NUDGE_WHEEL_MS : -NUDGE_WHEEL_MS;
      void nudgeSync(delta);
    },
    [nudgeSync],
  );

  if (!window.api) return null;

  return (
    <div className="sync-controls" onWheel={handleWheel}>
      <div className="sync-row">
        <button
          type="button"
          className="chrome-button sync-btn seek"
          onClick={() => void seekLine(-1)}
          disabled={!hasLyrics}
          title="Retroceder una línea"
          aria-label="Retroceder una línea"
        >
          ◀
        </button>
        <button
          type="button"
          className="chrome-button sync-btn seek"
          onClick={() => void seekLine(1)}
          disabled={!hasLyrics}
          title="Adelantar una línea"
          aria-label="Adelantar una línea"
        >
          ▶
        </button>
      </div>

      <div className="sync-row offset-row">
        <button
          type="button"
          className="chrome-button sync-btn offset-adj"
          onClick={() => void adjustOffset(-OFFSET_STEP_MS)}
          disabled={!hasLyrics}
          title={`Atrasar letra ${OFFSET_STEP_MS}ms (esta pista)`}
          aria-label="Atrasar letra"
        >
          −
        </button>
        <span className="sync-offset-label" title="Offset de sincronización (esta pista)">
          {offsetMs === 0 ? '0' : `${offsetMs > 0 ? '+' : ''}${offsetMs}`}
        </span>
        <button
          type="button"
          className="chrome-button sync-btn offset-adj"
          onClick={() => void adjustOffset(OFFSET_STEP_MS)}
          disabled={!hasLyrics}
          title={`Adelantar letra ${OFFSET_STEP_MS}ms (esta pista)`}
          aria-label="Adelantar letra"
        >
          +
        </button>
        {offsetMs !== 0 && (
          <button
            type="button"
            className="chrome-button sync-btn offset-apply-all"
            onClick={() => void applyToAll()}
            title="Este desfase pasa en todas las canciones: aplicarlo de forma global para que las próximas ya salgan sincronizadas"
            aria-label="Aplicar este ajuste a todas las canciones"
          >
            ⇈
          </button>
        )}
      </div>

      <div className="sync-row offset-row calibration-row">
        <button
          type="button"
          className="chrome-button sync-btn offset-adj"
          onClick={() => void adjustCalibration(-50)}
          disabled={!hasLyrics}
          title="Reducir calibración global 50ms"
          aria-label="Reducir calibración"
        >
          −
        </button>
        <span className="sync-offset-label calibration-label" title="Calibración global de latencia">
          {calibrationMs === 0 ? '0' : `${calibrationMs > 0 ? '+' : ''}${calibrationMs}`}cal
        </span>
        <button
          type="button"
          className="chrome-button sync-btn offset-adj"
          onClick={() => void adjustCalibration(50)}
          disabled={!hasLyrics}
          title="Aumentar calibración global 50ms"
          aria-label="Aumentar calibración"
        >
          +
        </button>
      </div>
    </div>
  );
}
