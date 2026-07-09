import { useMemo, useState } from 'react';
import type { Status } from './types';

interface Props {
  status: Status;
  title?: string;
  artist?: string;
}

export function LyricsRescuePanel({ status, title = '', artist = '' }: Props) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftArtist, setDraftArtist] = useState(artist);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevTrack, setPrevTrack] = useState(`${artist}::${title}`);

  // Patrón "ajustar estado durante el render" (docs de React): al cambiar la
  // pista, resetear los borradores sin efecto (evita setState en useEffect).
  const trackKey = `${artist}::${title}`;
  if (trackKey !== prevTrack) {
    setPrevTrack(trackKey);
    setDraftTitle(title);
    setDraftArtist(artist);
    setError(null);
  }

  const visible = status === 'NO_LYRICS' || status === 'ERROR';
  const heading = useMemo(
    () => (status === 'ERROR' ? 'Falló la búsqueda de letra' : 'No se encontró una letra'),
    [status],
  );

  if (!visible) return null;

  const canSearch = draftTitle.trim().length > 0 && draftArtist.trim().length > 0;

  const run = async (kind: 'retry' | 'search') => {
    if (!window.api) return;
    if (kind === 'search' && !canSearch) {
      setError('Ingresa título y artista.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response =
        kind === 'retry'
          ? await window.api.retryLyrics(title, artist)
          : await window.api.loadLyrics(draftTitle.trim(), draftArtist.trim());
      if (!response.ok) setError(response.error ?? 'No se pudo buscar la letra.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lyrics-rescue-panel">
      <strong>{heading}</strong>
      <span className="lyrics-rescue-copy">
        Reintenta con más fuentes o corrige el título y artista para una búsqueda manual.
      </span>
      <div className="lyrics-rescue-actions">
        <button type="button" onClick={() => void run('retry')} disabled={busy || !title || !artist}>
          Reintentar
        </button>
        <input
          type="text"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder="Título"
          spellCheck={false}
          disabled={busy}
        />
        <input
          type="text"
          value={draftArtist}
          onChange={(event) => setDraftArtist(event.target.value)}
          placeholder="Artista"
          spellCheck={false}
          disabled={busy}
        />
        <button type="button" onClick={() => void run('search')} disabled={busy || !canSearch}>
          Buscar
        </button>
      </div>
      {error && <span className="lyrics-rescue-error">{error}</span>}
    </div>
  );
}
