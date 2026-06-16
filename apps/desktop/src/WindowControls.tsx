import { useCallback, useEffect, useState } from 'react';
import type { DesktopApi } from './types';
import './WindowControls.css';

interface WindowControlsProps {
  api: DesktopApi | undefined;
}

/** Tamaños predefinidos del widget. M coincide con el default de BrowserWindow. */
const PRESETS = [
  { key: 'S', label: 'S', width: 380, height: 300, title: 'Compacto (380×300)' },
  { key: 'M', label: 'M', width: 560, height: 420, title: 'Normal (560×420)' },
  { key: 'L', label: 'L', width: 760, height: 560, title: 'Grande (760×560)' },
] as const;

type PresetKey = (typeof PRESETS)[number]['key'];

export function WindowControls({ api }: WindowControlsProps) {
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);

  // Leer tamaño inicial para resaltar el preset que coincida (si hay alguno).
  useEffect(() => {
    if (!api?.getSize) return;
    api.getSize().then((result) => {
      if (!result.ok) return;
      const match = PRESETS.find(
        (p) => p.width === result.width && p.height === result.height,
      );
      setActivePreset(match ? match.key : null);
    });
  }, [api]);

  const handleMinimize = useCallback(async () => {
    if (!api?.minimize) return;
    await api.minimize();
  }, [api]);

  const handleClose = useCallback(async () => {
    if (!api?.close) return;
    await api.close();
  }, [api]);

  const applyPreset = useCallback(
    async (key: PresetKey) => {
      if (!api?.setSize) return;
      const preset = PRESETS.find((p) => p.key === key);
      if (!preset) return;
      const result = await api.setSize(preset.width, preset.height);
      if (result.ok) setActivePreset(key);
    },
    [api],
  );

  if (!api) return null;

  return (
    <div className="window-controls">
      <div className="window-controls-row">
        <button
          type="button"
          className="win-btn minimize"
          onClick={handleMinimize}
          title="Minimizar"
          aria-label="Minimizar"
        >
          −
        </button>
        <button
          type="button"
          className="win-btn drag-handle-btn"
          title="Arrastrar para mover"
          aria-label="Arrastrar para mover"
        >
          ⋮⋮
        </button>
        <button
          type="button"
          className="win-btn close"
          onClick={handleClose}
          title="Cerrar"
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>

      <div className="window-controls-row preset-row">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className={`win-btn preset${activePreset === preset.key ? ' active' : ''}`}
            onClick={() => void applyPreset(preset.key)}
            title={preset.title}
            aria-label={preset.title}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
