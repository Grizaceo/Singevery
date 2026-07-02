import { useCallback, useEffect, useState } from 'react';
import type { DisplaySettings, RecognitionProviderMode } from './types';
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

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [display, setDisplay] = useState<DisplaySettings>({
    opacity: 1,
    fontScale: 1,
    alignment: 'center',
    mirrorMode: false,
  });
  const [provider, setProvider] = useState<RecognitionProviderMode>('auto');

  useEffect(() => {
    if (!open || !window.api) return;
    void window.api.getDisplaySettings().then((r) => {
      if (r.ok) setDisplay(r.display);
    });
    void window.api.getRecognitionProvider().then((r) => {
      if (r.ok) setProvider(r.provider);
    });
  }, [open]);

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
