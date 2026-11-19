import { useCallback, useEffect, useState } from 'react';
import type { DesktopApi } from './types';
import './WindowControls.css';
import { useT } from './i18n/useT';

interface WindowControlsProps {
  api: DesktopApi | undefined;
  onCollapse?: () => void;
  /** Modo compacto para la barra superior (sin presets de tamaño). */
  compact?: boolean;
}

export function WindowControls({ api, onCollapse, compact = false }: WindowControlsProps) {
  const t = useT();
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
            title={t('chrome.windowControls.collapseTitle')}
            aria-label={t('chrome.windowControls.collapseAria')}
          >
            ◧
          </button>
        )}
        <button
          type="button"
          className="chrome-button win-btn close danger"
          onClick={handleClose}
          title={t('chrome.windowControls.close')}
          aria-label={t('chrome.windowControls.close')}
        >
          ×
        </button>
        {!compact && (
          <button
            type="button"
            className={`chrome-button win-btn preset${activePreset === 'L' ? ' active' : ''}`}
            onClick={() => void applyPresetL()}
            title={t('chrome.windowControls.largeTitle')}
            aria-label={t('chrome.windowControls.largeAria')}
          >
            L
          </button>
        )}
      </div>
    </div>
  );
}
