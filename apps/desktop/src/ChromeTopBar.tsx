import { useState } from 'react';
import { WindowControls } from './WindowControls';
import { ReadingControls } from './ReadingControls';
import { TrackHeader } from './teleprompter/TrackHeader';
import type { ReadingMode, RenderModel, TranslationView } from './types';
import type { DesktopApi } from './types';
import type { ScriptHint } from './scriptDetect';
import './ChromeBars.css';

interface ChromeTopBarProps {
  api: DesktopApi | undefined;
  /** Para mostrar título/artista/estado en el centro de la barra. */
  model: RenderModel;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
  hasAnnotations: boolean;
  scriptHint?: ScriptHint;
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
  scriptHint,
  translationView,
  onTranslationViewChange,
  translationLoading,
  translationError,
  onCollapse,
  onOpenSettings,
}: ChromeTopBarProps) {
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const importLyrics = async () => {
    if (!api || importing) return;
    setImporting(true);
    setImportStatus(null);
    try {
      const result = await api.importLyrics();
      if (result.canceled) return;
      if (!result.ok) {
        setImportStatus(result.error ?? 'No se pudo importar');
        return;
      }
      setImportStatus(
        `${result.lineCount ?? 0} líneas · ${result.synced ? 'sincronizada' : 'texto plano'}`,
      );
    } catch {
      setImportStatus('No se pudo importar');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="chrome-bar chrome-bar-top">
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
        <button
          type="button"
          className="chrome-button"
          onClick={() => void importLyrics()}
          disabled={!api || importing}
          title="Importar letra propia o autorizada (LRC/TXT)"
          aria-label="Importar letra LRC o TXT"
        >
          {importing ? '…' : '↥'}
        </button>
        <ReadingControls
          mode={readingMode}
          onChange={onReadingModeChange}
          hasAnnotations={hasAnnotations}
          scriptHint={scriptHint}
          translationView={translationView}
          onTranslationViewChange={onTranslationViewChange}
          translationLoading={translationLoading}
          translationError={translationError}
          onOpenSettings={onOpenSettings}
        />
        <button
          type="button"
          className="chrome-button"
          onClick={onOpenSettings}
          title="Ajustes"
          aria-label="Abrir ajustes"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
