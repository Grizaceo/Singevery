import React from 'react';
import type { RenderModel } from '../types';
import { STATUS_LABEL } from './teleprompterHelpers';

interface TrackHeaderProps {
  model: RenderModel;
  chromeHidden?: boolean;
}

export const TrackHeader = React.memo(function TrackHeader({
  model,
  chromeHidden = false,
}: TrackHeaderProps) {
  const hasTrack = !!(model.track_title || model.track_artist);
  const statusLabel = STATUS_LABEL[model.status] ?? model.status;

  return (
    <div className={`track-header${chromeHidden ? ' is-hidden' : ''}`}>
      {hasTrack ? (
        <>
          {model.track_title && <div className="track-header-title">{model.track_title}</div>}
          {model.track_artist && <div className="track-header-artist">{model.track_artist}</div>}
          {statusLabel && <div className="track-header-status">{statusLabel}</div>}
        </>
      ) : (
        statusLabel && <div className="track-header-status">{statusLabel}</div>
      )}
    </div>
  );
});
