// ============================================================================
// LanguageSelect.tsx — selector del idioma de la interfaz (inglés/español).
//
// La etiqueta y las opciones son bilingües y fijas a propósito: quien abrió la
// app en un idioma que no entiende tiene que poder encontrar el selector. El
// cambio se guarda en el main (ajuste `uiLanguage`), que avisa al renderer
// con onUiLanguageChanged; además se aplica aquí al instante.
// ============================================================================
import { normalizeLocale, setLocale } from '../i18n';
import { useLocale } from '../i18n/useT';

export function LanguageSelect() {
  const locale = useLocale();

  const change = (value: string) => {
    const next = normalizeLocale(value);
    setLocale(next);
    void window.api?.setUiLanguage(next);
  };

  return (
    <section className="settings-section">
      <label className="settings-label" htmlFor="ui-language">
        Interface language / Idioma de la interfaz
      </label>
      <select id="ui-language" value={locale} onChange={(e) => change(e.target.value)}>
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>
    </section>
  );
}
