// ============================================================================
// DisplayTab.tsx — ajustes de presentación (Letra + Widget + Extras).
// Extraído de SettingsPanel.tsx (modularización god file, 2026-08-03).
// ============================================================================
import type { DisplaySettings, ReadingSettings } from '../types';
import type { WidgetControls } from '../widgetPrefs';
import { AUTO_GHOST_OPTIONS_S, type AutoGhostPrefs } from '../autoGhost';
import { useT } from '../i18n/useT';
import type { MessageKey } from '../i18n';

export interface DisplayTabProps {
  display: DisplaySettings;
  patchDisplay: (partial: Partial<DisplaySettings>) => void;
  reading: ReadingSettings;
  patchReading: (partial: Partial<ReadingSettings>) => void;
  widgetControls: WidgetControls;
  patchWidgetControls: (partial: Partial<WidgetControls>) => void;
  autoGhost: AutoGhostPrefs;
  patchAutoGhost: (partial: Partial<AutoGhostPrefs>) => void;
}

const TEXT_COLOR_PRESETS: { value: string; label: MessageKey }[] = [
  { value: '#ffffff', label: 'settingsDisplay.color.white' },
  { value: '#fde047', label: 'settingsDisplay.color.yellow' },
  { value: '#22d3ee', label: 'settingsDisplay.color.cyan' },
  { value: '#4ade80', label: 'settingsDisplay.color.green' },
  { value: '#f472b6', label: 'settingsDisplay.color.pink' },
  { value: '#111114', label: 'settingsDisplay.color.black' },
];

const HANDLE_COLOR_PRESETS: { value: string; label: MessageKey }[] = [
  { value: '#000000', label: 'settingsDisplay.color.black' },
  { value: '#ffffff', label: 'settingsDisplay.color.white' },
  { value: '#fde047', label: 'settingsDisplay.color.yellow' },
  { value: '#22d3ee', label: 'settingsDisplay.color.cyan' },
  { value: '#a78bfa', label: 'settingsDisplay.color.violet' },
  { value: '#f472b6', label: 'settingsDisplay.color.pink' },
];

const HANDLE_POSITION_PRESETS: { value: number; label: MessageKey }[] = [
  { value: 0.06, label: 'settingsDisplay.position.left' },
  { value: 0.5, label: 'settingsDisplay.position.center' },
  { value: 0.94, label: 'settingsDisplay.position.right' },
];

export function DisplayTab({
  display,
  patchDisplay,
  reading,
  patchReading,
  widgetControls,
  patchWidgetControls,
  autoGhost,
  patchAutoGhost,
}: DisplayTabProps) {
  const t = useT();
  return (
    <>
      {/* ---------------- Letra: lo que se toca a diario ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">{t('settingsDisplay.group.lyrics')}</span>

        <label className="settings-label" htmlFor="font-range">
          {t('settingsDisplay.size', { value: display.fontScale.toFixed(1) })}
        </label>
        <input
          id="font-range"
          type="range"
          min={0.6}
          max={2}
          step={0.1}
          value={display.fontScale}
          onChange={(e) => patchDisplay({ fontScale: Number(e.target.value) })}
        />

        <label className="settings-label" htmlFor="opacity-range">
          {t('settingsDisplay.textOpacity', { value: Math.round(display.opacity * 100) })}
        </label>
        <input
          id="opacity-range"
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={display.opacity}
          onChange={(e) => patchDisplay({ opacity: Number(e.target.value) })}
        />
        <p className="settings-hint">
          {t('settingsDisplay.hint.currentLine')}
        </p>

        <label className="settings-label" htmlFor="background-opacity-range">
          {t('settingsDisplay.backgroundOpacity', { value: Math.round(display.backgroundOpacity * 100) })}
        </label>
        <input
          id="background-opacity-range"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={display.backgroundOpacity}
          onChange={(e) => patchDisplay({ backgroundOpacity: Number(e.target.value) })}
        />
        <label className="settings-check">
          <input
            type="checkbox"
            checked={display.legibilityBoost}
            onChange={(e) => patchDisplay({ legibilityBoost: e.target.checked })}
          />
          {t('settingsDisplay.legibilityBoost')}
        </label>

        <span className="settings-label">{t('settingsDisplay.color.label')}</span>
        <div className="settings-color-row">
          {TEXT_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`settings-color-swatch${display.textColor === preset.value ? ' active' : ''}`}
              title={t(preset.label)}
              aria-label={t(preset.label)}
              onClick={() => patchDisplay({ textColor: preset.value })}
            >
              <span style={{ backgroundColor: preset.value }} />
            </button>
          ))}
          <label className="settings-color-picker" title={t('settingsDisplay.customColor')}>
            <input
              type="color"
              value={display.textColor}
              onChange={(e) => patchDisplay({ textColor: e.target.value.toLowerCase() })}
            />
          </label>
        </div>

        <label className="settings-label" htmlFor="window-size-range">
          {t('settingsDisplay.linesVisible', { value: display.lyricsWindowSize })}
        </label>
        <input
          id="window-size-range"
          type="range"
          min={1}
          max={5}
          step={1}
          value={display.lyricsWindowSize}
          onChange={(e) => patchDisplay({ lyricsWindowSize: Number(e.target.value) })}
        />
        <p className="settings-hint">
          {t('settingsDisplay.hint.linesWindow')}
        </p>

        <span className="settings-label">{t('settingsDisplay.alignment.label')}</span>
        <div className="settings-row">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              className={`chrome-button${display.alignment === align ? ' active' : ''}`}
              onClick={() => patchDisplay({ alignment: align })}
            >
              {align === 'left' ? '←' : align === 'right' ? '→' : '↔'}
            </button>
          ))}
        </div>
        <p className="settings-hint">
          {t('settingsDisplay.hint.alignment')}
        </p>
      </section>

      {/* ---------------- Handle del widget + botones visibles (F5) ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">{t('settingsDisplay.group.widget')}</span>
        <p className="settings-hint">{t('settingsDisplay.widgetHint')}</p>

        <div className="settings-color-row">
          {HANDLE_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`settings-color-swatch${display.handleColor === preset.value ? ' active' : ''}`}
              title={t(preset.label)}
              aria-label={t('settingsDisplay.handleColorAria', { color: t(preset.label) })}
              onClick={() => patchDisplay({ handleColor: preset.value })}
            >
              <span style={{ backgroundColor: preset.value }} />
            </button>
          ))}
          <label className="settings-color-picker" title={t('settingsDisplay.customHandleColor')}>
            <input
              type="color"
              value={display.handleColor}
              onChange={(e) => patchDisplay({ handleColor: e.target.value.toLowerCase() })}
            />
          </label>
        </div>
        <label className="settings-label" htmlFor="handle-scale-range">
          {t('settingsDisplay.size', { value: display.handleScale.toFixed(1) })}
        </label>
        <input
          id="handle-scale-range"
          type="range"
          min={0.6}
          max={2}
          step={0.1}
          value={display.handleScale}
          onChange={(e) => patchDisplay({ handleScale: Number(e.target.value) })}
        />
        <label className="settings-label" htmlFor="handle-position-range">
          {t('settingsDisplay.handlePosition', { value: Math.round(display.handlePositionX * 100) })}
        </label>
        <input
          id="handle-position-range"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={display.handlePositionX}
          onChange={(e) => patchDisplay({ handlePositionX: Number(e.target.value) })}
        />
        <div className="settings-row">
          {HANDLE_POSITION_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`chrome-button${Math.abs(display.handlePositionX - preset.value) < 0.03 ? ' active' : ''}`}
              onClick={() => patchDisplay({ handlePositionX: preset.value })}
            >
              {t(preset.label)}
            </button>
          ))}
        </div>

        <span className="settings-label">{t('settingsDisplay.visibleButtons')}</span>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={widgetControls.reading}
            onChange={(e) => patchWidgetControls({ reading: e.target.checked })}
          />
          {t('settingsDisplay.readingModes')}
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={widgetControls.translate}
            onChange={(e) => patchWidgetControls({ translate: e.target.checked })}
          />
          {t('settingsDisplay.translate')}
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={widgetControls.import}
            onChange={(e) => patchWidgetControls({ import: e.target.checked })}
          />
          {t('settingsDisplay.importLyrics')}
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={widgetControls.settings}
            onChange={(e) => patchWidgetControls({ settings: e.target.checked })}
          />
          {t('settingsDisplay.settings')}
        </label>

        <label className="settings-check">
          <input
            type="checkbox"
            checked={autoGhost.enabled}
            onChange={(e) => patchAutoGhost({ enabled: e.target.checked })}
          />
          {t('settingsDisplay.autoGhost')}
        </label>
        <label className="settings-label" htmlFor="auto-ghost-delay">
          {t('settingsDisplay.after')}
        </label>
        <select
          id="auto-ghost-delay"
          disabled={!autoGhost.enabled}
          value={autoGhost.idleSeconds}
          onChange={(e) => patchAutoGhost({ idleSeconds: Number(e.target.value) })}
        >
          {AUTO_GHOST_OPTIONS_S.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds < 60 ? `${seconds} s` : seconds === 60 ? '1 min' : `${seconds / 60} min`}
            </option>
          ))}
        </select>
        <p className="settings-hint">
          {t('settingsDisplay.hint.autoGhost')}
        </p>

        <label className="settings-check">
          <input
            type="checkbox"
            checked={autoGhost.openOnRecognize}
            onChange={(e) => patchAutoGhost({ openOnRecognize: e.target.checked })}
          />
          {t('settingsDisplay.openOnRecognize')}
        </label>
        <p className="settings-hint">
          {t('settingsDisplay.hint.openOnRecognize')}
        </p>
      </section>

      {/* ---------------- Extras de lectura ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">{t('settingsDisplay.group.readingExtras')}</span>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={reading.pinyinToneType === 'symbol'}
            onChange={(e) =>
              patchReading({ pinyinToneType: e.target.checked ? 'symbol' : 'none' })
            }
          />
          {t('settingsDisplay.pinyinTones')}
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={reading.spanishVariant === 'distincion'}
            onChange={(e) =>
              patchReading({ spanishVariant: e.target.checked ? 'distincion' : 'seseo' })
            }
          />
          {t('settingsDisplay.spanishIpa')}
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={display.mirrorMode}
            onChange={(e) => patchDisplay({ mirrorMode: e.target.checked })}
          />
          {t('settingsDisplay.mirrorMode')}
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={display.textColorMode === 'auto'}
            onChange={(e) =>
              patchDisplay({ textColorMode: e.target.checked ? 'auto' : 'manual' })
            }
          />
          {t('settingsDisplay.autoColor')}
        </label>
        {display.textColorMode === 'auto' && (
          <p className="settings-hint">
            {t('settingsDisplay.hint.autoColor')}
          </p>
        )}
      </section>
    </>
  );
}
