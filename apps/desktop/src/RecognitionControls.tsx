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
  /** Hay canción en pantalla (model.status === 'DISPLAYING'). */
  hasTrack: boolean;
  /** Abre la búsqueda manual de canción. */
  onManualSearch: () => void;
}

/**
 * Controles de reconocimiento — presentacionales: el motor vive en el hook
 * useRecognition (una sola instancia en App) y llega por props.
 *
 * La búsqueda manual NO es parte del menú por defecto: aparece solo cuando
 * hay un problema real con el reconocimiento:
 *  - mientras se escucha sin canción en pantalla (la app no la reconoce),
 *    un botón "Buscar" permite forzar la búsqueda por título/artista;
 *  - cuando hay canción mostrada, un botón "No es esta" permite señalar que
 *    el reconocimiento falló (feedback wrong + buscador manual).
 */
export function RecognitionControls({ recognition, hasTrack, onManualSearch }: RecognitionControlsProps) {
  const { activeSource, hint, error, level, start, stop } = recognition;

  if (!window.api) {
    return null;
  }

  const localDisabled = activeSource !== null;

  const handleWrongTrack = (): void => {
    // Feedback wrong → el main fuerza re-identificación (matchlog).
    void window.api?.logMatchFeedback(false);
    // Y abre la búsqueda manual para corregir al tiro.
    onManualSearch();
  };

  return (
    <div className="recognition-controls">
      <button
        type="button"
        className={`chrome-button${activeSource === 'system' ? ' active' : ''}`}
        onClick={() => void start('system')}
        disabled={localDisabled}
        title="Captura el audio que suena en el sistema (altavoces)"
        aria-label="Capturar audio del sistema"
      >
        Sistema
      </button>
      <button
        type="button"
        className={`chrome-button${activeSource === 'microphone' ? ' active' : ''}`}
        onClick={() => void start('microphone')}
        disabled={localDisabled}
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
      {/* La app está escuchando/identificando sin lograr mostrar canción:
          ofrecer la vía manual de inmediato. */}
      {activeSource && !hasTrack && (
        <button
          type="button"
          className="chrome-button search-link"
          onClick={onManualSearch}
          title="La app no reconoce la canción — búscala por título/artista"
          aria-label="Buscar canción manualmente"
        >
          🔍 Buscar
        </button>
      )}
      {/* Hay canción en pantalla pero puede estar mal identificada:
          el usuario la señala y se abre el buscador manual. */}
      {hasTrack && (
        <button
          type="button"
          className="chrome-button wrong"
          onClick={handleWrongTrack}
          title="La canción mostrada no es la que suena — buscar manualmente"
          aria-label="Señalar que la canción no es la correcta y buscar"
        >
          ✗ No es esta
        </button>
      )}
      {hint && !error && <span className="recognition-hint">{hint}</span>}
      {error && <span className="recognition-error">{error}</span>}
    </div>
  );
}
