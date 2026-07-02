import { RecognitionControls } from './RecognitionControls';
import { SyncControls } from './SyncControls';
import { ResizeGrip } from './ResizeGrip';
import type { RecognitionState } from './useRecognition';
import type { DesktopApi } from './types';
import './ChromeBars.css';

interface ChromeBottomBarProps {
  recognition: RecognitionState;
  api: DesktopApi | undefined;
}

export function ChromeBottomBar({ recognition, api }: ChromeBottomBarProps) {
  return (
    <div className="chrome-bar chrome-bar-bottom">
      <div className="chrome-bar-group chrome-bar-grow">
        <RecognitionControls recognition={recognition} />
      </div>
      <div className="chrome-bar-group">
        <SyncControls />
        <ResizeGrip api={api} />
      </div>
    </div>
  );
}
