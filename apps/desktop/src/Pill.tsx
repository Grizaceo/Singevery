import './Pill.css';
import { useT } from './i18n/useT';

interface PillProps {
  /** Click en SING: expande la pill e inicia el reconocimiento. */
  onSing: () => void;
  /**
   * Canción ya reconocida mientras sigue como pastilla (apertura automática
   * desactivada): se indica con un punto y en el tooltip.
   */
  trackTitle?: string;
}

/**
 * Viñeta colapsada del widget: vive arriba de la pantalla como un botón "SING".
 * El contenedor es arrastrable (mueve la ventana); el botón SING es no-drag para
 * que el clic dispare el comando. Al hacer clic se expande y empieza a buscar
 * la canción que suena.
 */
export function Pill({ onSing, trackTitle }: PillProps) {
  const t = useT();
  const label = trackTitle
    ? t('chrome.pill.playing', { title: trackTitle })
    : t('chrome.pill.idle');
  return (
    <div className="pill" title={t('chrome.pill.dragTitle')}>
      <button
        type="button"
        className={trackTitle ? 'pill-btn has-track' : 'pill-btn'}
        onClick={onSing}
        title={label}
        aria-label={label}
      >
        <svg className="pill-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          {/* Nota musical simple (diseño propio). */}
          <path
            d="M9 17.5V6.2l9-2v9.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="6.6" cy="17.6" r="2.4" fill="currentColor" />
          <circle cx="15.6" cy="15.3" r="2.4" fill="currentColor" />
        </svg>
        <span className="pill-text">SING</span>
        {trackTitle && <span className="pill-track-dot" aria-hidden="true" />}
      </button>
    </div>
  );
}
