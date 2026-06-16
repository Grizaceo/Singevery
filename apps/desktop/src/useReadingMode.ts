import { useCallback, useEffect, useState } from 'react';
import type { ReadingMode } from './types';

const STORAGE_KEY = 'espejo.readingMode';
const VALID: ReadingMode[] = ['original', 'furigana', 'romaji', 'furigana_romaji'];

// Por defecto el modo más útil para rapear en japonés: kanji con furigana y
// romaji debajo.
const DEFAULT_MODE: ReadingMode = 'furigana_romaji';

function load(): ReadingMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ReadingMode | null;
    if (stored && VALID.includes(stored)) return stored;
  } catch {
    /* localStorage no disponible */
  }
  return DEFAULT_MODE;
}

/** Modo de lectura del teleprompter, persistido en localStorage. */
export function useReadingMode(): [ReadingMode, (mode: ReadingMode) => void] {
  const [mode, setMode] = useState<ReadingMode>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const set = useCallback((next: ReadingMode) => setMode(next), []);
  return [mode, set];
}
