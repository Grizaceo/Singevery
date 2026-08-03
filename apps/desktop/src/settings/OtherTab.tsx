// ============================================================================
// OtherTab.tsx — ajustes varios (Traducción + Ayuda y beta).
// Extraído de SettingsPanel.tsx (modularización god file, 2026-08-03).
// ============================================================================
import { useEffect, useState } from 'react';
import type { MatchStats, TranslationSettings } from '../types';
import { SupportTicketForm } from '../SupportTicketForm';

export interface OtherTabProps {
  translation: TranslationSettings;
  patchTranslation: (partial: Partial<TranslationSettings>) => void;
  diagnosticStatus: string | null;
  setDiagnosticStatus: (status: string | null) => void;
}

const TRANSLATION_PROVIDERS: {
  value: TranslationSettings['provider'];
  label: string;
  hint: string;
}[] = [
  { value: 'mymemory', label: 'MyMemory', hint: 'Sin clave, listo para usar' },
  { value: 'local', label: 'Modelo local', hint: 'En tu equipo, sin límites' },
  { value: 'deepl', label: 'DeepL', hint: 'Mejor calidad, con tu clave' },
  { value: 'google', label: 'Google', hint: 'Con tu clave' },
];

export function OtherTab({
  translation,
  patchTranslation,
  diagnosticStatus,
  setDiagnosticStatus,
}: OtherTabProps) {
  // MyMemory no pide credenciales: el campo pasa a ser un email opcional que
  // solo sirve para subir la cuota diaria.
  const isKeyless = translation.provider === 'mymemory';
  const isLocal = translation.provider === 'local';

  const exportDiagnostics = async () => {
    if (!window.api) return;
    setDiagnosticStatus('Preparando diagnóstico…');
    const result = await window.api.exportDiagnostics();
    if (result.ok) setDiagnosticStatus(`Guardado en ${result.path ?? 'el archivo elegido'}`);
    else if (result.canceled) setDiagnosticStatus(null);
    else setDiagnosticStatus(result.error ?? 'No se pudo exportar el diagnóstico');
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
    void refreshAccuracyStats();
  }, []);

  const sendAccuracyFeedback = async (correct: boolean) => {
    if (!window.api?.logMatchFeedback || accuracyBusy) return;
    setAccuracyBusy(true);
    try {
      const result = await window.api.logMatchFeedback(correct);
      if (result.ok) {
        setAccuracyStatus(
          correct
            ? 'Gracias — quedó registrado como acierto.'
            : 'Gracias — quedó registrado y la app está re-identificando.',
        );
        await refreshAccuracyStats();
      } else {
        setAccuracyStatus(result.error ?? 'No se pudo guardar el feedback');
      }
    } finally {
      setAccuracyBusy(false);
    }
  };

  const openPrivacy = async () => {
    if (!window.api) return;
    const result = await window.api.openPrivacyNotice();
    if (!result.ok) setDiagnosticStatus(result.error ?? 'No se pudo abrir el aviso de privacidad');
  };

  const openBetaGuide = async () => {
    if (!window.api) return;
    const result = await window.api.openBetaGuide();
    if (!result.ok) setDiagnosticStatus(result.error ?? 'No se pudo abrir la guía beta');
  };

  return (
    <>
      {/* ---------------- Traducción ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">Traducción</span>
        <p className="settings-hint">
          Afecta solo al botón T del widget. Reconocer la canción y mostrar la letra funciona sin
          configurar nada.
        </p>
        <div className="settings-provider-list">
          {TRANSLATION_PROVIDERS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`settings-provider-btn${translation.provider === opt.value ? ' active' : ''}`}
              title={opt.hint}
              onClick={() => patchTranslation({ provider: opt.value })}
            >
              <strong>{opt.label}</strong>
              <span>{opt.hint}</span>
            </button>
          ))}
        </div>

        {isLocal ? (
          <>
            <p className="settings-hint">
              Traduce con un modelo en tu propio equipo: sin límite diario, sin internet y sin
              mandar las letras a nadie. Necesitas un runtime local corriendo — el más simple es{' '}
              <strong>Ollama</strong>: instálalo y ejecuta{' '}
              <code>ollama pull translategemma:4b</code> (unos 3 GB, especializado en traducir,
              55 idiomas). También sirven LM Studio, llama.cpp o Jan.
            </p>
            <label className="settings-label" htmlFor="local-model">
              Modelo
            </label>
            <input
              id="local-model"
              className="settings-text-input"
              type="text"
              value={translation.localModel}
              placeholder="translategemma:4b"
              onChange={(e) => patchTranslation({ localModel: e.target.value })}
            />
            <label className="settings-label" htmlFor="local-endpoint">
              Dirección del runtime
            </label>
            <input
              id="local-endpoint"
              className="settings-text-input"
              type="text"
              value={translation.localEndpoint}
              placeholder="http://localhost:11434/v1/chat/completions"
              onChange={(e) => patchTranslation({ localEndpoint: e.target.value })}
            />
            <p className="settings-hint">
              Por defecto apunta a Ollama. Con un modelo de 4B la canción tarda unos segundos en
              CPU y es casi instantánea con GPU.
            </p>
          </>
        ) : isKeyless ? (
          <>
            <label className="settings-label" htmlFor="translation-key">
              Tu email (opcional)
            </label>
            <input
              id="translation-key"
              className="settings-text-input"
              type="email"
              value={translation.apiKey}
              placeholder="tucorreo@ejemplo.com"
              onChange={(e) => patchTranslation({ apiKey: e.target.value })}
            />
            <p className="settings-hint">
              MyMemory funciona sin nada, con un tope de ~5.000 caracteres al día (unas 3
              canciones). Poner un email válido lo sube a 50.000 (~30 canciones). No se envía a
              ningún otro sitio.
            </p>
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
          </>
        )}

        <label className="settings-label" htmlFor="translation-lang">
          Idioma destino
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
        <span className="settings-label settings-group-title">Precisión</span>
        <p className="settings-hint">
          ¿La canción identificada era la que sonaba? Tu feedback se guarda en la bitácora local
          (matchlog.jsonl) y sirve para medir y mejorar el reconocimiento en las próximas
          versiones. Si te equivocaste, la app re-identifica al momento.
        </p>
        <div className="settings-row settings-accuracy-actions">
          <button
            type="button"
            className="chrome-button"
            disabled={accuracyBusy}
            onClick={() => void sendAccuracyFeedback(true)}
          >
            Estaba bien
          </button>
          <button
            type="button"
            className="chrome-button"
            disabled={accuracyBusy}
            onClick={() => void sendAccuracyFeedback(false)}
          >
            Se equivocó
          </button>
        </div>
        {accuracyStats && (
          <p className="settings-hint">
            {accuracyStats.total > 0
              ? `${Math.round(accuracyStats.accuracy * 100)}% de acierto · ${accuracyStats.matched} identificaciones · ${accuracyStats.correctFeedback} bien / ${accuracyStats.wrongFeedback} mal (tu feedback)`
              : 'Aún no hay datos: identifica una canción y vuelve aquí.'}
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
        <span className="settings-label settings-group-title">Ayuda y beta</span>
        <div className="settings-row settings-support-actions">
          <button type="button" className="chrome-button" onClick={() => void openBetaGuide()}>
            Guía para testers
          </button>
          <button type="button" className="chrome-button" onClick={() => void exportDiagnostics()}>
            Exportar diagnóstico
          </button>
          <button type="button" className="chrome-button" onClick={() => void openPrivacy()}>
            Privacidad
          </button>
        </div>
        <p className="settings-hint">
          El diagnóstico guarda versión, estado técnico y logs redactados. No incluye audio ni
          letras completas.
        </p>
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
