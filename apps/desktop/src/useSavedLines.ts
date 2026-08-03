import { useCallback, useState } from 'react';
import type { RenderLine, RenderModel } from './types';

const STORAGE_KEY = 'singevery.saved-lines.v1';
const MAX_SAVED_LINES = 200;

export interface SavedLine {
  id: string;
  trackTitle: string;
  trackArtist: string;
  positionMs: number;
  text: string;
  reading?: string;
  translation?: string;
  savedAt: string;
}

function lineReading(line: RenderLine): string | undefined {
  const reading = line.romaji?.trim() || line.kana?.trim();
  return reading && reading !== line.text.trim() ? reading : undefined;
}

export function savedLineFromModel(model: RenderModel, now = new Date()): SavedLine | null {
  const text = model.current_line.text.trim();
  if (model.status !== 'DISPLAYING' || !text) return null;
  const trackTitle = model.track_title?.trim() || 'Pista sin título';
  const trackArtist = model.track_artist?.trim() || 'Artista desconocido';
  const positionMs = Math.max(0, model.current_line.start_ms ?? model.position_ms ?? 0);
  const id = [trackArtist, trackTitle, positionMs, text].join('\u001f').toLocaleLowerCase();
  return {
    id,
    trackTitle,
    trackArtist,
    positionMs,
    text,
    reading: lineReading(model.current_line),
    translation: model.current_line.translation?.trim() || undefined,
    savedAt: now.toISOString(),
  };
}

export function toggleSavedLine(lines: SavedLine[], candidate: SavedLine): SavedLine[] {
  if (lines.some((line) => line.id === candidate.id)) {
    return lines.filter((line) => line.id !== candidate.id);
  }
  return [candidate, ...lines].slice(0, MAX_SAVED_LINES);
}

function csvCell(value: string | number | undefined): string {
  const text = String(value ?? '');
  const formulaSafe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export function savedLinesToCsv(lines: SavedLine[]): string {
  const header = ['Artista', 'Canción', 'Posición (ms)', 'Letra', 'Lectura', 'Traducción', 'Guardada'];
  const rows = lines.map((line) =>
    [
      line.trackArtist,
      line.trackTitle,
      line.positionMs,
      line.text,
      line.reading,
      line.translation,
      line.savedAt,
    ]
      .map(csvCell)
      .join(','),
  );
  return `\uFEFF${[header.map(csvCell).join(','), ...rows].join('\r\n')}\r\n`;
}

function readSavedLines(): SavedLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (line): line is SavedLine =>
          typeof line === 'object' &&
          line !== null &&
          typeof (line as SavedLine).id === 'string' &&
          typeof (line as SavedLine).text === 'string',
      )
      .slice(0, MAX_SAVED_LINES);
  } catch {
    return [];
  }
}

function persist(lines: SavedLine[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // La colección sigue disponible durante la sesión si el storage falla.
  }
}

export function useSavedLines() {
  const [lines, setLines] = useState<SavedLine[]>(readSavedLines);

  const toggle = useCallback((candidate: SavedLine) => {
    setLines((current) => {
      const next = toggleSavedLine(current, candidate);
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setLines((current) => {
      const next = current.filter((line) => line.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return { lines, toggle, remove };
}
