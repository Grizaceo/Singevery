// ============================================================================
// OtherTab.tsx — ajustes varios (Traducción + Ayuda y beta).
// Extraído de SettingsPanel.tsx (modularización god file, 2026-08-03).
// ============================================================================
import { useEffect, useState } from 'react';
import type { MatchStats, TranslationSettings } from '../types';
import { SupportTicketForm } from '../SupportTicketForm';
import { ReferencesSection } from './ReferencesSection';
import type { TeacherReferenceApi } from '../useTeacherReference';
import type { MessageKey } from '../i18n';
import { useT } from '../i18n/useT';

export interface OtherTabProps {
  translation: TranslationSettings;
  patchTranslation: (partial: Partial<TranslationSettings>) => void;
  diagnosticStatus: string | null;
  setDiagnosticStatus: (status: string | null) => void;
  teacherRef: TeacherReferenceApi;
  trackTitle?: string;
  trackArtist?: string;
}

const TRANSLATION_PROVIDERS: {
  value: TranslationSettings['provider'];
  labelKey: MessageKey;
  hintKey: MessageKey;
}[] = [
  { value: 'mymemory', labelKey: 'settingsMore.providerMymemoryLabel', hintKey: 'settingsMore.providerMymemoryHint' },
  { value: 'local', labelKey: 'settingsMore.providerLocalLabel', hintKey: 'settingsMore.providerLocalHint' },
  { value: 'deepl', labelKey: 'settingsMore.providerDeeplLabel', hintKey: 'settingsMore.providerDeeplHint' },
  { value: 'google', labelKey: 'settingsMore.providerGoogleLabel', hintKey: 'settingsMore.providerGoogleHint' },
];

export function OtherTab({
  translation,
  patchTranslation,
  diagnosticStatus,
  setDiagnosticStatus,
  teacherRef,
  trackTitle,
  trackArtist,
}: OtherTabProps) {
  const t = useT();
  // MyMemory no pide credenciales: el campo pasa a ser un email opcional que
  // solo sirve para subir la cuota diaria.
  const isKeyless = translation.provider === 'mymemory';
  const isLocal = translation.provider === 'local';

  const exportDiagnostics = async () => {
    if (!window.api) return;
    setDiagnosticStatus(t('settingsMore.diagPreparing'));
    const result = await window.api.exportDiagnostics();
    if (result.ok)
      setDiagnosticStatus(
        t('settingsMore.diagSaved', {
          path: result.path ?? t('settingsMore.diagSavedFallback'),
        }),
      );
    else if (result.canceled) setDiagnosticStatus(null);
    else setDiagnosticStatus(result.error ?? t('settingsMore.diagExportError'));
  };

  const [accuracyStats, setAccuracyStats] = useState<MatchStats | null>(null);
  const [accuracyBusy, setAccuracyBusy] = useState(false);
  const [accuracyStatus, setAccuracyStatus] = useState<string | null>(null);

  // Carga las estadísticas de precisión al abrir la pestaña y después de cada
  // feedback, para que el resumen refleje el último evento registrado.
  const refreshAccuracyStats = async () => {
    if (!window.api?.getMatchStats) return;
    const result = await window.api.getMatchStats();
    if (result.ok) setAccuracyStats(result.stats);
  };
  useEffect(() => {
    // El estado se fija DENTRO del callback asíncrono, no en el cuerpo del
    // efecto, y se descarta si la pestaña se cerró mientras llegaba la
    // respuesta: sin la guarda, cerrar Ajustes rápido dejaba un setState
    // sobre un componente ya desmontado.
    let cancelled = false;
    void (async () => {
      if (!window.api?.getMatchStats) return;
      const result = await window.api.getMatchStats();
      if (!cancelled && result.ok) setAccuracyStats(result.stats);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendAccuracyFeedback = async (correct: boolean) => {
    if (!window.api?.logMatchFeedback || accuracyBusy) return;
    setAccuracyBusy(true);
    try {
      const result = await window.api.logMatchFeedback(correct);
      if (result.ok) {
        setAccuracyStatus(
          correct
            ? t('settingsMore.feedbackCorrectMsg')
            : t('settingsMore.feedbackWrongMsg'),
        );
        await refreshAccuracyStats();
      } else {
        setAccuracyStatus(result.error ?? t('settingsMore.feedbackSaveError'));
      }
    } finally {
      setAccuracyBusy(false);
    }
  };

  const openPrivacy = async () => {
    if (!window.api) return;
    const result = await window.api.openPrivacyNotice();
    if (!result.ok) setDiagnosticStatus(result.error ?? t('settingsMore.privacyOpenError'));
  };

  const openBetaGuide = async () => {
    if (!window.api) return;
    const result = await window.api.openBetaGuide();
    if (!result.ok) setDiagnosticStatus(result.error ?? t('settingsMore.betaOpenError'));
  };

  return (
    <>
      {/* ------- Melodías de referencia del profesor (avanzado) ------- */}
      <ReferencesSection
        teacherRef={teacherRef}
        trackTitle={trackTitle}
        trackArtist={trackArtist}
        hasTrack={Boolean(trackTitle)}
      />

      {/* ---------------- Traducción ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">{t('settingsMore.translationSection')}</span>
        <p className="settings-hint">{t('settingsMore.translationHint')}</p>
        <div className="settings-provider-list">
          {TRANSLATION_PROVIDERS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`settings-provider-btn${translation.provider === opt.value ? ' active' : ''}`}
              title={t(opt.hintKey)}
              onClick={() => patchTranslation({ provider: opt.value })}
            >
              <strong>{t(opt.labelKey)}</strong>
              <span>{t(opt.hintKey)}</span>
            </button>
          ))}
        </div>

        {isLocal ? (
          <>
            <p className="settings-hint">
              {t('settingsMore.localModelHintPre')}
              <strong>Hy-MT2 1.8B Q4_K_M</strong>
              {t('settingsMore.localModelHintPost')}
            </p>
            <label className="settings-label" htmlFor="local-model">
              {t('settingsMore.fieldModel')}
            </label>
            <input
              id="local-model"
              className="settings-text-input"
              type="text"
              value={translation.localModel}
              placeholder="hymt2-singevery"
              onChange={(e) => patchTranslation({ localModel: e.target.value })}
            />
            <label className="settings-label" htmlFor="local-endpoint">
              {t('settingsMore.fieldRuntimeAddress')}
            </label>
            <input
              id="local-endpoint"
              className="settings-text-input"
              type="text"
              value={translation.localEndpoint}
              placeholder="http://localhost:11434/v1/chat/completions"
              onChange={(e) => patchTranslation({ localEndpoint: e.target.value })}
            />
            <p className="settings-hint">{t('settingsMore.localModelHint2')}</p>
          </>
        ) : isKeyless ? (
          <>
            <label className="settings-label" htmlFor="translation-key">
              {t('settingsMore.fieldYourEmail')}
            </label>
            <input
              id="translation-key"
              className="settings-text-input"
              type="email"
              value={translation.apiKey}
              placeholder={t('settingsMore.emailPlaceholder')}
              onChange={(e) => patchTranslation({ apiKey: e.target.value })}
            />
            <p className="settings-hint">{t('settingsMore.mymemoryHint')}</p>
          </>
        ) : (
          <>
            <label className="settings-label" htmlFor="translation-key">
              API key
            </label>
            <input
              id="translation-key"
              className="settings-text-input"
              type="password"
              value={translation.apiKey}
              placeholder={translation.provider === 'deepl' ? 'DeepL auth key' : 'Google API key'}
              onChange={(e) => patchTranslation({ apiKey: e.target.value })}
            />
            <p className="settings-hint">
              {translation.credentialStorage === 'secure'
                ? t('settingsMore.keySecure')
                : t('settingsMore.keySession')}
            </p>
          </>
        )}

        <label className="settings-label" htmlFor="translation-lang">
          {t('settingsMore.targetLang')}
        </label>
        <input
          id="translation-lang"
          className="settings-text-input"
          type="text"
          value={translation.targetLang}
          placeholder="es"
          onChange={(e) => patchTranslation({ targetLang: e.target.value })}
        />
      </section>

      {/* ---------------- Precisión del reconocimiento ---------------- */}
      <section className="settings-section settings-accuracy">
        <span className="settings-label settings-group-title">{t('settingsMore.accuracySection')}</span>
        <p className="settings-hint">{t('settingsMore.accuracyHint')}</p>
        <div className="settings-row settings-accuracy-actions">
          <button
            type="button"
            className="chrome-button"
            disabled={accuracyBusy}
            onClick={() => void sendAccuracyFeedback(true)}
          >
            {t('settingsMore.feedbackYes')}
          </button>
          <button
            type="button"
            className="chrome-button"
            disabled={accuracyBusy}
            onClick={() => void sendAccuracyFeedback(false)}
          >
            {t('settingsMore.feedbackNo')}
          </button>
        </div>
        {accuracyStats && (
          <p className="settings-hint">
            {accuracyStats.total > 0
              ? t('settingsMore.accuracyStats', {
                  pct: Math.round(accuracyStats.accuracy * 100),
                  matched: accuracyStats.matched,
                  correct: accuracyStats.correctFeedback,
                  wrong: accuracyStats.wrongFeedback,
                })
              : t('settingsMore.accuracyEmpty')}
          </p>
        )}
        {accuracyStatus && (
          <p className="settings-hint settings-support-status" role="status">
            {accuracyStatus}
          </p>
        )}
      </section>

      {/* ---------------- Ayuda y beta ---------------- */}
      <section className="settings-section settings-support">
        <span className="settings-label settings-group-title">{t('settingsMore.helpSection')}</span>
        <div className="settings-row settings-support-actions">
          <button type="button" className="chrome-button" onClick={() => void openBetaGuide()}>
            {t('settingsMore.betaGuide')}
          </button>
          <button type="button" className="chrome-button" onClick={() => void exportDiagnostics()}>
            {t('settingsMore.exportDiag')}
          </button>
          <button type="button" className="chrome-button" onClick={() => void openPrivacy()}>
            {t('settingsMore.privacy')}
          </button>
        </div>
        <p className="settings-hint">{t('settingsMore.diagHint')}</p>
        <SupportTicketForm onStatus={setDiagnosticStatus} />
        {diagnosticStatus && (
          <p className="settings-hint settings-support-status" role="status">
            {diagnosticStatus}
          </p>
        )}
      </section>
    </>
  );
}
