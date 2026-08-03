// ============================================================================
// DisplayTab.tsx — ajustes de presentación (Letra + Widget + Extras).
// Extraído de SettingsPanel.tsx (modularización god file, 2026-08-03).
// ============================================================================
import type { DisplaySettings, ReadingSettings } from '../types';
import type { WidgetControls } from '../widgetPrefs';

export interface DisplayTabProps {
  display: DisplaySettings;
  patchDisplay: (partial: Partial<DisplaySettings>) => void;
  reading: ReadingSettings;
  patchReading: (partial: Partial<ReadingSettings>) => void;
  widgetControls: WidgetControls;
  patchWidgetControls: (partial: Partial<WidgetControls>) => void;
}

const TEXT_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: '#ffffff', label: 'Blanco' },
  { value: '#fde047', label: 'Amarillo' },
  { value: '#22d3ee', label: 'Cian' },
  { value: '#4ade80', label: 'Verde' },
  { value: '#f472b6', label: 'Rosa' },
  { value: '#111114', label: 'Negro' },
];

const HANDLE_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: '#000000', label: 'Negro' },
  { value: '#ffffff', label: 'Blanco' },
  { value: '#fde047', label: 'Amarillo' },
  { value: '#22d3ee', label: 'Cian' },
  { value: '#a78bfa', label: 'Violeta' },
  { value: '#f472b6', label: 'Rosa' },
];

const HANDLE_POSITION_PRESETS: { value: number; label: string }[] = [
  { value: 0.06, label: 'Izquierda' },
  { value: 0.5, label: 'Centro' },
  { value: 0.94, label: 'Derecha' },
];

export function DisplayTab({
  display,
  patchDisplay,
  reading,
  patchReading,
  widgetControls,
  patchWidgetControls,
}: DisplayTabProps) {
  return (
    <>
      {/* ---------------- Letra: lo que se toca a diario ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">Letra</span>

        <label className="settings-label" htmlFor="font-range">
          Tamaño ({display.fontScale.toFixed(1)}×)
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
          Opacidad ({Math.round(display.opacity * 100)}%)
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

        <span className="settings-label">Color</span>
        <div className="settings-color-row">
          {TEXT_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`settings-color-swatch${display.textColor === preset.value ? ' active' : ''}`}
              title={preset.label}
              aria-label={preset.label}
              onClick={() => patchDisplay({ textColor: preset.value })}
            >
              <span style={{ backgroundColor: preset.value }} />
            </button>
          ))}
          <label className="settings-color-picker" title="Color personalizado">
            <input
              type="color"
              value={display.textColor}
              onChange={(e) => patchDisplay({ textColor: e.target.value.toLowerCase() })}
            />
          </label>
        </div>

        <label className="settings-label" htmlFor="window-size-range">
          Líneas visibles ({display.lyricsWindowSize} arriba y abajo)
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
          Más líneas dan margen cuando la sincronía va algo corrida y terminas cantando desde la
          previsualización. El texto se achica solo para que quepa.
        </p>

        <span className="settings-label">Alineación</span>
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
          La letra se muestra centrada por defecto; el layout lado a lado solo se activa con la
          traducción en modo paralelo.
        </p>
      </section>

      {/* ---------------- Handle del widget + botones visibles (F5) ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">Widget</span>
        <p className="settings-hint">La pestañita para mover el overlay y qué controles se ven.</p>

        <div className="settings-color-row">
          {HANDLE_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`settings-color-swatch${display.handleColor === preset.value ? ' active' : ''}`}
              title={preset.label}
              aria-label={`Handle ${preset.label}`}
              onClick={() => patchDisplay({ handleColor: preset.value })}
            >
              <span style={{ backgroundColor: preset.value }} />
            </button>
          ))}
          <label className="settings-color-picker" title="Color personalizado del handle">
            <input
              type="color"
              value={display.handleColor}
              onChange={(e) => patchDisplay({ handleColor: e.target.value.toLowerCase() })}
            />
          </label>
        </div>
        <label className="settings-label" htmlFor="handle-scale-range">
          Tamaño ({display.handleScale.toFixed(1)}×)
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
          Posición horizontal ({Math.round(display.handlePositionX * 100)}%)
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
              {preset.label}
            </button>
          ))}
        </div>

        <span className="settings-label">Botones visibles</span>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={widgetControls.reading}
            onChange={(e) => patchWidgetControls({ reading: e.target.checked })}
          />
          Modos de lectura (原 か ふ A IPA…)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={widgetControls.translate}
            onChange={(e) => patchWidgetControls({ translate: e.target.checked })}
          />
          Traducción (T)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={widgetControls.import}
            onChange={(e) => patchWidgetControls({ import: e.target.checked })}
          />
          Importar letra (↥)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={widgetControls.settings}
            onChange={(e) => patchWidgetControls({ settings: e.target.checked })}
          />
          Ajustes (⚙)
        </label>
      </section>

      {/* ---------------- Extras de lectura ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">Extras de lectura</span>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={reading.pinyinToneType === 'symbol'}
            onChange={(e) =>
              patchReading({ pinyinToneType: e.target.checked ? 'symbol' : 'none' })
            }
          />
          Tonos en el pinyin chino (nǐ hǎo vs ni hao)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={display.mirrorMode}
            onChange={(e) => patchDisplay({ mirrorMode: e.target.checked })}
          />
          Modo espejo (para proyectar sobre un cristal)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={display.textColorMode === 'auto'}
            onChange={(e) =>
              patchDisplay({ textColorMode: e.target.checked ? 'auto' : 'manual' })
            }
          />
          Color automático según el fondo (experimental)
        </label>
        {display.textColorMode === 'auto' && (
          <p className="settings-hint">
            Analiza el brillo de la pantalla bajo el widget cada pocos segundos; la imagen se
            procesa localmente y se descarta. Puede producir un ligero parpadeo, y el widget no
            aparece en grabaciones mientras esté activo.
          </p>
        )}
      </section>
    </>
  );
}
