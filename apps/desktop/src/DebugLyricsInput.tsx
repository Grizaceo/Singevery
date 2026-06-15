import { useState, type KeyboardEvent } from 'react';
import './DebugLyricsInput.css';

export function DebugLyricsInput() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!import.meta.env.DEV) {
    return null;
  }

  const handleKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;

    const parts = value.split('/').map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setError('Formato: Título / Artista');
      return;
    }

    setError(null);
    const [title, artist] = parts;

    if (!window.api?.loadLyrics) {
      setError('API no disponible');
      return;
    }

    const result = await window.api.loadLyrics(title, artist);
    if (!result.ok) {
      setError(result.error ?? 'Error al cargar letra');
    }
  };

  return (
    <div className="debug-lyrics-input">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Bohemian Rhapsody / Queen"
        spellCheck={false}
      />
      {error && <span className="debug-lyrics-error">{error}</span>}
    </div>
  );
}
