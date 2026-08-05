import { useMemo } from 'react';
import { matchWindow } from './audio/compare';
import type { usePitchMonitor } from './usePitchMonitor';
import type { useMelodyReference } from './useMelodyReference';
import './PitchMonitor.css';

/**
 * Badge de práctica vocal (P0-P3 de SWAP-PITCH-001).
 *
 * Recibe el monitor de pitch y la referencia melódica como props (App los
 * levanta para compartirlos con la columna de entonación del teleprompter).
 *
 * - P0: monitor de pitch del micrófono en vivo (nota + cents).
 * - P1: referencia melódica extraída de la PROPIA canción (loopback) — la app
 *   avisa que es una interpretación automática, no la partitura oficial.
 * - P2: score contra la referencia (ventana deslizante, ±50 cents).
 * - P3: guía de uso — la referencia se captura SIN cantar (30 s de loopback)
 *   y en ambiente silencioso; el micrófono integrado alcanza.
 */
interface PitchMonitorBadgeProps {
  pitchMonitor: ReturnType<typeof usePitchMonitor>;
  melodyRef: ReturnType<typeof useMelodyReference>;
}

/** Texto de la guía de uso (P3) — aparece en el tooltip y al capturar. */
const GUIDE_TEXT =
  'Práctica vocal: canta y compara tu tono con la melodía de la canción. ' +
  'La referencia es una interpretación automática de la app, no la partitura oficial. ' +
  'Para mejor precisión: cuarto silencioso, micrófono a 15-30 cm, canta claro (no susurres). ' +
  'La primera vez por canción se capturan ~24 s de la pista como referencia (descarta silencios) — reproduce la canción y no cantes durante la captura.';

export function PitchMonitorBadge({ pitchMonitor, melodyRef }: PitchMonitorBadgeProps) {
  const { active, pitch, error, window: pitchWindow, start, stop } = pitchMonitor;
  const { reference, status: refStatus, error: refError, recapture } = melodyRef;

  const toggle = (): void => {
    if (active) stop();
    else void start();
  };

  // Score contra la referencia (P2): ventana de pitch del usuario vs melodía.
  const match = useMemo(() => {
    if (!active || !reference || pitchWindow.length < 5) return null;
    return matchWindow(pitchWindow, reference, { toleranceCents: 50, maxOffsetMs: 20000 });
  }, [active, reference, pitchWindow]);

  const score = match ? Math.round(match.score * 100) : null;

  // Desviación: >0 = agudo, <0 = grave. Solo se pinta si hay nota.
  const centsLabel = pitch ? `${pitch.cents > 0 ? '+' : ''}${pitch.cents}¢` : null;
  const onKey = pitch && Math.abs(pitch.cents) <= 50;

  const statusLabel =
    refStatus === 'capturing'
      ? '🎵 capturando referencia…'
      : refStatus === 'error'
        ? '⚠ referencia no disponible'
        : refStatus === 'ready' && active
          ? score != null
            ? `afinación ${score}%`
            : 'escuchando…'
          : null;

  const title = [
    GUIDE_TEXT,
    refError ? `\nError de referencia: ${refError}` : null,
    refStatus === 'ready' ? '\nClic derecho: recapturar referencia' : null,
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
      {/* Error del monitor VISIBLE (no solo tooltip): si el ♪ no arranca, el
          usuario debe ver por qué (permiso denegado, micrófono no disponible). */}
      {error && (
        <span className="pitch-err" role="alert">
          ⚠ {error}
        </span>
      )}
      {!error && active && (
        <span className={`pitch-readout${onKey ? ' pitch-on-key' : ''}`}>
          {pitch ? (
            <>
              <strong>{pitch.note}</strong>
              <span className="pitch-cents">{centsLabel}</span>
            </>
          ) : (
            <span className="pitch-none">—</span>
          )}
          {score != null && (
            <span className={`pitch-score${score >= 70 ? ' pitch-score-good' : ''}`}>
              {statusLabel}
            </span>
          )}
          {refStatus === 'capturing' && <span className="pitch-capturing">{statusLabel}</span>}
          {refStatus === 'error' && <span className="pitch-err">{statusLabel}</span>}
        </span>
      )}
    </div>
  );
}
