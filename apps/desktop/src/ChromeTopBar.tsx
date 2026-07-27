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
  return (
    <div className="chrome-bar chrome-bar-top">
      <div className="chrome-bar-group">
        <WindowControls api={api} onCollapse={onCollapse} compact />
      </div>
      <TrackHeader model={model} />
      <div className="chrome-bar-group">
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
