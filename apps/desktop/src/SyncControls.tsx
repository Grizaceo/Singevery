import { useCallback, useEffect, useState } from 'react';
import type { Status } from './types';
import { useRenderModel } from './renderModelContext';
import { useT } from './i18n/useT';
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
  const t = useT();
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
      {model.sync_hold && (
        // Modo manual activo (moviste la línea con ◀/▶ o la rueda): la letra
        // no se mueve sola hasta pulsar aquí. Vive en la barra para no
        // estorbar en pantalla cuando la barra está oculta.
        <button
          type="button"
          className="chrome-button sync-resume"
          onClick={() => void window.api?.resumeSync()}
          title={t('app.sync.resumeTitle')}
          aria-label={t('app.sync.resumeAria')}
        >
          {t('app.sync.resume')}
        </button>
      )}
      <button
        type="button"
        className={`chrome-button sync-toggle${open ? ' active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title={t('app.sync.toggleTitle')}
        aria-label={t('app.sync.toggleAria')}
        aria-expanded={open}
      >
        ⇄
      </button>

      {open && (
        <section className="sync-panel" aria-label={t('app.sync.panelAria')}>
          <div className="sync-row">
            <button
              type="button"
              className="chrome-button sync-btn seek"
              onClick={() => void seekLine(-1)}
              disabled={!hasLyrics}
              title={t('app.sync.prevLine')}
              aria-label={t('app.sync.prevLine')}
            >
              ◀
            </button>
            <button
              type="button"
              className="chrome-button sync-btn seek"
              onClick={() => void seekLine(1)}
              disabled={!hasLyrics}
              title={t('app.sync.nextLine')}
              aria-label={t('app.sync.nextLine')}
            >
              ▶
            </button>
            <span className="sync-label">{t('app.sync.lineLabel')}</span>
          </div>

          <div className="sync-row offset-row">
            <button
              type="button"
              className="chrome-button sync-btn offset-adj"
              onClick={() => void adjustOffset(-OFFSET_STEP_MS)}
              disabled={!hasLyrics}
              title={t('app.sync.delayTitle', { ms: OFFSET_STEP_MS })}
              aria-label={t('app.sync.delayAria')}
            >
              −
            </button>
            <span className="sync-offset-label" title={t('app.sync.offsetTitle')}>
              {offsetMs === 0 ? '0' : `${offsetMs > 0 ? '+' : ''}${offsetMs}`}
            </span>
            <button
              type="button"
              className="chrome-button sync-btn offset-adj"
              onClick={() => void adjustOffset(OFFSET_STEP_MS)}
              disabled={!hasLyrics}
              title={t('app.sync.advanceTitle', { ms: OFFSET_STEP_MS })}
              aria-label={t('app.sync.advanceAria')}
            >
              +
            </button>
            {offsetMs !== 0 && (
              <button
                type="button"
                className="chrome-button sync-btn offset-apply-all"
                onClick={() => void applyToAll()}
                title={t('app.sync.applyAllTitle')}
                aria-label={t('app.sync.applyAllAria')}
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
              title={t('app.sync.decreaseCalibTitle', { ms: 50 })}
              aria-label={t('app.sync.decreaseCalibAria')}
            >
              −
            </button>
            <span className="sync-offset-label calibration-label" title={t('app.sync.calibTitle')}>
              {calibrationMs === 0 ? '0' : `${calibrationMs > 0 ? '+' : ''}${calibrationMs}`}cal
            </span>
            <button
              type="button"
              className="chrome-button sync-btn offset-adj"
              onClick={() => void adjustCalibration(50)}
              disabled={!hasLyrics}
              title={t('app.sync.increaseCalibTitle', { ms: 50 })}
              aria-label={t('app.sync.increaseCalibAria')}
            >
              +
            </button>
            <span className="sync-label">{t('app.sync.calibrationLabel')}</span>
          </div>
        </section>
      )}
    </div>
  );
}
