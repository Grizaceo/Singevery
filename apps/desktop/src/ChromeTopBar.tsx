import { WindowControls } from './WindowControls';
import { ReadingControls } from './ReadingControls';
import type { ReadingMode } from './types';
import type { DesktopApi } from './types';
import './ChromeBars.css';

interface ChromeTopBarProps {
  api: DesktopApi | undefined;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
  hasAnnotations: boolean;
  onCollapse?: () => void;
  onOpenSettings: () => void;
}

export function ChromeTopBar({
  api,
  readingMode,
  onReadingModeChange,
  hasAnnotations,
  onCollapse,
  onOpenSettings,
}: ChromeTopBarProps) {
  return (
    <div className="chrome-bar chrome-bar-top">
      <div className="chrome-bar-group">
        <span className="chrome-button chrome-drag-handle" title="Arrastrar ventana" aria-label="Arrastrar">
          ⋮⋮
        </span>
        <WindowControls api={api} onCollapse={onCollapse} compact />
      </div>
      <div className="chrome-bar-group">
        <ReadingControls mode={readingMode} onChange={onReadingModeChange} hasAnnotations={hasAnnotations} />
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
