import { useMemo } from 'react';
import { IPA_GUIDE, ipaSymbolsIn } from './ipaGuide';
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
  const symbols = useMemo(() => (ipa ? ipaSymbolsIn(ipa) : []), [ipa]);

  return (
    <div className="ipa-guide" role="dialog" aria-label="Guía de símbolos IPA">
      <header className="ipa-guide-header">
        <strong>Guía de símbolos{label ? ` · ${label}` : ''}</strong>
        <button
          type="button"
          className="ipa-guide-close"
          onClick={onClose}
          aria-label="Cerrar guía IPA"
          title="Cerrar"
        >
          ×
        </button>
      </header>
      {!ipa?.trim() ? (
        <p className="ipa-guide-empty">
          La línea actual no tiene transcripción IPA. Elige un modo de lectura IPA
          cuando la canción tenga una.
        </p>
      ) : symbols.length === 0 ? (
        <p className="ipa-guide-empty">Esta línea no contiene símbolos IPA.</p>
      ) : (
        <ul className="ipa-guide-list">
          {symbols.map((sym) => {
            const entry = IPA_GUIDE[sym];
            return (
              <li key={sym} className={`ipa-guide-row${entry ? '' : ' ipa-guide-unknown'}`}>
                <span className="ipa-guide-sym" aria-hidden="true">
                  {sym}
                </span>
                <span className="ipa-guide-info">
                  <strong>{entry?.desc ?? 'Carácter sin ficha en la guía'}</strong>
                  {entry && <em>{entry.ejemplo}</em>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
