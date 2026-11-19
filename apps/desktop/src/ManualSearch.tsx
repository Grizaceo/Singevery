import { useState } from 'react';
import { useT } from './i18n/useT';
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
  const t = useT();
  // Estado fresco en cada montaje: App monta el modal condicionalmente
  // ({manualSearchOpen && <ManualSearch/>}), así los valores iniciales
  // (pista actual) se aplican al abrir sin resetear en effects.
  const [title, setTitle] = useState(initialTitle ?? '');
  const [artist, setArtist] = useState(initialArtist ?? '');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const doSearch = async (useRetry: boolean): Promise<void> => {
    if (!window.api) return;
    const query = title.trim();
    const a = artist.trim();
    if (!query) {
      setStatus('error');
      setError(t('reading.search.errorTitle'));
      return;
    }
    setStatus('busy');
    setError(null);
    try {
      const result = useRetry ? await window.api.retryLyrics(query, a) : await window.api.loadLyrics(query, a);
      if (result.ok) {
        onClose();
      } else {
        setStatus('error');
        setError(result.error ?? t('reading.search.errorNotFound'));
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : t('reading.search.errorGeneric'));
    }
  };

  if (!window.api) return null;

  return (
    <div className="manual-search-overlay" onClick={onClose}>
      <div
        className="manual-search-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('reading.search.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t('reading.search.title')}</h2>
        <p className="manual-search-sub">
          {t('reading.search.subtitle')}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doSearch(false);
          }}
        >
          <label>
            {t('reading.search.titleLabel')}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('reading.search.titlePlaceholder')}
              autoFocus
            />
          </label>
          <label>
            {t('reading.search.artistLabel')}
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder={t('reading.search.artistPlaceholder')}
            />
          </label>
          <div className="manual-search-actions">
            <button
              type="submit"
              className="manual-search-primary"
              disabled={status === 'busy'}
            >
              {status === 'busy' ? t('reading.search.busy') : t('reading.search.submit')}
            </button>
            <button
              type="button"
              className="manual-search-secondary"
              disabled={status === 'busy'}
              onClick={() => void doSearch(true)}
              title={t('reading.search.retryTitle')}
            >
              {t('reading.search.retry')}
            </button>
            <button
              type="button"
              className="manual-search-secondary"
              disabled={status === 'busy'}
              onClick={onClose}
            >
              {t('reading.search.close')}
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
