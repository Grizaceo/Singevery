import { useRenderModel } from './renderModelContext';
import { useT } from './i18n/useT';
import './SyncHoldBadge.css';

/**
 * Indicador discreto del hold manual y de la letra sin sincronía.
 *
 * Es SOLO informativo: no recibe clics (pointer-events: none) y se ve tenue
 * en una esquina. La primera versión era una píldora oscura con el botón
 * "Sincronizar" al centro de la pantalla, que robaba atención y además
 * capturaba los clics de la app de atrás mientras durara el modo manual
 * (feedback del usuario, 17-11). El botón para volver a sincronizar vive
 * ahora en la barra inferior (SyncControls), que aparece al pasar el mouse.
 */
export function SyncHoldBadge() {
  const t = useT();
  const model = useRenderModel();
  const hold = model.sync_hold === true;
  const unsynced = model.status === 'DISPLAYING' && model.lyrics_synced === false;
  if (!hold && !unsynced) return null;

  const driftMs = model.sync_hold_drift_ms;
  const driftText =
    hold && driftMs != null
      ? `${driftMs >= 0 ? '+' : '−'}${Math.round(Math.abs(driftMs) / 1000)} s`
      : null;

  return (
    <div className="sync-hold-badge" aria-live="polite">
      {hold && (
        <span className="sync-hold-tag" title={t('app.syncHold.manualTitle')}>
          {t('app.syncHold.manual')}{driftText ? ` · ${driftText}` : ''}
        </span>
      )}
      {unsynced && <span className="lyrics-unsynced-tag">{t('app.syncHold.unsynced')}</span>}
    </div>
  );
}
