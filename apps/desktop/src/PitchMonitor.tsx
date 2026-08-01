import { usePitchMonitor } from './usePitchMonitor';
import './PitchMonitor.css';

/**
 * Badge de práctica vocal (P0 de SWAP-PITCH-001).
 *
 * Botón que activa el monitor de pitch del micrófono. Cuando está activo,
 * muestra la nota cantada en vivo (A4, C4, ...) con la desviación en cents.
 * Sin señal clara muestra "—" (silencio/ruido/susurro).
 *
 * La referencia melódica de la canción es P1; esto es solo el pitch del
 * usuario, para validar que el micrófono integrado alcanza.
 */
export function PitchMonitorBadge() {
  const { active, pitch, error, start, stop } = usePitchMonitor();

  const toggle = (): void => {
    if (active) stop();
    else void start();
  };

  // Desviación: >0 = agudo, <0 = grave. Solo se pinta si hay nota.
  const centsLabel = pitch ? `${pitch.cents > 0 ? '+' : ''}${pitch.cents}¢` : null;
  const onKey = pitch && Math.abs(pitch.cents) <= 50;

  return (
    <div className={`pitch-badge${active ? ' pitch-active' : ''}`} title={error ?? undefined}>
      <button
        type="button"
        className="chrome-button pitch-toggle"
        onClick={toggle}
        aria-pressed={active}
        title={
          error ??
          (active
            ? 'Monitor de tono activo — canta y mira tu nota. Clic para detener'
            : 'Práctica vocal: detecta tu tono con el micrófono (P0)')
        }
      >
        ♪
      </button>
      {active && (
        <span className={`pitch-readout${onKey ? ' pitch-on-key' : ''}`}>
          {pitch ? (
            <>
              <strong>{pitch.note}</strong>
              <span className="pitch-cents">{centsLabel}</span>
            </>
          ) : (
            <span className="pitch-none">—</span>
          )}
        </span>
      )}
    </div>
  );
}
