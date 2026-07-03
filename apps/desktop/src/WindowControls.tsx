import { useCallback, useEffect, useState } from 'react';
import type { DesktopApi } from './types';
import './WindowControls.css';

interface WindowControlsProps {
  api: DesktopApi | undefined;
  onCollapse?: () => void;
  /** Modo compacto para la barra superior (sin presets de tamaño). */
  compact?: boolean;
}

export function WindowControls({ api, onCollapse, compact = false }: WindowControlsProps) {
  const [activePreset, setActivePreset] = useState<'L' | null>(null);

  useEffect(() => {
    if (!api?.getSize || compact) return;
    api.getSize().then((result) => {
      if (!result.ok) return;
      if (result.width === 760 && result.height === 560) setActivePreset('L');
    });
  }, [api, compact]);

  const handleClose = useCallback(async () => {
    if (!api?.close) return;
    await api.close();
  }, [api]);

  const applyPresetL = useCallback(async () => {
    if (!api?.setSize) return;
    const result = await api.setSize(760, 560);
    if (result.ok) setActivePreset('L');
  }, [api]);

  if (!api) return null;

  return (
    <div className="window-controls">
      <div className="window-controls-row">
        {onCollapse && (
          <button
            type="button"
            className="chrome-button win-btn collapse"
            onClick={onCollapse}
            title="Colapsar a viñeta (SING)"
            aria-label="Colapsar a viñeta"
          >
            ◧
          </button>
        )}
        <button
          type="button"
          className="chrome-button win-btn close danger"
          onClick={handleClose}
          title="Cerrar"
          aria-label="Cerrar"
        >
          ×
        </button>
        {!compact && (
          <button
            type="button"
            className={`chrome-button win-btn preset${activePreset === 'L' ? ' active' : ''}`}
            onClick={() => void applyPresetL()}
            title="Grande (760×560)"
            aria-label="Tamaño grande"
          >
            L
          </button>
        )}
      </div>
    </div>
  );
}
