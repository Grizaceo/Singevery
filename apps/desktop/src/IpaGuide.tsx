import { useMemo } from 'react';
import { IPA_GUIDE, ipaGuideText, ipaSymbolsIn } from './ipaGuide';
import { useLocale, useT } from './i18n/useT';
import './IpaGuide.css';

interface IpaGuideProps {
  /** Transcripción IPA de la línea actual (current_line.ipa). */
  ipa?: string;
  /** Nombre del idioma del IPA, para el título (p. ej. "inglés (EE. UU.)"). */
  label?: string;
  onClose: () => void;
}

/**
 * Guía de símbolos IPA: solo muestra las fichas de los símbolos que aparecen
 * en la línea que se está cantando, para estudiar sobre la marcha.
 */
export function IpaGuide({ ipa, label, onClose }: IpaGuideProps) {
  const t = useT();
  const locale = useLocale();
  const symbols = useMemo(() => (ipa ? ipaSymbolsIn(ipa) : []), [ipa]);

  return (
    <div className="ipa-guide" role="dialog" aria-label={t('ipaGuide.dialogLabel')}>
      <header className="ipa-guide-header">
        <strong>
          {t('ipaGuide.title')}
          {label ? ` · ${label}` : ''}
        </strong>
        <button
          type="button"
          className="ipa-guide-close"
          onClick={onClose}
          aria-label={t('ipaGuide.close')}
          title={t('ipaGuide.closeTitle')}
        >
          ×
        </button>
      </header>
      {!ipa?.trim() ? (
        <p className="ipa-guide-empty">
          {t('ipaGuide.noIpa')}
        </p>
      ) : symbols.length === 0 ? (
        <p className="ipa-guide-empty">{t('ipaGuide.noSymbols')}</p>
      ) : (
        <ul className="ipa-guide-list">
          {symbols.map((sym) => {
            const entry = IPA_GUIDE[sym];
            const text = entry ? ipaGuideText(entry, locale) : undefined;
            return (
              <li key={sym} className={`ipa-guide-row${entry ? '' : ' ipa-guide-unknown'}`}>
                <span className="ipa-guide-sym" aria-hidden="true">
                  {sym}
                </span>
                <span className="ipa-guide-info">
                  <strong>{text?.desc ?? t('ipaGuide.unknownSymbol')}</strong>
                  {text && <em>{text.example}</em>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
