import { RecognitionControls } from './RecognitionControls';
import { SyncControls } from './SyncControls';
import { ResizeGrip } from './ResizeGrip';
import { PitchMonitorBadge } from './PitchMonitor';
import { PracticeControls } from './PracticeControls';
import type { RecognitionState } from './useRecognition';
import type { DesktopApi, RenderModel } from './types';
import type { usePitchMonitor } from './usePitchMonitor';
import type { useMelodyReference } from './useMelodyReference';
import './ChromeBars.css';

interface ChromeBottomBarProps {
  recognition: RecognitionState;
  api: DesktopApi | undefined;
  model: RenderModel;
  recallHidden: boolean;
  onRecallHiddenChange: (hidden: boolean) => void;
  /** Estado del monitor de pitch (App lo levanta para compartirlo con el teleprompter). */
  pitchMonitor: ReturnType<typeof usePitchMonitor>;
  /** Referencia melódica de la canción actual. */
  melodyRef: ReturnType<typeof useMelodyReference>;
}

export function ChromeBottomBar({
  recognition,
  api,
  model,
  recallHidden,
  onRecallHiddenChange,
  pitchMonitor,
  melodyRef,
}: ChromeBottomBarProps) {
  return (
    <div className="chrome-bar chrome-bar-bottom">
      <div className="chrome-bar-group chrome-bar-grow">
        <RecognitionControls recognition={recognition} />
      </div>
      <div className="chrome-bar-group">
        <PracticeControls
          api={api}
          model={model}
          recallHidden={recallHidden}
          onRecallHiddenChange={onRecallHiddenChange}
        />
        <PitchMonitorBadge pitchMonitor={pitchMonitor} melodyRef={melodyRef} />
        <SyncControls />
        <ResizeGrip api={api} />
      </div>
    </div>
  );
}
