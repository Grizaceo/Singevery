import { useCallback } from 'react';
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

/** Paso del ajuste fino por rueda del mouse (ms por muesca). */
const WHEEL_NUDGE_MS = 1000;

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
  /** Abre la búsqueda manual de canción (contextual, nunca en el menú por defecto). */
  onManualSearch: () => void;
}

export function ChromeBottomBar({
  recognition,
  api,
  model,
  recallHidden,
  onRecallHiddenChange,
  pitchMonitor,
  melodyRef,
  onManualSearch,
}: ChromeBottomBarProps) {
  // La rueda del mouse sobre la barra ajusta el desfase de la letra en el
  // acto (misma función que tenía el bloque de sync desplegado, ahora que
  // ese bloque vive colapsado detrás del botón ⇄).
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!window.api) return;
    e.preventDefault?.();
    const delta = e.deltaY < 0 ? WHEEL_NUDGE_MS : -WHEEL_NUDGE_MS;
    void window.api.nudgeSync(delta);
  }, []);

  return (
    <div className="chrome-bar chrome-bar-bottom" onWheel={handleWheel}>
      <div className="chrome-bar-group chrome-bar-grow">
        <RecognitionControls
          recognition={recognition}
          hasTrack={model.status === 'DISPLAYING'}
          onManualSearch={onManualSearch}
        />
      </div>
      <div className="chrome-bar-group">
        <PitchMonitorBadge pitchMonitor={pitchMonitor} melodyRef={melodyRef} />
        <PracticeControls
          api={api}
          model={model}
          recallHidden={recallHidden}
          onRecallHiddenChange={onRecallHiddenChange}
        />
        <SyncControls />
        <ResizeGrip api={api} />
      </div>
    </div>
  );
}
