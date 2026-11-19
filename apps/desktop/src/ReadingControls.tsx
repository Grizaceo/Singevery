import React, { useMemo, useRef, useState } from 'react';
import type { IpaInfo, ReadingMode, TranslationView } from './types';
import type { ScriptHint } from './scriptDetect';
import { useT } from './i18n/useT';
import type { MessageKey } from './i18n';
import './ReadingControls.css';

interface Props {
  mode: ReadingMode;
  onChange: (mode: ReadingMode) => void;
  /** Si las letras cargadas tienen datos de furigana/romaji/kana. */
  hasAnnotations?: boolean;
  scriptHint?: ScriptHint;
  translationView?: TranslationView;
  onTranslationViewChange?: (view: TranslationView) => void;
  translationLoading?: boolean;
  translationError?: string | null;
  onOpenSettings?: () => void;
  /** F5: mostrar los botones de modo de lectura (原 か ふ A IPA…). */
  showReadingModes?: boolean;
  /** F5: mostrar el botón de traducción (T). */
  showTranslate?: boolean;
  /** La letra trae transcripción IPA (japonés o idioma latino reconocido). */
  hasIpa?: boolean;
  /** Idioma/exactitud/salvedad del IPA de la canción (viene del main). */
  ipaInfo?: IpaInfo | null;
  /** Estado y toggle de la guía de símbolos IPA (botón "?"). */
  ipaGuideOpen?: boolean;
  onIpaGuideToggle?: () => void;
}

/** Ciclo del botón de traducción: sin → debajo → lado a lado → sin. */
const TRANSLATION_CYCLE: Record<TranslationView, TranslationView> = {
  off: 'below',
  below: 'side',
  side: 'off',
};

const TRANSLATION_LABEL: Record<TranslationView, string> = {
  off: 'T',
  below: 'T',
  side: 'T⇉',
};

const TRANSLATION_TITLE: Record<TranslationView, MessageKey> = {
  off: 'reading.translateOff',
  below: 'reading.translateBelow',
  side: 'reading.translateSide',
};

interface ModeOption {
  key: ReadingMode;
  label: string;
  title: MessageKey;
  needsAnnotations: boolean;
  scripts?: ScriptHint[];
}

const JAPANESE_OPTIONS: ModeOption[] = [
  { key: 'original', label: '原', title: 'reading.mode.jaOriginal.title', needsAnnotations: false },
  {
    key: 'kana',
    label: 'か',
    title: 'reading.mode.jaKana.title',
    needsAnnotations: true,
    scripts: ['japanese'],
  },
  {
    key: 'furigana',
    label: 'ふ',
    title: 'reading.mode.jaFurigana.title',
    needsAnnotations: true,
  },
  { key: 'romaji', label: 'A', title: 'reading.mode.jaRomaji.title', needsAnnotations: true },
  {
    key: 'furigana_romaji',
    label: 'ふ+A',
    title: 'reading.mode.jaFuriganaRomaji.title',
    needsAnnotations: true,
  },
  {
    key: 'ipa',
    label: 'IPA',
    title: 'reading.mode.jaIpa.title',
    needsAnnotations: true,
    scripts: ['japanese'],
  },
  {
    key: 'furigana_ipa',
    label: 'ふ+IPA',
    title: 'reading.mode.jaFuriganaIpa.title',
    needsAnnotations: true,
    scripts: ['japanese'],
  },
];

/**
 * Canciones en alfabeto latino (español, italiano, francés, alemán): no hay
 * nada que romanizar, así que furigana y romaji no aplican. Lo único que
 * aporta lectura es el IPA, y solo aparece cuando el detector de idioma
 * reconoció la canción.
 */
const LATIN_OPTIONS: ModeOption[] = [
  { key: 'original', label: 'Orig', title: 'reading.mode.latinOriginal.title', needsAnnotations: false },
  {
    key: 'ipa',
    label: 'IPA',
    title: 'reading.mode.latinIpa.title',
    needsAnnotations: true,
  },
];

const GENERIC_OPTIONS: ModeOption[] = [
  { key: 'original', label: 'Orig', title: 'reading.mode.genericOriginal.title', needsAnnotations: false },
  {
    key: 'furigana',
    label: 'Ruby',
    title: 'reading.mode.ruby.title',
    needsAnnotations: true,
  },
  { key: 'romaji', label: 'A', title: 'reading.mode.genericRomaji.title', needsAnnotations: true },
  {
    key: 'furigana_romaji',
    label: 'R+A',
    title: 'reading.mode.rubyRomaji.title',
    needsAnnotations: true,
  },
];

interface HelpRow {
  label: MessageKey;
  /** Texto traducible del ejemplo (va en la columna de muestra). */
  sampleKey?: MessageKey;
  /** Ejemplo literal (letra de muestra, romanización, IPA…). */
  sample?: React.ReactNode;
}

const HELP_EXAMPLES: Record<ScriptHint, { title: MessageKey; rows: HelpRow[] }> = {
  japanese: {
    title: 'reading.help.ja',
    rows: [
      {
        label: 'reading.helpLabel.original',
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
      { label: 'reading.helpLabel.kana', sample: 'わたしはひとり' },
      { label: 'reading.helpLabel.furigana', sampleKey: 'reading.helpSample.furiganaJa' },
      { label: 'reading.helpLabel.romaji', sample: 'watashi wa hitori' },
      { label: 'reading.helpLabel.ipa', sample: 'ɰatasaɕi ɰa çitoɾi' },
      { label: 'reading.helpLabel.furiganaIpa', sampleKey: 'reading.helpSample.furiganaIpaJa' },
    ],
  },
  korean: {
    title: 'reading.help.ko',
    rows: [
      { label: 'reading.helpLabel.original', sample: '안녕하세요' },
      { label: 'reading.helpLabel.ruby', sampleKey: 'reading.helpSample.koRuby' },
      { label: 'reading.helpLabel.romanization', sample: 'annyeonghaseyo' },
    ],
  },
  chinese: {
    title: 'reading.help.zh',
    rows: [
      { label: 'reading.helpLabel.original', sample: '你好' },
      { label: 'reading.helpLabel.ruby', sampleKey: 'reading.helpSample.zhRuby' },
      { label: 'reading.helpLabel.pinyin', sample: 'ni hao' },
    ],
  },
  cyrillic: {
    title: 'reading.help.cyrillic',
    rows: [
      { label: 'reading.helpLabel.original', sample: 'Привет' },
      { label: 'reading.helpLabel.ruby', sampleKey: 'reading.helpSample.cyrillicRuby' },
      { label: 'reading.helpLabel.romanization', sample: 'Privet' },
    ],
  },
  other: {
    title: 'reading.help.generic',
    rows: [
      { label: 'reading.helpLabel.original', sampleKey: 'reading.helpSample.otherOriginal' },
      { label: 'reading.helpLabel.ruby', sampleKey: 'reading.helpSample.otherRuby' },
      { label: 'reading.helpLabel.romanization', sampleKey: 'reading.helpSample.otherRomaji' },
    ],
  },
  latin: {
    title: 'reading.help.generic',
    rows: [
      { label: 'reading.helpLabel.original', sampleKey: 'reading.helpSample.latinOriginal' },
      { label: 'reading.helpLabel.note', sampleKey: 'reading.helpSample.latinNote' },
    ],
  },
};

/** Selector del modo de lectura del teleprompter. */
export function ReadingControls({
  mode,
  onChange,
  hasAnnotations = false,
  scriptHint = 'latin',
  translationView = 'off',
  onTranslationViewChange,
  translationLoading = false,
  translationError,
  onOpenSettings,
  showReadingModes = true,
  showTranslate = true,
  hasIpa = false,
  ipaInfo = null,
  ipaGuideOpen = false,
  onIpaGuideToggle,
}: Props) {
  const t = useT();
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    if (scriptHint === 'japanese') {
      return JAPANESE_OPTIONS.filter((opt) => !opt.scripts || opt.scripts.includes(scriptHint));
    }
    // Alfabeto latino con idioma reconocido → original + IPA. Sin idioma
    // reconocido no se ofrece nada: no hay lectura que dar.
    if (scriptHint === 'latin') return hasIpa ? LATIN_OPTIONS : [];
    return GENERIC_OPTIONS.filter((opt) => !opt.scripts || opt.scripts.includes(scriptHint));
  }, [scriptHint, hasIpa]);

  const help = HELP_EXAMPLES[scriptHint] ?? HELP_EXAMPLES.other;

  // El chip y el botón "?" de la guía solo tienen sentido con un modo IPA
  // activo y con ipa_info (idioma/exactitud) calculado por el main.
  const showIpaInfo =
    (mode === 'ipa' || mode === 'furigana_ipa') && ipaInfo != null;
  const ipaMetaSuffix = ipaInfo ? ` — ${ipaInfo.label} · ${ipaInfo.accuracy}` : '';

  return (
    <div className="reading-controls-wrap">
      <div className="reading-controls" title={t('reading.modeTitle')}>
        {showReadingModes &&
          options.map((opt) => {
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
              title={
                unavailable
                  ? t('reading.modeUnavailable', { title: t(opt.title) })
                  : (opt.key === 'ipa' || opt.key === 'furigana_ipa') && ipaInfo
                    ? `${t(opt.title)}${ipaMetaSuffix}`
                    : t(opt.title)
              }
              aria-label={t(opt.title)}
              aria-pressed={mode === opt.key}
            >
              {opt.label}
            </button>
          );
        })}

        {showIpaInfo && ipaInfo && (
          <>
            <span className="ipa-info-chip" title={ipaInfo.caveat}>
              IPA · {ipaInfo.label} · {ipaInfo.accuracy}
            </span>
            {onIpaGuideToggle && (
              <button
                type="button"
                className={`chrome-button reading-btn reading-btn-ipa-guide${ipaGuideOpen ? ' active' : ''}`}
                onClick={onIpaGuideToggle}
                title={t('reading.ipaGuideButton')}
                aria-label={t('reading.ipaGuideButton')}
                aria-pressed={ipaGuideOpen}
              >
                ?
              </button>
            )}
          </>
        )}

        {showTranslate && onTranslationViewChange && (
          <button
            type="button"
            className={[
              'chrome-button reading-btn reading-btn-translate',
              translationView !== 'off' ? 'active' : '',
              translationView === 'side' ? 'reading-btn-translate-side' : '',
              translationLoading ? 'loading' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onTranslationViewChange(TRANSLATION_CYCLE[translationView])}
            title={
              translationError ??
              (translationLoading ? t('reading.translating') : t(TRANSLATION_TITLE[translationView]))
            }
            aria-label={t(TRANSLATION_TITLE[translationView])}
            aria-pressed={translationView !== 'off'}
            disabled={translationLoading}
          >
            {TRANSLATION_LABEL[translationView]}
          </button>
        )}

        {(showReadingModes || (showTranslate && onTranslationViewChange)) && (
          <button
          type="button"
          className={`chrome-button reading-btn reading-btn-help${helpOpen ? ' active' : ''}`}
          onClick={() => setHelpOpen((v) => !v)}
          title={t('reading.helpTitle')}
          aria-label={t('reading.helpAria')}
          aria-expanded={helpOpen}
        >
          ?
        </button>
        )}
        </div>

      {helpOpen && (
        <div className="reading-help-popover" ref={helpRef} role="dialog" aria-label={t(help.title)}>
          <strong>{t(help.title)}</strong>
          <ul>
            {help.rows.map((row) => (
              <li key={row.label}>
                <span className="reading-help-label">{t(row.label)}</span>
                <span className="reading-help-sample">
                  {row.sampleKey ? t(row.sampleKey) : row.sample}
                </span>
              </li>
            ))}
          </ul>
          {scriptHint === 'japanese' && (
            <p className="reading-help-link">
              {t('reading.helpHiragana')}{' '}
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
                {t('reading.configureApiKey')}
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
