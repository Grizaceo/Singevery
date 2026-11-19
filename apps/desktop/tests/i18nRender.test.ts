import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLocale } from '../src/i18n';
import { I18nProvider } from '../src/i18n/react';
import { LocaleContext } from '../src/i18n/useT';
import { IpaGuide } from '../src/IpaGuide';

// ===========================================================================
// Render real de un componente con textos: inglés por defecto, español al
// cambiar el idioma. Sin DOM: renderToStaticMarkup en el entorno node.
// ===========================================================================

const noop = () => {};

describe('i18n — render de componentes', () => {
  afterEach(() => {
    setLocale('en');
  });

  it('sin window.api, I18nProvider deja la interfaz en inglés', () => {
    const html = renderToStaticMarkup(
      createElement(I18nProvider, null, createElement(IpaGuide, { ipa: 'θ', onClose: noop })),
    );
    expect(html).toContain('Symbol guide');
    expect(html).toContain('aria-label="Close IPA guide"');
    expect(html).toContain('&#x27;th&#x27; in &#x27;think&#x27;');
    expect(html).not.toContain('Guía de símbolos');
  });

  it('con el idioma en español muestra los textos y la ficha IPA en español', () => {
    setLocale('es');
    const html = renderToStaticMarkup(
      createElement(
        LocaleContext.Provider,
        { value: 'es' },
        createElement(IpaGuide, { ipa: 'θ', onClose: noop }),
      ),
    );
    expect(html).toContain('Guía de símbolos');
    expect(html).toContain('aria-label="Cerrar guía IPA"');
    expect(html).toContain('zapato');
    expect(html).not.toContain('Symbol guide');
  });

  it('el aviso de línea sin IPA también cambia de idioma', () => {
    const en = renderToStaticMarkup(createElement(IpaGuide, { onClose: noop }));
    expect(en).toContain('The current line has no IPA transcription');
    setLocale('es');
    const es = renderToStaticMarkup(
      createElement(LocaleContext.Provider, { value: 'es' }, createElement(IpaGuide, { onClose: noop })),
    );
    expect(es).toContain('La línea actual no tiene transcripción IPA');
  });
});
