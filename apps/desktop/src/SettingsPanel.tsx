// ============================================================================
// SettingsPanel.tsx — contenedor de ajustes: estado compartido + tabs.
// Los tres tabs viven en src/settings/ (DisplayTab, AudioTab, OtherTab).
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import type { DisplaySettings, ReadingSettings, RecognitionProviderMode, TranslationSettings } from './types';
import {
  type MicrophonePrefs,
  readMicrophonePrefs,
  writeMicrophonePrefs,
} from './audio/micPrefs';
import {
  type WidgetControls,
  readWidgetControls,
  writeWidgetControls,
} from './widgetPrefs';
import { DisplayTab } from './settings/DisplayTab';
import { AudioTab } from './settings/AudioTab';
import { OtherTab } from './settings/OtherTab';
import './SettingsPanel.css';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Escuchar el audio del sistema al abrir la app (preferencia del renderer). */
  autoStart: boolean;
  onAutoStartChange: (enabled: boolean) => void;
}

const DEFAULT_DISPLAY: DisplaySettings = {
  opacity: 1,
  fontScale: 1,
  alignment: 'center',
  mirrorMode: false,
  textColor: '#ffffff',
  textColorMode: 'manual',
  handleColor: '#000000',
  handleScale: 1,
  handlePositionX: 0.5,
  lyricsWindowSize: 2,
};

type SettingsTab = 'display' | 'audio' | 'other';

export function SettingsPanel({
  open,
  onClose,
  autoStart,
  onAutoStartChange,
}: SettingsPanelProps) {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('display');
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [provider, setProvider] = useState<RecognitionProviderMode>('auto');
  const [translation, setTranslation] = useState<TranslationSettings>({
    provider: 'mymemory',
    apiKey: '',
    targetLang: 'es',
    localEndpoint: 'http://localhost:11434/v1/chat/completions',
    localModel: 'translategemma:4b',
  });
  const [reading, setReading] = useState<ReadingSettings>({
    pinyinToneType: 'none',
    spanishVariant: 'seseo',
  });
  const [diagnosticStatus, setDiagnosticStatus] = useState<string | null>(null);

  // F4: preferencias de micrófono. F5: controles del widget.
  const [micPrefs, setMicPrefs] = useState<MicrophonePrefs>(readMicrophonePrefs);
  const [widgetControls, setWidgetControls] = useState<WidgetControls>(readWidgetControls);

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

  const patchDisplay = useCallback(async (partial: Partial<DisplaySettings>) => {
    if (!window.api) return;
    setDisplay((prev) => ({ ...prev, ...partial }));
    const result = await window.api.setDisplaySettings(partial);
    if (result.ok) setDisplay(result.display);
  }, []);

  const changeProvider = useCallback(async (value: RecognitionProviderMode) => {
    if (!window.api) return;
    setProvider(value);
    const result = await window.api.setRecognitionProvider(value);
    if (result.ok) setProvider(result.provider);
  }, []);

  const patchTranslation = useCallback(async (partial: Partial<TranslationSettings>) => {
    if (!window.api) return;
    setTranslation((prev) => ({ ...prev, ...partial }));
    const result = await window.api.setTranslationSettings(partial);
    if (result.ok) setTranslation(result.translation);
  }, []);

  const patchReading = useCallback(async (partial: Partial<ReadingSettings>) => {
    if (!window.api) return;
    setReading((prev) => ({ ...prev, ...partial }));
    const result = await window.api.setReadingSettings(partial);
    if (result.ok) setReading(result.reading);
  }, []);

  const patchMicPrefs = useCallback((partial: Partial<MicrophonePrefs>) => {
    setMicPrefs((prev) => {
      const next = { ...prev, ...partial };
      writeMicrophonePrefs(next);
      return next;
    });
  }, []);

  const patchWidgetControls = useCallback((partial: Partial<WidgetControls>) => {
    setWidgetControls((prev) => {
      const next = { ...prev, ...partial };
      writeWidgetControls(next);
      return next;
    });
  }, []);

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

        {/* F6: navegación por categorías en vez de una lista interminable. */}
        <nav className="settings-tabs" aria-label="Categorías de ajustes">
          {(
            [
              ['display', 'Display'],
              ['audio', 'Audio'],
              ['other', 'Otros'],
            ] as [SettingsTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={`settings-tab${settingsTab === tab ? ' active' : ''}`}
              onClick={() => setSettingsTab(tab)}
              aria-pressed={settingsTab === tab}
            >
              {label}
            </button>
          ))}
        </nav>

        {settingsTab === 'display' && (
          <DisplayTab
            display={display}
            patchDisplay={patchDisplay}
            reading={reading}
            patchReading={patchReading}
            widgetControls={widgetControls}
            patchWidgetControls={patchWidgetControls}
          />
        )}

        {settingsTab === 'audio' && (
          <AudioTab
            autoStart={autoStart}
            onAutoStartChange={onAutoStartChange}
            provider={provider}
            changeProvider={changeProvider}
            micPrefs={micPrefs}
            patchMicPrefs={patchMicPrefs}
          />
        )}

        {settingsTab === 'other' && (
          <OtherTab
            translation={translation}
            patchTranslation={patchTranslation}
            diagnosticStatus={diagnosticStatus}
            setDiagnosticStatus={setDiagnosticStatus}
          />
        )}
      </div>
    </div>
  );
}
