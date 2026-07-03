import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { DisplaySettings, ReadingSettings, RecognitionProviderMode, TranslationSettings } from './types';
import { useRemoteStatus } from './useRemoteStatus';
import './SettingsPanel.css';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDER_OPTIONS: { value: RecognitionProviderMode; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Shazam gratis primero, AudD como respaldo' },
  { value: 'shazam', label: 'Shazam', hint: 'Cliente no oficial, sin API key' },
  { value: 'audd', label: 'AudD', hint: 'Requiere AUDD_API_TOKEN' },
];

const TRANSLATION_PROVIDERS: { value: TranslationSettings['provider']; label: string }[] = [
  { value: 'deepl', label: 'DeepL' },
  { value: 'google', label: 'Google Translate v2' },
];

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [display, setDisplay] = useState<DisplaySettings>({
    opacity: 1,
    fontScale: 1,
    alignment: 'center',
    mirrorMode: false,
  });
  const [provider, setProvider] = useState<RecognitionProviderMode>('auto');
  const [translation, setTranslation] = useState<TranslationSettings>({
    provider: 'deepl',
    apiKey: '',
    targetLang: 'es',
  });
  const [reading, setReading] = useState<ReadingSettings>({ pinyinToneType: 'none' });
  const { status: remoteStatus, setEnabled: setRemoteEnabled } = useRemoteStatus();
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [tvQr, setTvQr] = useState<string | null>(null);
  const [micQr, setMicQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !window.api) return;
    void window.api.getDisplaySettings().then((r) => {
      if (r.ok) setDisplay(r.display);
    });
    void window.api.getRecognitionProvider().then((r) => {
      if (r.ok) setProvider(r.provider);
    });
    void window.api.getTranslationSettings().then((r) => {
      if (r.ok) setTranslation(r.translation);
    });
    void window.api.getReadingSettings().then((r) => {
      if (r.ok) setReading(r.reading);
    });
  }, [open]);

  useEffect(() => {
    if (!remoteStatus.enabled || !remoteStatus.tvUrl) {
      setTvQr(null);
      setMicQr(null);
      return;
    }
    void QRCode.toDataURL(remoteStatus.tvUrl, { width: 160, margin: 1 }).then(setTvQr);
    void QRCode.toDataURL(remoteStatus.micUrl, { width: 160, margin: 1 }).then(setMicQr);
  }, [remoteStatus.enabled, remoteStatus.tvUrl, remoteStatus.micUrl]);

  const toggleRemote = useCallback(
    async (enabled: boolean) => {
      setRemoteError(null);
      const result = await setRemoteEnabled(enabled);
      if (!result.ok) setRemoteError(result.error ?? 'No se pudo cambiar el modo TV');
    },
    [setRemoteEnabled],
  );

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable */
    }
  }, []);

  const patchDisplay = useCallback(async (partial: Partial<DisplaySettings>) => {
    if (!window.api) return;
    const next = { ...display, ...partial };
    setDisplay(next);
    const result = await window.api.setDisplaySettings(partial);
    if (result.ok) setDisplay(result.display);
  }, [display]);

  const changeProvider = useCallback(async (value: RecognitionProviderMode) => {
    if (!window.api) return;
    setProvider(value);
    const result = await window.api.setRecognitionProvider(value);
    if (result.ok) setProvider(result.provider);
  }, []);

  const patchTranslation = useCallback(
    async (partial: Partial<TranslationSettings>) => {
      if (!window.api) return;
      const next = { ...translation, ...partial };
      setTranslation(next);
      const result = await window.api.setTranslationSettings(partial);
      if (result.ok) setTranslation(result.translation);
    },
    [translation],
  );

  const patchReading = useCallback(
    async (partial: Partial<ReadingSettings>) => {
      if (!window.api) return;
      const next = { ...reading, ...partial };
      setReading(next);
      const result = await window.api.setReadingSettings(partial);
      if (result.ok) setReading(result.reading);
    },
    [reading],
  );

  if (!open || !window.api) return null;

  return (
    <div className="settings-backdrop" onClick={onClose} role="presentation">
      <div
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ajustes del teleprompter"
      >
        <header className="settings-header">
          <h2>Ajustes</h2>
          <button type="button" className="chrome-button" onClick={onClose} aria-label="Cerrar ajustes">
            ×
          </button>
        </header>

        <section className="settings-section">
          <label className="settings-label" htmlFor="opacity-range">
            Opacidad ({Math.round(display.opacity * 100)}%)
          </label>
          <input
            id="opacity-range"
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={display.opacity}
            onChange={(e) => void patchDisplay({ opacity: Number(e.target.value) })}
          />
        </section>

        <section className="settings-section">
          <label className="settings-label" htmlFor="font-range">
            Tamaño de fuente ({display.fontScale.toFixed(1)}×)
          </label>
          <input
            id="font-range"
            type="range"
            min={0.6}
            max={2}
            step={0.1}
            value={display.fontScale}
            onChange={(e) => void patchDisplay({ fontScale: Number(e.target.value) })}
          />
        </section>

        <section className="settings-section">
          <span className="settings-label">Alineación</span>
          <div className="settings-row">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                className={`chrome-button${display.alignment === align ? ' active' : ''}`}
                onClick={() => void patchDisplay({ alignment: align })}
              >
                {align === 'left' ? '←' : align === 'right' ? '→' : '↔'}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={display.mirrorMode}
              onChange={(e) => void patchDisplay({ mirrorMode: e.target.checked })}
            />
            Modo espejo (invertir horizontalmente)
          </label>
        </section>

        <section className="settings-section">
          <span className="settings-label">Traducción</span>
          <div className="settings-provider-list">
            {TRANSLATION_PROVIDERS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`settings-provider-btn${translation.provider === opt.value ? ' active' : ''}`}
                onClick={() => void patchTranslation({ provider: opt.value })}
              >
                <strong>{opt.label}</strong>
              </button>
            ))}
          </div>
          <label className="settings-label" htmlFor="translation-key">
            API key
          </label>
          <input
            id="translation-key"
            className="settings-text-input"
            type="password"
            value={translation.apiKey}
            placeholder={translation.provider === 'deepl' ? 'DeepL auth key' : 'Google API key'}
            onChange={(e) => void patchTranslation({ apiKey: e.target.value })}
          />
          <label className="settings-label" htmlFor="translation-lang">
            Idioma destino (ej. es, en, ja)
          </label>
          <input
            id="translation-lang"
            className="settings-text-input"
            type="text"
            value={translation.targetLang}
            onChange={(e) => void patchTranslation({ targetLang: e.target.value })}
          />
        </section>

        <section className="settings-section">
          <span className="settings-label">Pinyin (chino)</span>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={reading.pinyinToneType === 'symbol'}
              onChange={(e) =>
                void patchReading({ pinyinToneType: e.target.checked ? 'symbol' : 'none' })
              }
            />
            Mostrar tonos en pinyin (nǐ hǎo vs ni hao)
          </label>
        </section>

        <section className="settings-section">
          <span className="settings-label">Modo TV (extensión remota)</span>
          <p className="settings-hint">
            Opcional: el PC sigue siendo el cerebro. Transmite letras por WiFi al televisor y permite
            usar el teléfono como micrófono remoto.
          </p>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={remoteStatus.enabled}
              onChange={(e) => void toggleRemote(e.target.checked)}
            />
            Activar servidor LAN (puerto {remoteStatus.port})
          </label>
          {remoteError && <p className="settings-error">{remoteError}</p>}
          {remoteStatus.enabled && remoteStatus.running && (
            <div className="settings-remote-urls">
              <div className="settings-remote-block">
                <span className="settings-label">TV — letras en pantalla grande</span>
                <code className="settings-url">{remoteStatus.tvUrl}</code>
                <div className="settings-row">
                  <button type="button" className="chrome-button" onClick={() => void copyText(remoteStatus.tvUrl)}>
                    Copiar
                  </button>
                </div>
                {tvQr && <img className="settings-qr" src={tvQr} alt="QR para abrir en el televisor" />}
              </div>
              <div className="settings-remote-block">
                <span className="settings-label">Teléfono — micrófono remoto</span>
                <code className="settings-url">{remoteStatus.micUrl}</code>
                <div className="settings-row">
                  <button type="button" className="chrome-button" onClick={() => void copyText(remoteStatus.micUrl)}>
                    Copiar
                  </button>
                </div>
                {micQr && <img className="settings-qr" src={micQr} alt="QR para micrófono remoto" />}
                {remoteStatus.micConnected && (
                  <p className="settings-hint settings-hint-ok">Teléfono conectado y transmitiendo</p>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="settings-section">
          <span className="settings-label">Reconocimiento</span>
          <div className="settings-provider-list">
            {PROVIDER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`settings-provider-btn${provider === opt.value ? ' active' : ''}`}
                title={opt.hint}
                onClick={() => void changeProvider(opt.value)}
              >
                <strong>{opt.label}</strong>
                <span>{opt.hint}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
