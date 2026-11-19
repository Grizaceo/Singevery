import { useRef, useState } from 'react';
import { WindowControls } from './WindowControls';
import { ReadingControls } from './ReadingControls';
import { TrackHeader } from './teleprompter/TrackHeader';
import type { IpaInfo, ReadingMode, RenderModel, TranslationView } from './types';
import type { DesktopApi } from './types';
import type { ScriptHint } from './scriptDetect';
import { readWidgetControls } from './widgetPrefs';
import './ChromeBars.css';
import { useFitBar } from './useFitBar';
import { useT } from './i18n/useT';

interface ChromeTopBarProps {
  api: DesktopApi | undefined;
  /** Para mostrar título/artista/estado en el centro de la barra. */
  model: RenderModel;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
  hasAnnotations: boolean;
  hasIpa?: boolean;
  scriptHint?: ScriptHint;
  ipaInfo?: IpaInfo | null;
  ipaGuideOpen?: boolean;
  onIpaGuideToggle?: () => void;
  translationView?: TranslationView;
  onTranslationViewChange?: (view: TranslationView) => void;
  translationLoading?: boolean;
  translationError?: string | null;
  onCollapse?: () => void;
  onOpenSettings: () => void;
}

export function ChromeTopBar({
  api,
  model,
  readingMode,
  onReadingModeChange,
  hasAnnotations,
  hasIpa,
  scriptHint,
  ipaInfo,
  ipaGuideOpen,
  onIpaGuideToggle,
  translationView,
  onTranslationViewChange,
  translationLoading,
  translationError,
  onCollapse,
  onOpenSettings,
}: ChromeTopBarProps) {
  const t = useT();
  const barRef = useRef<HTMLDivElement>(null);
  useFitBar(barRef);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  // F5: qué controles mostrar según preferencias del usuario. Se lee en cada
  // render (no en useState) para reflejar cambios hechos en Opciones sin
  // remontar el widget.
  const widgetControls = readWidgetControls();

  const importLyrics = async () => {
    if (!api || importing) return;
    setImporting(true);
    setImportStatus(null);
    try {
      const result = await api.importLyrics();
      if (result.canceled) return;
      if (!result.ok) {
        setImportStatus(result.error ?? t('chrome.topBar.importError'));
        return;
      }
      setImportStatus(
        t('chrome.topBar.importStatus', {
          count: result.lineCount ?? 0,
          mode: t(result.synced ? 'chrome.topBar.importSynced' : 'chrome.topBar.importPlain'),
        }),
      );
    } catch {
      setImportStatus(t('chrome.topBar.importError'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div ref={barRef} className="chrome-bar chrome-bar-top">
      <div className="chrome-bar-group">
        <WindowControls api={api} onCollapse={onCollapse} compact />
      </div>
      <TrackHeader model={model} />
      <div className="chrome-bar-group">
        {importStatus && (
          <span className="chrome-import-status" role="status" title={importStatus}>
            {importStatus}
          </span>
        )}
        {widgetControls.import && (
          <button
            type="button"
            className="chrome-button"
            onClick={() => void importLyrics()}
            disabled={!api || importing}
            title={t('chrome.topBar.importTitle')}
            aria-label={t('chrome.topBar.importAria')}
          >
            {importing ? '…' : '↥'}
          </button>
        )}
        {widgetControls.reading && (
          <ReadingControls
            mode={readingMode}
            onChange={onReadingModeChange}
            hasAnnotations={hasAnnotations}
            hasIpa={hasIpa}
            scriptHint={scriptHint}
            ipaInfo={ipaInfo}
            ipaGuideOpen={ipaGuideOpen}
            onIpaGuideToggle={onIpaGuideToggle}
            translationView={translationView}
            onTranslationViewChange={widgetControls.translate ? onTranslationViewChange : undefined}
            translationLoading={translationLoading}
            translationError={translationError}
            onOpenSettings={onOpenSettings}
          />
        )}
        {widgetControls.settings && (
          <button
            type="button"
            className="chrome-button"
            onClick={onOpenSettings}
            title={t('chrome.topBar.settingsTitle')}
            aria-label={t('chrome.topBar.openSettings')}
          >
            ⚙
          </button>
        )}
      </div>
    </div>
  );
}
