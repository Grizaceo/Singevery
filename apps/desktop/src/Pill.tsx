import './Pill.css';

interface PillProps {
  /** Click en SING: expande la pill e inicia el reconocimiento. */
  onSing: () => void;
}

/**
 * Viñeta colapsada del widget: vive arriba de la pantalla como un botón "SING".
 * El contenedor es arrastrable (mueve la ventana); el botón SING es no-drag para
 * que el clic dispare el comando. Al hacer clic se expande y empieza a buscar
 * la canción que suena.
 */
export function Pill({ onSing }: PillProps) {
  return (
    <div className="pill" title="Arrastra para mover">
      <button
        type="button"
        className="pill-btn"
        onClick={onSing}
        title="SING — buscar la canción que suena"
        aria-label="SING — buscar la canción que suena"
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
      </button>
    </div>
  );
}
