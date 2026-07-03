import React, { useMemo, useRef, useState } from 'react';
import type { ReadingMode } from './types';
import type { ScriptHint } from './scriptDetect';
import './ReadingControls.css';

interface Props {
  mode: ReadingMode;
  onChange: (mode: ReadingMode) => void;
  /** Si las letras cargadas tienen datos de furigana/romaji/kana. */
  hasAnnotations?: boolean;
  scriptHint?: ScriptHint;
  showTranslation?: boolean;
  onTranslationChange?: (enabled: boolean) => void;
  translationLoading?: boolean;
  translationError?: string | null;
  onOpenSettings?: () => void;
}

interface ModeOption {
  key: ReadingMode;
  label: string;
  title: string;
  needsAnnotations: boolean;
  scripts?: ScriptHint[];
}

const JAPANESE_OPTIONS: ModeOption[] = [
  { key: 'original', label: '原', title: 'Original (kanji/kana sin ayudas)', needsAnnotations: false },
  {
    key: 'kana',
    label: 'か',
    title: 'Kana (todo en hiragana — ideal si aún no lees kanji)',
    needsAnnotations: true,
    scripts: ['japanese'],
  },
  {
    key: 'furigana',
    label: 'ふ',
    title: 'Furigana (hiragana encima de kanji, no es romaji)',
    needsAnnotations: true,
  },
  { key: 'romaji', label: 'A', title: 'Romaji (latín debajo del japonés)', needsAnnotations: true },
  {
    key: 'furigana_romaji',
    label: 'ふ+A',
    title: 'Furigana + romaji (kanji con kana arriba y latín abajo)',
    needsAnnotations: true,
  },
];

const GENERIC_OPTIONS: ModeOption[] = [
  { key: 'original', label: 'Orig', title: 'Original (sin lecturas)', needsAnnotations: false },
  {
    key: 'furigana',
    label: 'Ruby',
    title: 'Ruby (lectura encima: pinyin, romanización, etc.)',
    needsAnnotations: true,
  },
  { key: 'romaji', label: 'A', title: 'Romanización latina', needsAnnotations: true },
  {
    key: 'furigana_romaji',
    label: 'R+A',
    title: 'Ruby + romanización latina',
    needsAnnotations: true,
  },
];

const HELP_EXAMPLES: Record<ScriptHint, { title: string; rows: { label: string; sample: React.ReactNode }[] }> = {
  japanese: {
    title: 'Modos de lectura (japonés)',
    rows: [
      {
        label: 'Original',
        sample: (
          <>
            <ruby>
              私
              <rt>わたし</rt>
            </ruby>
            は一人
          </>
        ),
      },
      { label: 'Kana', sample: 'わたしはひとり' },
      { label: 'Furigana', sample: <>私 con わたし encima del kanji</> },
      { label: 'Romaji', sample: 'watashi wa hitori' },
    ],
  },
  korean: {
    title: 'Modos de lectura (coreano)',
    rows: [
      { label: 'Original', sample: '안녕하세요' },
      { label: 'Ruby', sample: <>안녕하세요 con annyeonghaseyo encima</> },
      { label: 'Romanización', sample: 'annyeonghaseyo' },
    ],
  },
  chinese: {
    title: 'Modos de lectura (chino)',
    rows: [
      { label: 'Original', sample: '你好' },
      { label: 'Ruby', sample: <>你 con nǐ encima</> },
      { label: 'Pinyin', sample: 'ni hao' },
    ],
  },
  cyrillic: {
    title: 'Modos de lectura (ruso/cirílico)',
    rows: [
      { label: 'Original', sample: 'Привет' },
      { label: 'Ruby', sample: <>Привет con Privet encima</> },
      { label: 'Romanización', sample: 'Privet' },
    ],
  },
  other: {
    title: 'Modos de lectura',
    rows: [
      { label: 'Original', sample: 'Texto original' },
      { label: 'Ruby', sample: 'Lectura latina encima cuando es posible' },
      { label: 'Romanización', sample: 'Transliteración latina' },
    ],
  },
  latin: {
    title: 'Modos de lectura',
    rows: [
      { label: 'Original', sample: 'Letra tal cual' },
      { label: 'Nota', sample: 'En idiomas latinos no hay ruby ni romanización' },
    ],
  },
};

/** Selector del modo de lectura del teleprompter. */
export function ReadingControls({
  mode,
  onChange,
  hasAnnotations = false,
  scriptHint = 'latin',
  showTranslation = false,
  onTranslationChange,
  translationLoading = false,
  translationError,
  onOpenSettings,
}: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const base = scriptHint === 'japanese' ? JAPANESE_OPTIONS : GENERIC_OPTIONS;
    return base.filter((opt) => !opt.scripts || opt.scripts.includes(scriptHint));
  }, [scriptHint]);

  const help = HELP_EXAMPLES[scriptHint] ?? HELP_EXAMPLES.other;

  return (
    <div className="reading-controls-wrap">
      <div className="reading-controls" title="Modo de lectura">
        {options.map((opt) => {
          const unavailable = opt.needsAnnotations && !hasAnnotations;
          return (
            <button
              key={opt.key}
              type="button"
              className={[
                'chrome-button reading-btn',
                mode === opt.key ? 'active' : '',
                unavailable ? 'unavailable' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChange(opt.key)}
              title={unavailable ? `${opt.title} — no disponible para esta canción` : opt.title}
              aria-label={opt.title}
              aria-pressed={mode === opt.key}
            >
              {opt.label}
            </button>
          );
        })}

        {onTranslationChange && (
          <button
            type="button"
            className={[
              'chrome-button reading-btn reading-btn-translate',
              showTranslation ? 'active' : '',
              translationLoading ? 'loading' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onTranslationChange(!showTranslation)}
            title={
              translationError ??
              (translationLoading ? 'Traduciendo…' : 'Mostrar traducción de la línea actual')
            }
            aria-label="Traducción"
            aria-pressed={showTranslation}
            disabled={translationLoading}
          >
            T
          </button>
        )}

        <button
          type="button"
          className={`chrome-button reading-btn reading-btn-help${helpOpen ? ' active' : ''}`}
          onClick={() => setHelpOpen((v) => !v)}
          title="Ayuda sobre modos de lectura"
          aria-label="Ayuda modos de lectura"
          aria-expanded={helpOpen}
        >
          ?
        </button>
      </div>

      {helpOpen && (
        <div className="reading-help-popover" ref={helpRef} role="dialog" aria-label={help.title}>
          <strong>{help.title}</strong>
          <ul>
            {help.rows.map((row) => (
              <li key={row.label}>
                <span className="reading-help-label">{row.label}</span>
                <span className="reading-help-sample">{row.sample}</span>
              </li>
            ))}
          </ul>
          {scriptHint === 'japanese' && (
            <p className="reading-help-link">
              Repasa tus kanas en{' '}
              <a
                href="https://www.tofugu.com/japanese/learn-hiragana/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Tofugu — Learn Hiragana
              </a>
            </p>
          )}
          {translationError && onOpenSettings && (
            <p className="reading-help-error">
              {translationError}{' '}
              <button type="button" className="reading-help-settings-link" onClick={onOpenSettings}>
                Configurar API key
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
