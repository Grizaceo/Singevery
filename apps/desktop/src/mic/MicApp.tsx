import { useRemoteMic } from './useRemoteMic';
import './mic.css';

export function MicApp() {
  const { active, connected, hint, error, level, start, stop } = useRemoteMic();

  const filled = Math.round(Math.min(1, level * 4) * 5);

  return (
    <div className="mic-root">
      <header className="mic-header">
        <h1>Singevery Mic</h1>
        <p>Micrófono remoto para el PC en la misma red WiFi.</p>
      </header>

      <div className="mic-status">
        <span className={`mic-dot${connected || active ? ' online' : ''}`} />
        {active ? 'Transmitiendo al PC' : connected ? 'Conectado' : 'Desconectado'}
      </div>

      <div className="mic-meter" aria-label="Nivel de audio">
        {'▰'.repeat(filled)}
        {'▱'.repeat(5 - filled)}
      </div>

      {hint && !error && <p className="mic-hint">{hint}</p>}
      {error && <p className="mic-error">{error}</p>}

      <div className="mic-actions">
        {!active ? (
          <button type="button" className="mic-btn primary" onClick={() => void start()}>
            Empezar a escuchar
          </button>
        ) : (
          <button type="button" className="mic-btn stop" onClick={stop}>
            Detener
          </button>
        )}
      </div>

      <footer className="mic-footer">
        <p>
          La primera vez, acepta el certificado autofirmado del PC (HTTPS). Mantén el teléfono cerca de
          los parlantes si la música suena en otra habitación.
        </p>
      </footer>
    </div>
  );
}
