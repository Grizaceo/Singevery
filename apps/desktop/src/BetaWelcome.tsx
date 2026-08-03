import { useState } from 'react';

interface BetaWelcomeProps {
  open: boolean;
  onDone: () => void;
  onOpenSettings: () => void;
}

export function BetaWelcome({ open, onDone, onOpenSettings }: BetaWelcomeProps) {
  const [guideError, setGuideError] = useState<string | null>(null);
  if (!open) return null;

  const openGuide = async (): Promise<void> => {
    const result = await window.api?.openBetaGuide();
    if (result && !result.ok) setGuideError(result.error ?? 'No se pudo abrir la guía beta');
  };

  return (
    <div className="beta-welcome-backdrop" role="presentation">
      <section className="beta-welcome" role="dialog" aria-modal="true" aria-labelledby="beta-title">
        <span className="beta-kicker">Beta para evaluación docente</span>
        <h1 id="beta-title">Bienvenido a Singevery</h1>
        <p>
          Esta versión sirve para probar letras sincronizadas, lectura, reconocimiento y apoyo de
          afinación. En una instalación nueva no escucha hasta que pulses <strong>SING</strong>.
        </p>
        <ol className="beta-steps">
          <li>
            <strong>Reproduce una canción</strong>
            <span>Pulsa SING para reconocer el audio del sistema.</span>
          </li>
          <li>
            <strong>Prueba voz y lectura</strong>
            <span>Activa el micrófono o el afinador sólo cuando quieras practicar.</span>
          </li>
          <li>
            <strong>Cuéntanos qué falla</strong>
            <span>Ajustes → Ayuda y beta prepara un ticket que tú revisas antes de enviar.</span>
          </li>
        </ol>
        <p className="beta-privacy">
          Los tickets y diagnósticos se guardan primero en tu equipo; no se suben automáticamente.
        </p>
        {guideError && <p className="beta-error" role="alert">{guideError}</p>}
        <div className="beta-actions">
          <button type="button" className="chrome-button" onClick={() => void openGuide()}>
            Abrir guía de prueba
          </button>
          <button type="button" className="chrome-button" onClick={onOpenSettings}>
            Ver ajustes
          </button>
          <button type="button" className="chrome-button beta-primary" onClick={onDone}>
            Empezar
          </button>
        </div>
      </section>
    </div>
  );
}
