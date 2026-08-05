import { useState } from 'react';
import './ManualSearch.css';

interface ManualSearchProps {
  onClose: () => void;
  /** Prellenado con la pista actual (si hay) para corregir rápido. */
  initialTitle?: string;
  initialArtist?: string;
}

type SearchStatus = 'idle' | 'busy' | 'error';

/**
 * Búsqueda manual de canción (reemplaza al DebugLyricsInput).
 *
 * NO vive en el menú por defecto: se abre contextualmente cuando el
 * reconocimiento falla (la app escucha y no identifica) o cuando el usuario
 * señala que la canción mostrada no es la correcta ("✗ No es esta").
 *
 * Usa los IPC existentes:
 *  - loadLyrics(title, artist)  → carga letra por metadata (matchlog 'manual').
 *  - retryLyrics(title, artist) → reintenta la búsqueda limpiando la caché y
 *    preservando la posición/pausa actuales.
 */
export function ManualSearch({ onClose, initialTitle, initialArtist }: ManualSearchProps) {
  // Estado fresco en cada montaje: App monta el modal condicionalmente
  // ({manualSearchOpen && <ManualSearch/>}), así los valores iniciales
  // (pista actual) se aplican al abrir sin resetear en effects.
  const [title, setTitle] = useState(initialTitle ?? '');
  const [artist, setArtist] = useState(initialArtist ?? '');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const doSearch = async (useRetry: boolean): Promise<void> => {
    if (!window.api) return;
    const t = title.trim();
    const a = artist.trim();
    if (!t) {
      setStatus('error');
      setError('Escribe el título de la canción.');
      return;
    }
    setStatus('busy');
    setError(null);
    try {
      const result = useRetry ? await window.api.retryLyrics(t, a) : await window.api.loadLyrics(t, a);
      if (result.ok) {
        onClose();
      } else {
        setStatus('error');
        setError(result.error ?? 'No se encontró la letra.');
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Error al buscar la letra.');
    }
  };

  if (!window.api) return null;

  return (
    <div className="manual-search-overlay" onClick={onClose}>
      <div
        className="manual-search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar canción manualmente"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Buscar canción manualmente</h2>
        <p className="manual-search-sub">
          La app no reconoce bien la canción. Escríbela para buscar la letra.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doSearch(false);
          }}
        >
          <label>
            Título
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="p. ej. Bailando Solo"
              autoFocus
            />
          </label>
          <label>
            Artista (opcional)
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="p. ej. Los Bunkers"
            />
          </label>
          <div className="manual-search-actions">
            <button
              type="submit"
              className="manual-search-primary"
              disabled={status === 'busy'}
            >
              {status === 'busy' ? 'Buscando…' : 'Buscar letra'}
            </button>
            <button
              type="button"
              className="manual-search-secondary"
              disabled={status === 'busy'}
              onClick={() => void doSearch(true)}
              title="Reintenta identificar la canción desde el audio (preserva posición y pausa)"
            >
              Reintentar reconocimiento
            </button>
            <button
              type="button"
              className="manual-search-secondary"
              disabled={status === 'busy'}
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
          {status === 'error' && (
            <p className="manual-search-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
