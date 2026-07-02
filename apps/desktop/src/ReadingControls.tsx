import type { ReadingMode } from './types';
import './ReadingControls.css';

interface Props {
  mode: ReadingMode;
  onChange: (mode: ReadingMode) => void;
  /** Si las letras cargadas tienen datos de furigana/romaji. */
  hasAnnotations?: boolean;
}

const OPTIONS: { key: ReadingMode; label: string; title: string; needsAnnotations: boolean }[] = [
  { key: 'original', label: '原', title: 'Original (sin lecturas)', needsAnnotations: false },
  { key: 'furigana', label: 'ふ', title: 'Furigana (kana sobre kanji)', needsAnnotations: true },
  { key: 'romaji', label: 'A', title: 'Romaji', needsAnnotations: true },
  { key: 'furigana_romaji', label: 'ふ+A', title: 'Furigana + romaji', needsAnnotations: true },
];

/** Selector del modo de lectura del teleprompter. */
export function ReadingControls({ mode, onChange, hasAnnotations = false }: Props) {
  return (
    <div className="reading-controls" title="Modo de lectura">
      {OPTIONS.map((opt) => {
        const unavailable = opt.needsAnnotations && !hasAnnotations;
        return (
          <button
            key={opt.key}
            type="button"
            className={[
              'chrome-button reading-btn',
              mode === opt.key ? 'active' : '',
              unavailable ? 'unavailable' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onChange(opt.key)}
            title={unavailable ? `${opt.title} — no disponible para esta canción` : opt.title}
            aria-label={opt.title}
            aria-pressed={mode === opt.key}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
