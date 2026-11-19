import { useState } from 'react';
import { useT } from './i18n/useT';

interface BetaWelcomeProps {
  open: boolean;
  onDone: () => void;
  onOpenSettings: () => void;
}

export function BetaWelcome({ open, onDone, onOpenSettings }: BetaWelcomeProps) {
  const t = useT();
  const [guideError, setGuideError] = useState<string | null>(null);
  if (!open) return null;

  const openGuide = async (): Promise<void> => {
    const result = await window.api?.openBetaGuide();
    if (result && !result.ok) setGuideError(result.error ?? t('app.beta.guideError'));
  };

  return (
    <div className="beta-welcome-backdrop" role="presentation">
      <section className="beta-welcome" role="dialog" aria-modal="true" aria-labelledby="beta-title">
        <span className="beta-kicker">{t('app.beta.kicker')}</span>
        <h1 id="beta-title">{t('app.beta.title')}</h1>
        <p>
          {t('app.beta.introBefore')}
          <strong>SING</strong>
          {t('app.beta.introAfter')}
        </p>
        <ol className="beta-steps">
          <li>
            <strong>{t('app.beta.step1Title')}</strong>
            <span>{t('app.beta.step1Desc')}</span>
          </li>
          <li>
            <strong>{t('app.beta.step2Title')}</strong>
            <span>{t('app.beta.step2Desc')}</span>
          </li>
          <li>
            <strong>{t('app.beta.step3Title')}</strong>
            <span>{t('app.beta.step3Desc')}</span>
          </li>
        </ol>
        <p className="beta-privacy">
          {t('app.beta.privacy')}
        </p>
        {guideError && <p className="beta-error" role="alert">{guideError}</p>}
        <div className="beta-actions">
          <button type="button" className="chrome-button" onClick={() => void openGuide()}>
            {t('app.beta.openGuide')}
          </button>
          <button type="button" className="chrome-button" onClick={onOpenSettings}>
            {t('app.beta.viewSettings')}
          </button>
          <button type="button" className="chrome-button beta-primary" onClick={onDone}>
            {t('app.beta.start')}
          </button>
        </div>
      </section>
    </div>
  );
}
