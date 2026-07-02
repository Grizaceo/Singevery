import { SILENCE_PEAK } from './audio/capture';
import type { RecognitionState } from './useRecognition';
import './RecognitionControls.css';

/** Medidor de nivel: 5 bloques llenados según el pico medido (0..1). */
function LevelMeter({ level }: { level: number }) {
  const filled = Math.round(Math.min(1, level * 4) * 5);
  return (
    <span
      className={`level-meter${level < SILENCE_PEAK ? ' silent' : ''}`}
      title={`Nivel de entrada: ${Math.round(level * 100)}%`}
      aria-label="Nivel de audio de entrada"
    >
      {'▰'.repeat(filled)}
      {'▱'.repeat(5 - filled)}
    </span>
  );
}

interface RecognitionControlsProps {
  recognition: RecognitionState;
}

/**
 * Controles de reconocimiento — ahora presentacionales: el motor vive en el
 * hook useRecognition (una sola instancia en App) y llega por props.
 */
export function RecognitionControls({ recognition }: RecognitionControlsProps) {
  const { activeSource, hint, error, level, start, stop } = recognition;

  if (!window.api) {
    return null;
  }

  return (
    <div className="recognition-controls">
      <button
        type="button"
        className={`chrome-button${activeSource === 'system' ? ' active' : ''}`}
        onClick={() => void start('system')}
        disabled={activeSource !== null}
        title="Captura el audio que suena en el sistema (altavoces)"
        aria-label="Capturar audio del sistema"
      >
        Sistema
      </button>
      <button
        type="button"
        className={`chrome-button${activeSource === 'microphone' ? ' active' : ''}`}
        onClick={() => void start('microphone')}
        disabled={activeSource !== null}
        title="Captura audio desde el micrófono"
        aria-label="Capturar micrófono"
      >
        Mic
      </button>
      {activeSource && (
        <button type="button" className="chrome-button stop" onClick={() => void stop()} aria-label="Detener reconocimiento">
          Stop
        </button>
      )}
      {activeSource && <LevelMeter level={level} />}
      {hint && !error && <span className="recognition-hint">{hint}</span>}
      {error && <span className="recognition-error">{error}</span>}
    </div>
  );
}