import type { usePitchMonitor } from './usePitchMonitor';
import type { useMelodyReference } from './useMelodyReference';
import './PitchMonitor.css';

/**
 * Badge de práctica vocal (P0-P3 de SWAP-PITCH-001).
 *
 * La barra inferior muestra SOLO el botón ♪ (activar/detener) y los estados
 * que la columna lateral no cubre: captura de referencia en curso y errores.
 * La nota en vivo, el tono objetivo y el veredicto alto/bajo viven en la
 * columna de entonación junto a la letra (persistente en modo karaoke) —
 * repetirlos aquí era redundante.
 */
interface PitchMonitorBadgeProps {
  pitchMonitor: ReturnType<typeof usePitchMonitor>;
  melodyRef: ReturnType<typeof useMelodyReference>;
}

/** Texto de la guía de uso (P3) — aparece en el tooltip y al capturar. */
const GUIDE_TEXT =
  'Práctica vocal: canta y compara tu tono con la melodía de la canción. ' +
  'La referencia se obtiene automáticamente del audio del sistema (loopback) — NO usa tu micrófono: ' +
  'al activar ♪ se capturan ~24 s de la pista y se descartan los silencios; solo necesita que la canción esté sonando. ' +
  'Si está pausada, la app espera a que suene (hasta 30 s) y captura sola. ' +
  'Para mejor precisión al practicar: cuarto silencioso, micrófono a 15-30 cm, canta claro (no susurres). ' +
  'La referencia es una interpretación automática de la app, no la partitura oficial. ' +
  'Clic derecho en ♪: recapturar la referencia de esta canción.';

export function PitchMonitorBadge({ pitchMonitor, melodyRef }: PitchMonitorBadgeProps) {
  const { active, error, start, stop } = pitchMonitor;
  const { status: refStatus, error: refError, recapture } = melodyRef;

  const toggle = (): void => {
    if (active) stop();
    else void start();
  };

  const title = [
    GUIDE_TEXT,
    refError ? `\nError de referencia: ${refError}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className={`pitch-badge${active ? ' pitch-active' : ''}`} title={error ?? title}>
      <button
        type="button"
        className="chrome-button pitch-toggle"
        onClick={toggle}
        onContextMenu={(e) => {
          e.preventDefault();
          if (refStatus === 'ready') recapture();
        }}
        aria-pressed={active}
        title={error ?? (active ? 'Monitor de tono activo — clic para detener' : 'Práctica vocal (♪)')}
      >
        ♪
      </button>
      {/* Estados que NO viven en la columna lateral: captura en curso y errores. */}
      {refStatus === 'capturing' && (
        <span className="pitch-capturing" role="status">
          🎵 capturando referencia…
        </span>
      )}
      {error && (
        <span className="pitch-err" role="alert">
          ⚠ {error}
        </span>
      )}
      {refStatus === 'error' && refError && (
        <span className="pitch-err" role="alert">
          ⚠ {refError}
        </span>
      )}
    </div>
  );
}
