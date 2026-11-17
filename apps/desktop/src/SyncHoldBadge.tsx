import { useEffect } from 'react';
import { useRenderModel } from './renderModelContext';
import './SyncHoldBadge.css';

interface SyncHoldBadgeProps {
  /** Avisa al App cuando el cursor está sobre la insignia (modo fantasma:
   *  la ventana es click-through y el hover es lo que la vuelve pulsable). */
  onHoverChange: (hovering: boolean) => void;
  /** Revela la chrome al acercar el cursor (como hace el handle). */
  onReveal: () => void;
}

/**
 * Insignia flotante del hold manual y de la letra sin sincronía.
 *
 * Vive FUERA de `.app-chrome` a propósito: debe verse (y ser pulsable) aunque
 * la barra de controles esté oculta por inactividad — es la única vía para
 * soltar el modo manual sin volver a mostrar toda la chrome. Por eso el CSS
 * propio reactiva pointer-events y -webkit-app-region: no-drag.
 */
export function SyncHoldBadge({ onHoverChange, onReveal }: SyncHoldBadgeProps) {
  const model = useRenderModel();
  const hold = model.sync_hold === true;
  const unsynced = model.status === 'DISPLAYING' && model.lyrics_synced === false;
  const visible = hold || unsynced;

  // Si la insignia desaparece con el cursor encima (p. ej. tras pulsar
  // "Sincronizar"), no debe quedar reportado un hover fantasma.
  useEffect(() => {
    if (!visible) onHoverChange(false);
    return () => onHoverChange(false);
  }, [visible, onHoverChange]);

  if (!window.api || !visible) return null;

  const driftMs = model.sync_hold_drift_ms;
  const driftText =
    hold && driftMs != null
      ? `la canción va ${driftMs >= 0 ? '+' : '−'}${Math.round(Math.abs(driftMs) / 1000)} s`
      : null;

  return (
    <div
      className="sync-hold-badge"
      onMouseEnter={() => {
        onHoverChange(true);
        onReveal();
      }}
      onMouseLeave={() => onHoverChange(false)}
    >
      {hold && (
        <>
          <button
            type="button"
            className="chrome-button sync-hold-resume"
            onClick={() => void window.api?.resumeSync()}
            title="Volver a seguir la canción automáticamente"
            aria-label="Volver a seguir la canción automáticamente"
          >
            Sincronizar
          </button>
          <span className="sync-hold-tag">manual</span>
          {driftText && <span className="sync-hold-drift">{driftText}</span>}
        </>
      )}
      {unsynced && (
        <span
          className="lyrics-unsynced-tag"
          title="Esta letra no trae tiempos por línea: el avance es aproximado. Puedes moverla con ◀/▶ y quedará fija hasta pulsar Sincronizar."
        >
          Letra sin sincronía
        </span>
      )}
    </div>
  );
}
