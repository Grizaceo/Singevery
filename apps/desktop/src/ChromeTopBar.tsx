import { WindowControls } from './WindowControls';
import { ReadingControls } from './ReadingControls';
import type { ReadingMode } from './types';
import type { DesktopApi } from './types';
import type { ScriptHint } from './scriptDetect';
import './ChromeBars.css';

interface ChromeTopBarProps {
  api: DesktopApi | undefined;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
  hasAnnotations: boolean;
  scriptHint?: ScriptHint;
  showTranslation?: boolean;
  onTranslationChange?: (enabled: boolean) => void;
  translationLoading?: boolean;
  translationError?: string | null;
  onCollapse?: () => void;
  onOpenSettings: () => void;
}

export function ChromeTopBar({
  api,
  readingMode,
  onReadingModeChange,
  hasAnnotations,
  scriptHint,
  showTranslation,
  onTranslationChange,
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
      <div className="chrome-bar-group">
        <ReadingControls
          mode={readingMode}
          onChange={onReadingModeChange}
          hasAnnotations={hasAnnotations}
          scriptHint={scriptHint}
          showTranslation={showTranslation}
          onTranslationChange={onTranslationChange}
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
