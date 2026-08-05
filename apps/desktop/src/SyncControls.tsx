import { useCallback, useEffect, useState } from 'react';
import type { Status } from './types';
import { useRenderModel } from './renderModelContext';
import './SyncControls.css';

const SYNCABLE_STATUSES: Set<Status> = new Set([
  'DISPLAYING',
  'FETCHING_LYRICS',
  'NO_LYRICS',
]);

/** Paso del ajuste por pista. 250ms: un desfase audible se corrige en pocos
 *  clics (con 100ms hacían falta demasiados para un retraso de ~1-2s). */
const OFFSET_STEP_MS = 250;

/**
 * Ajuste de sincronización, colapsado en un botón ⇄ para que la barra
 * inferior no crezca en altura (antes eran 3 filas de controles).
 * El ajuste fino por rueda del mouse vive en la barra completa (ChromeBottomBar);
 * este botón abre el panel con saltos de línea, offset por pista y calibración.
 */
export function SyncControls() {
  const model = useRenderModel();
  const hasLyrics = SYNCABLE_STATUSES.has(model.status);
  const [offsetMs, setOffsetMs] = useState(0);
  const [calibrationMs, setCalibrationMs] = useState(0);
  const [open, setOpen] = useState(false);

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

  if (!window.api) return null;

  return (
    <div className="sync-controls">
      <button
        type="button"
        className={`chrome-button sync-toggle${open ? ' active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title="Ajustar sincronización de la letra (saltos, offset, calibración). La rueda del mouse también ajusta el desfase."
        aria-label="Ajustar sincronización"
        aria-expanded={open}
      >
        ⇄
      </button>

      {open && (
        <section className="sync-panel" aria-label="Ajustes de sincronización">
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
            <span className="sync-label">línea</span>
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
            <span className="sync-label">offset</span>
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
            <span className="sync-label">calibración</span>
          </div>
        </section>
      )}
    </div>
  );
}
