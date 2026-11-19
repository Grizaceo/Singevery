import type { usePitchMonitor } from './usePitchMonitor';
import type { useMelodyReference } from './useMelodyReference';
import { useT } from './i18n/useT';
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

export function PitchMonitorBadge({ pitchMonitor, melodyRef }: PitchMonitorBadgeProps) {
  const t = useT();
  const { active, error, start, stop } = pitchMonitor;
  const { status: refStatus, error: refError, recapture, needsCapture } = melodyRef;

  const toggle = (): void => {
    if (active) stop();
    else void start();
  };

  /** Texto de la guía de uso (P3) — aparece en el tooltip y al capturar. */
  const guideText = t('practice.guide');

  const title = [
    guideText,
    refError ? `\n${t('practice.refErrorLabel', { error: refError })}` : null,
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
        title={error ?? (active ? t('practice.pitchMonitorActive') : t('practice.vocalPractice'))}
      >
        ♪
      </button>
      {/* Estados que NO viven en la columna lateral: captura en curso, errores
          y el aviso de primera vez (canción sin referencia guardada). */}
      {refStatus === 'capturing' && (
        <span className="pitch-capturing" role="status">
          🎵 {t('practice.capturingReference')}
        </span>
      )}
      {!active && needsCapture && refStatus !== 'capturing' && (
        <span className="pitch-first" role="status">
          🎤 {t('practice.firstTimeCapture')}
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
