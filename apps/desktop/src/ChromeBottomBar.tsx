import { RecognitionControls } from './RecognitionControls';
import { SyncControls } from './SyncControls';
import { ResizeGrip } from './ResizeGrip';
import { PitchMonitorBadge } from './PitchMonitor';
import type { RecognitionState } from './useRecognition';
import type { DesktopApi } from './types';
import './ChromeBars.css';

interface ChromeBottomBarProps {
  recognition: RecognitionState;
  api: DesktopApi | undefined;
  /** Clave de pista actual (artist__title normalizado) para la referencia melódica. */
  trackKey: string | null;
}

export function ChromeBottomBar({ recognition, api, trackKey }: ChromeBottomBarProps) {
  return (
    <div className="chrome-bar chrome-bar-bottom">
      <div className="chrome-bar-group chrome-bar-grow">
        <RecognitionControls recognition={recognition} />
      </div>
      <div className="chrome-bar-group">
        <PitchMonitorBadge trackKey={trackKey} />
        <SyncControls />
        <ResizeGrip api={api} />
      </div>
    </div>
  );
}
